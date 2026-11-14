import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Boxes, CircleDollarSign, PackageCheck, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../api/client';
import formatCurrency from '../lib/formatCurrency';

export default function DashboardPage({ user }) {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [tops, setTops] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/dashboard/summary'),
      api.get('/dashboard/trends'),
      api.get('/alerts'),
      user?.role === 'admin' ? api.get('/restocking/suggestions') : Promise.resolve({ data: { suggestions: [] } }),
    ]).then(([summaryResponse, trendResponse, alertResponse, restockResponse]) => {
      if (!active) return;
      setSummary(summaryResponse.data);
      setTrend(trendResponse.data.data || []);
      setTops(trendResponse.data.topProducts || []);
      setAlerts(alertResponse.data.alerts || []);
      setRecommendations(restockResponse.data.suggestions || []);
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Dashboard data unavailable. Verify backend and database connection.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  if (loading) return <div className="loading-card"><span className="spinner" /> Loading live business metrics…</div>;
  const kpis = [
    { title: 'Products', value: summary?.totalProducts ?? 0, note: 'Active catalog', icon: Boxes, color: 'blue' },
    { title: 'Inventory value', value: formatCurrency(summary?.totalInventoryValue, user?.currency, 0), note: 'At purchase cost', icon: CircleDollarSign, color: 'violet' },
    { title: 'Low stock', value: summary?.lowStockCount ?? 0, note: 'Products need attention', icon: AlertTriangle, color: 'orange' },
    { title: 'Out of stock', value: summary?.outOfStockCount ?? 0, note: 'Currently unavailable', icon: PackageCheck, color: 'green' },
    { title: "Today's sales", value: formatCurrency(summary?.salesToday, user?.currency, 0), note: `${summary?.transactionsToday || 0} completed sales`, icon: TrendingUp, color: 'blue' },
    { title: 'Stock units', value: summary?.totalStockUnits ?? 0, note: 'Across active products', icon: PackageCheck, color: 'green' },
  ];
  return (
    <div className="page-stack">
      <header className="page-heading"><div><h1>Overview</h1></div><Link to="/stock" className="button primary"><PackageCheck size={16} /> Update stock</Link></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      <section className="hero">
        <div><span className="hero-kicker">YOUR BUSINESS AT A GLANCE</span><h2>Know what’s in stock.<br />Know what needs attention.</h2><Link to="/products" className="hero-link">View products <ArrowRight size={15} /></Link></div>
        <div className="hero-stat"><span>MONTHLY SALES</span><strong>{formatCurrency(summary?.salesThisMonth, user?.currency, 0)}</strong><small>{summary?.transactionsThisMonth ?? 0} completed sales this month</small><Link to="/sales" className="hero-link">Record a sale <ArrowRight size={15} /></Link></div>
      </section>
      <section className="kpi-grid">
        {kpis.map(({ title, value, note, icon: Icon, color }) => <article className="kpi-card" key={title}><span className={`kpi-icon ${color}`}><Icon size={18} /></span><span className="kpi-title">{title}</span><strong>{value}</strong><small>{note}</small></article>)}
      </section>
      <section className="two-panels">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Sales trend</h2></div><span className="pill neutral">Last 7 days</span></div><div className="chart-area"><ResponsiveContainer><AreaChart data={trend}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#39a778" stopOpacity=".22" /><stop offset="95%" stopColor="#39a778" stopOpacity="0" /></linearGradient></defs><CartesianGrid stroke="#edf0eb" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#65746a', fontSize: 14 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#65746a', fontSize: 14 }} /><Tooltip formatter={(value) => formatCurrency(value, user?.currency)} /><Area type="monotone" dataKey="sales" name="Revenue" stroke="#25875c" strokeWidth={2.5} fill="url(#salesFill)" /></AreaChart></ResponsiveContainer></div></article>
        <article className="panel"><div className="panel-heading"><div><span className="section-kicker">ATTENTION REQUIRED</span><h2>Low-stock alerts</h2></div><Link to="/alerts" className="text-link">View all <ArrowRight size={14} /></Link></div><div className="list">
          {alerts.length === 0 ? <div className="empty"><PackageCheck size={22} /><strong>All clear</strong><span>Nothing is at or below reorder level.</span></div> : alerts.slice(0, 5).map((item) => <div className="list-item" key={item.id || item._id}><div><strong>{item.name || item.productName}</strong><small>{item.currentStock} available · threshold {item.reorderLevel ?? item.minimumStockLevel}</small></div><span className="pill warning">Low</span></div>)}
        </div></article>
      </section>
      <section className="two-panels">
        <article className="panel"><div className="panel-heading"><div><span className="section-kicker">CUSTOMER DEMAND</span><h2>Top-selling products</h2></div></div>{tops.length ? <div className="list">{tops.map((item, index) => <div className="list-item" key={item._id}><div className="rank-name"><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong></div><strong>{item.unitsSold} units</strong></div>)}</div> : <div className="empty"><TrendingUp size={22} /><strong>No sales data yet</strong><span>Recorded customer sales appear here.</span></div>}</article>
        <article className="panel"><div className="panel-heading"><div><span className="section-kicker">REPLENISHMENT</span><h2>Restock suggestions</h2></div><Link to="/restocking" className="text-link">Details <ArrowRight size={14} /></Link></div>{user?.role !== 'admin' ? <div className="empty">Restock recommendations are available to administrators.</div> : recommendations.length ? <div className="list">{recommendations.slice(0, 5).map((item) => <div className="list-item" key={item.productId}><div><strong>{item.productName}</strong><small>{item.reason}</small></div><span className="pill neutral">{item.recommendedOrder ?? '—'} units</span></div>)}</div> : <div className="empty">No restock recommendations to show.</div>}</article>
      </section>
      <article className="panel"><div className="panel-heading"><div><span className="section-kicker">AUDIT TRAIL</span><h2>Recent stock movements</h2></div><Link to="/stock" className="text-link">Open stock operations <ArrowRight size={14} /></Link></div>{summary?.recentMovements?.length ? <div className="table-scroll"><table><thead><tr><th>Product</th><th>Operation</th><th>Quantity</th><th>Staff</th><th>Date</th></tr></thead><tbody>{summary.recentMovements.map((item) => <tr key={item.transactionId}><td>{item.productName}</td><td>{item.operationType}</td><td>{item.type === 'IN' ? '+' : '−'}{item.quantity}</td><td>{item.staffName}</td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty">No stock movements have been recorded.</div>}</article>
    </div>
  );
}
