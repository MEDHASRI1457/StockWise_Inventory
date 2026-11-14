import { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import api from '../api/client';
import formatCurrency from '../lib/formatCurrency';

const blank = { productId: '', name: '', sku: '', barcode: '', category: '', description: '', purchasePrice: '', sellingPrice: '', currentStock: '0', minimumStockLevel: '5', maximumStockLevel: '', unit: 'unit', supplierName: '', location: '' };

export default function ProductsPage({ canManage, currency = 'INR' }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [image, setImage] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('date-newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/products', { params: { page, limit: 10, search: query, category, sort } });
      setProducts(data.products || []);
      setPagination(data.pagination || { total: 0, totalPages: 1 });
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load products.');
    } finally { setLoading(false); }
  };
  useEffect(() => { api.get('/categories').then(({ data }) => setCategories(data.categories || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [page, query, category, sort]);

  const save = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => { if (value !== '') payload.append(key, value); });
    if (image) payload.append('image', image);
    try {
      if (editing) await api.put(`/products/${editing}`, payload);
      else await api.post('/products', payload);
      setNotice(editing ? 'Product details updated. Use stock operations to change quantities.' : 'Product created with its opening stock recorded.');
      setForm(blank); setImage(null); setEditing(null); await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save product.');
    }
  };

  const startEdit = (product) => {
    setEditing(product.id || product._id);
    setForm({
      productId: product.productId || '', name: product.name, sku: product.sku,
      barcode: product.barcode || '', category: product.category,
      description: product.description || '', purchasePrice: String(product.purchasePrice),
      sellingPrice: String(product.sellingPrice), currentStock: String(product.currentStock),
      minimumStockLevel: String(product.minimumStockLevel), maximumStockLevel: product.maximumStockLevel == null ? '' : String(product.maximumStockLevel),
      unit: product.unit || 'unit', supplierName: product.supplierName || '', location: product.location || '',
    });
  };

  const archive = async (product) => {
    if (!window.confirm(`Archive ${product.name}? This retains its transaction history.`)) return;
    try { await api.delete(`/products/${product.id || product._id}`); setNotice('Product archived. History retained.'); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not archive product.'); }
  };

  return (
    <div className="page-stack">
      <header className="page-heading"><div><span className="eyebrow">PRODUCT CATALOG</span><h1>{canManage ? 'Products' : 'Available products'}</h1><p>{pagination.total} products in your business.</p></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
      {canManage && <section className="panel"><div className="panel-heading"><div><span className="section-kicker">{editing ? 'UPDATE CATALOG ENTRY' : 'NEW CATALOG ENTRY'}</span><h2>{editing ? 'Edit product' : 'Add a product'}</h2></div></div>
        <form className="form-grid" onSubmit={save}>
          <label>Product name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={160} /></label>
          <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
          <label>Barcode<input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
          <label>Category<input list="categories-list" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /><datalist id="categories-list">{categories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
          <label>Purchase price (₹)<input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} required /></label>
          <label>Selling price (₹)<input type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} required /></label>
          <label>{editing ? 'Current stock (use Stock operations to change)' : 'Opening stock'}<input type="number" min="0" step="1" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} disabled={Boolean(editing)} /></label>
          <label>Minimum stock<input type="number" min="0" step="1" value={form.minimumStockLevel} onChange={(e) => setForm({ ...form, minimumStockLevel: e.target.value })} required /></label>
          <label>Maximum stock<input type="number" min="0" step="1" value={form.maximumStockLevel} onChange={(e) => setForm({ ...form, maximumStockLevel: e.target.value })} /></label>
          <label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
          <label>Supplier name<input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></label>
          <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label className="span-two">Description<textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="span-two">Product image (JPG, PNG, WEBP; max 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setImage(e.target.files?.[0] || null)} /></label>
          <div className="form-actions span-two"><button className="button primary"><Plus size={16} />{editing ? 'Save product' : 'Create product'}</button>{editing && <button className="button secondary" type="button" onClick={() => { setEditing(null); setForm(blank); setImage(null); }}>Cancel</button>}</div>
        </form>
      </section>}
      <section className="panel">
        <div className="panel-heading inventory-toolbar"><div><span className="section-kicker">INVENTORY</span><h2>Product list</h2></div>
          <div className="filters"><label className="searchbox"><Search size={15} /><input placeholder="Search name, SKU, barcode" value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} /></label><select aria-label="Filter by category" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }}><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)}><option value="date-newest">Newest</option><option value="date-oldest">Oldest</option><option value="price-low">Price low-high</option><option value="price-high">Price high-low</option><option value="stock-low">Stock low-high</option><option value="stock-high">Stock high-low</option></select></div>
        </div>
        {loading ? <div className="loading-card"><span className="spinner" /> Loading catalog…</div> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Available</th><th>Status</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
          {products.length === 0 ? <tr><td className="empty" colSpan={canManage ? 7 : 6}>No products match your filters.</td></tr> : products.map((item) => <tr key={item.id || item._id}><td><strong>{item.name}</strong><small className="cell-sub">{item.location || item.unit || '—'}</small></td><td>{item.sku}</td><td>{item.category}</td><td>{formatCurrency(item.sellingPrice, currency)}</td><td>{item.currentStock}</td><td><span className={`pill ${item.currentStock <= item.minimumStockLevel ? 'warning' : 'success'}`}>{item.currentStock === 0 ? 'Out of stock' : item.currentStock <= item.minimumStockLevel ? 'Low stock' : 'Healthy'}</span></td>{canManage && <td className="actions"><button aria-label={`Edit ${item.name}`} className="icon-button" onClick={() => startEdit(item)}><Pencil size={15} /></button><button aria-label={`Archive ${item.name}`} className="icon-button danger" onClick={() => archive(item)}><Trash2 size={15} /></button></td>}</tr>)}
        </tbody></table></div>}
        <div className="pagination"><span>Page {pagination.page || page} of {pagination.totalPages || 1}</span><div><button className="button secondary small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="button secondary small" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
      </section>
    </div>
  );
}
