import { useEffect, useState } from 'react';
import { UserPlus, UserX } from 'lucide-react';
import api from '../api/client';

export default function TeamPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api.get('/users').then(({ data }) => setUsers(data.users || []));
  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Could not load staff.')); }, []);
  async function addStaff(event) {
    event.preventDefault(); setError(''); setNotice('');
    try { await api.post('/users', form); setForm({ name: '', email: '', password: '' }); setNotice('Staff account created with staff-only permissions.'); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not create account.'); }
  }
  async function deactivate(user) {
    if (!window.confirm(`Deactivate ${user.name}? Past activity will be retained.`)) return;
    try { await api.delete(`/users/${user.id}`); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Could not deactivate staff.'); }
  }
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">BUSINESS ACCESS</span><h1>Team management</h1><p>New employees receive staff access only. Admin access cannot be granted from this page.</p></div></header>{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel"><div className="panel-heading"><div><span className="section-kicker">TEAM ACCOUNT</span><h2>Add staff member</h2></div></div><form className="form-grid" onSubmit={addStaff}><label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password (min. 10 characters)<input type="password" minLength="10" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><div className="form-actions"><button className="button primary"><UserPlus size={15} />Create staff login</button></div></form></section>
    <section className="panel"><div className="panel-heading"><h2>Business accounts</h2></div><div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td><span className={`pill ${user.isActive ? 'success' : 'warning'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.role === 'staff' && user.isActive && <button aria-label={`Deactivate ${user.name}`} className="icon-button danger" onClick={() => deactivate(user)}><UserX size={15} /></button>}</td></tr>)}</tbody></table></div></section>
  </div>;
}
