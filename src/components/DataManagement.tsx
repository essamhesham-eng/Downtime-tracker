import React, { useState } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Calendar, Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';

export function DataManagement() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deleteIncidents, setDeleteIncidents] = useState(true);
  const [deleteWip, setDeleteWip] = useState(true);
  const [deleteEvaluations, setDeleteEvaluations] = useState(true);
  const [deleteProdHours, setDeleteProdHours] = useState(true);

  const handleDelete = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.');
      return;
    }
    
    if (!deleteIncidents && !deleteWip && !deleteEvaluations && !deleteProdHours) {
      setError('Please select at least one type of data to delete.');
      return;
    }
    
    if (startDate > endDate) {
      setError('Start date must be before or equal to end date.');
      return;
    }

    const start = window.confirm(`Are you absolutely sure you want to delete all operational data from ${startDate} to ${endDate}? This action cannot be undone.`);
    if (!start) return;

    setIsDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const startTimestamp = Timestamp.fromDate(startOfDay(new Date(startDate)));
      const endTimestamp = Timestamp.fromDate(endOfDay(new Date(endDate)));

      let batch = writeBatch(db);
      let opCount = 0;

      const commitBatchIfNeeded = async () => {
        if (opCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      // 1. Delete Incidents
      if (deleteIncidents) {
        const incidentsQuery = query(collection(db, 'incidents'), where('startTime', '>=', startTimestamp), where('startTime', '<=', endTimestamp));
        const incidentsSnapshot = await getDocs(incidentsQuery);
        for (const docSnap of incidentsSnapshot.docs) {
          batch.delete(doc(db, 'incidents', docSnap.id));
          opCount++;
          await commitBatchIfNeeded();
        }
      }
      
      // 2. Delete WIP Snapshots & Entries
      if (deleteWip) {
        const wipSnapshotsQuery = query(collection(db, 'wip_snapshots'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const wipSnapshots = await getDocs(wipSnapshotsQuery);
        const wipSnapshotIds = wipSnapshots.docs.map(d => d.id);
        for (const docSnap of wipSnapshots.docs) {
          batch.delete(doc(db, 'wip_snapshots', docSnap.id));
          opCount++;
          await commitBatchIfNeeded();
        }
        
        if (wipSnapshotIds.length > 0) {
          // Chunk snapshot IDs to avoid query limits
          const chunkSize = 10;
          for (let i = 0; i < wipSnapshotIds.length; i += chunkSize) {
            const chunk = wipSnapshotIds.slice(i, i + chunkSize);
            const entriesQuery = query(collection(db, 'wip_entries'), where('snapshotId', 'in', chunk));
            const entriesSnap = await getDocs(entriesQuery);
            for (const docSnap of entriesSnap.docs) {
              batch.delete(doc(db, 'wip_entries', docSnap.id));
              opCount++;
              await commitBatchIfNeeded();
            }
          }
        }
      }

      // 3. Delete Evaluations
      if (deleteEvaluations) {
        const evalsQuery = query(collection(db, 'evaluations'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const evalsSnapshot = await getDocs(evalsQuery);
        for (const docSnap of evalsSnapshot.docs) {
          batch.delete(doc(db, 'evaluations', docSnap.id));
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      // 4. Delete Production Hours
      // Production hours use string date YYYY-MM-DD
      if (deleteProdHours) {
        const prodHoursQuery = query(collection(db, 'production_hours'), where('date', '>=', startDate), where('date', '<=', endDate));
        const prodHoursSnap = await getDocs(prodHoursQuery);
        for (const docSnap of prodHoursSnap.docs) {
          batch.delete(doc(db, 'production_hours', docSnap.id));
          opCount++;
          await commitBatchIfNeeded();
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      setSuccess(`Successfully deleted operational data for the selected date range.`);
    } catch (err: any) {
      console.error('Delete error', err);
      setError(err.message || 'An error occurred while deleting data.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-red-200 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -z-10 opacity-50"></div>
      
      <h3 className="text-xl font-bold text-red-700 mb-6 border-b border-red-100 pb-4 flex items-center gap-2">
        <AlertTriangle size={20} />
        Data Management (Delete Operational Data)
      </h3>
      
      <p className="text-sm text-gray-600 mb-6">
        Permanently delete operational data within a specific date range. Please select the types of data you wish to delete. This action cannot be undone. System configuration data (Machines, Lines, Users, Groups) will NOT be affected.
      </p>

      {error && (
        <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 text-green-700 p-4 rounded-xl flex items-start gap-3">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
            />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3">Select Data Types to Delete</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={deleteIncidents}
              onChange={(e) => setDeleteIncidents(e.target.checked)}
              className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <span className="font-medium text-gray-700">Breakdown Records (Incidents)</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={deleteWip}
              onChange={(e) => setDeleteWip(e.target.checked)}
              className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <span className="font-medium text-gray-700">WIP History</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={deleteEvaluations}
              onChange={(e) => setDeleteEvaluations(e.target.checked)}
              className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <span className="font-medium text-gray-700">Evaluations</span>
          </label>
          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={deleteProdHours}
              onChange={(e) => setDeleteProdHours(e.target.checked)}
              className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <span className="font-medium text-gray-700">Production Hours</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        {isDeleting ? 'Deleting Data...' : 'Delete Data in Range'}
      </button>
    </div>
  );
}
