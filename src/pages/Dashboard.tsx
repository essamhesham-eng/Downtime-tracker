import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Crown, Info, Clock, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface Line {
  id: string;
  name: string;
  wipUpdatedAt?: any;
  colorCode?: string;
  status?: 'running' | 'upcoming' | 'stopped' | 'line_off';
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
  lineId?: string;
  assignedGroups?: string[];
}

import { getServerTime } from '../utils/time';

export function Dashboard() {
  const { profile, user, permissions } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeLineIssues, setActiveLineIssues] = useState<Incident[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [productionHours, setProductionHours] = useState<Record<string, number>>({});
  const [now, setNow] = useState(getServerTime());
  const [isCompactView, setIsCompactView] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedMachineId) {
        const target = event.target as HTMLElement;
        if (!target.closest('.machine-container')) {
          setSelectedMachineId(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedMachineId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(getServerTime()), 1000); // Update every 1 second
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

    const qGroups = query(collection(db, 'groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const startOfToday = new Date(getServerTime());
    startOfToday.setHours(0, 0, 0, 0);

    const qIncidents = query(collection(db, 'incidents'), where('startTime', '>=', startOfToday));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident)));
    });

    const qActiveIssues = query(collection(db, 'incidents'), where('status', 'in', ['open', 'working_on', 'pending_me_review']));
    const unsubLineIssues = onSnapshot(qActiveIssues, (snapshot) => {
      const allActive = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident));
      setActiveLineIssues(allActive.filter(i => i.type === 'line_issue' || i.type === 'line_off'));
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
      unsubGroups();
      unsubIncidents();
      unsubLineIssues();
      unsubHours();
    };
  }, [user]);

  const role = profile?.role || 'pending';
  const canSeeLineReport = role === 'admin' || (permissions && permissions[role]?.includes('line_breakdown_report'));

  const getMachineIncident = React.useCallback((machine: Machine) => {
    if (machine.currentIncidentId) {
      const incident = incidents.find(i => i.id === machine.currentIncidentId);
      if (incident) return incident;
    }
    // Fallback if currentIncidentId is missing
    return incidents.find(i => i.machineId === machine.id && (i.status === 'open' || i.status === 'working_on' || i.status === 'pending_me_review'));
  }, [incidents]);

  const formatStoppedTime = (minutes: number) => {
    const totalHrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const days = Math.floor(totalHrs / 24);
    const hrs = totalHrs % 24;
    
    if (days > 0) {
      return `${days}d : ${hrs}hr : ${mins}min`;
    } else if (totalHrs > 0) {
      return `${totalHrs}hr : ${mins}min`;
    } else {
      return `${minutes}min`;
    }
  };

  const handleLineBackToWork = async (lineId: string) => {
    try {
      const batch = writeBatch(db);
      const lineRef = doc(db, 'lines', lineId);
      const openIssue = activeLineIssues.find(i => i.lineId === lineId);
      
      batch.update(lineRef, {
        status: 'running',
        currentIssueId: null
      });

      if (openIssue) {
        const incidentRef = doc(db, 'incidents', openIssue.id);
        const startTime = openIssue.startTime?.toDate ? openIssue.startTime.toDate() : new Date();
        
        let durationMin;
        if (openIssue.type === 'line_off') {
          const shiftHours = productionHours[lineId] ?? 9;
          durationMin = shiftHours * 60;
        } else {
          durationMin = Math.max(1, Math.ceil((now.getTime() - startTime.getTime()) / 60000));
        }
        
        batch.update(incidentRef, {
          status: 'resolved',
          endTime: serverTimestamp(),
          durationMinutes: durationMin,
          resolvedBy: user?.uid || 'unknown'
        });
      }

      await batch.commit();
    } catch (error) {
      console.error('Error setting line to running:', error);
    }
  };

  const calculateDuration = React.useCallback((startTime: any) => {
    if (!startTime) return 0;
    const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 60000));
  }, [now]);

  const getMachineStats = React.useCallback((machineId: string, lineId: string) => {
    const machineIncidents = incidents.filter(i => i.machineId === machineId);
    
    let totalMins = 0;
    const today = new Date(getServerTime());
    today.setHours(0, 0, 0, 0);

    machineIncidents.forEach(incident => {
      const start = incident.startTime.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
      const end = incident.endTime?.toDate 
        ? incident.endTime.toDate() 
        : (incident.status === 'resolved' ? start : getServerTime());
      
      // Calculate overlap with today
      const overlapStart = Math.max(start.getTime(), today.getTime());
      const overlapEnd = Math.min(end.getTime(), getServerTime().getTime());
      
      if (overlapEnd > overlapStart) {
        totalMins += Math.floor((overlapEnd - overlapStart) / 60000);
      }
    });

    const shiftHours = productionHours[lineId] ?? 9;
    const totalShiftMins = shiftHours * 60;
    const downPercent = totalShiftMins > 0 ? (totalMins / totalShiftMins) * 100 : 0;

    return {
      events: machineIncidents.length,
      mins: totalMins,
      percent: downPercent
    };
  }, [incidents, productionHours]);

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
            let lineBgClass = 'bg-white';
            let lineBorderClass = `border-x border-b border-gray-100 border-t-4 ${styles.border}`;
            
            if (line.status === 'upcoming') {
              lineBgClass = 'bg-yellow-50 animate-pulse';
              lineBorderClass = 'border-4 border-yellow-400';
            } else if (line.status === 'stopped') {
              lineBgClass = 'bg-red-50 animate-pulse';
              lineBorderClass = 'border-4 border-red-500';
            } else if (line.status === 'line_off') {
              lineBgClass = 'bg-gray-100/50';
              lineBorderClass = 'border-4 border-gray-300';
            }

            const activeIssue = (line.status === 'upcoming' || line.status === 'stopped' || line.status === 'line_off') ? activeLineIssues.find(i => i.lineId === line.id) : null;
            let issueText = '';
            let countdownText = '';
            if (activeIssue) {
              const assignedGroup = activeIssue.assignedGroups?.[0];
              const groupName = groups.find(g => g.id === assignedGroup)?.name || 'Unknown Team';
              const rootCause = (activeIssue as any).rootCause;
              issueText = rootCause ? `${groupName}: ${rootCause}` : groupName;

              if (line.status === 'line_off') {
                const startTime = activeIssue.startTime?.toDate ? activeIssue.startTime.toDate() : new Date();
                const totalMs = now.getTime() - startTime.getTime();
                const totalMin = Math.floor(Math.max(0, totalMs) / 60000);
                countdownText = ` (${formatStoppedTime(totalMin)})`;
              } else {
                if (line.status === 'upcoming' && (activeIssue as any).remainingTimeMinutes) {
                  const startTime = activeIssue.startTime?.toDate ? activeIssue.startTime.toDate() : new Date();
                  const totalTargetMs = startTime.getTime() + (activeIssue as any).remainingTimeMinutes * 60000;
                  const remainingMs = totalTargetMs - now.getTime();
                  if (remainingMs > 0) {
                    const remainingMin = Math.floor(remainingMs / 60000);
                    const remainingSec = Math.floor((remainingMs % 60000) / 1000);
                    countdownText = ` (-${remainingMin}:${remainingSec.toString().padStart(2, '0')})`;
                  } else {
                    countdownText = ' (Time Up!)';
                  }
                } else if (line.status === 'stopped') {
                  const startTime = activeIssue.startTime?.toDate ? activeIssue.startTime.toDate() : new Date();
                  const totalMs = now.getTime() - startTime.getTime();
                  const totalMin = Math.max(1, Math.ceil(Math.max(0, totalMs) / 60000));
                  countdownText = ` (${formatStoppedTime(totalMin)})`;
                }
              }
            }

            return (
              <div key={line.id} className={`${lineBgClass} rounded-xl shadow-sm ${lineBorderClass} flex flex-col ${isCompactView ? 'p-3' : 'p-6'} transition-colors`}>
                <div className={`flex justify-between items-center ${isCompactView ? 'mb-2' : 'mb-4'}`}>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className={`font-semibold ${line.status === 'line_off' ? 'text-gray-500' : 'text-gray-800'} ${isCompactView ? 'text-sm' : 'text-lg'}`}>{line.name}</h3>
                    <span className={`${isCompactView ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium ${line.status === 'line_off' ? 'text-gray-500 bg-white border-gray-300' : 'text-blue-600 bg-blue-50 border-blue-100'} rounded-full border whitespace-nowrap`}>
                      {isCompactView ? 'S: ' : 'Shift: '}{productionHours[line.id] ?? 9}{isCompactView ? 'h' : 'hrs'}
                    </span>
                    <span className={`${isCompactView ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-medium ${line.status === 'line_off' ? 'text-gray-500 bg-white border-gray-300' : 'text-purple-600 bg-purple-50 border-purple-100'} px-2 py-1 rounded-full border whitespace-nowrap`}>
                      {isCompactView ? 'WIP: ' : 'Total WIP: '}{totalWIP}
                    </span>
                    {line.status === 'line_off' && canSeeLineReport && (
                      <button
                        onClick={() => handleLineBackToWork(line.id)}
                        className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-medium rounded text-xs transition-colors shadow-sm"
                      >
                        Back to Work
                      </button>
                    )}
                    {issueText && (
                      <span className={`${isCompactView ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} font-bold ${line.status === 'stopped' ? 'text-red-700 bg-red-100 border-red-200' : line.status === 'line_off' ? 'text-gray-700 bg-gray-200 border-gray-300' : 'text-yellow-700 bg-yellow-100 border-yellow-200'} px-2 py-1 rounded-full border whitespace-nowrap`}>
                        {issueText}{countdownText}
                      </span>
                    )}
                  </div>
                  {line.wipUpdatedAt && !isCompactView && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                      <Clock size={12} className="text-blue-500" />
                      <span>Last updated: {line.wipUpdatedAt?.toDate ? format(line.wipUpdatedAt.toDate(), 'MMM d, HH:mm') : 'Just now'}</span>
                    </div>
                  )}
                </div>
                
                <div className={`flex flex-wrap gap-x-2 gap-y-4 items-center ${line.status === 'line_off' ? 'grayscale opacity-60' : ''}`}>
                  {lineMachines.length === 0 ? (
                    <span className="text-[10px] text-gray-400 italic">No machines</span>
                  ) : (
                    lineMachines.map((machine, index) => {
                      const incident = getMachineIncident(machine);
                      const isDown = machine.status === 'down';
                      const duration = incident ? calculateDuration(incident.startTime) : 0;
                      
                      const iconSize = isCompactView ? 'w-8 h-8' : 'w-12 h-12';
                      
                      return (
                        <div key={machine.id} className="flex items-center machine-container">
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
                            <button 
                              onClick={() => setSelectedMachineId(selectedMachineId === machine.id ? null : machine.id)}
                              className={`${iconSize} rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 active:scale-95 relative outline-none ${
                                isDown ? (incident?.type === 'out_of_order' ? 'bg-amber-500 animate-pulse' : incident?.type === 'maintenance' ? 'bg-blue-500 animate-pulse' : 'bg-red-500 animate-pulse') : 'bg-green-500'
                              }`}
                            >
                              {machine.isCritical && (
                                <div className={`absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm z-10 ${isCompactView ? 'scale-75' : ''}`}>
                                  <Crown size={isCompactView ? 10 : 14} className="text-yellow-500 fill-yellow-500" />
                                </div>
                              )}
                              <span className={`font-bold truncate px-0.5 ${isCompactView ? 'text-[8px]' : 'text-xs'}`}>{machine.name.substring(0, 3)}</span>
                            </button>
                            
                            {/* Analysis Card */}
                            <AnimatePresence>
                              {selectedMachineId === machine.id && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                  transition={{ duration: 0.2 }}
                                  className="absolute top-[110%] left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[120px]"
                                >
                                  <div className="space-y-1.5">
                                    {(() => {
                                      const stats = getMachineStats(machine.id, line.id);
                                      return (
                                        <>
                                          <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                            <span className="text-gray-500">Events:</span>
                                            <span className="font-bold text-gray-800">{stats.events}</span>
                                          </div>
                                          <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                            <span className="text-gray-500">Mins:</span>
                                            <span className="font-bold text-red-600">{stats.mins}</span>
                                          </div>
                                          <div className="h-[1px] bg-gray-100 my-1"></div>
                                          <div className="flex justify-between items-center text-[10px] sm:text-xs">
                                            <span className="text-gray-500">Down:</span>
                                            <span className={`font-bold ${stats.percent > 10 ? 'text-red-600' : 'text-orange-500'}`}>{stats.percent.toFixed(1)}%</span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l border-gray-200 rotate-45"></div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Tooltip (only if not analysis card) */}
                            {selectedMachineId !== machine.id && (
                              <div className="absolute -bottom-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] rounded py-1 px-2 whitespace-nowrap z-20 pointer-events-none flex flex-col items-center gap-1">
                                <span>{machine.name}</span>
                              </div>
                            )}
                            
                            {isDown && selectedMachineId !== machine.id && (
                              <div className={`flex flex-col items-center ${isCompactView ? 'mt-0.5' : 'mt-1'}`}>
                                <span className={`font-bold text-red-600 ${isCompactView ? 'text-[9px]' : 'text-xs'} whitespace-nowrap`}>
                                  {formatStoppedTime(duration)}
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
