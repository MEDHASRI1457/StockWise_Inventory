import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../api/client';

export default function CategoriesPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.get('/categories').then(({ data }) => setItems(data.categories || []));
  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Could not load categories.')); }, []);
  async function submit(event) {
    event.preventDefault(); setError('');
    try {
      if (editing) await api.put(`/categories/${editing}`, { name, description });
      else await api.post('/categories', { name, description });
      setName(''); setDescription(''); setEditing(null); await load();
    } catch (e) { setError(e.response?.data?.message || 'Could not save category.'); }
  }
  async function remove(item) {
    if (!window.confirm(`Delete category "${item.name}"?`)) return;
    try { await api.delete(`/categories/${item.id}`); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not delete category.'); }
  }
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">CATALOG ORGANIZATION</span><h1>Categories</h1><p>Keep your inventory searchable and organized.</p></div></header>{error && <div className="notice error" role="alert">{error}</div>}
    <section className="panel"><div className="panel-heading"><div><span className="section-kicker">CATEGORY SETUP</span><h2>{editing ? 'Edit category' : 'Add a category'}</h2></div></div><form className="form-row" onSubmit={submit}><label>Category name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} /></label><div className="form-actions"><button className="button primary"><Plus size={15} />{editing ? 'Save' : 'Add category'}</button>{editing && <button className="button secondary" type="button" onClick={() => { setEditing(null); setName(''); setDescription(''); }}>Cancel</button>}</div></form></section>
    <section className="panel"><div className="panel-heading"><h2>Business categories</h2><span className="pill neutral">{items.length} total</span></div><div className="table-scroll"><table><thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan="3" className="empty">No categories created.</td></tr> : items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.description || '—'}</td><td className="actions"><button aria-label={`Edit ${item.name}`} className="icon-button" onClick={() => { setEditing(item.id); setName(item.name); setDescription(item.description || ''); }}><Pencil size={14} /></button><button aria-label={`Delete ${item.name}`} className="icon-button danger" onClick={() => remove(item)}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div></section>
  </div>;
}
