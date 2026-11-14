import { UserRound } from 'lucide-react';

export default function ProfilePage({ user }) {
  return <div className="page-stack"><header className="page-heading"><div><span className="eyebrow">ACCOUNT</span><h1>My profile</h1><p>Your StockWise business access.</p></div></header><section className="panel profile"><div className="profile-icon"><UserRound size={25} /></div><div><span className="section-kicker">SIGNED IN</span><h2>{user?.name}</h2><p>{user?.email}</p></div></section><section className="panel"><h2>Workspace details</h2><dl className="details"><div><dt>Role</dt><dd>{user?.role}</dd></div><div><dt>Business ID</dt><dd>{user?.businessId}</dd></div></dl><p className="panel-subtitle">Never share access tokens. Ask an administrator to manage team permissions.</p></section></div>;
}
