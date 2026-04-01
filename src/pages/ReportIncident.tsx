import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export function ReportIncident() {
  const { user } = useAuth();
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [selectedLine, setSelectedLine] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [brokenJigs, setBrokenJigs] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    return () => {
      unsubLines();
      unsubMachines();
    };
  }, [user]);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLine || !selectedMachine || !user) return;

    setLoading(true);
    try {
      const machine = machines.find(m => m.id === selectedMachine);
      const line = lines.find(l => l.id === selectedLine);

      if (!machine || !line) throw new Error('Invalid selection');

      if (machine.jigs > 0 && brokenJigs === '') {
        setError('Please select the number of broken jigs.');
        setLoading(false);
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
        assignedGroups: machine.assignedGroups || null,
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

      setSuccess(true);
      setSelectedLine('');
      setSelectedMachine('');
      setBrokenJigs('');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error reporting incident:', err);
      setError('Failed to report incident.');
    } finally {
      setLoading(false);
    }
  };

  const filteredMachines = machines.filter(m => m.lineId === selectedLine && m.status === 'running');
  const selectedMachineData = machines.find(m => m.id === selectedMachine);

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-red-100 text-red-600 rounded-full">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Report Machine Breakdown</h2>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
          <CheckCircle size={20} />
          <span>Breakdown reported successfully. Maintenance team notified.</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center justify-between border border-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      <form onSubmit={handleReport} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Production Line</label>
          <select
            value={selectedLine}
            onChange={(e) => {
              setSelectedLine(e.target.value);
              setSelectedMachine('');
              setBrokenJigs('');
            }}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
            required
          >
            <option value="">Select a line...</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
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
              setSelectedMachine(e.target.value);
              setBrokenJigs('');
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

        <div className="flex flex-col gap-4">
          <button
            type="submit"
            disabled={loading || !selectedLine || !selectedMachine}
            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex justify-center items-center gap-2"
          >
            {loading ? 'Reporting...' : (
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
                setLoading(true);
                try {
                  const machine = machines.find(m => m.id === selectedMachine);
                  const line = lines.find(l => l.id === selectedLine);
                  if (!machine || !line) throw new Error('Invalid selection');
                  if (machine.jigs > 0 && brokenJigs === '') {
                    setError('Please select the number of broken jigs.');
                    setLoading(false);
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
                    assignedGroups: machine.assignedGroups || null,
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
                  setSuccess(true);
                  setSelectedLine('');
                  setSelectedMachine('');
                  setBrokenJigs('');
                  setTimeout(() => setSuccess(false), 3000);
                } catch (err) {
                  console.error('Error reporting out of order:', err);
                  setError('Failed to report out of order.');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || !selectedLine || !selectedMachine}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex justify-center items-center gap-2"
            >
              {loading ? 'Reporting...' : (
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
  );
}
