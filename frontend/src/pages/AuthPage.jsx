import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import api from '../api/client';

export default function AuthPage({ mode, onAuth }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      onAuth(data);
      navigate('/');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not connect to StockWise. Check that the API is running.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <div className="brand auth-brand"><div className="brand-mark"><PackageCheck size={20} /></div><div><strong>stockwise</strong><small>SMART INVENTORY</small></div></div>
        <div className="auth-message"><span className="eyebrow">KNOW YOUR STOCK. CONTROL YOUR BUSINESS.</span><h1>Better inventory decisions start here.</h1><p>Bring your products, sales and stock movements into one clear workspace.</p></div>
        <div className="auth-aside-foot">Simple operations. Smarter planning.</div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">{isRegister ? 'CREATE A WORKSPACE' : 'WELCOME BACK'}</span>
          <h2>{isRegister ? 'Start with StockWise' : 'Sign in to your account'}</h2>
          <p className="muted">{isRegister ? 'Set up your business workspace in a minute.' : 'Enter your details to open your inventory workspace.'}</p>
          <form onSubmit={submit} className="form-stack">
            {isRegister && <><label>Your name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" /></label><label>Business name<input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required /></label></>}
            <label>Email address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" /></label>
            <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={isRegister ? 10 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} />{isRegister && <small className="help-text">Use at least 10 characters.</small>}</label>
            {error && <div className="notice error" role="alert">{error}</div>}
            <button className="button primary wide" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create workspace' : 'Sign in'}</button>
          </form>
          <p className="auth-switch">{isRegister ? 'Already have a workspace?' : 'New to StockWise?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
        </div>
      </section>
    </main>
  );
}
