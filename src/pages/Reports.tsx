import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx-js-style';
import { FileSpreadsheet, Download, Calendar, Edit2 } from 'lucide-react';
import { format } from 'date-fns';

export function Reports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  const [editingIncident, setEditingIncident] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editDuration, setEditDuration] = useState<number | ''>('');
  const [editMachineName, setEditMachineName] = useState('');
  const [editLineName, setEditLineName] = useState('');
  const [editReportedBy, setEditReportedBy] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editCause, setEditCause] = useState('');
  const [editAction, setEditAction] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatName = (name: string) => {
    if (!name) return 'Unknown';
    if (name.includes('@')) {
      return name.split('@')[0];
    }
    return name;
  };

  useEffect(() => {
    if (!['admin', 'manager', 'pd_engineer'].includes(profile?.role || '')) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch users for mapping
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const uMap: Record<string, string> = {};
        usersSnapshot.docs.forEach(doc => {
          const data = doc.data();
          uMap[doc.id] = data.displayName || (data.email ? data.email.split('@')[0] : doc.id);
        });
        setUsersMap(uMap);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const q = query(
          collection(db, 'incidents'), 
          where('startTime', '>=', startOfMonth),
          orderBy('startTime', 'desc')
        );
        const snapshot = await getDocs(q);
        setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile]);

  const handleExport = () => {
    if (incidents.length === 0) {
      setError('No data to export.');
      return;
    }

    const exportData = incidents.map(incident => {
      const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
      const end = incident.endTime?.toDate ? incident.endTime.toDate() : (incident.endTime ? new Date(incident.endTime) : null);
      
      return {
        'Incident ID': incident.id,
        'Line Name': incident.lineName,
        'Machine Name': incident.machineName,
        'Status': incident.status,
        'Start Time': format(start, 'yyyy-MM-dd HH:mm:ss'),
        'End Time': end ? format(end, 'yyyy-MM-dd HH:mm:ss') : 'Ongoing',
        'Duration (Minutes)': incident.durationMinutes || (end ? Math.ceil((end.getTime() - start.getTime()) / 60000) : 'Ongoing'),
        'Stopped Jigs': incident.totalJigs ? (incident.breakdownJigs || 0) : 1,
        'Breakdown (%)': incident.durationMinutes != null
          ? ((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (Number(incident.durationMinutes) / 60) * 100).toFixed(2) + '%'
          : 'N/A',
        'Reason Code': incident.reasonCode || 'N/A',
        'Cause': incident.cause || 'N/A',
        'Action Taken': incident.action || 'N/A',
        'Reported By': formatName(incident.reportedByName || usersMap[incident.reportedBy] || incident.reportedBy),
        'Acknowledged By': formatName(usersMap[incident.acknowledgedBy] || incident.acknowledgedBy || 'N/A'),
        'Resolved By': formatName(incident.resolvedByName || usersMap[incident.resolvedBy] || incident.resolvedBy || 'N/A'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Apply styling for out_of_order incidents
    if (worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      for (let R = 1; R <= range.e.r; ++R) {
        const incident = incidents[R - 1];
        if (incident && incident.type === 'out_of_order') {
          for (let C = 0; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!worksheet[cellAddress]) {
              worksheet[cellAddress] = { t: 's', v: '' };
            }
            worksheet[cellAddress].s = {
              fill: {
                fgColor: { rgb: "FFF9C4" } // Light yellow
              },
              border: {
                top: { style: "thick", color: { rgb: "FFB300" } }, // Golden/Amber
                bottom: { style: "thick", color: { rgb: "FFB300" } },
                left: C === 0 ? { style: "thick", color: { rgb: "FFB300" } } : undefined,
                right: C === range.e.c ? { style: "thick", color: { rgb: "FFB300" } } : undefined
              }
            };
          }
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Downtime Data');
    
    // Generate buffer and trigger download
    XLSX.writeFile(workbook, `Downtime_Report_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
  };

  const handleEditClick = (incident: any) => {
    setEditingIncident(incident);
    setEditStatus(incident.status);
    setEditDuration(incident.durationMinutes || '');
    setEditMachineName(incident.machineName || '');
    setEditLineName(incident.lineName || '');
    setEditReportedBy(incident.reportedBy || '');
    setEditCause(incident.cause || '');
    setEditAction(incident.action || '');
    
    // Convert Firestore timestamp to datetime-local format
    const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
    setEditStartTime(format(start, "yyyy-MM-dd'T'HH:mm"));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIncident) return;
    
    setIsSaving(true);
    try {
      const updateData: any = {};
      
      if (editStatus !== editingIncident.status) updateData.status = editStatus;
      if (editMachineName !== editingIncident.machineName) updateData.machineName = editMachineName;
      if (editLineName !== editingIncident.lineName) updateData.lineName = editLineName;
      if (editReportedBy !== editingIncident.reportedBy) updateData.reportedBy = editReportedBy;
      if (editCause !== (editingIncident.cause || '')) updateData.cause = editCause;
      if (editAction !== (editingIncident.action || '')) updateData.action = editAction;
      
      const start = editingIncident.startTime?.toDate ? editingIncident.startTime.toDate() : new Date(editingIncident.startTime);
      if (editStartTime !== format(start, "yyyy-MM-dd'T'HH:mm")) {
        updateData.startTime = new Date(editStartTime);
      }
      
      if (editDuration !== '') {
        if (Number(editDuration) !== editingIncident.durationMinutes) {
          updateData.durationMinutes = Number(editDuration);
        }
      } else if (editingIncident.durationMinutes != null) {
        updateData.durationMinutes = null;
      }
      
      if (Object.keys(updateData).length > 0) {
        await updateDoc(doc(db, 'incidents', editingIncident.id), updateData);
        
        // Update local state
        setIncidents(prev => prev.map(inc => 
          inc.id === editingIncident.id ? { ...inc, ...updateData } : inc
        ));
      }
      
      setEditingIncident(null);
      setError(null);
    } catch (error: any) {
      console.error('Error updating incident:', error);
      setError(error.message || 'Failed to update incident. Make sure you have the right permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!['admin', 'manager', 'pd_engineer'].includes(profile?.role || '')) {
    return <div className="p-8 text-center text-red-600 font-bold">Access Denied. Managers and Engineers only.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center justify-between border border-red-100 mb-6">
          <div className="flex items-center gap-2">
            <p className="font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 text-green-700 rounded-full">
            <FileSpreadsheet size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Downtime Reports</h2>
        </div>
        
        <button
          onClick={handleExport}
          disabled={loading || incidents.length === 0}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
        >
          <Download size={20} />
          Export to Excel
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
          <Calendar size={20} className="text-blue-600" />
          Data Overview
        </h3>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading data...</div>
        ) : incidents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No downtime incidents recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                  <th className="p-4 font-medium">Machine</th>
                  <th className="p-4 font-medium">Line</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Start Time</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Stopped Jigs</th>
                  <th className="p-4 font-medium">Breakdown (%)</th>
                  <th className="p-4 font-medium">Reported By</th>
                  <th className="p-4 font-medium">Fixed By</th>
                  {profile?.role === 'admin' && <th className="p-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="">
                {incidents.slice(0, 50).map(incident => {
                  const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                  const isOutOfOrder = incident.type === 'out_of_order';
                  return (
                    <tr 
                      key={incident.id} 
                      className={`transition-colors ${
                        isOutOfOrder 
                          ? 'bg-yellow-50 outline outline-[3px] outline-amber-500 hover:bg-yellow-100 relative z-10' 
                          : 'hover:bg-gray-50 border-b border-gray-100'
                      }`}
                    >
                      <td className="p-4 font-medium text-gray-800">{incident.machineName}</td>
                      <td className="p-4 text-gray-600">{incident.lineName}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                          incident.status === 'resolved' ? 'bg-green-100 text-green-800' :
                          incident.status === 'pending_me_review' ? 'bg-blue-100 text-blue-800' :
                          incident.status === 'acknowledged' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {incident.status === 'pending_me_review' ? 'Pending Review' : incident.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">{format(start, 'MMM d, yyyy HH:mm')}</td>
                      <td className="p-4 font-medium text-gray-800">
                        {incident.durationMinutes ? `${incident.durationMinutes} mins` : 'Ongoing'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.totalJigs ? (incident.breakdownJigs || 0) : 1}
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.durationMinutes != null
                          ? ((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (Number(incident.durationMinutes) / 60) * 100).toFixed(2) + '%'
                          : '-'}
                      </td>
                      <td className="p-4 text-gray-600">
                        {formatName(incident.reportedByName || usersMap[incident.reportedBy] || incident.reportedBy)}
                      </td>
                      <td className="p-4 text-gray-600">
                        {formatName(incident.resolvedByName || (incident.resolvedBy ? usersMap[incident.resolvedBy] || incident.resolvedBy : 'N/A'))}
                      </td>
                      {profile?.role === 'admin' && (
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleEditClick(incident)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Incident"
                          >
                            <Edit2 size={18} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {incidents.length > 50 && (
              <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 border-t border-gray-100">
                Showing latest 50 records. Export to Excel to view all {incidents.length} records.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingIncident && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Incident</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Machine Name</label>
                <input
                  type="text"
                  value={editMachineName}
                  onChange={(e) => setEditMachineName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Line Name</label>
                <input
                  type="text"
                  value={editLineName}
                  onChange={(e) => setEditLineName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reported By</label>
                <select
                  value={editReportedBy}
                  onChange={(e) => setEditReportedBy(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select User</option>
                  {Object.entries(usersMap).map(([uid, name]) => (
                    <option key={uid} value={uid}>{name}</option>
                  ))}
                  {/* Fallback if user is not in map */}
                  {!usersMap[editReportedBy] && editReportedBy && (
                    <option value={editReportedBy}>{editReportedBy}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Open</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="pending_me_review">Pending Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  value={editDuration}
                  onChange={(e) => setEditDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cause</label>
                <textarea
                  value={editCause}
                  onChange={(e) => setEditCause(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken</label>
                <textarea
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingIncident(null)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
