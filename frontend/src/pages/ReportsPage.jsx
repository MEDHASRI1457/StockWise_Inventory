import { useEffect, useState } from 'react';
import api from '../api/client';
import formatCurrency from '../lib/formatCurrency';

export default function ReportsPage({ currency = 'INR' }) {
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get('/reports/sales'), api.get('/reports/inventory')])
      .then(([salesResponse, inventoryResponse]) => { setSales(salesResponse.data); setInventory(inventoryResponse.data); })
      .catch((e) => setError(e.response?.data?.message || 'Could not load reports.'));
  }, []);
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">BUSINESS INTELLIGENCE</span><h1>Reports</h1><p>Live totals calculated from your business data.</p></div></header>{error && <div className="notice error" role="alert">{error}</div>}
    <section className="kpi-grid three"><article className="kpi-card"><span className="kpi-title">Month-to-date sales</span><strong>{formatCurrency(sales?.totalSales, currency)}</strong><small>{sales?.transactionCount ?? 0} completed sales</small></article><article className="kpi-card"><span className="kpi-title">Inventory cost value</span><strong>{formatCurrency(inventory?.costValue, currency)}</strong><small>Current stock × purchase cost</small></article><article className="kpi-card"><span className="kpi-title">Retail stock value</span><strong>{formatCurrency(inventory?.retailValue, currency)}</strong><small>Current stock × selling price</small></article></section>
    <section className="panel"><div className="panel-heading"><h2>Inventory valuation</h2></div><div className="table-scroll"><table><tbody><tr><th>Active products</th><td>{inventory?.products ?? '—'}</td></tr><tr><th>Total units on hand</th><td>{inventory?.units ?? '—'}</td></tr><tr><th>Recorded movements</th><td>{inventory?.movementCount ?? '—'}</td></tr><tr><th>Sales reporting period</th><td>{sales ? `${new Date(sales.from).toLocaleDateString()} – ${new Date(sales.to).toLocaleDateString()}` : '—'}</td></tr></tbody></table></div><p className="panel-subtitle">Export features and advanced date-filtered reports are not enabled in this milestone.</p></section>
  </div>;
}
