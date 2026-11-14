import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanLine, ShoppingCart, Truck, X } from 'lucide-react';
import api from '../api/client';
import { deleteQueueItem, getQueue, getSnapshot, queueStockOperation, saveSnapshot } from '../lib/offline';

export default function StockPage() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [queued, setQueued] = useState([]);
  const [form, setForm] = useState({ productId: '', type: 'IN', operationType: 'receipt', quantity: '1', barcode: '', reference: '', notes: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const activeScan = useRef(false);
  const selectedProduct = useMemo(() => products.find((item) => (item.id || item._id) === form.productId), [products, form.productId]);

  const load = async () => {
    try {
      const [productResponse, movementResponse] = await Promise.all([
        api.get('/products', { params: { limit: 100 } }),
        api.get('/stock/history', { params: { limit: 25 } }),
      ]);
      const list = productResponse.data.products || [];
      const history = movementResponse.data.movements || [];
      setProducts(list); setMovements(history);
      await saveSnapshot('products', list); await saveSnapshot('movements', history);
      setForm((current) => ({ ...current, productId: current.productId || list[0]?.id || list[0]?._id || '' }));
    } catch (requestError) {
      if (!requestError.response) {
        setProducts((await getSnapshot('products')) || []);
        setMovements((await getSnapshot('movements')) || []);
        setMessage('Showing cached data. Offline stock entries remain pending and are not confirmed until synchronized.');
      } else setError(requestError.response?.data?.message || 'Unable to load stock data.');
    } finally { setLoading(false); }
  };

  const refreshQueue = () => getQueue().then(setQueued).catch((requestError) => console.error('Queue read failed:', requestError));
  useEffect(() => { load(); refreshQueue(); window.addEventListener('stockwise-queue-change', refreshQueue); return () => window.removeEventListener('stockwise-queue-change', refreshQueue); }, []);

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!form.productId) { setError('Select a product.'); return; }
    const productName = selectedProduct?.name || 'Product';
    const operation = { productId: form.productId, productName, type: form.type, operationType: form.operationType, quantity: Number(form.quantity), reference: form.reference, notes: form.notes };
    try {
      if (!navigator.onLine) {
        await queueStockOperation(operation);
        setMessage('Saved locally as pending. Server stock has not been changed.');
      } else {
        await api.post(`/stock/${form.type === 'IN' ? 'in' : 'out'}`, { ...operation, idempotencyKey: crypto.randomUUID() });
        setMessage(form.operationType === 'sale' ? 'Sale and stock movement recorded.' : 'Stock movement recorded.');
        await load();
      }
      setForm((current) => ({ ...current, quantity: '1', notes: '', reference: '' }));
    } catch (requestError) {
      if (!requestError.response) {
        try { await queueStockOperation(operation); setMessage('Connection lost. Saved as pending; not confirmed by the server.'); }
        catch (queueError) { setError(queueError.message || 'Offline operation could not be saved.'); }
      } else setError(requestError.response.data?.message || 'Stock operation was rejected.');
    }
  }

  async function lookup(code) {
    if (!code.trim()) { setError('Enter a barcode or SKU.'); return; }
    if (!navigator.onLine) {
      const match = products.find((item) => item.barcode === code.trim() || item.sku?.toUpperCase() === code.trim().toUpperCase());
      if (match) setForm((current) => ({ ...current, productId: match.id || match._id }));
      else setError('No matching product in the cached catalog. Reconnect to search.');
      return;
    }
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code.trim())}`);
      setForm((current) => ({ ...current, productId: data.product.id || data.product._id }));
      setError('');
      setMessage(`Found ${data.product.name}.`);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Barcode lookup failed.'); }
  }

  function stopScan() {
    activeScan.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; setScanning(false);
  }
  async function scan() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !('BarcodeDetector' in window)) {
      setError('Camera scanning needs a supported browser and HTTPS/localhost. Use manual barcode or SKU entry instead.');
      return;
    }
    try {
      setError(''); activeScan.current = true; setScanning(true);
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!videoRef.current) return stopScan();
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
      while (activeScan.current) {
        const codes = await detector.detect(videoRef.current);
        if (codes.length) { const code = codes[0].rawValue; stopScan(); setForm((current) => ({ ...current, barcode: code })); await lookup(code); break; }
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    } catch (scanError) { console.error(scanError); setError('Camera permission or scanning failed. Enter the code manually.'); stopScan(); }
  }
  useEffect(() => () => { activeScan.current = false; streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading stock operations…</div>;
  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">INVENTORY CONTROL</span><h1>Stock operations</h1><p>Every quantity change is recorded with its type, operator, and time.</p></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
      <div className="two-panels stock-layout">
        <section className="panel"><div className="panel-heading"><div><span className="section-kicker">RECORD MOVEMENT</span><h2>Update inventory</h2></div><button type="button" className="button secondary" onClick={scanning ? stopScan : scan}><ScanLine size={15} />{scanning ? 'Stop scan' : 'Scan barcode'}</button></div>
          {scanning && <div className="camera-frame"><video ref={videoRef} muted playsInline aria-label="Camera barcode scanner" /><button className="icon-button camera-close" aria-label="Stop scanner" onClick={stopScan}><X size={15} /></button></div>}
          <div className="barcode-entry"><label>Barcode / SKU<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(form.barcode); } }} placeholder="Enter code manually" /></label><button className="button secondary" type="button" onClick={() => lookup(form.barcode)}>Find product</button></div>
          <form className="form-stack" onSubmit={submit}>
            <label>Product<select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Select a product</option>{products.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.name} · {item.sku}</option>)}</select></label>
            {selectedProduct && <div className="selected-product"><strong>{selectedProduct.name}</strong><span>Current quantity: {selectedProduct.currentStock} {selectedProduct.unit || 'units'}</span><span>Reorder threshold: {selectedProduct.minimumStockLevel}</span></div>}
            <div className="form-row"><label>Direction<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, operationType: e.target.value === 'IN' ? 'receipt' : 'adjustment' })}><option value="IN">Stock in</option><option value="OUT">Stock out</option></select></label><label>Transaction type<select value={form.operationType} onChange={(e) => setForm({ ...form, operationType: e.target.value })}>{form.type === 'IN' ? <><option value="receipt">Supplier receipt</option><option value="adjustment">Adjustment</option></> : <><option value="adjustment">Adjustment / removal</option><option value="sale">Customer sale</option></>}</select></label></div>
            <label>Quantity<input type="number" min="1" step="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice, order, reason…" /></label>
            <label>Notes<textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="button primary">{form.operationType === 'sale' ? <ShoppingCart size={16} /> : form.type === 'IN' ? <Truck size={16} /> : <PackageCheck size={16} />}{form.operationType === 'sale' ? 'Record sale' : form.type === 'IN' ? 'Record stock in' : 'Record stock out'}</button>
          </form>
        </section>
        <section className="panel"><div className="panel-heading"><div><span className="section-kicker">AUDIT HISTORY</span><h2>Recent movements</h2></div></div>{movements.length ? <div className="list">{movements.slice(0, 12).map((item) => <div className="list-item" key={item.transactionId}><div><strong>{item.productName}</strong><small>{item.operationType} · {item.staffName} · {new Date(item.createdAt).toLocaleString()}</small></div><span className={`pill ${item.type === 'IN' ? 'success' : 'neutral'}`}>{item.type === 'IN' ? '+' : '−'}{item.quantity}</span></div>)}</div> : <div className="empty">Stock movements will appear here.</div>}</section>
      </div>
      {queued.length > 0 && <section className="panel"><div className="panel-heading"><div><span className="section-kicker">OFFLINE SYNC</span><h2>Pending and conflicted operations</h2></div><span className="pill warning">{queued.length} unconfirmed</span></div><p className="panel-subtitle">Pending work is not reflected in server inventory. Conflicts require review before a new operation is recorded.</p><div className="list">{queued.map((item) => <div className="list-item" key={item.id}><div><strong>{item.type} {item.quantity} · {item.productName}</strong><small>{item.status === 'conflict' ? item.error : 'Waiting for an internet connection'}</small></div><div className="actions"><span className={`pill ${item.status === 'conflict' ? 'warning' : 'neutral'}`}>{item.status}</span><button className="button secondary small" onClick={async () => { if (window.confirm('Discard this unconfirmed local operation?')) await deleteQueueItem(item.id); }}>Discard</button></div></div>)}</div></section>}
    </div>
  );
}
