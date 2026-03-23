import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, AlertTriangle, Settings, FileSpreadsheet, LogOut, Wrench, User } from 'lucide-react';
import { useAlarmNotification } from '../hooks/useAlarmNotification';

export function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  
  const { activeAlarm, setActiveAlarm } = useAlarmNotification();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'engineer', 'line_leader', 'maintenance_engineer'] },
    { path: '/report', label: 'Report Breakdown', icon: AlertTriangle, roles: ['admin', 'line_leader'] },
    { path: '/incidents', label: 'Active Incidents', icon: Wrench, roles: ['admin', 'maintenance_engineer', 'line_leader', 'manager', 'engineer'] },
    { path: '/reports', label: 'Export Data', icon: FileSpreadsheet, roles: ['admin', 'manager', 'engineer'] },
    { path: '/admin', label: 'Admin Panel', icon: Settings, roles: ['admin'] },
    { path: '/profile', label: 'Profile', icon: User, roles: ['admin', 'manager', 'engineer', 'line_leader', 'maintenance_engineer'] },
  ];

  const filteredNav = navItems.filter(item => profile?.role && item.roles.includes(profile.role));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar / Bottom Nav */}
      <nav className="bg-white border-r border-gray-200 w-full md:w-64 flex-shrink-0 fixed bottom-0 md:relative z-10 md:h-screen flex md:flex-col shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:shadow-none">
        <div className="p-4 hidden md:block border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Wrench className="text-blue-600" />
            Downtime Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{profile?.displayName}</p>
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full mt-2 capitalize">
            {profile?.role.replace('_', ' ')}
          </span>
        </div>

        <div className="flex-1 flex md:flex-col overflow-x-auto md:overflow-y-auto p-2 md:p-4 gap-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-colors min-w-[72px] md:min-w-0 ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-500'} />
                <span className="text-[10px] md:text-sm text-center md:text-left">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="hidden md:block p-4 border-t border-gray-100">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-4 py-2 w-full text-gray-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0 h-screen">
        <div className="md:hidden bg-white p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Wrench className="text-blue-600" size={20} />
            Downtime Tracker
          </h1>
          <button onClick={signOut} className="p-2 text-gray-500 hover:text-red-600">
            <LogOut size={20} />
          </button>
        </div>
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Alarm Toast */}
      {activeAlarm && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-50 animate-bounce">
          <AlertTriangle size={24} />
          <div className="flex-1">
            <h4 className="font-bold text-lg">Machine Down!</h4>
            <p className="text-red-100">{activeAlarm.message}</p>
          </div>
          <button 
            onClick={() => setActiveAlarm(null)} 
            className="text-white/80 hover:text-white p-2"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
