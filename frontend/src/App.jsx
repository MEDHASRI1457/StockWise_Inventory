import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const RestockPage = lazy(() => import('./pages/RestockPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const StockPage = lazy(() => import('./pages/StockPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));

function storedUser() {
  try { return JSON.parse(localStorage.getItem('smartInventoryUser') || 'null'); } catch { return null; }
}

export default function App() {
  const [user, setUser] = useState(storedUser);
  useEffect(() => {
    if (user) localStorage.setItem('smartInventoryUser', JSON.stringify(user));
    else localStorage.removeItem('smartInventoryUser');
  }, [user]);
  const acceptAuth = (result) => {
    localStorage.setItem('smartInventoryToken', result.token);
    setUser(result.user);
  };
  const logout = () => {
    localStorage.removeItem('smartInventoryToken');
    localStorage.removeItem('smartInventoryUser');
    setUser(null);
  };
  const page = (element, roles) => <ProtectedRoute user={user} roles={roles}><Layout user={user} onLogout={logout}>{element}</Layout></ProtectedRoute>;
  return <BrowserRouter><Suspense fallback={<div className="loading-card"><span className="spinner" /> Loading workspace…</div>}><Routes>
    <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" onAuth={acceptAuth} />} />
    <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" onAuth={acceptAuth} />} />
    <Route path="/" element={page(<DashboardPage user={user} />)} />
    <Route path="/products" element={page(<ProductsPage canManage={user?.role === 'admin'} currency={user?.currency} />)} />
    <Route path="/stock" element={page(<StockPage />)} />
    <Route path="/sales" element={page(<SalesPage currency={user?.currency} />, ['admin'])} />
    <Route path="/alerts" element={page(<AlertsPage />, ['admin'])} />
    <Route path="/categories" element={page(<CategoriesPage />, ['admin'])} />
    <Route path="/team" element={page(<TeamPage />, ['admin'])} />
    <Route path="/reports" element={page(<ReportsPage currency={user?.currency} />, ['admin'])} />
    <Route path="/restocking" element={page(<RestockPage currency={user?.currency} />, ['admin'])} />
    <Route path="/profile" element={page(<ProfilePage user={user} />)} />
    <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
  </Routes></Suspense></BrowserRouter>;
}
