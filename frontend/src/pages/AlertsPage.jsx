import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../api/client';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api.get('/alerts').then(({ data }) => setAlerts(data.alerts || []));
  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Could not load alerts.')); }, []);
  async function resolve(item) {
    try { setError(''); await api.put(`/alerts/${item.id}/resolve`); setNotice(`Alert resolved for ${item.name}.`); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Alert cannot be resolved yet.'); }
  }
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">INVENTORY HEALTH</span><h1>Low-stock alerts</h1><p>Alerts open at or below reorder level and close after replenishment.</p></div></header>{error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel"><div className="panel-heading"><div><span className="section-kicker">ACTIVE ALERTS</span><h2>{alerts.length} products need attention</h2></div><AlertTriangle size={18} /></div>{alerts.length ? <div className="table-scroll"><table><thead><tr><th>Product</th><th>Available</th><th>Threshold</th><th>Status</th><th>Action</th></tr></thead><tbody>{alerts.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.currentStock}</td><td>{item.reorderLevel ?? item.minimumStockLevel}</td><td><span className="pill warning">Low stock</span></td><td><button className="button secondary small" onClick={() => resolve(item)}>Resolve</button></td></tr>)}</tbody></table></div> : <div className="empty"><CheckCircle2 size={23} /><strong>All clear</strong><span>Nothing is below its stock threshold.</span></div>}</section>
  </div>;
}
