import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { differenceInMinutes, format } from 'date-fns';
import { Wrench, CheckCircle, Clock, AlertTriangle, Filter, Trash2, ArrowUpDown } from 'lucide-react';

import { MultiSelect } from '../components/MultiSelect';

export function IncidentsList() {
  const { user, profile } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [reviewingIncident, setReviewingIncident] = useState<any | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Filters and Sorting
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all');
  const [resolvedSearch, setResolvedSearch] = useState('');
  const [resolvedSortField, setResolvedSortField] = useState<'startTime' | 'durationMinutes' | 'machineName' | 'lineName'>('startTime');
  const [resolvedSortOrder, setResolvedSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Admin Selection
  const [selectedResolvedIds, setSelectedResolvedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'incidents'), orderBy('startTime', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsub();
      unsubUsers();
    };
  }, []);

  const handleAcknowledge = async (incidentId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        status: 'acknowledged',
        acknowledgedBy: user.uid,
        acknowledgedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error acknowledging incident:', error);
      setError('Failed to acknowledge incident.');
    }
  };

  const handleResolve = async (incident: any) => {
    if (!user) return;
    try {
      const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
      const duration = differenceInMinutes(new Date(), start);

      const hasCauseAndAction = incident.cause && incident.action;

      await updateDoc(doc(db, 'incidents', incident.id), {
        status: hasCauseAndAction ? 'resolved' : 'pending_me_review',
        resolvedBy: user.uid,
        endTime: serverTimestamp(),
        durationMinutes: duration,
      });

      await updateDoc(doc(db, 'machines', incident.machineId), {
        status: 'running',
        currentIncidentId: null,
      });
    } catch (error) {
      console.error('Error resolving incident:', error);
      setError('Failed to resolve incident.');
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingIncident || !user) return;
    
    setIsSubmittingReview(true);
    try {
      const updates: any = {
        cause,
        action,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp()
      };

      if (reviewingIncident.status === 'pending_me_review') {
        updates.status = 'resolved';
      }

      await updateDoc(doc(db, 'incidents', reviewingIncident.id), updates);
      
      setReviewingIncident(null);
      setCause('');
      setAction('');
    } catch (error) {
      console.error('Error submitting review:', error);
      setError('Failed to submit review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleAssignME = async (incidentId: string, meIds: string[]) => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        assignedTo: meIds.length > 0 ? meIds : null
      });
    } catch (error) {
      console.error('Error assigning ME:', error);
      setError('Failed to assign ME.');
    }
  };

  const handleDeleteResolved = async () => {
    if (profile?.role !== 'admin' || selectedResolvedIds.size === 0) return;
    setDeleteConfirm(true);
  };

  const confirmDeleteResolved = async () => {
    setIsDeleting(true);
    setDeleteConfirm(false);
    try {
      for (const id of selectedResolvedIds) {
        await deleteDoc(doc(db, 'incidents', id));
      }
      setSelectedResolvedIds(new Set());
    } catch (error) {
      console.error('Error deleting incidents:', error);
      setError('Failed to delete incidents.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleResolvedSelection = (id: string) => {
    const newSet = new Set(selectedResolvedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedResolvedIds(newSet);
  };

  const toggleAllResolved = () => {
    if (selectedResolvedIds.size === filteredResolvedIncidents.length) {
      setSelectedResolvedIds(new Set());
    } else {
      setSelectedResolvedIds(new Set(filteredResolvedIncidents.map(i => i.id)));
    }
  };

  const maintenanceEngineers = users.filter(u => u.role === 'maintenance_engineer');

  const activeIncidents = useMemo(() => {
    let filtered = incidents.filter(i => i.status !== 'resolved');
    if (activeStatusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === activeStatusFilter);
    }
    return filtered;
  }, [incidents, activeStatusFilter]);

  const filteredResolvedIncidents = useMemo(() => {
    let filtered = incidents.filter(i => i.status === 'resolved');
    
    if (resolvedSearch) {
      const searchLower = resolvedSearch.toLowerCase();
      filtered = filtered.filter(i => 
        i.machineName?.toLowerCase().includes(searchLower) ||
        i.lineName?.toLowerCase().includes(searchLower) ||
        i.cause?.toLowerCase().includes(searchLower) ||
        i.action?.toLowerCase().includes(searchLower)
      );
    }

    filtered.sort((a, b) => {
      let valA = a[resolvedSortField];
      let valB = b[resolvedSortField];

      if (resolvedSortField === 'startTime') {
        valA = valA?.toMillis?.() || 0;
        valB = valB?.toMillis?.() || 0;
      }

      if (valA < valB) return resolvedSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return resolvedSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [incidents, resolvedSearch, resolvedSortField, resolvedSortOrder]);

  const handleSort = (field: typeof resolvedSortField) => {
    if (resolvedSortField === field) {
      setResolvedSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setResolvedSortField(field);
      setResolvedSortOrder('desc');
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center justify-between border border-red-100 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} />
            <p className="font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete {selectedResolvedIds.size} incident(s)? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteResolved}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle className="text-red-500" />
            Active Incidents
          </h2>
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-500" />
            <select
              value={activeStatusFilter}
              onChange={(e) => setActiveStatusFilter(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            >
              <option value="all">All Active</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="pending_me_review">Pending Review</option>
            </select>
          </div>
        </div>
        
        {activeIncidents.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500 flex flex-col items-center gap-2">
            <CheckCircle className="text-green-500" size={32} />
            <p>No active incidents match your filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeIncidents.map(incident => {
              const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
              const isPendingReview = incident.status === 'pending_me_review';
              const duration = isPendingReview && incident.durationMinutes 
                ? incident.durationMinutes 
                : differenceInMinutes(now, start);
              const isAcknowledged = incident.status === 'acknowledged';

              return (
                <div key={incident.id} className={`bg-white p-6 rounded-xl shadow-sm border-l-4 ${
                  isPendingReview ? 'border-blue-500' : 
                  isAcknowledged ? 'border-yellow-400' : 'border-red-500 animate-pulse-border'
                }`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{incident.machineName}</h3>
                      <p className="text-sm text-gray-500">{incident.lineName}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      isPendingReview ? 'bg-blue-100 text-blue-800' :
                      isAcknowledged ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {isPendingReview ? 'Pending Review' : incident.status}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock size={16} />
                      <span>Started: {format(start, 'MMM d, HH:mm')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                      <AlertTriangle size={16} />
                      <span>Downtime: {duration} mins {isPendingReview && '(Fixed)'}</span>
                    </div>
                    {profile?.role === 'admin' ? (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                        <span className="font-medium">Assigned MEs:</span>
                        <MultiSelect
                          options={maintenanceEngineers.map(me => ({ value: me.id, label: me.displayName || me.email }))}
                          selectedValues={incident.assignedTo || []}
                          onChange={(newValues) => handleAssignME(incident.id, newValues)}
                          placeholder="All MEs"
                          className="w-full max-w-[200px]"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                        <span className="font-medium">Assigned MEs:</span>
                        <span className="font-semibold text-blue-600">
                          {incident.assignedTo && incident.assignedTo.length > 0 
                            ? incident.assignedTo.map((id: string) => maintenanceEngineers.find(me => me.id === id)?.displayName || 'Unknown ME').join(', ') 
                            : 'All MEs'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    {profile?.role === 'maintenance_engineer' && !isAcknowledged && !isPendingReview && (
                      <button
                        onClick={() => handleAcknowledge(incident.id)}
                        className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
                      >
                        <Wrench size={18} />
                        Acknowledge
                      </button>
                    )}
                    
                    {(profile?.role === 'line_leader' || profile?.role === 'admin') && !isPendingReview && (
                      <button
                        onClick={() => handleResolve(incident)}
                        className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
                      >
                        <CheckCircle size={18} />
                        Mark Fixed
                      </button>
                    )}

                    {(profile?.role === 'maintenance_engineer' || profile?.role === 'admin') && (
                      <button
                        onClick={() => {
                          setReviewingIncident(incident);
                          setCause(incident.cause || '');
                          setAction(incident.action || '');
                        }}
                        className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
                      >
                        <Wrench size={18} />
                        {incident.cause ? 'Edit Cause/Action' : 'Add Cause/Action'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CheckCircle className="text-green-500" />
            Recently Resolved
          </h2>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="Search incidents..."
              value={resolvedSearch}
              onChange={(e) => setResolvedSearch(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm flex-1 md:w-64"
            />
            {profile?.role === 'admin' && selectedResolvedIds.size > 0 && (
              <button
                onClick={handleDeleteResolved}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                Delete ({selectedResolvedIds.size})
              </button>
            )}
          </div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                {profile?.role === 'admin' && (
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      checked={selectedResolvedIds.size > 0 && selectedResolvedIds.size === filteredResolvedIncidents.length}
                      onChange={toggleAllResolved}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => handleSort('machineName')}>
                  <div className="flex items-center gap-1">Machine <ArrowUpDown size={14} /></div>
                </th>
                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => handleSort('lineName')}>
                  <div className="flex items-center gap-1">Line <ArrowUpDown size={14} /></div>
                </th>
                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => handleSort('startTime')}>
                  <div className="flex items-center gap-1">Start Time <ArrowUpDown size={14} /></div>
                </th>
                <th className="p-4 font-medium cursor-pointer hover:bg-gray-100" onClick={() => handleSort('durationMinutes')}>
                  <div className="flex items-center gap-1">Duration <ArrowUpDown size={14} /></div>
                </th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredResolvedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 6 : 5} className="p-8 text-center text-gray-500">No resolved incidents match your criteria.</td>
                </tr>
              ) : (
                filteredResolvedIncidents.map(incident => {
                  const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                  return (
                    <tr key={incident.id} className={`hover:bg-gray-50 transition-colors ${selectedResolvedIds.has(incident.id) ? 'bg-blue-50' : ''}`}>
                      {profile?.role === 'admin' && (
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedResolvedIds.has(incident.id)}
                            onChange={() => toggleResolvedSelection(incident.id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      <td className="p-4 font-medium text-gray-800">{incident.machineName}</td>
                      <td className="p-4 text-gray-600">{incident.lineName}</td>
                      <td className="p-4 text-gray-600">{format(start, 'MMM d, HH:mm')}</td>
                      <td className="p-4 font-medium text-red-600">{incident.durationMinutes} mins</td>
                      <td className="p-4">
                        {(profile?.role === 'maintenance_engineer' || profile?.role === 'admin') && (
                          <button
                            onClick={() => {
                              setReviewingIncident(incident);
                              setCause(incident.cause || '');
                              setAction(incident.action || '');
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                          >
                            Edit Cause/Action
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      {reviewingIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add Cause & Action</h3>
            <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm">
              <p><strong>Machine:</strong> {reviewingIncident.machineName}</p>
              <p><strong>Downtime:</strong> {reviewingIncident.durationMinutes ? `${reviewingIncident.durationMinutes} minutes` : 'Ongoing'}</p>
            </div>
            <form onSubmit={submitReview} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Root Cause</label>
                <textarea
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  placeholder="Describe what caused the downtime..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken</label>
                <textarea
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                  placeholder="Describe the action taken to resolve the issue..."
                  required
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setReviewingIncident(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  disabled={isSubmittingReview}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmittingReview ? 'Saving...' : (reviewingIncident.status === 'pending_me_review' ? 'Save & Resolve' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
