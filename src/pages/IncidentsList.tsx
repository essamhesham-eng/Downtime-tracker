import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Wrench, CheckCircle, Clock, AlertTriangle, Filter, Trash2, ArrowUpDown, ChevronDown, ChevronUp, Image as ImageIcon, X } from 'lucide-react';

import { MultiSelect } from '../components/MultiSelect';

import { getServerTime } from '../utils/time';

export function IncidentsList() {
  const { user, profile } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [now, setNow] = useState(getServerTime());
  const [reviewingIncident, setReviewingIncident] = useState<any | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');
  const [causeImage, setCauseImage] = useState<File | null>(null);
  const [actionImage, setActionImage] = useState<File | null>(null);
  const [causeImageUrl, setCauseImageUrl] = useState<string | null>(null);
  const [actionImageUrl, setActionImageUrl] = useState<string | null>(null);
  const [selectedReasonCode, setSelectedReasonCode] = useState('');
  const [reasonCodes, setReasonCodes] = useState<any[]>([]);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Filters and Sorting
  const [activeStatusFilter, setActiveStatusFilter] = useState<string>('all');
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [resolvedSearch, setResolvedSearch] = useState('');
  const [resolvedSortField, setResolvedSortField] = useState<'startTime' | 'durationMinutes' | 'machineName' | 'lineName'>('startTime');
  const [resolvedSortOrder, setResolvedSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Admin Selection
  const [selectedResolvedIds, setSelectedResolvedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<boolean>(false);

  const formatName = (name: string) => {
    if (!name) return 'Unknown';
    if (name.includes('@')) {
      return name.split('@')[0];
    }
    return name;
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(getServerTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'incidents'), orderBy('startTime', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qGroups = query(collection(db, 'groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qReasonCodes = query(collection(db, 'reasonCodes'), orderBy('code', 'asc'));
    const unsubReasonCodes = onSnapshot(qReasonCodes, (snapshot) => {
      setReasonCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsub();
      unsubUsers();
      unsubGroups();
      unsubReasonCodes();
    };
  }, [user]);

  const handleAcknowledge = async (incidentId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        status: 'working_on',
        workingOnBy: user.uid,
        workingOnAt: serverTimestamp(),
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
      const duration = Math.ceil((getServerTime().getTime() - start.getTime()) / 60000);

      if (incident.type === 'out_of_order') {
        // For out of order, we prompt for a comment first
        setReviewingIncident(incident);
        setCause(incident.cause || '');
        setAction(incident.action || '');
        setCauseImageUrl(incident.causeImageUrl || null);
        setActionImageUrl(incident.actionImageUrl || null);
        setSelectedReasonCode(incident.reasonCode || '');
        setCauseImage(null);
        setActionImage(null);
        return;
      }

      const hasCauseAndAction = incident.cause && incident.action && incident.reasonCode;

      const batch = writeBatch(db);

      batch.update(doc(db, 'incidents', incident.id), {
        status: hasCauseAndAction ? 'resolved' : 'pending_me_review',
        resolvedBy: user.uid,
        resolvedByName: user.displayName || user.email || 'Unknown',
        endTime: serverTimestamp(),
        durationMinutes: duration,
      });

      batch.update(doc(db, 'machines', incident.machineId), {
        status: 'running',
        currentIncidentId: null,
      });

      await batch.commit();
    } catch (error) {
      console.error('Error resolving incident:', error);
      setError('Failed to resolve incident.');
    }
  };

  const submitReview = async (e: React.FormEvent | React.MouseEvent, resolve: boolean = false) => {
    e.preventDefault();
    if (!reviewingIncident || !user) return;
    
    const willResolve = resolve || reviewingIncident.status === 'pending_me_review' || reviewingIncident.type === 'out_of_order';
    
    if (willResolve && !selectedReasonCode && reviewingIncident.type !== 'out_of_order') {
      setError('Please select a reason code before resolving.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      let finalCauseImageUrl = causeImageUrl;
      let finalActionImageUrl = actionImageUrl;

      if (causeImage) {
        const causeImageRef = ref(storage, `incidents/${reviewingIncident.id}/cause_${Date.now()}_${causeImage.name}`);
        await uploadBytes(causeImageRef, causeImage);
        finalCauseImageUrl = await getDownloadURL(causeImageRef);
      }

      if (actionImage) {
        const actionImageRef = ref(storage, `incidents/${reviewingIncident.id}/action_${Date.now()}_${actionImage.name}`);
        await uploadBytes(actionImageRef, actionImage);
        finalActionImageUrl = await getDownloadURL(actionImageRef);
      }

      const updates: any = {
        cause,
        action,
        causeImageUrl: finalCauseImageUrl,
        actionImageUrl: finalActionImageUrl,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp()
      };
      
      if (selectedReasonCode) {
        updates.reasonCode = selectedReasonCode;
      }

      const batch = writeBatch(db);

      if (willResolve) {
        updates.status = 'resolved';
        
        // Only set endTime and duration if they don't already exist (e.g., if line leader already marked it fixed)
        if (!reviewingIncident.endTime) {
          const start = reviewingIncident.startTime?.toDate ? reviewingIncident.startTime.toDate() : new Date(reviewingIncident.startTime);
          const duration = Math.ceil((getServerTime().getTime() - start.getTime()) / 60000);
          
          updates.resolvedBy = user.uid;
          updates.resolvedByName = user.displayName || user.email || 'Unknown';
          updates.endTime = serverTimestamp();
          updates.durationMinutes = duration;
          
          batch.update(doc(db, 'machines', reviewingIncident.machineId), {
            status: 'running',
            currentIncidentId: null,
          });
        }
      }

      batch.update(doc(db, 'incidents', reviewingIncident.id), updates);
      
      await batch.commit();
      setReviewingIncident(null);
      setCause('');
      setAction('');
      setCauseImage(null);
      setActionImage(null);
      setCauseImageUrl(null);
      setActionImageUrl(null);
      setSelectedReasonCode('');
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

  const handleAssignGroups = async (incidentId: string, groupIds: string[]) => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        assignedGroups: groupIds.length > 0 ? groupIds : null
      });
    } catch (error) {
      console.error('Error assigning groups:', error);
      setError('Failed to assign groups.');
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

  const maintenanceEngineers = React.useMemo(() => users.filter(u => u.role === 'maintenance_engineer'), [users]);

  const activeIncidents = useMemo(() => {
    let filtered = incidents.filter(i => i.status !== 'resolved');
    
    // Hide out_of_order incidents from maintenance engineers
    if (profile?.role === 'maintenance_engineer') {
      filtered = filtered.filter(i => i.type !== 'out_of_order');
    }
    
    // Filter by assigned groups and individual assignments for non-admins/managers/pd_engineers
    if (profile?.role !== 'admin' && profile?.role !== 'manager' && profile?.role !== 'pd_engineer' && user) {
      const userGroups = groups.filter(g => g.userIds?.includes(user.uid));
      filtered = filtered.filter(incident => {
        // Always show incidents reported by the user
        if (incident.reportedBy === user.uid) return true;

        const hasGroups = incident.assignedGroups && incident.assignedGroups.length > 0;
        const hasIndividuals = incident.assignedTo && incident.assignedTo.length > 0;
        
        if (!hasGroups && !hasIndividuals) return true; // Visible to all if no assignments
        
        const inGroup = hasGroups && userGroups.some(g => incident.assignedGroups.includes(g.id));
        const isIndividual = hasIndividuals && incident.assignedTo.includes(user.uid);
        
        return inGroup || isIndividual;
      });
    }

    if (activeStatusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === activeStatusFilter);
    }
    return filtered;
  }, [incidents, activeStatusFilter, profile?.role, user, groups]);

  const groupedActiveIncidents = useMemo(() => {
    const groups: Record<string, any[]> = {};
    activeIncidents.forEach(inc => {
      const line = inc.lineName || 'Unknown Line';
      if (!groups[line]) groups[line] = [];
      groups[line].push(inc);
    });
    return groups;
  }, [activeIncidents]);

  const toggleLine = React.useCallback((line: string) => {
    setExpandedLines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(line)) newSet.delete(line);
      else newSet.add(line);
      return newSet;
    });
  }, []);

  const filteredResolvedIncidents = useMemo(() => {
    let filtered = incidents.filter(i => i.status === 'resolved');
    
    // Hide out_of_order incidents from maintenance engineers
    if (profile?.role === 'maintenance_engineer') {
      filtered = filtered.filter(i => i.type !== 'out_of_order');
    }
    
    // Filter by assigned groups and individual assignments for non-admins/managers/pd_engineers
    if (profile?.role !== 'admin' && profile?.role !== 'manager' && profile?.role !== 'pd_engineer' && user) {
      const userGroups = groups.filter(g => g.userIds?.includes(user.uid));
      filtered = filtered.filter(incident => {
        // Always show incidents reported by the user
        if (incident.reportedBy === user.uid) return true;

        const hasGroups = incident.assignedGroups && incident.assignedGroups.length > 0;
        const hasIndividuals = incident.assignedTo && incident.assignedTo.length > 0;
        
        if (!hasGroups && !hasIndividuals) return true; // Visible to all if no assignments
        
        const inGroup = hasGroups && userGroups.some(g => incident.assignedGroups.includes(g.id));
        const isIndividual = hasIndividuals && incident.assignedTo.includes(user.uid);
        
        return inGroup || isIndividual;
      });
    }
    
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
  }, [incidents, resolvedSearch, resolvedSortField, resolvedSortOrder, profile?.role, user, groups]);

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
              <option value="working_on">Working On</option>
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
          <div className="space-y-4">
            {Object.entries(groupedActiveIncidents).map(([lineName, lineIncidents]: [string, any[]]) => {
              const isExpanded = expandedLines.has(lineName);
              return (
                <div key={lineName} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => toggleLine(lineName)}
                    className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-gray-800">{lineName}</h3>
                      <span className="px-2.5 py-0.5 bg-red-100 text-red-800 text-xs font-bold rounded-full">
                        {lineIncidents.length} Incident{lineIncidents.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp className="text-gray-500" /> : <ChevronDown className="text-gray-500" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border-t border-gray-100">
                      {lineIncidents.map(incident => {
                        const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                        const isPendingReview = incident.status === 'pending_me_review';
                        const duration = isPendingReview && incident.durationMinutes 
                          ? incident.durationMinutes 
                          : Math.ceil((now.getTime() - start.getTime()) / 60000);
                        const isWorkingOn = incident.status === 'working_on';

                        // Check if current user is assigned via individual assignment or group membership
                        const isUserAssigned = (() => {
                          if (!user) return false;
                          const hasIndividuals = incident.assignedTo && incident.assignedTo.length > 0;
                          const hasGroups = incident.assignedGroups && incident.assignedGroups.length > 0;
                          
                          if (!hasIndividuals && !hasGroups) return true; // All MEs if none assigned
                          
                          if (hasIndividuals && incident.assignedTo.includes(user.uid)) return true;
                          
                          if (hasGroups) {
                            const userGroups = groups.filter(g => g.userIds?.includes(user.uid));
                            if (userGroups.some((g: any) => incident.assignedGroups.includes(g.id))) return true;
                          }
                          
                          return false;
                        })();

                        const assignedUserNames = (() => {
                          const names: string[] = [];
                          if (incident.assignedTo) {
                            incident.assignedTo.forEach((id: string) => {
                              const u = users.find(u => u.id === id);
                              if (u) names.push(u.displayName || u.email);
                            });
                          }
                          if (incident.assignedGroups) {
                            incident.assignedGroups.forEach((id: string) => {
                              const g = groups.find(g => g.id === id);
                              if (g) names.push(`Group: ${g.name}`);
                            });
                          }
                          return names.length > 0 ? names.join(', ') : 'All MEs';
                        })();

                        return (
                          <div key={incident.id} className={`bg-white p-6 rounded-xl shadow-sm border-l-4 border border-gray-100 ${
                            isPendingReview ? 'border-l-blue-500' : 
                            isWorkingOn ? 'border-l-yellow-400' : 
                            incident.type === 'out_of_order' ? 'border-l-amber-500 animate-pulse-border' : 'border-l-red-500 animate-pulse-border'
                          }`}>
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-lg font-bold text-gray-800">{incident.machineName}</h3>
                                  {incident.type === 'maintenance' && (
                                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded uppercase">
                                      Maintenance
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500">{incident.lineName}</p>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                isPendingReview ? 'bg-blue-100 text-blue-800' :
                                isWorkingOn ? 'bg-yellow-100 text-yellow-800' : 
                                incident.type === 'out_of_order' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {isPendingReview ? 'Pending Review' : incident.status === 'working_on' ? 'Working On' : incident.status}
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
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <AlertTriangle size={16} className="opacity-0" />
                                <span>
                                  Stopped Jigs: {incident.totalJigs ? (incident.breakdownJigs || 0) : 1} | Breakdown: {((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (Number(duration) / 60) * 100).toFixed(2)}%
                                </span>
                              </div>
                              {profile?.role === 'admin' ? (
                                <div className="space-y-2 mt-2">
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span className="font-medium whitespace-nowrap">Assign MEs:</span>
                                    <MultiSelect
                                      options={maintenanceEngineers.map(me => ({ value: me.id, label: me.displayName || me.email }))}
                                      selectedValues={incident.assignedTo || []}
                                      onChange={(newValues) => handleAssignME(incident.id, newValues)}
                                      placeholder="Individual MEs"
                                      className="w-full"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span className="font-medium whitespace-nowrap">Assign Groups:</span>
                                    <MultiSelect
                                      options={groups.map(g => ({ value: g.id, label: g.name }))}
                                      selectedValues={incident.assignedGroups || []}
                                      onChange={(newValues) => handleAssignGroups(incident.id, newValues)}
                                      placeholder="Groups"
                                      className="w-full"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1 text-sm text-gray-600 mt-2">
                                  <span className="font-medium">Assigned To:</span>
                                  <span className="font-semibold text-blue-600">
                                    {assignedUserNames}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-3">
                              {profile?.role === 'maintenance_engineer' && !isWorkingOn && !isPendingReview && isUserAssigned && (
                                <button
                                  onClick={() => handleAcknowledge(incident.id)}
                                  className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
                                >
                                  <Wrench size={18} />
                                  Working On
                                </button>
                              )}
                              
                              {(profile?.role === 'line_leader' || profile?.role === 'pd_engineer' || profile?.role === 'admin') && !isPendingReview && (
                                <button
                                  onClick={() => handleResolve(incident)}
                                  className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors flex justify-center items-center gap-2"
                                >
                                  <CheckCircle size={18} />
                                  {incident.type === 'out_of_order' ? 'Back to Work' : 'Mark Fixed'}
                                </button>
                              )}

                              {(profile?.role === 'maintenance_engineer' || profile?.role === 'pd_engineer' || profile?.role === 'admin') && (isUserAssigned || profile?.role === 'admin' || profile?.role === 'pd_engineer') && incident.type !== 'out_of_order' && (
                                <button
                                  onClick={() => {
                                    setReviewingIncident(incident);
                                    setCause(incident.cause || '');
                                    setAction(incident.action || '');
                                    setCauseImageUrl(incident.causeImageUrl || null);
                                    setActionImageUrl(incident.actionImageUrl || null);
                                    setSelectedReasonCode(incident.reasonCode || '');
                                    setCauseImage(null);
                                    setActionImage(null);
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
                <th className="p-4 font-medium">Stopped Jigs</th>
                <th className="p-4 font-medium">Breakdown (%)</th>
                <th className="p-4 font-medium">Reason</th>
                <th className="p-4 font-medium">Reported By</th>
                <th className="p-4 font-medium">Fixed By</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="">
              {filteredResolvedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 11 : 10} className="p-8 text-center text-gray-500 border-b border-gray-100">No resolved incidents match your criteria.</td>
                </tr>
              ) : (
                filteredResolvedIncidents.map(incident => {
                  const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                  const isOutOfOrder = incident.type === 'out_of_order';
                  return (
                    <tr 
                      key={incident.id} 
                      className={`transition-colors ${
                        isOutOfOrder 
                          ? 'bg-yellow-50 outline outline-[3px] outline-amber-500 hover:bg-yellow-100 relative z-10' 
                          : 'hover:bg-gray-50 border-b border-gray-100'
                      } ${selectedResolvedIds.has(incident.id) ? 'bg-blue-50' : ''}`}
                    >
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
                      <td className="p-4 text-gray-600">
                        {incident.totalJigs ? (incident.breakdownJigs || 0) : 1}
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.durationMinutes != null
                          ? ((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (Number(incident.durationMinutes) / 60) * 100).toFixed(2) + '%'
                          : '-'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.reasonCode ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {incident.reasonCode}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {formatName(incident.reportedByName || users.find(u => u.id === incident.reportedBy)?.displayName || users.find(u => u.id === incident.reportedBy)?.email || incident.reportedBy)}
                      </td>
                      <td className="p-4 text-gray-600">
                        {formatName(incident.resolvedByName || users.find(u => u.id === incident.resolvedBy)?.displayName || users.find(u => u.id === incident.resolvedBy)?.email || incident.resolvedBy || 'N/A')}
                      </td>
                      <td className="p-4">
                        {(profile?.role === 'maintenance_engineer' || profile?.role === 'pd_engineer' || profile?.role === 'admin') && (
                          <button
                            onClick={() => {
                              setReviewingIncident(incident);
                              setCause(incident.cause || '');
                              setAction(incident.action || '');
                              setCauseImageUrl(incident.causeImageUrl || null);
                              setActionImageUrl(incident.actionImageUrl || null);
                              setSelectedReasonCode(incident.reasonCode || '');
                              setCauseImage(null);
                              setActionImage(null);
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
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {reviewingIncident.type === 'out_of_order' ? 'Out of Order Details' : 'Add Cause & Action'}
            </h3>
            <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded-lg text-sm">
              <p><strong>Machine:</strong> {reviewingIncident.machineName}</p>
              <p><strong>Downtime:</strong> {reviewingIncident.durationMinutes ? `${reviewingIncident.durationMinutes} minutes` : 'Ongoing'}</p>
            </div>
            <form onSubmit={submitReview} className="space-y-4">
              {reviewingIncident.type === 'out_of_order' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comment / Reason</label>
                  <textarea
                    value={cause}
                    onChange={(e) => setCause(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    placeholder="Describe why the machine was out of order..."
                    required
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Root Cause</label>
                    <textarea
                      value={cause}
                      onChange={(e) => setCause(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                      placeholder="Describe what caused the downtime..."
                      required
                    />
                    <div className="mt-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                        <ImageIcon size={16} />
                        <span>{causeImage ? causeImage.name : (causeImageUrl ? 'Change Image' : 'Upload Image')}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setCauseImage(e.target.files?.[0] || null)} />
                      </label>
                      {(causeImage || causeImageUrl) && (
                        <div className="relative mt-2 inline-block">
                          <img src={causeImage ? URL.createObjectURL(causeImage) : causeImageUrl!} alt="Cause" className="h-20 w-20 object-cover rounded-lg border" />
                          <button type="button" onClick={() => { setCauseImage(null); setCauseImageUrl(null); }} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm border text-gray-500 hover:text-red-500">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason Code</label>
                    <select
                      value={selectedReasonCode}
                      onChange={(e) => setSelectedReasonCode(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a reason code...</option>
                      {reasonCodes.map(code => (
                        <option key={code.id} value={code.code}>{code.code} - {code.description}</option>
                      ))}
                    </select>
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
                    <div className="mt-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                        <ImageIcon size={16} />
                        <span>{actionImage ? actionImage.name : (actionImageUrl ? 'Change Image' : 'Upload Image')}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setActionImage(e.target.files?.[0] || null)} />
                      </label>
                      {(actionImage || actionImageUrl) && (
                        <div className="relative mt-2 inline-block">
                          <img src={actionImage ? URL.createObjectURL(actionImage) : actionImageUrl!} alt="Action" className="h-20 w-20 object-cover rounded-lg border" />
                          <button type="button" onClick={() => { setActionImage(null); setActionImageUrl(null); }} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm border text-gray-500 hover:text-red-500">
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setReviewingIncident(null);
                    setCause('');
                    setAction('');
                    setCauseImage(null);
                    setActionImage(null);
                    setCauseImageUrl(null);
                    setActionImageUrl(null);
                    setSelectedReasonCode('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  disabled={isSubmittingReview}
                >
                  Cancel
                </button>
                {reviewingIncident.type !== 'out_of_order' && reviewingIncident.status !== 'pending_me_review' && (
                  <button
                    type="button"
                    onClick={(e) => submitReview(e, false)}
                    disabled={isSubmittingReview}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isSubmittingReview ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => submitReview(e, true)}
                  disabled={isSubmittingReview}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmittingReview ? 'Saving...' : (reviewingIncident.type === 'out_of_order' ? 'Back to Work' : 'Save & Resolve')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
