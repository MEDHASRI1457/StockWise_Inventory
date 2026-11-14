import { useEffect, useState } from 'react';
import { Plus, ReceiptText, RotateCcw, Trash2 } from 'lucide-react';
import api from '../api/client';
import formatCurrency from '../lib/formatCurrency';

export default function SalesPage({ currency = 'INR' }) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [period, setPeriod] = useState('monthly');
  const [summary, setSummary] = useState({});
  const [cart, setCart] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const [productResponse, saleResponse, summaryResponse] = await Promise.all([
        api.get('/products', { params: { limit: 100 } }),
        api.get('/sales', { params: { limit: 50, from: dateFrom || undefined, to: dateTo ? `${dateTo}T23:59:59` : undefined } }),
        api.get('/sales/summary', { params: { period } }),
      ]);
      setProducts(productResponse.data.products || []);
      setSales(saleResponse.data.sales || []);
      setSummary(summaryResponse.data);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not load sales.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [period, dateFrom, dateTo]);

  const addLine = () => setCart((items) => [...items, { productId: '', quantity: '1' }]);
  const setLine = (index, key, value) => setCart((items) => items.map((item, current) => current === index ? { ...item, [key]: value } : item));
  const total = cart.reduce((sum, line) => {
    const product = products.find((item) => (item.id || item._id) === line.productId);
    return sum + (product ? Number(line.quantity || 0) * product.sellingPrice : 0);
  }, 0);

  async function submitSale(event) {
    event.preventDefault();
    setError(''); setNotice('');
    try {
      const items = cart.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }));
      const { data } = await api.post('/sales', { items, idempotencyKey: crypto.randomUUID() });
      setNotice(`Sale ${data.sale?.transactionId?.slice(0, 8) || ''} recorded for ${formatCurrency(data.sale?.totalAmount, currency)}.`);
      setCart([]); await load();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Sale failed; inventory was not changed.'); }
  }

  async function returnSale(sale) {
    if (!window.confirm(`Return all items from sale ${sale.transactionId}? This creates compensating stock entries.`)) return;
    try {
      await api.post(`/sales/${sale.id}/return`, { idempotencyKey: crypto.randomUUID() });
      setNotice('Return recorded as a separate compensating transaction.');
      await load();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Return could not be processed.'); }
  }

  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">CUSTOMER TRANSACTIONS</span><h1>Sales</h1><p>Customer sales are separate from stock adjustments and supplier receipts.</p></div><div className="filters"><label>Revenue period<select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="daily">Today</option><option value="weekly">Last 7 days</option><option value="monthly">This month</option></select></label></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
      <section className="kpi-grid three">
        <article className="kpi-card"><span className="kpi-title">Revenue</span><strong>{formatCurrency(summary.totalSales, currency)}</strong><small>Selected period</small></article>
        <article className="kpi-card"><span className="kpi-title">Units sold</span><strong>{summary.totalUnits || 0}</strong><small>Customer sale items</small></article>
        <article className="kpi-card"><span className="kpi-title">Transactions</span><strong>{summary.transactions || 0}</strong><small>Completed sales</small></article>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="section-kicker">CHECKOUT</span><h2>Record a sale</h2></div><button type="button" className="button secondary" onClick={addLine}><Plus size={15} /> Add product</button></div>
        {cart.length === 0 ? <button className="empty action-empty" type="button" onClick={addLine}><Plus size={18} /> Add items to start a sale</button> : <form onSubmit={submitSale}>
          <div className="cart-list">{cart.map((line, index) => {
            const product = products.find((item) => (item.id || item._id) === line.productId);
            return <div className="cart-line" key={index}><label>Product<select required value={line.productId} onChange={(e) => setLine(index, 'productId', e.target.value)}><option value="">Select product</option>{products.map((item) => <option disabled={item.currentStock === 0} key={item.id || item._id} value={item.id || item._id}>{item.name} · available {item.currentStock}</option>)}</select></label><label>Qty<input type="number" min="1" max={product?.currentStock || undefined} step="1" required value={line.quantity} onChange={(e) => setLine(index, 'quantity', e.target.value)} /></label><strong>{formatCurrency(product ? Number(line.quantity) * product.sellingPrice : 0, currency)}</strong><button className="icon-button danger" type="button" aria-label="Remove item" onClick={() => setCart((items) => items.filter((_, current) => current !== index))}><Trash2 size={15} /></button></div>;
          })}</div>
          <div className="checkout-footer"><strong>Sale total <span>{formatCurrency(total, currency)}</span></strong><button className="button primary"><ReceiptText size={16} /> Complete sale</button></div>
        </form>}
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="section-kicker">TRANSACTION LOG</span><h2>Sales history</h2></div><div className="date-filters"><label>From<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label><label>To<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label></div></div>
        {loading ? <div className="loading-card"><span className="spinner" /> Loading sales…</div> : <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Products</th><th>Total</th><th>Staff</th><th>Date</th><th>Action</th></tr></thead><tbody>{sales.length === 0 ? <tr><td className="empty" colSpan="6">No customer sales match these dates.</td></tr> : sales.map((sale) => <tr key={sale.id || sale._id}><td>{sale.transactionId.slice(0, 10)}</td><td>{sale.items.map((item) => `${item.productName} × ${item.quantity}${item.returnedQuantity ? ` (${item.returnedQuantity} returned)` : ''}`).join(', ')}</td><td>{formatCurrency(sale.totalAmount, currency)}</td><td>{sale.staffName}</td><td>{new Date(sale.createdAt).toLocaleString()}</td><td><button className="button secondary small" disabled={!sale.returnable} onClick={() => returnSale(sale)}><RotateCcw size={14} />{sale.returnable ? 'Return remaining' : 'Returned'}</button></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
