import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Crown, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Line {
  id: string;
  name: string;
}

interface Machine {
  id: string;
  lineId: string;
  name: string;
  status: 'running' | 'down';
  currentIncidentId: string | null;
  isCritical?: boolean;
  jigs?: number | null;
}

interface Incident {
  id: string;
  machineId: string;
  startTime: any;
  endTime?: any;
  status: 'open' | 'acknowledged' | 'resolved' | 'pending_me_review';
  brokenJigs?: number | null;
}

export function Dashboard() {
  const { profile } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [now, setNow] = useState(new Date());
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const qLines = query(collection(db, 'lines'), orderBy('createdAt', 'asc'));
    const unsubLines = onSnapshot(qLines, (snapshot) => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Line)));
    });

    const qMachines = query(collection(db, 'machines'), orderBy('createdAt', 'asc'));
    const unsubMachines = onSnapshot(qMachines, (snapshot) => {
      const fetchedMachines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Machine));
      fetchedMachines.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      });
      setMachines(fetchedMachines);
    });

    const qIncidents = query(collection(db, 'incidents'));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident)));
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubIncidents();
    };
  }, []);

  const getMachineIncident = (machineId: string) => {
    return incidents.find(i => i.machineId === machineId && i.status !== 'resolved');
  };

  const calculateDuration = (startTime: any) => {
    if (!startTime) return 0;
    const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
    return Math.ceil((now.getTime() - start.getTime()) / 60000);
  };

  const calculateMachineHealth = (machineId: string) => {
    let score = 100;
    
    // Get all incidents for this machine in the last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const machineIncidents = incidents.filter(i => {
      if (i.machineId !== machineId) return false;
      if (!i.startTime) return false;
      const start = i.startTime.toDate ? i.startTime.toDate() : new Date(i.startTime);
      return start >= sevenDaysAgo;
    });

    // Currently down: -20 points
    const currentIncident = machineIncidents.find(i => i.status !== 'resolved' && i.status !== 'pending_me_review');
    if (currentIncident) {
      score -= 20;
    }

    // Frequency: -5 points per breakdown
    score -= (machineIncidents.length * 5);

    // Duration: -2 points per hour of downtime
    let totalDowntimeMinutes = 0;
    machineIncidents.forEach(i => {
      const start = i.startTime.toDate ? i.startTime.toDate() : new Date(i.startTime);
      let end = now;
      if ((i.status === 'resolved' || i.status === 'pending_me_review') && i.endTime) {
         end = i.endTime.toDate ? i.endTime.toDate() : new Date(i.endTime);
      }
      totalDowntimeMinutes += Math.ceil((end.getTime() - start.getTime()) / 60000);
    });

    const downtimeHours = Math.floor(totalDowntimeMinutes / 60);
    score -= (downtimeHours * 2);

    return Math.max(0, score);
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Production Lines Dashboard</h2>
        {profile?.role === 'admin' && (
          <button 
            onClick={() => setShowMethodology(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
          >
            <Info size={16} />
            Health Scoring
          </button>
        )}
      </div>
      
      {lines.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
          No production lines configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {lines.map(line => {
            const lineMachines = machines.filter(m => m.lineId === line.id);
            
            return (
              <div key={line.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{line.name}</h3>
                
                <div className="flex flex-wrap gap-4 items-center">
                  {lineMachines.length === 0 ? (
                    <span className="text-sm text-gray-400 italic">No machines added</span>
                  ) : (
                    lineMachines.map((machine, index) => {
                      const incident = getMachineIncident(machine.id);
                      const isDown = machine.status === 'down';
                      const duration = incident ? calculateDuration(incident.startTime) : 0;
                      const healthScore = calculateMachineHealth(machine.id);
                      
                      return (
                        <div key={machine.id} className="flex items-center">
                          <div className="flex flex-col items-center group relative">
                            <div 
                              className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 relative ${
                                isDown ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                              }`}
                            >
                              {machine.isCritical && (
                                <div className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm z-10">
                                  <Crown size={14} className="text-yellow-500 fill-yellow-500" />
                                </div>
                              )}
                              <span className="text-xs font-bold truncate px-1">{machine.name.substring(0, 3)}</span>
                            </div>
                            
                            {/* Health Score Badge */}
                            {profile?.role === 'admin' && (
                              <div className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${getHealthColor(healthScore)}`}>
                                {healthScore}
                              </div>
                            )}
                            
                            {/* Tooltip */}
                            <div className="absolute -bottom-12 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10 pointer-events-none flex flex-col items-center gap-1">
                              <span>{machine.name}</span>
                              {profile?.role === 'admin' && (
                                <span className="text-[10px] text-gray-300">Health: {healthScore}/100</span>
                              )}
                            </div>
                            
                            {isDown && (
                              <div className="flex flex-col items-center mt-1">
                                <span className="text-xs font-bold text-red-600">
                                  {duration}m
                                </span>
                                {incident?.brokenJigs && (
                                  <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full mt-0.5">
                                    {incident.brokenJigs}{machine.jigs ? `/${machine.jigs}` : ''} Jigs
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Connector line between machines */}
                          {index < lineMachines.length - 1 && (
                            <div className="w-8 h-1 bg-gray-200 mx-1 rounded-full"></div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Methodology Modal */}
      {showMethodology && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Health Scoring Methodology</h3>
              <button onClick={() => setShowMethodology(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="space-y-4 text-sm text-gray-700">
              <p>Each machine starts with a perfect score of <strong>100</strong>. Points are deducted based on activity in the last 7 days:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><span className="text-red-600 font-bold">-20 points</span> if the machine is currently down.</li>
                <li><span className="text-red-600 font-bold">-5 points</span> for each breakdown occurrence.</li>
                <li><span className="text-red-600 font-bold">-2 points</span> for every hour of accumulated downtime.</li>
              </ul>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="font-semibold mb-2">Score Ranges:</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span> 80-100: Healthy</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> 50-79: Caution</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span> 0-49: Critical</div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setShowMethodology(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
