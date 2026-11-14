import { NavLink, useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, Boxes, FileText, LogOut, PackageCheck, Tags, Users, Warehouse } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getQueue, syncQueue } from '../lib/offline';

const links = [
  { title: 'Overview', to: '/', icon: BarChart3, roles: ['admin', 'staff'] },
  { title: 'Products', to: '/products', icon: Boxes, roles: ['admin', 'staff'] },
  { title: 'Stock operations', to: '/stock', icon: Warehouse, roles: ['admin', 'staff'] },
  { title: 'Sales history', to: '/sales', icon: FileText, roles: ['admin'] },
  { title: 'Low-stock alerts', to: '/alerts', icon: AlertTriangle, roles: ['admin'] },
  { title: 'Categories', to: '/categories', icon: Tags, roles: ['admin'] },
  { title: 'Team', to: '/team', icon: Users, roles: ['admin'] },
  { title: 'Reports', to: '/reports', icon: Activity, roles: ['admin'] },
];

export default function Layout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    const refresh = async () => {
      try { setQueue(await getQueue()); } catch (error) { console.error('Offline queue read failed:', error); }
    };
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) syncQueue().catch((error) => console.error('Stock sync failed:', error));
      refresh();
    };
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('stockwise-queue-change', refresh);
    refresh();
    if (navigator.onLine) syncQueue().catch((error) => console.error('Stock sync failed:', error));
    return () => {
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('stockwise-queue-change', refresh);
    };
  }, []);

  const logout = () => {
    onLogout();
    navigate('/login');
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><PackageCheck size={20} /></div><div><strong>stockwise</strong><small>INVENTORY WORKSPACE</small></div></div>
        <div className="side-label">BUSINESS</div>
        <nav className="nav-list">
          {links.filter((item) => item.roles.includes(user?.role)).map(({ title, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} />{title}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="identity"><span className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</span><div><strong>{user?.name}</strong><small>{user?.role === 'admin' ? 'Administrator' : 'Staff member'}</small></div></div>
          <button className="logout" type="button" onClick={logout}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="top-context"><Activity size={15} /> Inventory workspace</div><div className="top-meta"><span className={`connection ${online ? 'online' : 'offline'}`}><i />{online ? 'Online' : 'Offline'}</span>{queue.length > 0 && <span className="queue-count">{queue.length} pending/conflict</span>}<time>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time></div></header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
