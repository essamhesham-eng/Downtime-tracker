import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { differenceInMinutes, format } from 'date-fns';
import { Wrench, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export function IncidentsList() {
  const { user, profile } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [reviewingIncident, setReviewingIncident] = useState<any | null>(null);
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'incidents'), orderBy('startTime', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
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
      alert('Failed to acknowledge incident.');
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
      alert('Failed to resolve incident.');
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
      alert('Failed to submit review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const activeIncidents = incidents.filter(i => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter(i => i.status === 'resolved').slice(0, 10); // Show last 10

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <AlertTriangle className="text-red-500" />
          Active Incidents
        </h2>
        
        {activeIncidents.length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500 flex flex-col items-center gap-2">
            <CheckCircle className="text-green-500" size={32} />
            <p>No active incidents. All machines are running.</p>
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
                      <span>Started: {format(start, 'HH:mm')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                      <AlertTriangle size={16} />
                      <span>Downtime: {duration} mins {isPendingReview && '(Fixed)'}</span>
                    </div>
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
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <CheckCircle className="text-green-500" />
          Recently Resolved
        </h2>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                <th className="p-4 font-medium">Machine</th>
                <th className="p-4 font-medium">Line</th>
                <th className="p-4 font-medium">Start Time</th>
                <th className="p-4 font-medium">Duration</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resolvedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">No resolved incidents yet.</td>
                </tr>
              ) : (
                resolvedIncidents.map(incident => {
                  const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                  return (
                    <tr key={incident.id} className="hover:bg-gray-50 transition-colors">
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
