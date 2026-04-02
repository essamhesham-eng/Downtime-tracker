import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart
} from 'recharts';
import { Clock, AlertTriangle, Activity, Wrench, Info, Loader2 } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

export function Analysis() {
  const { profile, user } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedLine, setSelectedLine] = useState('all');
  const [selectedMachine, setSelectedMachine] = useState('all');
  const [trendMetric, setTrendMetric] = useState<'hours' | 'events'>('hours');
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState<number>(24);
  
  const [aiInsights, setAiInsights] = useState<{paretoGroups: any[], oeeOpportunities: string[]}>({
    paretoGroups: [],
    oeeOpportunities: []
  });
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubIncidents = onSnapshot(query(collection(db, 'incidents')), snapshot => {
      setIncidents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubMachines = onSnapshot(query(collection(db, 'machines')), snapshot => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubLines = onSnapshot(query(collection(db, 'lines')), snapshot => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGroups = onSnapshot(query(collection(db, 'groups')), snapshot => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const fetchSettings = async () => {
      try {
        const generalSnap = await getDoc(doc(db, 'settings', 'general'));
        if (generalSnap.exists()) {
          const data = generalSnap.data();
          if (data.workingHours) setWorkingHoursPerDay(data.workingHours);
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();

    return () => { unsubIncidents(); unsubMachines(); unsubLines(); unsubGroups(); };
  }, [user]);

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
    return Math.ceil((new Date().getTime() - start.getTime()) / 60000);
  }, []);

  // KPIs
  const totalDowntimeMinutes = filteredIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  const totalDowntimeHours = (totalDowntimeMinutes / 60).toFixed(1);
  
  const prevDowntimeMinutes = previousPeriodIncidents.reduce((acc, inc) => acc + getIncidentDuration(inc), 0);
  const downtimeChange = prevDowntimeMinutes === 0 ? 0 : ((totalDowntimeMinutes - prevDowntimeMinutes) / prevDowntimeMinutes) * 100;

  const totalEvents = filteredIncidents.length;
  
  // Availability = (Planned Production Time - Downtime) / Planned Production Time
  const diffTime = Math.abs(new Date(endDate).getTime() - new Date(startDate).getTime());
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  const totalHours = days * workingHoursPerDay;
  const availability = Math.max(0, ((totalHours - parseFloat(totalDowntimeHours)) / totalHours) * 100).toFixed(1);

  const mttr = totalEvents > 0 ? (totalDowntimeMinutes / totalEvents).toFixed(1) : '0';
  const mtbf = totalEvents > 0 ? ((totalHours * 60 - totalDowntimeMinutes) / totalEvents / 60).toFixed(1) : '0';

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
      const date = format(dateObj, 'MMM dd');
      const fullDate = format(dateObj, 'MMM dd, yyyy');
      const sortKey = format(dateObj, 'yyyy-MM-dd');
      
      if (!data[date]) data[date] = { date, fullDate, sortKey, totalHours: 0, totalEvents: 0 };
      data[date].totalHours += getIncidentDuration(inc) / 60;
      data[date].totalEvents += 1;
      
      // Group by machine category/name
      const cat = inc.machineName || 'Unknown';
      if (!data[date][cat + '_hours']) data[date][cat + '_hours'] = 0;
      if (!data[date][cat + '_events']) data[date][cat + '_events'] = 0;
      data[date][cat + '_hours'] += getIncidentDuration(inc) / 60;
      data[date].totalEvents += 1;
    });
    return Object.values(data).sort((a: any, b: any) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredIncidents]);

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

  // AI Analysis
  useEffect(() => {
    const generateAIInsights = async () => {
      if (filteredIncidents.length === 0) return;
      setIsAiLoading(true);
      try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
        
        const causes = filteredIncidents.map(i => ({
          reasonCode: i.reasonCode || 'Uncategorized',
          cause: i.cause || 'Unknown',
          duration: getIncidentDuration(i)
        }));

        const prompt = `
          Analyze the following machine downtime data:
          ${JSON.stringify(causes)}
          
          Based on the reason codes, causes, and durations, provide the top 3 actionable opportunities to improve OEE (Overall Equipment Effectiveness) by reducing downtime.
          
          Return ONLY a JSON object with this exact structure:
          {
            "oeeOpportunities": [
              "Opportunity 1",
              "Opportunity 2",
              "Opportunity 3"
            ]
          }
        `;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          }
        });

        const result = JSON.parse(response.text || '{}');

        setAiInsights({
          paretoGroups: [], // No longer used from AI
          oeeOpportunities: result.oeeOpportunities || []
        });

      } catch (error) {
        console.error("AI Analysis failed:", error);
      } finally {
        setIsAiLoading(false);
      }
    };

    const timeoutId = setTimeout(generateAIInsights, 1000); // Debounce
    return () => clearTimeout(timeoutId);
  }, [filteredIncidents]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Downtime Analysis</h2>
        
        <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2">
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
          tooltip="Percentage of planned time the machines were available to run."
        />
        <KpiCard 
          title="MTBF" 
          value={`${mtbf}h`} 
          icon={<Wrench className="text-purple-500" />}
          tooltip="Mean Time Between Failures: Average operational time between breakdowns."
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
                <YAxis label={{ value: trendMetric === 'hours' ? 'Hours' : 'Events', angle: -90, position: 'insideLeft' }} />
                <RechartsTooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                          <p className="font-bold text-gray-800 mb-1">{data.fullDate}</p>
                          <p className="text-sm text-blue-600">
                            {trendMetric === 'hours' ? 'Total Hours' : 'Total Events'}: <span className="font-bold">{trendMetric === 'hours' ? data.totalHours.toFixed(1) : data.totalEvents}</span>
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
                  dataKey={trendMetric === 'hours' ? 'totalHours' : 'totalEvents'} 
                  name={trendMetric === 'hours' ? 'Total Hours' : 'Total Events'} 
                  stroke="#8b5cf6" 
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

        {/* OEE Impact Summary */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              OEE Impact & Opportunities
              <div className="group relative">
                <Info size={16} className="text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  AI-generated recommendations based on the most significant downtime causes.
                </div>
              </div>
            </h3>
            {isAiLoading && <Loader2 className="animate-spin text-blue-500" size={20} />}
          </div>
          
          <div className="flex-1 bg-blue-50 rounded-lg p-5 border border-blue-100">
            <h4 className="font-semibold text-blue-900 mb-3">Top 3 Opportunities to Improve OEE:</h4>
            {aiInsights.oeeOpportunities.length > 0 ? (
              <ul className="space-y-3">
                {aiInsights.oeeOpportunities.map((opp, idx) => (
                  <li key={idx} className="flex gap-3 text-blue-800 text-sm">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5">{opp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-blue-600/70 text-sm italic">
                {isAiLoading ? 'Generating insights...' : 'Insufficient data to generate opportunities.'}
              </div>
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
