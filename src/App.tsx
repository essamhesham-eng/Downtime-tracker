/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ReportIncident } from './pages/ReportIncident';
import { IncidentsList } from './pages/IncidentsList';
import { AdminPanel } from './pages/AdminPanel';
import { Reports } from './pages/Reports';
import { Profile } from './pages/Profile';
import { Analysis } from './pages/Analysis';
import { WIP } from './pages/WIP';
import { Wrench } from 'lucide-react';

function ProtectedRoute({ children, requiredPermission }: { children: React.ReactNode, requiredPermission?: string }) {
  const { user, profile, loading, permissions, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (profile?.role === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-md text-center">
          <Wrench className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Account Pending</h2>
          <p className="text-gray-600 mb-6">Your account is waiting for administrator approval. Please contact your admin to assign you a role.</p>
          <button
            onClick={signOut}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (requiredPermission && profile) {
    const rolePerms = permissions[profile.role] || [];
    if (!rolePerms.includes(requiredPermission)) {
      return <Navigate to="/" />;
    }
  }

  return <>{children}</>;
}

function Login() {
  const { user, signInWithEmail } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  if (user) {
    return <Navigate to="/" />;
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError(err.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-md w-full text-center">
        <Wrench className="w-16 h-16 text-blue-600 mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Downtime Tracker</h1>
        <p className="text-gray-600 mb-8">
          Sign in to manage production lines and track machine downtime.
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter your email"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ProtectedRoute requiredPermission="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="report" element={
          <ProtectedRoute requiredPermission="report">
            <ReportIncident />
          </ProtectedRoute>
        } />
        <Route path="incidents" element={
          <ProtectedRoute requiredPermission="incidents">
            <IncidentsList />
          </ProtectedRoute>
        } />
        <Route path="reports" element={
          <ProtectedRoute requiredPermission="reports">
            <Reports />
          </ProtectedRoute>
        } />
        <Route path="analysis" element={
          <ProtectedRoute requiredPermission="analysis">
            <Analysis />
          </ProtectedRoute>
        } />
        <Route path="wip" element={
          <ProtectedRoute requiredPermission="wip">
            <WIP />
          </ProtectedRoute>
        } />
        <Route path="profile" element={
          <ProtectedRoute requiredPermission="profile">
            <Profile />
          </ProtectedRoute>
        } />
        <Route path="admin" element={
          <ProtectedRoute requiredPermission="admin">
            <AdminPanel />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
