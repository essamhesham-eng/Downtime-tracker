import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, serverTimestamp, writeBatch, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, CheckCircle, Activity } from 'lucide-react';

export function ReportIncident() {
  const { user, profile, permissions } = useAuth();
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [reasonCodes, setReasonCodes] = useState<any[]>([]);
  
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedIssue, setSelectedIssue] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [remainingTime, setRemainingTime] = useState('');
  const [lineIssueMode, setLineIssueMode] = useState<'upcoming' | 'stopped' | 'line_off'>('upcoming');

  const [selectedLine, setSelectedLine] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedMachineTeam, setSelectedMachineTeam] = useState<string>('');
  const [selectedLineIssue, setSelectedLineIssue] = useState('');
  const [brokenJigs, setBrokenJigs] = useState<number | ''>('');
  
  const [loadingMachine, setLoadingMachine] = useState(false);
  const [loadingLine, setLoadingLine] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const role = profile?.role || 'pending';
  const canSeeLineReport = role === 'admin' || (permissions && permissions[role]?.includes('line_breakdown_report'));

  useEffect(() => {
    if (!user) return;

    const qLines = query(collection(db, 'lines'), orderBy('createdAt', 'asc'));
    const unsubLines = onSnapshot(qLines, (snapshot) => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qMachines = query(collection(db, 'machines'), orderBy('createdAt', 'asc'));
    const unsubMachines = onSnapshot(qMachines, (snapshot) => {
      const fetchedMachines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedMachines.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      });
      setMachines(fetchedMachines);
    });

    const qGroups = query(collection(db, 'groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sorted.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
      setGroups(sorted);
    });

    const qReasonCodes = query(collection(db, 'reasonCodes'));
    const unsubReasonCodes = onSnapshot(qReasonCodes, (snapshot) => {
      const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sorted.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.code || '').localeCompare(b.code || '');
      });
      setReasonCodes(sorted);
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubGroups();
      unsubReasonCodes();
    };
  }, [user]);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLine || !selectedMachine || !user) return;

    setLoadingMachine(true);
    try {
      const machine = machines.find(m => m.id === selectedMachine);
      const line = lines.find(l => l.id === selectedLine);

      if (!machine || !line) throw new Error('Invalid selection');

      if (machine.jigs > 0 && brokenJigs === '') {
        setError('Please select the number of broken jigs.');
        setLoadingMachine(false);
        return;
      }

      const batch = writeBatch(db);
      
      const incidentRef = doc(collection(db, 'incidents'));
      
      batch.set(incidentRef, {
        lineId: selectedLine,
        machineId: selectedMachine,
        machineName: machine.name,
        lineName: line.name,
        reportedBy: user.uid,
        reportedByName: user.displayName || user.email || 'Unknown',
        assignedTo: null,
        assignedGroups: selectedMachineTeam ? [selectedMachineTeam] : null,
        totalJigs: machine.jigs || null,
        breakdownJigs: brokenJigs === '' ? null : brokenJigs,
        startTime: serverTimestamp(),
        status: 'open',
      });

      const machineRef = doc(db, 'machines', selectedMachine);
      batch.update(machineRef, {
        status: 'down',
        currentIncidentId: incidentRef.id,
      });

      await batch.commit();

      setSuccess('Machine breakdown reported successfully!');
      setSelectedLine('');
      setSelectedMachine('');
      setSelectedMachineTeam('');
      setBrokenJigs('');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error reporting incident:', err);
      setError('Failed to report incident.');
    } finally {
      setLoadingMachine(false);
    }
  };

  const handleLineReport = async (status: 'upcoming' | 'stopped' | 'line_off') => {
    if (!selectedLineIssue || !selectedIssue || !selectedGroup || !user) return;
    if (status === 'upcoming' && !remainingTime) {
      setError('Please specify the remain time for the upcoming issue.');
      return;
    }
    setLoadingLine(true);
    try {
      const line = lines.find(l => l.id === selectedLineIssue);
      if (!line) throw new Error('Invalid line');

      const batch = writeBatch(db);
      const incidentRef = doc(collection(db, 'incidents'));

      batch.set(incidentRef, {
        lineId: selectedLineIssue,
        machineId: 'line_issue',
        machineName: 'Line Issue',
        lineName: line.name,
        reportedBy: user.uid,
        reportedByName: user.displayName || user.email || 'Unknown',
        assignedTo: null,
        assignedGroups: [selectedGroup],
        reasonCode: selectedIssue,
        rootCause: rootCause.trim() || null,
        remainingTimeMinutes: remainingTime ? parseInt(remainingTime, 10) : null,
        lineIssueType: status,
        type: status === 'line_off' ? 'line_off' : 'line_issue',
        startTime: serverTimestamp(),
        status: 'open'
      });

      const lineRef = doc(db, 'lines', selectedLineIssue);
      batch.update(lineRef, {
        status: status,
        currentIssueId: incidentRef.id
      });

      await batch.commit();

      setSuccess('Line issue reported successfully!');
      setSelectedLineIssue('');
      setSelectedIssue('');
      setSelectedGroup('');
      setRootCause('');
      setRemainingTime('');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error reporting line issue:', err);
      setError('Failed to report line issue.');
    } finally {
      setLoadingLine(false);
    }
  };

  const filteredMachines = machines.filter(m => m.lineId === selectedLine && m.status === 'running');
  const selectedMachineData = machines.find(m => m.id === selectedMachine);

  const colorClasses: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50/50',
    green: 'border-green-500 bg-green-50/50',
    purple: 'border-purple-500 bg-purple-50/50',
    orange: 'border-orange-500 bg-orange-50/50',
    pink: 'border-pink-500 bg-pink-50/50',
    indigo: 'border-indigo-500 bg-indigo-50/50',
    rose: 'border-rose-500 bg-rose-50/50',
    cyan: 'border-cyan-500 bg-cyan-50/50',
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      {success && (
        <div className="p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
          <CheckCircle size={20} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center justify-between border border-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Machine Breakdown Section */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            Report Machine Breakdown
          </h2>
        </div>

        <form onSubmit={handleReport} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Production Line</label>
            <select
              value={selectedLine}
              onChange={(e) => {
                setSelectedLine(e.target.value);
                setSelectedMachine('');
                setSelectedMachineTeam('');
                setBrokenJigs('');
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              required
            >
              <option value="">Select a line...</option>
              {lines.map(line => {
                const hasLineIssue = line.status === 'upcoming' || line.status === 'stopped' || line.status === 'line_off';
                return (
                  <option key={line.id} value={line.id}>
                    {line.name} {hasLineIssue ? `(Active Issue: ${line.status.replace('_', ' ')})` : ''}
                  </option>
                );
              })}
            </select>
            {selectedLine && lines.find(l => l.id === selectedLine)?.allowOutOfOrder && (
              <p className="text-xs text-amber-600 mt-2 font-medium flex items-center gap-1">
                <AlertTriangle size={12} />
                "Out of Order" reporting is enabled for this line.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Machine</label>
            <select
              value={selectedMachine}
              onChange={(e) => {
                const mId = e.target.value;
                setSelectedMachine(mId);
                setBrokenJigs('');
                const selectedM = machines.find(m => m.id === mId);
                setSelectedMachineTeam(selectedM?.assignedGroups?.[0] || '');
              }}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 disabled:opacity-50"
              required
              disabled={!selectedLine}
            >
              <option value="">Select a machine...</option>
              {filteredMachines.map(machine => (
                <option key={machine.id} value={machine.id}>{machine.name}</option>
              ))}
            </select>
            {selectedLine && filteredMachines.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No running machines found on this line.</p>
            )}
          </div>

          {selectedMachineData && selectedMachineData.jigs > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Broken Jigs (Max: {selectedMachineData.jigs})</label>
              <select
                value={brokenJigs}
                onChange={(e) => setBrokenJigs(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                required
              >
                <option value="">Select broken jigs...</option>
                {Array.from({ length: selectedMachineData.jigs }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
          )}

          {selectedMachine && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                Related Team
              </label>
              {groups.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const isSelected = selectedMachineTeam === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedMachineTeam(isSelected ? '' : g.id)}
                        className={`py-2 px-4 rounded-lg font-bold text-sm transition-all border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  No teams available.
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Defaults to the pre-configured team for this machine. Tap a team to change the selection.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={loadingMachine || !selectedLine || !selectedMachine}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex justify-center items-center gap-2"
            >
              {loadingMachine ? 'Reporting...' : (
                <>
                  <AlertTriangle size={20} />
                  CALL MAINTENANCE
                </>
              )}
            </button>
            
            {lines.find(l => l.id === selectedLine)?.allowOutOfOrder && (
              <button
                type="button"
                onClick={async () => {
                  if (!selectedLine || !selectedMachine || !user) return;
                  setLoadingMachine(true);
                  try {
                    const machine = machines.find(m => m.id === selectedMachine);
                    const line = lines.find(l => l.id === selectedLine);
                    if (!machine || !line) throw new Error('Invalid selection');
                    if (machine.jigs > 0 && brokenJigs === '') {
                      setError('Please select the number of broken jigs.');
                      setLoadingMachine(false);
                      return;
                    }
                    const incidentRef = await addDoc(collection(db, 'incidents'), {
                      lineId: selectedLine,
                      machineId: selectedMachine,
                      machineName: machine.name,
                      lineName: line.name,
                      reportedBy: user.uid,
                      reportedByName: user.displayName || user.email || 'Unknown',
                      assignedTo: null,
                      assignedGroups: selectedMachineTeam ? [selectedMachineTeam] : null,
                      totalJigs: machine.jigs || null,
                      breakdownJigs: brokenJigs === '' ? null : brokenJigs,
                      startTime: serverTimestamp(),
                      status: 'open',
                      type: 'out_of_order'
                    });
                    await updateDoc(doc(db, 'machines', selectedMachine), {
                      status: 'down',
                      currentIncidentId: incidentRef.id,
                    });
                    setSuccess('Out of order reported successfully!');
                    setSelectedLine('');
                    setSelectedMachine('');
                    setSelectedMachineTeam('');
                    setBrokenJigs('');
                    setTimeout(() => setSuccess(null), 3000);
                  } catch (err) {
                    console.error('Error reporting out of order:', err);
                    setError('Failed to report out of order.');
                  } finally {
                    setLoadingMachine(false);
                  }
                }}
                disabled={loadingMachine || !selectedLine || !selectedMachine}
                className="w-full py-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex justify-center items-center gap-2"
              >
                {loadingMachine ? 'Reporting...' : (
                  <>
                    <AlertTriangle size={20} />
                    OUT OF ORDER
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Line Issue Section */}
      {canSeeLineReport && (
        <div className={`p-8 rounded-xl shadow-sm border-2 transition-all duration-300 ${
          lineIssueMode === 'upcoming' ? 'border-yellow-400 bg-yellow-50/10' : lineIssueMode === 'stopped' ? 'border-red-400 bg-red-50/10' : 'border-gray-400 bg-gray-50/10'
        }`}>
          <div className="flex items-center gap-3 mb-6 border-b border-gray-200/50 pb-4">
            <div className={`p-3 rounded-full ${lineIssueMode === 'upcoming' ? 'bg-yellow-100 text-yellow-600' : lineIssueMode === 'stopped' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
              <Activity size={24} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              Report Line Issue
            </h2>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <button
              type="button"
              onClick={() => setLineIssueMode('upcoming')}
              className={`flex-1 py-3 px-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                lineIssueMode === 'upcoming' 
                  ? 'bg-yellow-500 text-white shadow-md border-b-4 border-yellow-600' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <AlertTriangle size={20} />
              Upcoming Issue
            </button>
            <button
              type="button"
              onClick={() => setLineIssueMode('stopped')}
              className={`flex-1 py-3 px-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                 lineIssueMode === 'stopped'
                   ? 'bg-red-600 text-white shadow-md border-b-4 border-red-700'
                   : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <AlertTriangle size={20} />
              Line Stopped
            </button>
            <button
              type="button"
              onClick={() => setLineIssueMode('line_off')}
              className={`flex-1 py-3 px-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                 lineIssueMode === 'line_off'
                   ? 'bg-gray-600 text-white shadow-md border-b-4 border-gray-700'
                   : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Activity size={20} />
              Line Off
            </button>
          </div>

          <form className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Production Line</label>
              <select
                value={selectedLineIssue}
                onChange={(e) => setSelectedLineIssue(e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:outline-none bg-white ${
                  lineIssueMode === 'upcoming' ? 'border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500' : lineIssueMode === 'stopped' ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-gray-500 focus:border-gray-500'
                }`}
                required
              >
                <option value="">Select a line...</option>
                {lines.map(line => {
                  const isBlocked = line.status === 'upcoming' || line.status === 'stopped' || line.status === 'line_off';
                  return (
                    <option key={line.id} value={line.id} disabled={isBlocked}>
                      {line.name} {isBlocked ? `(Currently ${line.status.replace('_', ' ')})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Issue / Cause</label>
              <select
                value={selectedIssue}
                onChange={(e) => setSelectedIssue(e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:outline-none bg-white disabled:opacity-50 ${
                  lineIssueMode === 'upcoming' ? 'border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500' : lineIssueMode === 'stopped' ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-gray-500 focus:border-gray-500'
                }`}
                required
              >
                <option value="">Select an issue...</option>
                {reasonCodes.map(c => (
                  <option key={c.id} value={c.code}>{c.code} - {c.description}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Related Team</label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:outline-none bg-white disabled:opacity-50 ${
                  lineIssueMode === 'upcoming' ? 'border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500' : lineIssueMode === 'stopped' ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-gray-500 focus:border-gray-500'
                }`}
                required
              >
                <option value="">Select a team...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Root Cause (Optional)</label>
              <input
                type="text"
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="e.g., Material shortage, Sensor failure"
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:outline-none bg-white ${
                  lineIssueMode === 'upcoming' ? 'border-yellow-300 focus:ring-yellow-500 focus:border-yellow-500' : lineIssueMode === 'stopped' ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-gray-500 focus:border-gray-500'
                }`}
              />
            </div>

            {lineIssueMode === 'upcoming' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Remain Time for Upcoming Issue (Minutes) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={remainingTime}
                  onChange={(e) => setRemainingTime(e.target.value)}
                  placeholder="e.g., 15"
                  required
                  className="w-full p-3 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 focus:outline-none bg-white"
                />
              </div>
            )}

            <div className="flex mt-8 gap-4">
              <button
                type="button"
                onClick={() => handleLineReport(lineIssueMode)}
                disabled={loadingLine || !selectedLineIssue || !selectedIssue || !selectedGroup || (lineIssueMode === 'upcoming' && !remainingTime)}
                className={`w-full py-4 font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex justify-center items-center gap-2 ${
                  lineIssueMode === 'upcoming' 
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white' 
                    : lineIssueMode === 'stopped' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {loadingLine ? 'Reporting...' : (lineIssueMode === 'upcoming' ? 'Submit Upcoming Issue' : lineIssueMode === 'stopped' ? 'Submit Line Stopped' : 'Submit Line Off')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

