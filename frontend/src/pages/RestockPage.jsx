import { useEffect, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import api from '../api/client';
import formatCurrency from '../lib/formatCurrency';

export default function RestockPage({ currency = 'INR' }) {
  const [data, setData] = useState({ suggestions: [], periodDays: 30 });
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { const response = await api.get('/restocking/suggestions', { params: { days } }); setData(response.data); setError(''); }
    catch (e) { setError(e.response?.data?.message || 'Could not load restock recommendations.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days]);
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">SALES-TREND PLANNING</span><h1>Restocking suggestions</h1><p>Transparent estimates from recorded completed sales—not an advanced AI prediction.</p></div><label className="inline-select">History window<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label></header>{error && <div className="notice error" role="alert">{error}</div>}
    <section className="panel"><div className="panel-heading"><div><span className="section-kicker">REORDER ESTIMATES</span><h2>Review suggested replenishment</h2></div><button className="button secondary" onClick={load}><RefreshCw size={14} /> Refresh</button></div><p className="panel-subtitle">Reorder point = average daily demand × supplier lead time + safety stock. The initial lead time is 7 days and safety buffer is 3 days; pending purchase orders are not tracked.</p>
      {loading ? <div className="loading-card"><span className="spinner" /> Calculating from sales history…</div> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>Available</th><th>Avg/day</th><th>Lead demand</th><th>Safety stock</th><th>Reorder point</th><th>Suggested qty</th><th>Est. cost</th><th>Reason</th></tr></thead><tbody>{data.suggestions.length === 0 ? <tr><td className="empty" colSpan="9">No products currently require replenishment.</td></tr> : data.suggestions.map((item) => <tr key={item.productId}><td>{item.productName}</td><td>{item.currentStock} / min {item.reorderLevel}</td><td>{item.insufficientData ? '—' : item.avgDailySales}</td><td>{item.insufficientData ? 'Insufficient history' : item.forecastLeadDemand}</td><td>{item.safetyStock ?? '—'}</td><td>{item.reorderPoint ?? '—'}</td><td><strong>{item.recommendedOrder ?? '—'}</strong></td><td>{item.estimatedCost == null ? '—' : formatCurrency(item.estimatedCost, currency)}</td><td className="reason-cell">{item.reason}</td></tr>)}</tbody></table></div>}
    </section><div className="notice info"><Lightbulb size={17} /> Products without completed sale history show “insufficient data” instead of a fabricated demand estimate. Historical average is units sold during the chosen window divided by calendar days.</div>
  </div>;
}
