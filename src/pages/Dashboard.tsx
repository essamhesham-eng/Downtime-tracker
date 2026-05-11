import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Crown, Info, Clock, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

interface Line {
  id: string;
  name: string;
  wipUpdatedAt?: any;
  colorCode?: string;
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
  const [isCompactView, setIsCompactView] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(getServerTime()), 30000); // Update every 30 seconds
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
    return Math.floor((now.getTime() - start.getTime()) / 60000);
  }, [now]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Production Lines Dashboard</h2>
        <button
          onClick={() => setIsCompactView(!isCompactView)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          title={isCompactView ? "Switch to Standard View" : "Fit all lines on screen"}
        >
          {isCompactView ? (
            <><List size={16} /> Standard View</>
          ) : (
            <><LayoutGrid size={16} /> Compact View</>
          )}
        </button>
      </div>
      
      {lines.length === 0 ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
          No production lines configured yet.
        </div>
      ) : (
        <div className={isCompactView ? "grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4" : "flex flex-col gap-6"}>
          {lines.map(line => {
            const lineMachines = machines.filter(m => m.lineId === line.id);
            const totalWIP = lineMachines.reduce((sum, machine) => sum + (Number(machine.wip) || 0), 0);
            const colorCode = line.colorCode || 'blue';
            const colorClasses: Record<string, { border: string }> = {
              blue: { border: 'border-t-blue-500' },
              emerald: { border: 'border-t-emerald-500' },
              purple: { border: 'border-t-purple-500' },
              amber: { border: 'border-t-amber-500' },
              pink: { border: 'border-t-pink-500' },
              indigo: { border: 'border-t-indigo-500' },
              rose: { border: 'border-t-rose-500' },
              cyan: { border: 'border-t-cyan-500' },
            };
            const styles = colorClasses[colorCode] || colorClasses.blue;

            return (
              <div key={line.id} className={`bg-white rounded-xl shadow-sm border-x border-b border-gray-100 border-t-4 ${styles.border} ${isCompactView ? 'p-3' : 'p-6'}`}>
                <div className={`flex justify-between items-center ${isCompactView ? 'mb-2' : 'mb-4'}`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <h3 className={`font-semibold text-gray-800 ${isCompactView ? 'text-sm' : 'text-lg'}`}>{line.name}</h3>
                    <span className={`${isCompactView ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium text-blue-600 bg-blue-50 rounded-full border border-blue-100 whitespace-nowrap`}>
                      {isCompactView ? 'S: ' : 'Shift: '}{productionHours[line.id] ?? 9}{isCompactView ? 'h' : 'hrs'}
                    </span>
                    <span className={`${isCompactView ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full border border-purple-100 whitespace-nowrap`}>
                      {isCompactView ? 'WIP: ' : 'Total WIP: '}{totalWIP}
                    </span>
                  </div>
                  {line.wipUpdatedAt && !isCompactView && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                      <Clock size={12} className="text-blue-500" />
                      <span>Last updated: {line.wipUpdatedAt?.toDate ? format(line.wipUpdatedAt.toDate(), 'MMM d, HH:mm') : 'Just now'}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-x-2 gap-y-4 items-center">
                  {lineMachines.length === 0 ? (
                    <span className="text-[10px] text-gray-400 italic">No machines</span>
                  ) : (
                    lineMachines.map((machine, index) => {
                      const incident = getMachineIncident(machine);
                      const isDown = machine.status === 'down';
                      const duration = incident ? calculateDuration(incident.startTime) : 0;
                      
                      const iconSize = isCompactView ? 'w-8 h-8' : 'w-12 h-12';
                      
                      return (
                        <div key={machine.id} className="flex items-center">
                          {/* Connector line and WIP before the machine */}
                          {(index > 0 || (machine.wip !== undefined && machine.wip !== null && machine.wip !== '')) && (
                            <div className={`flex flex-col items-center justify-center relative mx-0.5 ${isCompactView ? 'w-4 h-8' : 'w-8 h-12'}`}>
                              {machine.wip !== undefined && machine.wip !== null && machine.wip !== '' && (
                                <span className={`absolute -top-3 text-[9px] font-bold text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200 shadow-sm whitespace-nowrap z-10 ${isCompactView ? 'scale-90' : ''}`}>
                                  {machine.wip}
                                </span>
                              )}
                              <div className="w-full h-0.5 bg-gray-200 rounded-full"></div>
                            </div>
                          )}
                          
                          <div className="flex flex-col items-center group relative">
                            <div 
                              className={`${iconSize} rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 relative ${
                                isDown ? (incident?.type === 'out_of_order' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse') : 'bg-green-500'
                              }`}
                            >
                              {machine.isCritical && (
                                <div className={`absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm z-10 ${isCompactView ? 'scale-75' : ''}`}>
                                  <Crown size={isCompactView ? 10 : 14} className="text-yellow-500 fill-yellow-500" />
                                </div>
                              )}
                              <span className={`font-bold truncate px-0.5 ${isCompactView ? 'text-[8px]' : 'text-xs'}`}>{machine.name.substring(0, 3)}</span>
                            </div>
                            
                            {/* Tooltip */}
                            <div className="absolute -bottom-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] rounded py-1 px-2 whitespace-nowrap z-20 pointer-events-none flex flex-col items-center gap-1">
                              <span>{machine.name}</span>
                            </div>
                            
                            {isDown && (
                              <div className={`flex flex-col items-center ${isCompactView ? 'mt-0.5' : 'mt-1'}`}>
                                <span className={`font-bold text-red-600 ${isCompactView ? 'text-[9px]' : 'text-xs'}`}>
                                  {duration}m
                                </span>
                                {incident?.breakdownJigs != null && !isCompactView && (
                                  <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full mt-0.5">
                                    {incident.breakdownJigs}{incident.totalJigs ? `/${incident.totalJigs}` : ''} J
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
