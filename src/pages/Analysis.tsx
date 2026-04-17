import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, getDoc, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart
} from 'recharts';
import { Clock, AlertTriangle, Activity, Wrench, Info, Loader2, Calendar } from 'lucide-react';
import { getServerTime } from '../utils/time';
import { ProductionHoursModal } from '../components/ProductionHoursModal';

export function Analysis() {
  const { profile, user } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  
  const [startDate, setStartDate] = useState(format(subDays(getServerTime(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(getServerTime(), 'yyyy-MM-dd'));
  const [selectedLine, setSelectedLine] = useState('all');
  const [selectedMachine, setSelectedMachine] = useState('all');
  const [trendMetric, setTrendMetric] = useState<'hours' | 'minutes' | 'events'>('minutes');
  const [mttrTrendMetric, setMttrTrendMetric] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [productionHoursData, setProductionHoursData] = useState<any[]>([]);
  const [isProductionHoursModalOpen, setIsProductionHoursModalOpen] = useState(false);

  const currentDatePreset = useMemo(() => {
    const today = getServerTime();
    const todayStr = format(today, 'yyyy-MM-dd');
    if (startDate === format(subDays(today, 7), 'yyyy-MM-dd') && endDate === todayStr) return 'last7';
    if (startDate === format(subDays(today, 30), 'yyyy-MM-dd') && endDate === todayStr) return 'last30';
    if (startDate === format(startOfMonth(today), 'yyyy-MM-dd') && endDate === format(endOfMonth(today), 'yyyy-MM-dd')) return 'thisMonth';
    return 'custom';
  }, [startDate, endDate]);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const today = getServerTime();
    if (val === 'last7') {
      setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (val === 'last30') {
      setStartDate(format(subDays(today, 30), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (val === 'thisMonth') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
    }
  };

  useEffect(() => {
    if (!user) return;

    // Calculate how far back we need data (including the previous period for comparison)
    const currentStart = startOfDay(new Date(startDate));
    const currentEnd = endOfDay(new Date(endDate));
    const diffTime = Math.abs(currentEnd.getTime() - currentStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const prevStart = subDays(currentStart, diffDays);
    const startTimestamp = Timestamp.fromDate(prevStart);

    // Limit by date to drastically reduce read quota
    const unsubIncidents = onSnapshot(
      query(collection(db, 'incidents'), where('startTime', '>=', startTimestamp), orderBy('startTime', 'desc'), limit(5000)), 
      snapshot => {
        setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );
    const unsubMachines = onSnapshot(query(collection(db, 'machines')), snapshot => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLines = onSnapshot(query(collection(db, 'lines')), snapshot => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGroups = onSnapshot(query(collection(db, 'groups')), snapshot => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubProductionHours = onSnapshot(
      query(collection(db, 'production_hours'), limit(5000)), 
      snapshot => {
        setProductionHoursData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => { unsubIncidents(); unsubMachines(); unsubLines(); unsubGroups(); unsubProductionHours(); };
  }, [user, startDate, endDate]);

  const userGroups = useMemo(() => {
    if (!profile || !groups.length) return [];
    return groups.filter(g => g.userIds?.includes(profile.uid)).map(g => g.id);
  }, [profile, groups]);

  const filteredIncidents = useMemo(() => {
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    
    return incidents.filter(inc => {
      if (!inc.startTime) return false;
      if (inc.type === 'out_of_order') return false; // Exclude out of order incidents
      
      const incStart = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      if (!isWithinInterval(incStart, { start, end })) return false;
      
      if (selectedLine !== 'all' && inc.lineName !== lines.find(l => l.id === selectedLine)?.name) return false;
      if (selectedMachine !== 'all' && inc.machineId !== selectedMachine) return false;
      
      if (profile?.role !== 'admin' && profile?.role !== 'manager' && user) {
        if (inc.reportedBy === user.uid) return true;
        const hasGroups = inc.assignedGroups && inc.assignedGroups.length > 0;
        const hasIndividuals = inc.assignedTo && inc.assignedTo.length > 0;
        if (!hasGroups && !hasIndividuals) return true;
        const inGroup = hasGroups && userGroups.some(groupId => inc.assignedGroups.includes(groupId));
        const isIndividual = hasIndividuals && inc.assignedTo.includes(user.uid);
        if (!inGroup && !isIndividual) return false;
      }

      return true;
    });
  }, [incidents, startDate, endDate, selectedLine, selectedMachine, lines, profile, userGroups, user]);

  // Previous period for % change
  const previousPeriodIncidents = useMemo(() => {
    const currentStart = startOfDay(new Date(startDate));
    const currentEnd = endOfDay(new Date(endDate));
    const diffTime = Math.abs(currentEnd.getTime() - currentStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const prevStart = subDays(currentStart, diffDays);
    const prevEnd = subDays(currentEnd, diffDays);
    
    return incidents.filter(inc => {
      if (!inc.startTime) return false;
      if (inc.type === 'out_of_order') return false; // Exclude out of order incidents
      
      const incStart = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      if (!isWithinInterval(incStart, { start: prevStart, end: prevEnd })) return false;
      
      if (selectedLine !== 'all' && inc.lineName !== lines.find(l => l.id === selectedLine)?.name) return false;
      if (selectedMachine !== 'all' && inc.machineId !== selectedMachine) return false;
      
      if (profile?.role !== 'admin' && profile?.role !== 'manager' && user) {
        if (inc.reportedBy === user.uid) return true;
        const hasGroups = inc.assignedGroups && inc.assignedGroups.length > 0;
        const hasIndividuals = inc.assignedTo && inc.assignedTo.length > 0;
        if (!hasGroups && !hasIndividuals) return true;
        const inGroup = hasGroups && userGroups.some(groupId => inc.assignedGroups.includes(groupId));
        const isIndividual = hasIndividuals && inc.assignedTo.includes(user.uid);
        if (!inGroup && !isIndividual) return false;
      }

      return true;
    });
  }, [incidents, startDate, endDate, selectedLine, selectedMachine, lines, profile, userGroups, user]);

  // Helper to calculate duration including active incidents
  const getIncidentDuration = React.useCallback((inc: any) => {
    if (inc.durationMinutes != null) return inc.durationMinutes;
    if (!inc.startTime) return 0;
    const start = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
    return Math.ceil((getServerTime().getTime() - start.getTime()) / 60000);
  }, []);

  // KPIs
  const totalDowntimeMinutes = filteredIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  const totalDowntimeHours = (totalDowntimeMinutes / 60).toFixed(1);
  
  const prevDowntimeMinutes = previousPeriodIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  const downtimeChange = prevDowntimeMinutes === 0 ? 0 : ((totalDowntimeMinutes - prevDowntimeMinutes) / prevDowntimeMinutes) * 100;

  const totalEvents = filteredIncidents.length;
  
  // Availability = (Planned Production Time - Downtime) / Planned Production Time
  const totalHours = useMemo(() => {
    let hours = 0;
    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    
    // Create a map for quick lookup: "YYYY-MM-DD_lineId" -> hours
    const hoursMap = new Map<string, number>();
    productionHoursData.forEach(ph => {
      hoursMap.set(`${ph.date}_${ph.lineId}`, ph.hours);
    });

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const linesToProcess = selectedLine === 'all' ? lines : lines.filter(l => l.id === selectedLine);
    
    if (linesToProcess.length === 0) {
      return days * 9; // Fallback if no lines exist
    }

    // Iterate through each day in the range
    for (let i = 0; i < days; i++) {
      const currentDate = format(subDays(end, i), 'yyyy-MM-dd');
      
      // For each line, get the hours (default to 9 if not set)
      linesToProcess.forEach(line => {
        const key = `${currentDate}_${line.id}`;
        const lineHours = hoursMap.has(key) ? hoursMap.get(key)! : 9;
        hours += lineHours;
      });
    }
    
    return hours;
  }, [productionHoursData, startDate, endDate, selectedLine, lines]);

  const effectiveDowntimeHours = useMemo(() => {
    const effectiveMins = filteredIncidents.reduce((acc, inc) => {
      const duration = getIncidentDuration(inc);
      const breakdownJigs = inc.breakdownJigs || 0;
      const totalJigs = inc.totalJigs || 0;
      
      if (breakdownJigs > 0 && totalJigs > 0) {
        return acc + (duration * (breakdownJigs / totalJigs));
      }
      return acc + duration;
    }, 0);
    return effectiveMins / 60;
  }, [filteredIncidents, getIncidentDuration]);

  const availability = totalHours > 0 
    ? Math.max(0, ((totalHours - effectiveDowntimeHours) / totalHours) * 100).toFixed(1)
    : '0.0';

  const mttr = totalEvents > 0 ? (totalDowntimeMinutes / totalEvents).toFixed(1) : '0';
  
  const mtbf = useMemo(() => {
    let totalDailyMtbf = 0;
    let daysWithProduction = 0;

    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const linesToProcess = selectedLine === 'all' ? lines : lines.filter(l => l.id === selectedLine);
    
    const hoursMap = new Map<string, number>();
    productionHoursData.forEach(ph => {
      hoursMap.set(`${ph.date}_${ph.lineId}`, ph.hours);
    });

    for (let i = 0; i < days; i++) {
      const currentDate = format(subDays(end, i), 'yyyy-MM-dd');
      
      let dailyHours = 0;
      linesToProcess.forEach(line => {
        const key = `${currentDate}_${line.id}`;
        const lineHours = hoursMap.has(key) ? hoursMap.get(key)! : 9;
        dailyHours += lineHours;
      });

      const dailyIncidents = filteredIncidents.filter(inc => {
        if (!inc.startTime) return false;
        const incDate = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
        return format(incDate, 'yyyy-MM-dd') === currentDate;
      });
      
      const dailyFailures = dailyIncidents.length;
      
      if (dailyHours > 0) {
        daysWithProduction++;
        if (dailyFailures > 0) {
          totalDailyMtbf += (dailyHours / dailyFailures);
        } else {
          totalDailyMtbf += dailyHours;
        }
      }
    }
    
    return daysWithProduction > 0 ? (totalDailyMtbf / daysWithProduction).toFixed(1) : '0';
  }, [filteredIncidents, startDate, endDate, selectedLine, lines, productionHoursData]);

  // All Issues (Sorted by duration)
  const allIssues = [...filteredIncidents]
    .filter(i => getIncidentDuration(i) > 0)
    .sort((a, b) => getIncidentDuration(b) - getIncidentDuration(a));

  // Trend Data
  const trendData = useMemo(() => {
    const data: any = {};
    filteredIncidents.forEach(inc => {
      if (!inc.startTime) return;
      const dateObj = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      
      let formatKey = 'yyyy-MM-dd';
      let date = format(dateObj, 'MMM dd');
      
      if (trendMetric === 'hours') {
        formatKey = 'yyyy-MM-dd HH:00';
        date = format(dateObj, 'MMM dd, HH:00');
      } else if (trendMetric === 'minutes') {
        formatKey = 'yyyy-MM-dd HH:mm';
        date = format(dateObj, 'HH:mm');
      }
      
      const sortKey = format(dateObj, formatKey);
      const fullDate = format(dateObj, 'MMM dd, yyyy HH:mm');
      
      if (!data[sortKey]) data[sortKey] = { date, fullDate, sortKey, totalHours: 0, totalMinutes: 0, totalEvents: 0 };
      const duration = getIncidentDuration(inc);
      data[sortKey].totalHours += duration / 60;
      data[sortKey].totalMinutes += duration;
      data[sortKey].totalEvents += 1;
      
      // Group by machine category/name
      const cat = inc.machineName || 'Unknown';
      if (!data[sortKey][cat + '_hours']) data[sortKey][cat + '_hours'] = 0;
      if (!data[sortKey][cat + '_minutes']) data[sortKey][cat + '_minutes'] = 0;
      if (!data[sortKey][cat + '_events']) data[sortKey][cat + '_events'] = 0;
      data[sortKey][cat + '_hours'] += duration / 60;
      data[sortKey][cat + '_minutes'] += duration;
      data[sortKey][cat + '_events'] += 1;
    });
    return Object.values(data).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredIncidents, trendMetric, getIncidentDuration]);

  // MTTR Trend Data
  const mttrTrendData = useMemo(() => {
    const data: any = {};
    filteredIncidents.forEach(inc => {
      if (!inc.startTime) return;
      const dateObj = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      
      let formatKey = 'yyyy-MM-dd';
      let displayLabel = format(dateObj, 'MMM dd');
      
      if (mttrTrendMetric === 'hours') {
        formatKey = 'yyyy-MM-dd HH:00';
        displayLabel = format(dateObj, 'MMM dd, HH:00');
      } else if (mttrTrendMetric === 'minutes') {
        formatKey = 'yyyy-MM-dd HH:mm';
        displayLabel = format(dateObj, 'HH:mm');
      }
      
      const key = format(dateObj, formatKey);
      
      if (!data[key]) {
        data[key] = { 
          key, 
          label: displayLabel,
          fullDate: format(dateObj, 'MMM dd, yyyy HH:mm'),
          totalHours: 0, 
          totalEvents: 0 
        };
      }
      
      const duration = getIncidentDuration(inc);
      data[key].totalHours += duration / 60;
      data[key].totalEvents += 1;
    });
    
    return Object.values(data).sort((a: any, b: any) => a.key.localeCompare(b.key));
  }, [filteredIncidents, mttrTrendMetric, getIncidentDuration]);

  // Heatmap Data (simplified as a bar chart by hour of day for the selected period)
  const heatmapData = useMemo(() => {
    const data = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, duration: 0 }));
    filteredIncidents.forEach(inc => {
      if (!inc.startTime) return;
      const date = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      const hour = date.getHours();
      data[hour].duration += getIncidentDuration(inc);
    });
    return data;
  }, [filteredIncidents]);

  // Pareto Data (Local calculation based on reasonCode)
  const paretoData = useMemo(() => {
    const groups: { [key: string]: number } = {};
    let totalDuration = 0;

    filteredIncidents.forEach(inc => {
      const category = inc.reasonCode || 'Uncategorized';
      const duration = getIncidentDuration(inc);
      if (!groups[category]) groups[category] = 0;
      groups[category] += duration;
      totalDuration += duration;
    });

    const sortedGroups = Object.keys(groups)
      .map(category => ({ category, duration: groups[category] }))
      .sort((a, b) => b.duration - a.duration);

    let cumulative = 0;
    return sortedGroups.map(g => {
      cumulative += g.duration;
      return {
        ...g,
        cumulativePercentage: totalDuration > 0 ? (cumulative / totalDuration) * 100 : 0
      };
    });
  }, [filteredIncidents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Downtime Analysis</h2>
        
        <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <select
              value={currentDatePreset}
              onChange={handlePresetChange}
              className="p-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
            >
              <option value="custom">Custom Range</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="thisMonth">This Month</option>
            </select>
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
            onChange={e => { setSelectedLine(e.target.value); setSelectedMachine('all'); }}
            className="p-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Lines</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <select 
            value={selectedMachine}
            onChange={e => setSelectedMachine(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm"
            disabled={selectedLine === 'all'}
          >
            <option value="all">All Machines</option>
            {machines.filter(m => m.lineId === selectedLine).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {(profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'pd_engineer') && (
            <button
              onClick={() => setIsProductionHoursModalOpen(true)}
              className="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium rounded-lg transition-colors flex items-center gap-2 text-sm border border-blue-200"
            >
              <Calendar size={16} />
              Set Shift Hours
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard 
          title="Total Downtime" 
          value={`${totalDowntimeHours}h`} 
          trend={downtimeChange} 
          icon={<Clock className="text-blue-500" />}
          tooltip="Total hours of machine downtime in the selected period."
        />
        <KpiCard 
          title="Downtime Events" 
          value={totalEvents} 
          icon={<AlertTriangle className="text-orange-500" />}
          tooltip="Total number of recorded downtime incidents."
        />
        <KpiCard 
          title="Availability (OEE)" 
          value={`${availability}%`} 
          icon={<Activity className="text-green-500" />}
          tooltip="Formula: (shift hours - sum of (each downtime * number of stopped jigs / total number of jigs)) / shift hours"
        />
        <KpiCard 
          title="MTBF" 
          value={`${mtbf}h`} 
          icon={<Wrench className="text-purple-500" />}
          tooltip="Mean Time Between Failures: Calculated for each day separately based on production hours (shift hours / number of Failures)."
        />
        <KpiCard 
          title="MTTR" 
          value={`${mttr}m`} 
          icon={<Wrench className="text-red-500" />}
          tooltip="Mean Time To Repair: Average time taken to resolve an incident."
        />
      </div>

      {/* Filtered Dashboard Visual */}
      {selectedLine !== 'all' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            Line Overview
            <div className="group relative">
              <Info size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 font-normal">
                Visual representation of the line for the selected period. Red indicates breakdowns occurred.
              </div>
            </div>
          </h3>
          
          <div className="flex flex-wrap gap-4 items-start min-w-max pb-4">
            {machines
              .filter(m => m.lineId === selectedLine)
              .filter(m => selectedMachine === 'all' || m.id === selectedMachine)
              .sort((a: any, b: any) => {
                const orderA = a.order !== undefined ? a.order : 0;
                const orderB = b.order !== undefined ? b.order : 0;
                if (orderA !== orderB) return orderA - orderB;
                return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
              })
              .map((machine, index) => {
                // Calculate metrics for this machine in the filtered period
                const machineIncidents = filteredIncidents.filter(inc => inc.machineId === machine.id);
                const totalStoppageEvents = machineIncidents.length;
                const totalStoppageMinutes = machineIncidents.reduce((sum, inc) => sum + getIncidentDuration(inc), 0);
                
                // Calculate breakdown percentage
                // Total available minutes = totalHours * 60
                const availableMinutes = totalHours * 60;
                const breakdownPercentage = availableMinutes > 0 
                  ? ((totalStoppageMinutes / availableMinutes) * 100).toFixed(1) 
                  : '0.0';
                  
                const hasBreakdown = totalStoppageEvents > 0;

                return (
                  <div key={machine.id} className="flex items-center">
                    {/* Connector line */}
                    {index > 0 && selectedMachine === 'all' && (
                      <div className="flex flex-col items-center justify-center relative mx-1 w-8 h-12 mt-[-40px]">
                        <div className="w-full h-1 bg-gray-200 rounded-full"></div>
                      </div>
                    )}
                    
                    <div className="flex flex-col items-center group relative">
                      <div 
                        className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md transition-transform transform hover:scale-105 relative ${
                          hasBreakdown ? 'bg-red-500' : 'bg-green-500'
                        }`}
                      >
                        <span className="text-xs font-bold truncate px-1">{machine.name.substring(0, 4)}</span>
                      </div>
                      
                      {/* Tooltip for full name */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10 pointer-events-none">
                        {machine.name}
                      </div>
                      
                      {/* Metrics below the circle */}
                      <div className="flex flex-col items-center mt-3 bg-gray-50 rounded-lg p-2 border border-gray-200 min-w-[90px] shadow-sm">
                        <div className="flex flex-col w-full gap-1.5">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-500">Events:</span>
                            <span className="font-bold text-gray-800">{totalStoppageEvents}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-500">Mins:</span>
                            <span className={`font-bold ${totalStoppageMinutes > 0 ? 'text-red-600' : 'text-gray-800'}`}>{totalStoppageMinutes}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-gray-200">
                            <span className="text-gray-500">Down:</span>
                            <span className={`font-bold ${parseFloat(breakdownPercentage) > 0 ? 'text-orange-600' : 'text-green-600'}`}>{breakdownPercentage}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
            {machines.filter(m => m.lineId === selectedLine).length === 0 && (
              <div className="text-gray-500 italic text-sm py-4">No machines found for this line.</div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pareto Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Top Downtime Reasons (Pareto)
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Downtime grouped by Reason Code. The line shows cumulative percentage.
                </div>
              </div>
            </h3>
          </div>
          <div className="h-80">
            {paretoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" angle={-45} textAnchor="end" height={60} tick={{fontSize: 12}} />
                  <YAxis yAxisId="left" label={{ value: 'Duration (mins)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} label={{ value: 'Cumulative %', angle: 90, position: 'insideRight' }} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="duration" name="Duration" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name="Cumulative %" stroke="#ef4444" strokeWidth={2} dot={{r: 4}} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                Not enough data for Pareto analysis
              </div>
            )}
          </div>
        </div>

        {/* Trend Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Downtime Trend
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Daily downtime trend over the selected period.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setTrendMetric('hours')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${trendMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setTrendMetric('minutes')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${trendMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setTrendMetric('events')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${trendMetric === 'events' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Events
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize: 12}} />
                <YAxis label={{ value: trendMetric === 'hours' ? 'Hours' : trendMetric === 'minutes' ? 'Minutes' : 'Events', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                          <p className="font-bold text-gray-800 mb-1">{data.fullDate}</p>
                          <p className="text-sm text-blue-600">
                            {trendMetric === 'hours' ? 'Total Hours' : trendMetric === 'minutes' ? 'Total Minutes' : 'Total Events'}: <span className="font-bold">{trendMetric === 'hours' ? data.totalHours.toFixed(1) : trendMetric === 'minutes' ? data.totalMinutes : data.totalEvents}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey={trendMetric === 'hours' ? 'totalHours' : trendMetric === 'minutes' ? 'totalMinutes' : 'totalEvents'} 
                  name={trendMetric === 'hours' ? 'Total Hours' : trendMetric === 'minutes' ? 'Total Minutes' : 'Total Events'} 
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  dot={{r: 4}} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MTTR Trend Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              MTTR Trend
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Daily Mean Time To Repair (MTTR) trend over the selected period.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setMttrTrendMetric('minutes')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${mttrTrendMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setMttrTrendMetric('hours')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${mttrTrendMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setMttrTrendMetric('days')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${mttrTrendMetric === 'days' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Days
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mttrTrendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{fontSize: 12}} />
                <YAxis label={{ value: mttrTrendMetric === 'minutes' ? 'Minutes' : mttrTrendMetric === 'hours' ? 'Hours' : 'Days', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      let mttrValueStr = '0.0';
                      if (data.totalEvents > 0) {
                        const mins = (data.totalHours * 60) / data.totalEvents;
                        if (mttrTrendMetric === 'minutes') mttrValueStr = mins.toFixed(1) + ' mins';
                        else if (mttrTrendMetric === 'hours') mttrValueStr = (mins / 60).toFixed(2) + ' hrs';
                        else mttrValueStr = (mins / 60 / 24).toFixed(2) + ' days';
                      }
                      return (
                        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                          <p className="font-bold text-gray-800 mb-1">{data.fullDate}</p>
                          <p className="text-sm text-red-600">
                            MTTR: <span className="font-bold">{mttrValueStr}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey={(data) => {
                    if (data.totalEvents === 0) return 0;
                    const mins = (data.totalHours * 60) / data.totalEvents;
                    if (mttrTrendMetric === 'minutes') return mins;
                    if (mttrTrendMetric === 'hours') return mins / 60;
                    return mins / 60 / 24;
                  }} 
                  name={`MTTR (${mttrTrendMetric})`} 
                  stroke="#ef4444" 
                  strokeWidth={3} 
                  dot={{r: 4}} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmap / Time of Day */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            Downtime by Hour of Day
            <div className="group relative">
              <Info size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                Total downtime minutes aggregated by the hour of the day the incident started.
              </div>
            </div>
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmapData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{fontSize: 12}} />
                <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="duration" name="Downtime Mins" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* All Issues Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            All Downtime Events (Sorted by Duration)
            <div className="group relative">
              <Info size={16} className="text-gray-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                Sorted by duration in descending order.
              </div>
            </div>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                <th className="p-4 font-medium">Machine</th>
                <th className="p-4 font-medium">Line</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Duration</th>
                <th className="p-4 font-medium">Stopped Jigs</th>
                <th className="p-4 font-medium">Breakdown (%)</th>
                <th className="p-4 font-medium">Reason Code</th>
                <th className="p-4 font-medium">Root Cause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allIssues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">No downtime events found.</td>
                </tr>
              ) : (
                allIssues.map(inc => (
                  <tr key={inc.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{inc.machineName}</td>
                    <td className="p-4 text-gray-600">{inc.lineName}</td>
                    <td className="p-4 text-gray-600">
                      {inc.startTime ? format(inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime), 'MMM d, HH:mm') : 'N/A'}
                    </td>
                    <td className="p-4 font-medium text-red-600">{getIncidentDuration(inc)} mins</td>
                    <td className="p-4 text-gray-600">
                      {inc.totalJigs ? (inc.breakdownJigs || 0) : 1}
                    </td>
                    <td className="p-4 text-gray-600">
                      {getIncidentDuration(inc) > 0
                        ? ((Number(inc.totalJigs ? (inc.breakdownJigs || 0) : 1) / Number(inc.totalJigs || 1)) * (getIncidentDuration(inc) / 60) * 100).toFixed(2) + '%'
                        : '-'}
                    </td>
                    <td className="p-4 text-gray-600">
                      {inc.reasonCode ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {inc.reasonCode}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-4 text-gray-600 max-w-xs truncate" title={inc.cause}>{inc.cause || 'Not specified'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Hours Modal */}
      <ProductionHoursModal
        isOpen={isProductionHoursModalOpen}
        onClose={() => setIsProductionHoursModalOpen(false)}
        lines={lines}
      />
    </div>
  );
}

function KpiCard({ title, value, trend, icon, tooltip }: { title: string, value: string | number, trend?: number, icon: React.ReactNode, tooltip: string }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative group">
      <div className="absolute top-2 right-2">
        <Info size={14} className="text-gray-300 cursor-help" />
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
          {tooltip}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend !== undefined && (
          <span className={`text-xs font-medium mb-1 ${trend > 0 ? 'text-red-500' : trend < 0 ? 'text-green-500' : 'text-gray-500'}`}>
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
