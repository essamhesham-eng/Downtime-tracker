/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Wrench } from 'lucide-react';
import orbitLogo from './assets/images/orbit360_logo_1780398756649.png';

const Dashboard = React.lazy(() => import('./pages/Dashboard').then(mod => ({ default: mod.Dashboard })));
const ReportIncident = React.lazy(() => import('./pages/ReportIncident').then(mod => ({ default: mod.ReportIncident })));
const IncidentsList = React.lazy(() => import('./pages/IncidentsList').then(mod => ({ default: mod.IncidentsList })));
const AdminPanel = React.lazy(() => import('./pages/AdminPanel').then(mod => ({ default: mod.AdminPanel })));
const Reports = React.lazy(() => import('./pages/Reports').then(mod => ({ default: mod.Reports })));
const Profile = React.lazy(() => import('./pages/Profile').then(mod => ({ default: mod.Profile })));
const Analysis = React.lazy(() => import('./pages/Analysis').then(mod => ({ default: mod.Analysis })));
const WIP = React.lazy(() => import('./pages/WIP').then(mod => ({ default: mod.WIP })));
const Evaluation = React.lazy(() => import('./pages/Evaluation').then(mod => ({ default: mod.Evaluation })));

const LoadingFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

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
  const { user, signInWithEmail, signUpWithEmail, logoSettings } = useAuth();
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
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        if (email.toLowerCase() === 'essam.bn@yahoo.com') {
          try {
            await signUpWithEmail(email, password);
            return;
          } catch (signUpErr: any) {
            if (signUpErr.code === 'auth/email-already-in-use') {
              setError('Invalid password. Please try again.');
            } else if (signUpErr.code === 'auth/weak-password') {
              setError('Password should be at least 6 characters.');
            } else {
              setError(signUpErr.message || 'Failed to auto-create admin account.');
            }
          }
        } else {
          setError('Invalid email or password. Access is by invitation only.');
        }
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
        <img 
          src={(logoSettings && logoSettings.customLogo) ? logoSettings.customLogo : orbitLogo} 
          alt="ORBIT" 
          style={{
            height: logoSettings ? `${logoSettings.desktopHeight * 1.3}px` : '56px',
            width: logoSettings && logoSettings.desktopWidth !== 'auto' ? `${logoSettings.desktopWidth}px` : 'auto'
          }}
          className="object-contain mx-auto mb-6" 
          referrerPolicy="no-referrer"
        />
        <h1 className="text-3xl font-bold text-gray-800 mb-2 font-sans tracking-tight">ORBIT</h1>
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
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
            <Route path="evaluation" element={
              <ProtectedRoute requiredPermission="evaluation">
                <Evaluation />
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
      </Suspense>
    </ErrorBoundary>
  );
}

import { fetchServerTimeOffset } from './utils/time';

export default function App() {
  React.useEffect(() => {
    fetchServerTimeOffset();
  }, []);

  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
