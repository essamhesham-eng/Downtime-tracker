import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx-js-style';
import { FileSpreadsheet, Download, Calendar, Edit2, Filter } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { getServerTime } from '../utils/time';

export function Reports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [wipEntries, setWipEntries] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [machinesMap, setMachinesMap] = useState<Record<string, string>>({});
  const [linesMap, setLinesMap] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'downtime' | 'wip'>('downtime');

  const [startDate, setStartDate] = useState(format(subDays(getServerTime(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(getServerTime(), 'yyyy-MM-dd'));
  const [selectedLine, setSelectedLine] = useState('all');
  const [selectedMachine, setSelectedMachine] = useState('all');

  const [editingIncident, setEditingIncident] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editDuration, setEditDuration] = useState<number | ''>('');
  const [editMachineName, setEditMachineName] = useState('');
  const [editLineName, setEditLineName] = useState('');
  const [editReportedBy, setEditReportedBy] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editCause, setEditCause] = useState('');
  const [editAction, setEditAction] = useState('');
  const [editTotalJigs, setEditTotalJigs] = useState<number | ''>('');
  const [editBreakdownJigs, setEditBreakdownJigs] = useState<number | ''>('');
  const [editType, setEditType] = useState('');
  const [editResolvedBy, setEditResolvedBy] = useState('');
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

        // Fetch machines for mapping
        const machinesSnapshot = await getDocs(collection(db, 'machines'));
        const mMap: Record<string, string> = {};
        const mList: any[] = [];
        machinesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          mMap[doc.id] = data.name;
          mList.push({ id: doc.id, ...data });
        });
        setMachinesMap(mMap);
        setMachines(mList);

        // Fetch lines for mapping
        const linesSnapshot = await getDocs(collection(db, 'lines'));
        const lMap: Record<string, string> = {};
        const lList: any[] = [];
        linesSnapshot.docs.forEach(doc => {
          const data = doc.data();
          lMap[doc.id] = data.name;
          lList.push({ id: doc.id, ...data });
        });
        setLinesMap(lMap);
        setLines(lList);

        const qIncidents = query(
          collection(db, 'incidents'), 
          orderBy('startTime', 'desc')
        );
        const snapshotIncidents = await getDocs(qIncidents);
        setIncidents(snapshotIncidents.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qWip = query(
          collection(db, 'wip_entries'),
          orderBy('createdAt', 'desc')
        );
        const snapshotWip = await getDocs(qWip);
        setWipEntries(snapshotWip.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile]);

  const filteredIncidents = useMemo(() => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    
    return incidents.filter(inc => {
      if (!inc.startTime) return false;
      const incDate = inc.startTime?.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      if (incDate < start || incDate > end) return false;
      
      if (selectedLine !== 'all' && inc.lineId !== selectedLine) return false;
      if (selectedMachine !== 'all' && inc.machineId !== selectedMachine) return false;
      
      return true;
    });
  }, [incidents, startDate, endDate, selectedLine, selectedMachine]);

  const filteredWipEntries = useMemo(() => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    
    return wipEntries.filter(entry => {
      if (!entry.createdAt) return false;
      const entryDate = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
      if (entryDate < start || entryDate > end) return false;
      
      if (selectedLine !== 'all' && entry.lineId !== selectedLine) return false;
      if (selectedMachine !== 'all' && entry.machineId !== selectedMachine) return false;
      
      return true;
    });
  }, [wipEntries, startDate, endDate, selectedLine, selectedMachine]);

  const getIncidentDuration = React.useCallback((inc: any) => {
    if (inc.durationMinutes != null) return inc.durationMinutes;
    if (!inc.startTime) return 0;
    const start = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
    return Math.ceil((getServerTime().getTime() - start.getTime()) / 60000);
  }, []);

  const handleExport = () => {
    if (activeTab === 'downtime') {
      if (filteredIncidents.length === 0) {
        setError('No data to export.');
        return;
      }

      const exportData = filteredIncidents.map(incident => {
        let start: Date | null = null;
        if (incident.startTime) {
          start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
        }
        
        let end: Date | null = null;
        if (incident.endTime) {
          end = incident.endTime?.toDate ? incident.endTime.toDate() : new Date(incident.endTime);
        }
        
        return {
          'Incident ID': incident.id,
          'Line Name': incident.lineName,
          'Machine Name': incident.machineName,
          'Status': incident.status,
          'Type': incident.type === 'out_of_order' ? 'Out of Order' : 'Maintenance',
          'Start Time': start ? format(start, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
          'End Time': end ? format(end, 'yyyy-MM-dd HH:mm:ss') : 'Ongoing',
          'Duration (Minutes)': getIncidentDuration(incident),
          'Total Jigs': incident.totalJigs || 1,
          'Stopped Jigs': incident.totalJigs ? (incident.breakdownJigs || 0) : 1,
          'Breakdown (%)': getIncidentDuration(incident) > 0
            ? ((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (getIncidentDuration(incident) / 60) * 100).toFixed(2) + '%'
            : 'N/A',
          'Reason Code': incident.reasonCode || 'N/A',
          'Cause': incident.cause || 'N/A',
          'Action Taken': incident.action || 'N/A',
          'Reported By': formatName(incident.reportedByName || usersMap[incident.reportedBy] || incident.reportedBy),
          'Working On By': formatName(usersMap[incident.workingOnBy] || incident.workingOnBy || 'N/A'),
          'Resolved By': formatName(incident.resolvedByName || usersMap[incident.resolvedBy] || incident.resolvedBy || 'N/A'),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Apply styling for out_of_order incidents
      if (worksheet['!ref']) {
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let R = 1; R <= range.e.r; ++R) {
          const incident = filteredIncidents[R - 1];
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
      XLSX.writeFile(workbook, `Downtime_Report_${format(getServerTime(), 'yyyyMMdd_HHmmss')}.xlsx`);
    } else {
      if (filteredWipEntries.length === 0) {
        setError('No WIP data to export.');
        return;
      }

      const exportData = filteredWipEntries.map(entry => {
        let createdAt: Date | null = null;
        if (entry.createdAt) {
          createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
        }
        return {
          'Entry ID': entry.id,
          'Line Name': linesMap[entry.lineId] || entry.lineId,
          'Machine Name': machinesMap[entry.machineId] || entry.machineId,
          'WIP Quantity': entry.wip,
          'Date & Time': createdAt ? format(createdAt, 'yyyy-MM-dd HH:mm:ss') : 'N/A',
          'Created By': formatName(usersMap[entry.createdBy] || entry.createdBy),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'WIP Data');
      
      XLSX.writeFile(workbook, `WIP_Report_${format(getServerTime(), 'yyyyMMdd_HHmmss')}.xlsx`);
    }
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
    setEditTotalJigs(incident.totalJigs || '');
    setEditBreakdownJigs(incident.breakdownJigs || '');
    setEditType(incident.type || '');
    setEditResolvedBy(incident.resolvedBy || '');
    
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
      if (editReportedBy !== editingIncident.reportedBy) {
        updateData.reportedBy = editReportedBy;
        updateData.reportedByName = usersMap[editReportedBy] || editReportedBy;
      }
      if (editResolvedBy !== (editingIncident.resolvedBy || '')) {
        updateData.resolvedBy = editResolvedBy;
        updateData.resolvedByName = usersMap[editResolvedBy] || editResolvedBy;
      }
      if (editType !== (editingIncident.type || '')) updateData.type = editType;
      if (editCause !== (editingIncident.cause || '')) updateData.cause = editCause;
      if (editAction !== (editingIncident.action || '')) updateData.action = editAction;
      
      if (editTotalJigs !== '') {
        if (Number(editTotalJigs) !== editingIncident.totalJigs) updateData.totalJigs = Number(editTotalJigs);
      } else if (editingIncident.totalJigs != null) {
        updateData.totalJigs = null;
      }

      if (editBreakdownJigs !== '') {
        if (Number(editBreakdownJigs) !== editingIncident.breakdownJigs) updateData.breakdownJigs = Number(editBreakdownJigs);
      } else if (editingIncident.breakdownJigs != null) {
        updateData.breakdownJigs = null;
      }
      
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
          <h2 className="text-2xl font-bold text-gray-800">Export Data</h2>
        </div>
        
        <button
          onClick={handleExport}
          disabled={loading || (activeTab === 'downtime' ? incidents.length === 0 : wipEntries.length === 0)}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
        >
          <Download size={20} />
          Export to Excel
        </button>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('downtime')}
          className={`py-3 px-6 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'downtime'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Downtime Data
        </button>
        <button
          onClick={() => setActiveTab('wip')}
          className={`py-3 px-6 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'wip'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          WIP Data
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4 text-gray-800 font-medium">
          <Filter size={18} className="text-blue-600" />
          Filters
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-gray-500">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          
          <select
            value={selectedLine}
            onChange={(e) => {
              setSelectedLine(e.target.value);
              setSelectedMachine('all');
            }}
            className="p-2 border border-gray-300 rounded-lg text-sm min-w-[150px]"
          >
            <option value="all">All Lines</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>

          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm min-w-[150px]"
            disabled={selectedLine === 'all'}
          >
            <option value="all">All Machines</option>
            {machines
              .filter(m => m.lineId === selectedLine)
              .map(machine => (
                <option key={machine.id} value={machine.id}>{machine.name}</option>
              ))}
          </select>
        </div>
      </div>

      {activeTab === 'downtime' ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
            <Calendar size={20} className="text-blue-600" />
            Downtime Overview
          </h3>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading data...</div>
          ) : filteredIncidents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No downtime incidents found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                    <th className="p-4 font-medium">Machine</th>
                    <th className="p-4 font-medium">Line</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Type</th>
                    <th className="p-4 font-medium">Start Time</th>
                    <th className="p-4 font-medium">Duration</th>
                    <th className="p-4 font-medium">Total Jigs</th>
                    <th className="p-4 font-medium">Stopped Jigs</th>
                    <th className="p-4 font-medium">Breakdown (%)</th>
                    <th className="p-4 font-medium">Reported By</th>
                    <th className="p-4 font-medium">Fixed By</th>
                    {profile?.role === 'admin' && <th className="p-4 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="">
                  {filteredIncidents.map(incident => {
                    let start: Date | null = null;
                    if (incident.startTime) {
                      start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
                    }
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
                          incident.status === 'working_on' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {incident.status === 'pending_me_review' ? 'Pending Review' : incident.status === 'working_on' ? 'Working On' : incident.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 capitalize">
                        {incident.type === 'out_of_order' ? 'Out of Order' : 'Maintenance'}
                      </td>
                      <td className="p-4 text-gray-600">{start ? format(start, 'MMM d, yyyy HH:mm') : 'N/A'}</td>
                      <td className="p-4 font-medium text-gray-800">
                        {getIncidentDuration(incident)} mins
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.totalJigs || 1}
                      </td>
                      <td className="p-4 text-gray-600">
                        {incident.totalJigs ? (incident.breakdownJigs || 0) : 1}
                      </td>
                      <td className="p-4 text-gray-600">
                        {getIncidentDuration(incident) > 0
                          ? ((Number(incident.totalJigs ? (incident.breakdownJigs || 0) : 1) / Number(incident.totalJigs || 1)) * (getIncidentDuration(incident) / 60) * 100).toFixed(2) + '%'
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
          </div>
        )}
      </div>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
            <Calendar size={20} className="text-blue-600" />
            WIP Overview
          </h3>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading data...</div>
          ) : filteredWipEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No WIP entries found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                    <th className="p-4 font-medium">Date & Time</th>
                    <th className="p-4 font-medium">Line</th>
                    <th className="p-4 font-medium">Machine</th>
                    <th className="p-4 font-medium">WIP Quantity</th>
                    <th className="p-4 font-medium">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredWipEntries.map((entry) => {
                    let createdAt: Date | null = null;
                    if (entry.createdAt) {
                      createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
                    }
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-gray-600">
                          {createdAt ? format(createdAt, 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                        </td>
                        <td className="p-4 text-gray-600">{linesMap[entry.lineId] || entry.lineId}</td>
                        <td className="p-4 text-gray-600">{machinesMap[entry.machineId] || entry.machineId}</td>
                        <td className="p-4 font-medium text-blue-600">{entry.wip}</td>
                        <td className="p-4 text-gray-600">{formatName(usersMap[entry.createdBy] || entry.createdBy)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                  <option value="working_on">Working On</option>
                  <option value="pending_me_review">Pending Review</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Type</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="out_of_order">Out of Order</option>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Jigs</label>
                  <input
                    type="number"
                    value={editTotalJigs}
                    onChange={(e) => setEditTotalJigs(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stopped Jigs</label>
                  <input
                    type="number"
                    value={editBreakdownJigs}
                    onChange={(e) => setEditBreakdownJigs(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fixed By</label>
                <select
                  value={editResolvedBy}
                  onChange={(e) => setEditResolvedBy(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select User</option>
                  {Object.entries(usersMap).map(([uid, name]) => (
                    <option key={uid} value={uid}>{name}</option>
                  ))}
                  {!usersMap[editResolvedBy] && editResolvedBy && (
                    <option value={editResolvedBy}>{editResolvedBy}</option>
                  )}
                </select>
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
