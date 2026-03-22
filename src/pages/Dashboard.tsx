import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { differenceInMinutes } from 'date-fns';

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
}

interface Incident {
  id: string;
  machineId: string;
  startTime: any;
  status: 'open' | 'acknowledged' | 'resolved';
}

export function Dashboard() {
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [now, setNow] = useState(new Date());

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
    return differenceInMinutes(now, start);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Production Lines Dashboard</h2>
      
      {lines.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
          No production lines configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
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
                      
                      return (
                        <div key={machine.id} className="flex items-center">
                          <div className="flex flex-col items-center group relative">
                            <div 
                              className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 ${
                                isDown ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                              }`}
                            >
                              <span className="text-xs font-bold truncate px-1">{machine.name.substring(0, 3)}</span>
                            </div>
                            
                            {/* Tooltip */}
                            <div className="absolute -bottom-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10 pointer-events-none">
                              {machine.name}
                            </div>
                            
                            {isDown && (
                              <span className="text-xs font-bold text-red-600 mt-1">
                                {duration}m
                              </span>
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
    </div>
  );
}
