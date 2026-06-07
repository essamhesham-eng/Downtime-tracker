import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, getDoc, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart, PieChart, Pie, Cell
} from 'recharts';
import { Clock, AlertTriangle, Activity, Wrench, Info, Loader2, Calendar } from 'lucide-react';
import { getServerTime } from '../utils/time';
import { ProductionHoursModal } from '../components/ProductionHoursModal';
import { MultiSelect } from '../components/MultiSelect';

export function Analysis() {
  const { profile, user } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  
  const [startDate, setStartDate] = useState(format(subDays(getServerTime(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(getServerTime(), 'yyyy-MM-dd'));
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const [appliedStartDate, setAppliedStartDate] = useState(startDate);
  const [appliedEndDate, setAppliedEndDate] = useState(endDate);
  const [appliedSelectedLines, setAppliedSelectedLines] = useState(selectedLines);
  const [appliedSelectedMachines, setAppliedSelectedMachines] = useState(selectedMachines);
  const [appliedSelectedGroups, setAppliedSelectedGroups] = useState(selectedGroups);
  const [appliedSelectedTypes, setAppliedSelectedTypes] = useState(selectedTypes);

  const handleApplyFilters = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedSelectedLines(selectedLines);
    setAppliedSelectedMachines(selectedMachines);
    setAppliedSelectedGroups(selectedGroups);
    setAppliedSelectedTypes(selectedTypes);
  };

  const [trendMetric, setTrendMetric] = useState<'hours' | 'minutes' | 'days' | 'events'>('minutes');
  const [mttrTrendMetric, setMttrTrendMetric] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [teamPerformanceMetric, setTeamPerformanceMetric] = useState<'days' | 'hours' | 'minutes' | 'events'>('minutes');
  const [incidentTypesMetric, setIncidentTypesMetric] = useState<'days' | 'hours' | 'minutes' | 'events'>('minutes');
  const [productionHoursData, setProductionHoursData] = useState<any[]>([]);
  const [isProductionHoursModalOpen, setIsProductionHoursModalOpen] = useState(false);
  const [downtimeDisplayCount, setDowntimeDisplayCount] = useState(20);

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
    if (val === 'today') {
      setStartDate(format(today, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (val === 'lastDay') {
      const yesterday = subDays(today, 1);
      setStartDate(format(yesterday, 'yyyy-MM-dd'));
      setEndDate(format(yesterday, 'yyyy-MM-dd'));
    } else if (val === 'last7') {
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

  // 1. Subscribe to static/metadata collections ONLY ONCE on mount/auth-change
  useEffect(() => {
    if (!user) return;

    const unsubMachines = onSnapshot(query(collection(db, 'machines')), snapshot => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLines = onSnapshot(query(collection(db, 'lines')), snapshot => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGroups = onSnapshot(query(collection(db, 'groups')), snapshot => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { 
      unsubMachines(); 
      unsubLines(); 
      unsubGroups(); 
    };
  }, [user]);

  // 2. Subscribe to incidents dynamically based on date range (avoids loading other collections again)
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

    const prevStartStr = format(prevStart, 'yyyy-MM-dd');
    const unsubProductionHours = onSnapshot(
      query(collection(db, 'production_hours'), where('date', '>=', prevStartStr), limit(5000)), 
      snapshot => {
        setProductionHoursData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => { 
      unsubIncidents(); 
      unsubProductionHours();
    };
  }, [user, startDate, endDate]);

  const userGroups = useMemo(() => {
    if (!profile || !groups.length) return [];
    return groups.filter(g => g.userIds?.includes(profile.uid)).map(g => g.id);
  }, [profile, groups]);

  const matchesFilters = React.useCallback((inc: any, interval?: { start: Date, end: Date }) => {
    if (!inc.startTime) return false;
    
    if (interval) {
      const incStart = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      if (!isWithinInterval(incStart, interval)) return false;
    }

    if (appliedSelectedTypes.length > 0) {
      let isMatchingType = false;
      for (const type of appliedSelectedTypes) {
         if (type === 'out_of_order' && inc.type === 'out_of_order') { isMatchingType = true; break; }
         if (type === 'maintenance' && inc.type === 'maintenance') { isMatchingType = true; break; }
         if (type === 'breakdown' && !inc.type) { isMatchingType = true; break; }
         if (type === 'stopped' && inc.type === 'line_issue' && inc.lineIssueType !== 'upcoming' && inc.remainingTimeMinutes == null) { isMatchingType = true; break; }
         if (type === 'upcoming' && inc.type === 'line_issue' && (inc.lineIssueType === 'upcoming' || inc.remainingTimeMinutes != null)) { isMatchingType = true; break; }
         if (type === 'line_off' && inc.type === 'line_off') { isMatchingType = true; break; }
      }
      if (!isMatchingType) return false;
    }
    
    if (appliedSelectedLines.length > 0) {
      const allowedLineNames = appliedSelectedLines.map(id => lines.find(l => l.id === id)?.name);
      if (!allowedLineNames.includes(inc.lineName)) return false;
    }
    
    if (appliedSelectedMachines.length > 0 && !appliedSelectedMachines.includes(inc.machineId)) return false;
    
    if (appliedSelectedGroups.length > 0 && (!inc.assignedGroups || !inc.assignedGroups.some((g: string) => appliedSelectedGroups.includes(g)))) return false;
    
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
  }, [appliedSelectedLines, appliedSelectedMachines, appliedSelectedGroups, appliedSelectedTypes, lines, profile, userGroups, user]);

  const filteredIncidents = useMemo(() => {
    const start = startOfDay(new Date(appliedStartDate));
    const end = endOfDay(new Date(appliedEndDate));
    return incidents.filter(inc => matchesFilters(inc, { start, end }));
  }, [incidents, appliedStartDate, appliedEndDate, matchesFilters]);

  // Previous period for % change
  const previousPeriodIncidents = useMemo(() => {
    const currentStart = startOfDay(new Date(appliedStartDate));
    const currentEnd = endOfDay(new Date(appliedEndDate));
    const diffTime = Math.abs(currentEnd.getTime() - currentStart.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const prevStart = subDays(currentStart, diffDays);
    const prevEnd = subDays(currentEnd, diffDays);
    
    return incidents.filter(inc => matchesFilters(inc, { start: prevStart, end: prevEnd }));
  }, [incidents, startDate, endDate, matchesFilters]);

  // Helper to calculate duration including active incidents
  const getIncidentDuration = React.useCallback((inc: any) => {
    if (inc.durationMinutes != null) return inc.durationMinutes;
    if (!inc.startTime) return 0;
    if (inc.type === 'line_off') {
      const start = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
      const dateStr = format(start, 'yyyy-MM-dd');
      const prodHourObj = productionHoursData.find(ph => ph.date === dateStr && ph.lineId === inc.lineId);
      const hours = prodHourObj ? prodHourObj.hours : 9;
      return hours * 60;
    }
    const start = inc.startTime.toDate ? inc.startTime.toDate() : new Date(inc.startTime);
    return Math.max(1, Math.ceil((getServerTime().getTime() - start.getTime()) / 60000));
  }, [productionHoursData]);

  // KPIs (Memoized to prevent unnecessary recalculations on state updates)
  const totalDowntimeMinutes = useMemo(() => {
    return filteredIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  }, [filteredIncidents, getIncidentDuration]);

  const totalDowntimeHours = useMemo(() => {
    return (totalDowntimeMinutes / 60).toFixed(1);
  }, [totalDowntimeMinutes]);
  
  const prevDowntimeMinutes = useMemo(() => {
    return previousPeriodIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  }, [previousPeriodIncidents, getIncidentDuration]);

  const downtimeChange = useMemo(() => {
    return prevDowntimeMinutes === 0 ? 0 : ((totalDowntimeMinutes - prevDowntimeMinutes) / prevDowntimeMinutes) * 100;
  }, [totalDowntimeMinutes, prevDowntimeMinutes]);

  const totalEvents = useMemo(() => {
    return filteredIncidents.length;
  }, [filteredIncidents]);
  
  // Availability = (Planned Production Time - Downtime) / Planned Production Time
  const totalHours = useMemo(() => {
    let hours = 0;
    const start = startOfDay(new Date(appliedStartDate));
    const end = endOfDay(new Date(appliedEndDate));
    
    // Create a map for quick lookup: "YYYY-MM-DD_lineId" -> hours
    const hoursMap = new Map<string, number>();
    productionHoursData.forEach(ph => {
      hoursMap.set(`${ph.date}_${ph.lineId}`, ph.hours);
    });

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const linesToProcess = appliedSelectedLines.length === 0 ? lines : lines.filter(l => appliedSelectedLines.includes(l.id));
    
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
  }, [productionHoursData, appliedStartDate, appliedEndDate, appliedSelectedLines, lines]);

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

  const availability = useMemo(() => {
    return totalHours > 0 
      ? Math.max(0, ((totalHours - effectiveDowntimeHours) / totalHours) * 100).toFixed(1)
      : '0.0';
  }, [totalHours, effectiveDowntimeHours]);

  const mttr = useMemo(() => {
    return totalEvents > 0 ? (totalDowntimeMinutes / totalEvents).toFixed(1) : '0';
  }, [totalDowntimeMinutes, totalEvents]);
  
  const mtbf = useMemo(() => {
    let totalDailyMtbf = 0;
    let daysWithProduction = 0;

    const start = startOfDay(new Date(appliedStartDate));
    const end = endOfDay(new Date(appliedEndDate));
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const linesToProcess = appliedSelectedLines.length === 0 ? lines : lines.filter(l => appliedSelectedLines.includes(l.id));
    
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
  }, [filteredIncidents, appliedStartDate, appliedEndDate, appliedSelectedLines, lines, productionHoursData]);

  // All Issues (Sorted by duration, wrapped in useMemo to prevent sorting of entries on every render)
  const allIssues = useMemo(() => {
    return [...filteredIncidents]
      .filter(i => getIncidentDuration(i) > 0)
      .sort((a, b) => getIncidentDuration(b) - getIncidentDuration(a));
  }, [filteredIncidents, getIncidentDuration]);

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
        date = format(dateObj, 'MMM dd, HH:mm');
      } else if (trendMetric === 'days') {
        formatKey = 'yyyy-MM-dd';
        date = format(dateObj, 'MMM dd');
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
        displayLabel = format(dateObj, 'MMM dd, HH:mm');
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
  }, [filteredIncidents, getIncidentDuration]);

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
  }, [filteredIncidents, getIncidentDuration]);

  // Team Performance Data
  const teamPerformanceData = useMemo(() => {
    const teamStats: { [groupId: string]: { totalDuration: number, events: number } } = {};
    
    groups.forEach(g => {
      teamStats[g.id] = { totalDuration: 0, events: 0 };
    });

    filteredIncidents.forEach(inc => {
      const duration = getIncidentDuration(inc);
      if (inc.assignedGroups && inc.assignedGroups.length > 0) {
        inc.assignedGroups.forEach((groupId: string) => {
          if (teamStats[groupId]) {
            teamStats[groupId].totalDuration += duration;
            teamStats[groupId].events += 1;
          }
        });
      }
    });

    return groups.map(g => {
      const stats = teamStats[g.id];
      const durationMinutes = stats.totalDuration || 0;
      const events = stats.events || 0;
      
      let val = 0;
      if (teamPerformanceMetric === 'days') {
        val = durationMinutes / 1440;
      } else if (teamPerformanceMetric === 'hours') {
        val = durationMinutes / 60;
      } else if (teamPerformanceMetric === 'minutes') {
        val = durationMinutes;
      } else if (teamPerformanceMetric === 'events') {
        val = events;
      }

      return {
        name: g.name,
        value: Number(val.toFixed(1)),
        durationMinutes,
        events,
      };
    }).filter(g => g.durationMinutes > 0 || g.events > 0).sort((a, b) => b.value - a.value);
  }, [filteredIncidents, groups, getIncidentDuration, teamPerformanceMetric]);

  const incidentTypesData = useMemo(() => {
    const start = startOfDay(new Date(appliedStartDate));
    const end = endOfDay(new Date(appliedEndDate));
    
    // Filter incidents matching current filters but WITHOUT excluding out_of_order
    const allMatchingIncidents = incidents.filter(inc => matchesFilters(inc, { start, end }));

    let outOfOrderDuration = 0;
    let upcomingIssueDuration = 0;
    let lineStoppedDuration = 0;
    let breakdownDuration = 0;
    let maintenanceDuration = 0;
    let lineOffDuration = 0;

    let outOfOrderEvents = 0;
    let upcomingIssueEvents = 0;
    let lineStoppedEvents = 0;
    let breakdownEvents = 0;
    let maintenanceEvents = 0;
    let lineOffEvents = 0;

    allMatchingIncidents.forEach(inc => {
      const duration = getIncidentDuration(inc);

      if (inc.type === 'out_of_order') {
        outOfOrderDuration += duration;
        outOfOrderEvents++;
      } else if (inc.type === 'line_issue') {
        if (inc.lineIssueType === 'upcoming' || inc.remainingTimeMinutes != null) {
          upcomingIssueDuration += duration;
          upcomingIssueEvents++;
        } else {
          lineStoppedDuration += duration;
          lineStoppedEvents++;
        }
      } else if (inc.type === 'maintenance') {
        maintenanceDuration += duration;
        maintenanceEvents++;
      } else if (inc.type === 'line_off') {
        lineOffDuration += duration;
        lineOffEvents++;
      } else {
        breakdownDuration += duration;
        breakdownEvents++;
      }
    });

    const getValue = (duration: number, events: number) => {
      if (incidentTypesMetric === 'days') return Number((duration / 1440).toFixed(1));
      if (incidentTypesMetric === 'hours') return Number((duration / 60).toFixed(1));
      if (incidentTypesMetric === 'minutes') return Number(duration.toFixed(1));
      return events;
    };

    const outOfOrderVal = getValue(outOfOrderDuration, outOfOrderEvents);
    const upcomingIssueVal = getValue(upcomingIssueDuration, upcomingIssueEvents);
    const lineStoppedVal = getValue(lineStoppedDuration, lineStoppedEvents);
    const lineOffVal = getValue(lineOffDuration, lineOffEvents);
    const breakdownVal = getValue(breakdownDuration, breakdownEvents);
    const maintenanceVal = getValue(maintenanceDuration, maintenanceEvents);

    const data = [];
    if (outOfOrderVal > 0) data.push({ name: 'Out of Order', value: outOfOrderVal, color: '#f59e0b' });
    if (upcomingIssueVal > 0) data.push({ name: 'Upcoming Issue', value: upcomingIssueVal, color: '#fde047' });
    if (lineStoppedVal > 0) data.push({ name: 'Line Stopped', value: lineStoppedVal, color: '#ef4444' });
    if (lineOffVal > 0) data.push({ name: 'Line Off', value: lineOffVal, color: '#6b7280' });
    if (breakdownVal > 0) data.push({ name: 'Breakdown', value: breakdownVal, color: '#ef4444' });
    if (maintenanceVal > 0) data.push({ name: 'Maintenance', value: maintenanceVal, color: '#3b82f6' });

    return data;
  }, [incidents, appliedStartDate, appliedEndDate, matchesFilters, getIncidentDuration, incidentTypesMetric]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Downtime Analysis</h2>
        
        <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
            <select
              value={currentDatePreset}
              onChange={handlePresetChange}
              className="p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 flex-grow"
            >
              <option value="custom">Custom Range</option>
              <option value="today">This Day</option>
              <option value="lastDay">Last Day</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="thisMonth">This Month</option>
            </select>
            <div className="flex items-center gap-1 flex-wrap">
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm flex-grow"
              />
              <span className="text-gray-500">to</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg text-sm flex-grow"
              />
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto z-50">
            <MultiSelect
              options={lines.map(l => ({ value: l.id, label: l.name }))}
              selectedValues={selectedLines}
              onChange={vals => { setSelectedLines(vals); setSelectedMachines([]); }}
              placeholder="All Lines"
              className="flex-grow sm:flex-none sm:w-40"
            />

            <MultiSelect
              options={machines
                .filter(m => selectedLines.length === 0 || selectedLines.includes(m.lineId))
                .map(m => ({ value: m.id, label: m.name }))}
              selectedValues={selectedMachines}
              onChange={setSelectedMachines}
              placeholder="All Machines"
              className="flex-grow sm:flex-none sm:w-40"
            />

            <MultiSelect
              options={groups.map(g => ({ value: g.id, label: g.name }))}
              selectedValues={selectedGroups}
              onChange={setSelectedGroups}
              placeholder="All Teams"
              className="flex-grow sm:flex-none sm:w-40"
            />

            <MultiSelect
              options={[
                { value: 'breakdown', label: 'Breakdown' },
                { value: 'out_of_order', label: 'Out of Order' },
                { value: 'upcoming', label: 'Upcoming Issue' },
                { value: 'stopped', label: 'Line Stopped' },
                { value: 'line_off', label: 'Line Off' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
              selectedValues={selectedTypes}
              onChange={setSelectedTypes}
              placeholder="All Types"
              className="flex-grow sm:flex-none sm:w-40"
            />
            
            <button
              onClick={handleApplyFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg whitespace-nowrap shadow-sm transition-colors"
            >
              Apply Filter
            </button>
          </div>

          {(profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'pd_engineer') && (
            <button
              onClick={() => setIsProductionHoursModalOpen(true)}
              className="px-3 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm border border-blue-200 w-full lg:w-auto"
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
          title={<span>MTBF <span className="text-gray-400 font-normal">({totalHours}h)</span></span>} 
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
      {appliedSelectedLines.length > 0 && appliedSelectedLines.map(lineId => {
        const line = lines.find(l => l.id === lineId);
        if (!line) return null;
        return (
          <div key={line.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              {line.name} Overview
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 font-normal">
                  Visual representation of the line for the selected period. Red indicates breakdowns occurred.
                </div>
              </div>
            </h3>
            
            <div className="flex flex-wrap gap-4 items-start min-w-max pb-4">
              {machines
                .filter(m => m.lineId === line.id)
                .filter(m => appliedSelectedMachines.length === 0 || appliedSelectedMachines.includes(m.id))
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
                      {index > 0 && appliedSelectedMachines.length === 0 && (
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
                
              {machines.filter(m => m.lineId === line.id).length === 0 && (
                <div className="text-gray-500 italic text-sm py-4">No machines found for this line.</div>
              )}
            </div>
          </div>
        );
      })}

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
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Downtime Trend
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Daily downtime trend over the selected period.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto justify-between sm:justify-start">
              <button
                onClick={() => setTrendMetric('days')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${trendMetric === 'days' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Days
              </button>
              <button
                onClick={() => setTrendMetric('hours')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${trendMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setTrendMetric('minutes')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${trendMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setTrendMetric('events')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${trendMetric === 'events' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Events
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{fontSize: 11}} 
                  angle={-45} 
                  textAnchor="end" 
                  height={70}
                />
                <YAxis label={{ value: trendMetric === 'hours' ? 'Hours' : trendMetric === 'minutes' ? 'Minutes' : trendMetric === 'days' ? 'Hours (Sum)' : 'Events', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 12 } }} />
                <RechartsTooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                          <p className="font-bold text-gray-800 mb-1">{data.fullDate}</p>
                          <p className="text-sm text-blue-600">
                            {trendMetric === 'hours' ? 'Total Hours' : trendMetric === 'minutes' ? 'Total Minutes' : trendMetric === 'days' ? 'Total Hours' : 'Total Events'}: <span className="font-bold">{trendMetric === 'hours' || trendMetric === 'days' ? data.totalHours.toFixed(1) : trendMetric === 'minutes' ? data.totalMinutes : data.totalEvents}</span>
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
                  dataKey={trendMetric === 'hours' || trendMetric === 'days' ? 'totalHours' : trendMetric === 'minutes' ? 'totalMinutes' : 'totalEvents'} 
                  name={trendMetric === 'hours' || trendMetric === 'days' ? 'Total Hours' : trendMetric === 'minutes' ? 'Total Minutes' : 'Total Events'} 
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  dot={{r: 4}} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MTTR Trend Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              MTTR Trend
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Daily Mean Time To Repair (MTTR) trend over the selected period.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto justify-between sm:justify-start">
              <button
                onClick={() => setMttrTrendMetric('minutes')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${mttrTrendMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setMttrTrendMetric('hours')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${mttrTrendMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setMttrTrendMetric('days')}
                className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${mttrTrendMetric === 'days' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Days
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mttrTrendData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tick={{fontSize: 11}} 
                  angle={-45} 
                  textAnchor="end" 
                  height={70}
                />
                <YAxis label={{ value: mttrTrendMetric === 'minutes' ? 'Minutes' : mttrTrendMetric === 'hours' ? 'Hours' : 'Days', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 12 } }} />
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

        {/* Team Performance */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Team Performance
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 font-normal">
                  Downtime performance metrics distribution categorized by responsible teams.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto justify-between sm:justify-start gap-1">
              <button
                onClick={() => setTeamPerformanceMetric('days')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${teamPerformanceMetric === 'days' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Days
              </button>
              <button
                onClick={() => setTeamPerformanceMetric('hours')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${teamPerformanceMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setTeamPerformanceMetric('minutes')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${teamPerformanceMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setTeamPerformanceMetric('events')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${teamPerformanceMetric === 'events' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Events
              </button>
            </div>
          </div>
          <div className="h-80 flex items-center justify-center">
            {teamPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={teamPerformanceData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {teamPerformanceData.map((_entry, index) => {
                      const PIE_COLORS = ['#3bb9ff', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#14b8a6'];
                      return (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      );
                    })}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(val: any) => {
                      let unit = '';
                      if (teamPerformanceMetric === 'days') unit = ' Days';
                      else if (teamPerformanceMetric === 'hours') unit = ' Hours';
                      else if (teamPerformanceMetric === 'minutes') unit = ' Mins';
                      else if (teamPerformanceMetric === 'events') unit = ' Events';
                      return [`${val}${unit}`, 'Value'];
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-gray-400 text-sm">No team performance data available</span>
            )}
          </div>
        </div>

        {/* Incident Types */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              Incident Types
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 font-normal">
                  Distribution of total captured incidents by their reported type constraint.
                </div>
              </div>
            </h3>
            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto overflow-x-auto justify-between sm:justify-start gap-1">
              <button
                onClick={() => setIncidentTypesMetric('days')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${incidentTypesMetric === 'days' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Days
              </button>
              <button
                onClick={() => setIncidentTypesMetric('hours')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${incidentTypesMetric === 'hours' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Hours
              </button>
              <button
                onClick={() => setIncidentTypesMetric('minutes')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${incidentTypesMetric === 'minutes' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Minutes
              </button>
              <button
                onClick={() => setIncidentTypesMetric('events')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex-grow sm:flex-grow-0 ${incidentTypesMetric === 'events' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Events
              </button>
            </div>
          </div>
          <div className="h-80 flex items-center justify-center">
            {incidentTypesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incidentTypesData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {incidentTypesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(val: any) => {
                      let unit = '';
                      if (incidentTypesMetric === 'days') unit = ' Days';
                      else if (incidentTypesMetric === 'hours') unit = ' Hours';
                      else if (incidentTypesMetric === 'minutes') unit = ' Mins';
                      else if (incidentTypesMetric === 'events') unit = ' Events';
                      return [`${val}${unit}`, 'Value'];
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-gray-400 text-sm">No incident types data available</span>
            )}
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
                <th className="p-4 font-medium">Type</th>
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
                  <td colSpan={9} className="p-8 text-center text-gray-500">No downtime events found.</td>
                </tr>
              ) : (
                allIssues.slice(0, downtimeDisplayCount).map(inc => (
                  <tr key={inc.id} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{inc.machineName}</td>
                    <td className="p-4 text-gray-600">{inc.lineName}</td>
                    <td className="p-4 text-gray-600">
                      {inc.type === 'out_of_order' ? (
                        <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium text-xs whitespace-nowrap">Out of Order</span>
                      ) : inc.type === 'line_issue' ? (
                        <span className={`inline-block px-2 py-1 rounded font-medium text-xs whitespace-nowrap ${inc.lineIssueType === 'upcoming' || inc.remainingTimeMinutes != null ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {inc.lineIssueType === 'upcoming' || inc.remainingTimeMinutes != null ? 'Upcoming Issue' : 'Line Stopped'}
                        </span>
                      ) : inc.type === 'maintenance' ? (
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium text-xs whitespace-nowrap">Maintenance</span>
                      ) : inc.type === 'line_off' ? (
                        <span className="inline-block px-2 py-1 bg-gray-100 text-gray-800 rounded font-medium text-xs whitespace-nowrap">Line Off</span>
                      ) : (
                        <span className="inline-block px-2 py-1 bg-red-100 text-red-800 rounded font-medium text-xs whitespace-nowrap">Breakdown</span>
                      )}
                    </td>
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
        {downtimeDisplayCount < allIssues.length && (
          <div className="mt-4 mb-6 flex justify-center">
            <button
              onClick={() => setDowntimeDisplayCount(prev => prev + 20)}
              className="px-6 py-2 bg-white border border-gray-200 shadow-sm text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Load more
            </button>
          </div>
        )}
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

function KpiCard({ title, value, trend, icon, tooltip }: { title: React.ReactNode | string, value: string | number, trend?: number, icon: React.ReactNode, tooltip: string }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative group">
      <div className="absolute top-2 right-2">
        <Info size={14} className="text-gray-300 cursor-help" />
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
          {tooltip}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 mb-2">
        <div className="p-1.5 sm:p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
        <h3 className="text-xs sm:text-sm font-medium text-gray-600">{title}</h3>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl sm:text-2xl font-bold text-gray-900">{value}</span>
        {trend !== undefined && (
          <span className={`text-xs font-medium mb-1 ${trend > 0 ? 'text-red-500' : trend < 0 ? 'text-green-500' : 'text-gray-500'}`}>
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
