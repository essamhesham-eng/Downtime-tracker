import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Crown, Info, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface Line {
  id: string;
  name: string;
  wipUpdatedAt?: any;
}

interface Machine {
  id: string;
  lineId: string;
  name: string;
  status: 'running' | 'down';
  currentIncidentId: string | null;
  isCritical?: boolean;
  jigs?: number | null;
  wip?: number | string | null;
}

interface Incident {
  id: string;
  machineId: string;
  startTime: any;
  endTime?: any;
  status: 'open' | 'working_on' | 'resolved' | 'pending_me_review';
  breakdownJigs?: number | null;
  totalJigs?: number | null;
  type?: string;
}

import { getServerTime } from '../utils/time';

export function Dashboard() {
  const { profile, user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [productionHours, setProductionHours] = useState<Record<string, number>>({});
  const [now, setNow] = useState(getServerTime());

  useEffect(() => {
    const timer = setInterval(() => setNow(getServerTime()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

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

    const qIncidents = query(collection(db, 'incidents'), where('status', 'in', ['open', 'working_on', 'pending_me_review']));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident)));
    });

    const todayStr = format(getServerTime(), 'yyyy-MM-dd');
    const qHours = query(collection(db, 'production_hours'), where('date', '==', todayStr));
    const unsubHours = onSnapshot(qHours, (snapshot) => {
      const hoursMap: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        hoursMap[data.lineId] = data.hours;
      });
      setProductionHours(hoursMap);
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubIncidents();
      unsubHours();
    };
  }, [user]);

  const getMachineIncident = React.useCallback((machine: Machine) => {
    if (machine.currentIncidentId) {
      const incident = incidents.find(i => i.id === machine.currentIncidentId);
      if (incident) return incident;
    }
    // Fallback if currentIncidentId is missing
    return incidents.find(i => i.machineId === machine.id && (i.status === 'open' || i.status === 'working_on'));
  }, [incidents]);

  const calculateDuration = React.useCallback((startTime: any) => {
    if (!startTime) return 0;
    const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
    return Math.ceil((now.getTime() - start.getTime()) / 60000);
  }, [now]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Production Lines Dashboard</h2>
      </div>
      
      {lines.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
          No production lines configured yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {lines.map(line => {
            const lineMachines = machines.filter(m => m.lineId === line.id);
            const totalWIP = lineMachines.reduce((sum, machine) => sum + (Number(machine.wip) || 0), 0);
            
            return (
              <div key={line.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-800">{line.name}</h3>
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                      Shift: {productionHours[line.id] ?? 9}hrs
                    </span>
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full border border-purple-100">
                      Total WIP: {totalWIP}
                    </span>
                  </div>
                  {line.wipUpdatedAt && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                      <Clock size={12} className="text-blue-500" />
                      <span>Last updated: {line.wipUpdatedAt?.toDate ? format(line.wipUpdatedAt.toDate(), 'MMM d, HH:mm') : 'Just now'}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-4 items-center">
                  {lineMachines.length === 0 ? (
                    <span className="text-sm text-gray-400 italic">No machines added</span>
                  ) : (
                    lineMachines.map((machine, index) => {
                      const incident = getMachineIncident(machine);
                      const isDown = machine.status === 'down';
                      const duration = incident ? calculateDuration(incident.startTime) : 0;
                      
                      return (
                        <div key={machine.id} className="flex items-center">
                          {/* Connector line and WIP before the machine */}
                          {(index > 0 || (machine.wip !== undefined && machine.wip !== null && machine.wip !== '')) && (
                            <div className="flex flex-col items-center justify-center relative mx-1 w-8 h-12">
                              {machine.wip !== undefined && machine.wip !== null && machine.wip !== '' && (
                                <span className="absolute -top-4 text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm whitespace-nowrap z-10">
                                  {machine.wip}
                                </span>
                              )}
                              <div className="w-full h-1 bg-gray-200 rounded-full"></div>
                            </div>
                          )}
                          
                          <div className="flex flex-col items-center group relative">
                            <div 
                              className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 relative ${
                                isDown ? (incident?.type === 'out_of_order' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse') : 'bg-green-500'
                              }`}
                            >
                              {machine.isCritical && (
                                <div className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-sm z-10">
                                  <Crown size={14} className="text-yellow-500 fill-yellow-500" />
                                </div>
                              )}
                              <span className="text-xs font-bold truncate px-1">{machine.name.substring(0, 3)}</span>
                            </div>
                            
                            {/* Tooltip */}
                            <div className="absolute -bottom-12 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10 pointer-events-none flex flex-col items-center gap-1">
                              <span>{machine.name}</span>
                            </div>
                            
                            {isDown && (
                              <div className="flex flex-col items-center mt-1">
                                <span className="text-xs font-bold text-red-600">
                                  {duration}m
                                </span>
                                {incident?.breakdownJigs != null && (
                                  <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full mt-0.5">
                                    {incident.breakdownJigs}{incident.totalJigs ? `/${incident.totalJigs}` : ''} Jigs
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
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
