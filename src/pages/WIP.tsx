import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Wrench, Save, Clock, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface Line {
  id: string;
  name: string;
  order: number;
  wipUpdatedAt?: any;
}

interface Machine {
  id: string;
  name: string;
  lineId: string;
  order: number;
  wip?: number | string | null;
}

interface WipRow {
  id: string;
  machineId: string;
  wip: string;
}

interface WipSnapshot {
  id: string;
  lineId: string;
  createdAt: any;
  createdBy: string;
}

export function WIP() {
  const { profile } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [lineRows, setLineRows] = useState<Record<string, WipRow[]>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<Record<string, WipSnapshot[]>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<Record<string, string>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState<Record<string, boolean>>({});
  
  const dirtyLinesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const qLines = query(collection(db, 'lines'), orderBy('createdAt', 'asc'));
    const unsubLines = onSnapshot(qLines, (snapshot) => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Line)));
    });

    const qMachines = query(collection(db, 'machines'), orderBy('createdAt', 'asc'));
    const unsubMachines = onSnapshot(qMachines, (snapshot) => {
      const machinesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Machine));
      setMachines(machinesData);
      
      setLineRows(prev => {
        const newRows = { ...prev };
        let changed = false;
        
        const lineIds = new Set(machinesData.map(m => m.lineId));
        
        lineIds.forEach(lineId => {
          // Only update from machines if not currently dirty and no history snapshot is selected
          if (!dirtyLinesRef.current.has(lineId) && !selectedSnapshotId[lineId]) {
            // Get all machines for this line
            const lineMachines = machinesData.filter(m => m.lineId === lineId).sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Create a row for machines that have a WIP value
            const machinesWithWip = lineMachines.filter(m => m.wip !== undefined && m.wip !== null && m.wip !== '');
            
            let rowsForLine = machinesWithWip.map(m => ({
              id: Math.random().toString(36).substring(2, 9),
              machineId: m.id,
              wip: String(m.wip)
            }));
            
            // If no machines have WIP, start with one empty row
            if (rowsForLine.length === 0) {
              rowsForLine = [{ id: Math.random().toString(36).substring(2, 9), machineId: '', wip: '' }];
            }
            
            const currentRows = newRows[lineId] || [];
            const currentData = currentRows.map(r => `${r.machineId}-${r.wip}`).join('|');
            const newData = rowsForLine.map(r => `${r.machineId}-${r.wip}`).join('|');
            
            if (currentData !== newData) {
              newRows[lineId] = rowsForLine;
              changed = true;
            }
          }
        });
        
        return changed ? newRows : prev;
      });
    });

    // Fetch WIP Snapshots
    const qSnapshots = query(collection(db, 'wip_snapshots'), orderBy('createdAt', 'desc'));
    const unsubSnapshots = onSnapshot(qSnapshots, (snapshot) => {
      const allSnapshots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WipSnapshot));
      const grouped = allSnapshots.reduce((acc, s) => {
        if (!acc[s.lineId]) acc[s.lineId] = [];
        acc[s.lineId].push(s);
        return acc;
      }, {} as Record<string, WipSnapshot[]>);
      setSnapshots(grouped);
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubSnapshots();
    };
  }, [selectedSnapshotId]);

  const handleSnapshotChange = async (lineId: string, snapshotId: string) => {
    setSelectedSnapshotId(prev => ({ ...prev, [lineId]: snapshotId }));
    
    if (!snapshotId) {
      // If cleared, revert to current machine data
      dirtyLinesRef.current.delete(lineId);
      const lineMachines = machines.filter(m => m.lineId === lineId).sort((a, b) => (a.order || 0) - (b.order || 0));
      const machinesWithWip = lineMachines.filter(m => m.wip !== undefined && m.wip !== null && m.wip !== '');
      let rowsForLine = machinesWithWip.map(m => ({
        id: Math.random().toString(36).substring(2, 9),
        machineId: m.id,
        wip: String(m.wip)
      }));
      if (rowsForLine.length === 0) {
        rowsForLine = [{ id: Math.random().toString(36).substring(2, 9), machineId: '', wip: '' }];
      }
      setLineRows(prev => ({ ...prev, [lineId]: rowsForLine }));
      return;
    }

    setIsLoadingHistory(prev => ({ ...prev, [lineId]: true }));
    try {
      // Query wip_entries for this snapshot
      const snapshotQuery = query(collection(db, 'wip_entries'), where('snapshotId', '==', snapshotId));
      const result = await getDocs(snapshotQuery);
      
      const entries = result.docs.map(doc => doc.data());
      const rows = entries.map(entry => ({
        id: Math.random().toString(36).substring(2, 9),
        machineId: entry.machineId,
        wip: String(entry.wip)
      }));
      
      if (rows.length === 0) {
        rows.push({ id: Math.random().toString(36).substring(2, 9), machineId: '', wip: '' });
      }
      
      setLineRows(prev => ({ ...prev, [lineId]: rows }));
      dirtyLinesRef.current.add(lineId);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setIsLoadingHistory(prev => ({ ...prev, [lineId]: false }));
    }
  };

  const handleRowChange = React.useCallback((lineId: string, rowId: string, field: keyof WipRow, value: string) => {
    dirtyLinesRef.current.add(lineId);
    setLineRows(prev => ({
      ...prev,
      [lineId]: (prev[lineId] || []).map(row => 
        row.id === rowId ? { ...row, [field]: value } : row
      )
    }));
  }, []);

  const handleAddRow = React.useCallback((lineId: string) => {
    dirtyLinesRef.current.add(lineId);
    setLineRows(prev => ({
      ...prev,
      [lineId]: [...(prev[lineId] || []), { id: Math.random().toString(36).substring(2, 9), machineId: '', wip: '' }]
    }));
  }, []);

  const handleRemoveRow = React.useCallback((lineId: string, rowId: string) => {
    dirtyLinesRef.current.add(lineId);
    setLineRows(prev => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(row => row.id !== rowId)
    }));
  }, []);

  const handleSaveWip = async (lineId: string) => {
    setIsSaving(prev => ({ ...prev, [lineId]: true }));
    try {
      const rows = lineRows[lineId] || [];
      const lineMachines = machines.filter(m => m.lineId === lineId);
      
      const wipMap: Record<string, number | null> = {};
      
      // Initialize all machines in this line to null
      lineMachines.forEach(m => {
        wipMap[m.id] = null;
      });
      
      // Update with values from rows
      rows.forEach(row => {
        if (row.machineId && row.wip !== '') {
          wipMap[row.machineId] = Number(row.wip);
        }
      });
      
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();
      
      // Create a snapshot record
      const snapshotRef = doc(collection(db, 'wip_snapshots'));
      const snapshotId = snapshotRef.id;
      batch.set(snapshotRef, {
        lineId,
        createdAt: timestamp,
        createdBy: profile?.email || 'unknown'
      });
      
      // Update all machines in the line and save entries
      lineMachines.forEach(m => {
        const newWip = wipMap[m.id];
        
        // Always save to wip_entries for the snapshot if there's a value
        if (newWip !== null) {
          const newEntryRef = doc(collection(db, 'wip_entries'));
          batch.set(newEntryRef, {
            snapshotId,
            lineId,
            machineId: m.id,
            wip: newWip,
            createdAt: timestamp,
            createdBy: profile?.email || 'unknown'
          });
        }

        // Update current machine state if it changed
        if (m.wip !== newWip) {
          batch.update(doc(db, 'machines', m.id), { wip: newWip });
        }
      });
      
      // Update line's wipUpdatedAt
      batch.update(doc(db, 'lines', lineId), {
        wipUpdatedAt: timestamp
      });
      
      await batch.commit();
      
      dirtyLinesRef.current.delete(lineId);
      setSelectedSnapshotId(prev => ({ ...prev, [lineId]: '' }));
      
      setSaveSuccess(prev => ({ ...prev, [lineId]: true }));
      setTimeout(() => {
        setSaveSuccess(prev => ({ ...prev, [lineId]: false }));
      }, 2000);
    } catch (error) {
      console.error('Error updating WIP:', error);
    } finally {
      setIsSaving(prev => ({ ...prev, [lineId]: false }));
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 text-blue-700 rounded-full">
          <Wrench size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Work In Progress (WIP)</h2>
          <p className="text-gray-500">Update WIP quantities for each machine</p>
        </div>
      </div>

      <div className="space-y-6">
        {lines.map(line => {
          const lineMachines = machines.filter(m => m.lineId === line.id).sort((a, b) => (a.order || 0) - (b.order || 0));
          const rows = lineRows[line.id] || [];
          
          if (lineMachines.length === 0) return null;

          return (
            <div key={line.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <h3 className="text-lg font-bold text-gray-800">{line.name}</h3>
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <select
                      value={selectedSnapshotId[line.id] || ''}
                      onChange={(e) => handleSnapshotChange(line.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white min-w-[200px]"
                    >
                      <option value="">Current Live View</option>
                      {snapshots[line.id]?.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.createdAt?.toDate ? format(s.createdAt.toDate(), 'MMM d, yyyy HH:mm') : 'Recently added'}
                        </option>
                      ))}
                    </select>
                    {isLoadingHistory[line.id] && <span className="text-xs text-blue-500 animate-pulse">Loading...</span>}
                  </div>
                </div>
                {line.wipUpdatedAt && (
                  <div className="text-sm text-gray-500 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                    <Clock size={14} className="text-blue-500" />
                    <span>Last updated: <span className="font-medium text-gray-700">{line.wipUpdatedAt?.toDate ? format(line.wipUpdatedAt.toDate(), 'MMM d, yyyy HH:mm') : 'Just now'}</span></span>
                  </div>
                )}
              </div>
              <div className="p-6 space-y-4">
                {rows.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 px-2 text-sm font-medium text-gray-500 uppercase tracking-wider">
                      <div className="flex-1">WIP Quantity</div>
                      <div className="flex-1">Machine</div>
                      <div className="w-10"></div>
                    </div>
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-4 bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <input
                            type="number"
                            value={row.wip}
                            onChange={(e) => handleRowChange(line.id, row.id, 'wip', e.target.value)}
                            placeholder="Enter WIP"
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          />
                        </div>
                        <div className="flex-1">
                          <select
                            value={row.machineId}
                            onChange={(e) => handleRowChange(line.id, row.id, 'machineId', e.target.value)}
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          >
                            <option value="">Select Machine</option>
                            {lineMachines.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => handleRemoveRow(line.id, row.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove row"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200 border-dashed text-gray-500">
                    No WIP entries. Click "Add new" to create one.
                  </div>
                )}
                
                <button
                  onClick={() => handleAddRow(line.id)}
                  className="w-full py-3 mt-4 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 font-medium"
                >
                  <Plus size={20} />
                  Add new
                </button>
                
                <div className="pt-6 mt-6 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => handleSaveWip(line.id)}
                    disabled={isSaving[line.id]}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 shadow-sm ${
                      saveSuccess[line.id]
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <Save size={20} />
                    {isSaving[line.id] ? 'Saving...' : saveSuccess[line.id] ? 'Saved!' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {lines.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500">
            No lines configured yet.
          </div>
        )}
      </div>
    </div>
  );
}
