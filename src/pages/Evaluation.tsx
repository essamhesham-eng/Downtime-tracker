import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs, addDoc, serverTimestamp, setDoc, doc, getDoc, limit, deleteDoc, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Search, Save, User, Star, History, AlertTriangle, Minus, Plus, Trash2, PieChart as PieChartIcon, Calendar, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getServerTime } from '../utils/time';

export function Evaluation() {
  const { profile, permissions } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'analysis'>('form');
  const [operators, setOperators] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  
  const [searchCode, setSearchCode] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [pointsChange, setPointsChange] = useState<number | ''>('');
  const [comment, setComment] = useState('');
  
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [historySearchCode, setHistorySearchCode] = useState('');
  const [selectedEvaluations, setSelectedEvaluations] = useState<string[]>([]);
  const [evaluationCauses, setEvaluationCauses] = useState<any[]>([]);
  const [selectedCause, setSelectedCause] = useState<string>('');

  const [analysisEvaluations, setAnalysisEvaluations] = useState<any[]>([]);
  const [selectedOperatorForDetails, setSelectedOperatorForDetails] = useState<{code: string, name: string} | null>(null);
  
  const [startDate, setStartDate] = useState(format(subDays(getServerTime(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(getServerTime(), 'yyyy-MM-dd'));
  const [appliedStartDate, setAppliedStartDate] = useState(startDate);
  const [appliedEndDate, setAppliedEndDate] = useState(endDate);

  const [selectedEvaluator, setSelectedEvaluator] = useState<string>('all');
  const [appliedSelectedEvaluator, setAppliedSelectedEvaluator] = useState<string>('all');

  const [analysisOperatorSearch, setAnalysisOperatorSearch] = useState('');
  const [appliedAnalysisOperatorSearch, setAppliedAnalysisOperatorSearch] = useState('');

  const handleApplyFilters = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedSelectedEvaluator(selectedEvaluator);
    setAppliedAnalysisOperatorSearch(analysisOperatorSearch);
  };

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

  const isPdEngineer = profile?.role === 'pd_engineer';
  const isLineLeader = profile?.role === 'line_leader';
  const canEvaluate = isPdEngineer || isLineLeader || profile?.role === 'admin' || profile?.role === 'manager';
  const canEditName = isPdEngineer || profile?.role === 'admin';
  
  const existingOperator = operators.find(o => o.code === searchCode.trim());

  useEffect(() => {
    if (!canEvaluate) return;

    // Fetch operators
    const qOps = query(collection(db, 'operators'), orderBy('name'));
    const unsubOps = onSnapshot(qOps, snapshot => {
      setOperators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qCauses = query(collection(db, 'evaluationCauses'), orderBy('createdAt', 'asc'));
    const unsubCauses = onSnapshot(qCauses, snapshot => {
      setEvaluationCauses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubOps();
      unsubCauses();
    };
  }, [canEvaluate]);
  
  const currentPeriod = useMemo(() => {
    const d = new Date();
    let start, end;
    if (d.getDate() >= 21) {
      start = new Date(d.getFullYear(), d.getMonth(), 21);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 20, 23, 59, 59, 999);
    } else {
      start = new Date(d.getFullYear(), d.getMonth() - 1, 21);
      end = new Date(d.getFullYear(), d.getMonth(), 20, 23, 59, 59, 999);
    }
    return { start, end };
  }, []);

  useEffect(() => {
    if (!canEvaluate) return;
    
    const qEvals = query(
      collection(db, 'evaluations'),
      where('createdAt', '>=', currentPeriod.start),
      orderBy('createdAt', 'desc'),
      limit(5000)
    );
    
    const unsubEvals = onSnapshot(qEvals, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const periodEvals = data.filter((e: any) => {
        const d = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt ? new Date(e.createdAt) : new Date());
        const inPeriod = d <= currentPeriod.end;
        if (isLineLeader && e.evaluatorId !== profile?.uid) {
          return false;
        }
        return inPeriod;
      });
      setEvaluations(periodEvals);
    });

    return () => unsubEvals();
  }, [canEvaluate, currentPeriod, isLineLeader, profile?.uid]);

  const canSeeAnalysis = profile?.role === 'admin' || (permissions && permissions[profile?.role]?.includes('evaluation_analysis'));
  useEffect(() => {
    if (!canEvaluate || !canSeeAnalysis) return;

    const start = startOfDay(new Date(appliedStartDate));
    const end = endOfDay(new Date(appliedEndDate));
    
    const qAnalysisEvals = query(
      collection(db, 'evaluations'),
      where('createdAt', '>=', start),
      orderBy('createdAt', 'desc'),
      limit(5000)
    );
    
    const unsubAnalysisEvals = onSnapshot(qAnalysisEvals, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const periodEvals = data.filter((e: any) => {
        const d = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt ? new Date(e.createdAt) : new Date());
        return d <= end;
      });
      setAnalysisEvaluations(periodEvals);
    });

    return () => unsubAnalysisEvals();
  }, [canEvaluate, canSeeAnalysis, appliedStartDate, appliedEndDate]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchCode(val);
    
    if (val.trim() !== '') {
      const existing = operators.find(o => o.code === val.trim());
      if (existing) {
        setOperatorName(existing.name);
      }
    } else {
      setOperatorName('');
    }
  };

  const handleSelectOp = (op: any) => {
    setSearchCode(op.code);
    setOperatorName(op.name);
  };

  const setPresetPoints = (pts: number) => {
    setPointsChange(pts);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    setSuccessMsg(null);
    
    const code = searchCode.trim();
    const name = operatorName.trim();
    const pts = Number(pointsChange);
    
    if (!code || !name || pointsChange === '' || !selectedCause) {
      setErrorCode('Please fill out code, name, points, and cause.');
      return;
    }
    
    if (isNaN(pts) || pts === 0) {
      setErrorCode('Points must be a non-zero number.');
      return;
    }
    
    if (pts > 0 && !isPdEngineer && profile?.role !== 'admin' && profile?.role !== 'manager') {
      setErrorCode('Only PD Engineers and Managers can add points.');
      return;
    }
    
    if (pts < 0 && Math.abs(pts) > 3 && isLineLeader && profile?.role !== 'admin') {
      setErrorCode('Line Leaders can only subtract up to 3 points per evaluation.');
      return;
    }
    
    setLoading(true);
    try {
      const opRef = doc(db, 'operators', code);
      const opDoc = await getDoc(opRef);
      if (!opDoc.exists()) {
        await setDoc(opRef, {
          code,
          name,
          createdAt: serverTimestamp(),
          createdBy: profile?.uid
        });
      } else if (opDoc.data().name !== name && canEditName) {
        await setDoc(opRef, { name }, { merge: true });
        
        // Reflect name change in all evaluations for this operator
        const evalsQuery = query(collection(db, 'evaluations'), where('operatorCode', '==', code));
        const evalsSnapshot = await getDocs(evalsQuery);
        const updatePromises = evalsSnapshot.docs.map(evDoc => 
          setDoc(doc(db, 'evaluations', evDoc.id), { operatorName: name }, { merge: true })
        );
        await Promise.all(updatePromises);
      }
      
      await addDoc(collection(db, 'evaluations'), {
        operatorCode: code,
        operatorName: name,
        pointsChange: pts,
        cause: selectedCause,
        comment: comment.trim(),
        evaluatorId: profile?.uid,
        evaluatorName: profile?.displayName,
        createdAt: serverTimestamp()
      });
      
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 2000);
      
      setSuccessMsg(`Evaluation saved for ${name} (${pts > 0 ? '+' : ''}${pts} pts).`);
      setPointsChange('');
      setSelectedCause('');
      setComment('');
      
    } catch (err: any) {
      console.error(err);
      setErrorCode('Failed to save evaluation. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canEvaluate) {
    return <div className="p-8 text-center text-red-600 font-bold">Access Denied.</div>;
  }
  
  const handleDeleteEvaluation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'evaluations', id));
      setSuccessMsg('Evaluation deleted successfully.');
      setSelectedEvaluations(prev => prev.filter(eId => eId !== id));
    } catch (err: any) {
      console.error(err);
      setErrorCode('Failed to delete evaluation. ' + err.message);
    }
  };

  const handleSelectEvaluation = (id: string) => {
    setSelectedEvaluations(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    setLoading(true);
    try {
      const deletePromises = selectedEvaluations.map(id => deleteDoc(doc(db, 'evaluations', id)));
      await Promise.all(deletePromises);
      setSuccessMsg(`${selectedEvaluations.length} evaluation(s) deleted successfully.`);
      setSelectedEvaluations([]);
    } catch (err: any) {
      console.error(err);
      setErrorCode('Failed to delete evaluations. ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getOperatorPoints = (code: string) => {
    let currentPoints = 100;
    evaluations.forEach(ev => {
      if (ev.operatorCode === code) {
        currentPoints += (ev.pointsChange || 0);
      }
    });
    return currentPoints;
  };
  
  const filteredOperators = searchCode ? operators.filter(o => o.code.includes(searchCode) || o.name.toLowerCase().includes(searchCode.toLowerCase())) : [];
  const showDropdown = searchCode && !existingOperator && filteredOperators.length > 0;

  const evaluatorsList = useMemo(() => {
    const map = new Map<string, string>();
    analysisEvaluations.forEach(ev => {
      if (ev.evaluatorId) {
        map.set(ev.evaluatorId, ev.evaluatorName || 'Unknown');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [analysisEvaluations]);

  const filteredAnalysisEvaluations = useMemo(() => {
    return analysisEvaluations.filter(ev => {
      if (appliedSelectedEvaluator !== 'all' && ev.evaluatorId !== appliedSelectedEvaluator) return false;
      if (appliedAnalysisOperatorSearch) {
        const query = appliedAnalysisOperatorSearch.toLowerCase();
        if (!ev.operatorCode?.toLowerCase().includes(query) && !ev.operatorName?.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [analysisEvaluations, appliedSelectedEvaluator, appliedAnalysisOperatorSearch]);

  // Analysis data
  const analysisData = useMemo(() => {
    const causesMap: Record<string, number> = {};
    const operatorsMap: Record<string, { code: string; name: string; totalPointsChange: number }> = {};
    
    filteredAnalysisEvaluations.forEach(ev => {
      // Cause distribution
      if (ev.cause) {
        causesMap[ev.cause] = (causesMap[ev.cause] || 0) + 1;
      }
      
      // Operator points
      if (ev.operatorCode) {
        if (!operatorsMap[ev.operatorCode]) {
          operatorsMap[ev.operatorCode] = {
            code: ev.operatorCode,
            name: ev.operatorName || 'Unknown',
            totalPointsChange: 0
          };
        }
        operatorsMap[ev.operatorCode].totalPointsChange += (ev.pointsChange || 0);
      }
    });

    const causesChartData = Object.keys(causesMap).map(cause => ({ name: cause, value: causesMap[cause] })).sort((a, b) => b.value - a.value);
    const operatorsArr = Object.values(operatorsMap).sort((a, b) => b.totalPointsChange - a.totalPointsChange);
    
    const topPerformers = operatorsArr.filter(o => o.totalPointsChange > 0);
    const lowestPerformers = [...operatorsArr].sort((a, b) => a.totalPointsChange - b.totalPointsChange).filter(o => o.totalPointsChange < 0);

    return { causesChartData, topPerformers, lowestPerformers };
  }, [filteredAnalysisEvaluations]);

  const operatorDetailsData = useMemo(() => {
    if (!selectedOperatorForDetails) return [];
    return filteredAnalysisEvaluations.filter(ev => ev.operatorCode === selectedOperatorForDetails.code).sort((a,b) => {
      const dA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const dB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return dB.getTime() - dA.getTime();
    });
  }, [selectedOperatorForDetails, filteredAnalysisEvaluations]);
  
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Star className="text-yellow-500" /> Operator Evaluation
          </h2>
          {canSeeAnalysis && (
            <div className="flex space-x-2 bg-gray-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => setActiveTab('form')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'form' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <User size={16} />
                Data Entry
              </button>
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  activeTab === 'analysis' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <PieChartIcon size={16} />
                Analysis
              </button>
            </div>
          )}
        </div>
        <div className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg border border-blue-100 font-medium">
          Period: {currentPeriod.start.toLocaleDateString()} - {currentPeriod.end.toLocaleDateString()}
        </div>
      </div>
      
      {errorCode && (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
             <AlertTriangle size={18} />
             <span>{errorCode}</span>
          </div>
          <button onClick={() => setErrorCode(null)} className="hover:text-red-900">&times;</button>
        </div>
      )}
      
      {successMsg && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-100 flex items-center justify-between shadow-sm">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="hover:text-green-900">&times;</button>
        </div>
      )}

      {activeTab === 'form' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <User size={20} className="text-blue-500" /> Evaluation Form
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Code</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search size={16} className="text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={searchCode}
                      onChange={handleCodeChange}
                      placeholder="Search or enter"
                      className="w-full pl-10 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                      required
                    />
                    
                    {showDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {filteredOperators.map(op => (
                          <div 
                            key={op.id} 
                            className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm border-b border-gray-50 last:border-0"
                            onClick={() => handleSelectOp(op)}
                          >
                            <span className="font-bold text-blue-600">{op.code}</span> - <span className="text-gray-700">{op.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="Operator Name"
                    readOnly={existingOperator && !canEditName}
                    className={`w-full p-3 border rounded-xl outline-none transition-all shadow-sm ${existingOperator && !canEditName ? 'bg-gray-50 border-gray-200 text-gray-600 cursor-not-allowed' : 'border-gray-200 focus:ring-2 focus:ring-blue-500'}`}
                    required
                  />
                </div>
              </div>

              {searchCode && !isLineLeader && (
                <div className="bg-gray-50 p-4 rounded-xl flex items-center justify-between border border-gray-100 shadow-inner">
                  <div className="flex items-center gap-2">
                     <Star size={18} className="text-yellow-500" />
                     <span className="text-sm font-medium text-gray-700">Current Balance</span>
                  </div>
                  <span className={`text-2xl font-black ${getOperatorPoints(searchCode) >= 100 ? 'text-green-600' : 'text-orange-500'}`}>
                    {getOperatorPoints(searchCode)} <span className="text-sm font-medium text-gray-500">pts</span>
                  </span>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Points Action</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {/* Line Leaders and Up can subtract */}
                  <button type="button" onClick={() => setPresetPoints(-1)} className={`py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center gap-1 ${pointsChange === -1 ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'}`}><Minus size={14} /> 1 pt</button>
                  <button type="button" onClick={() => setPresetPoints(-2)} className={`py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center gap-1 ${pointsChange === -2 ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'}`}><Minus size={14} /> 2 pts</button>
                  <button type="button" onClick={() => setPresetPoints(-3)} className={`py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center gap-1 ${pointsChange === -3 ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'}`}><Minus size={14} /> 3 pts</button>
                  
                  {/* PD Engineers / Admin / Manager can add or do custom */}
                  {(isPdEngineer || profile?.role === 'admin' || profile?.role === 'manager') && (
                    <>
                      <div className="w-px h-8 bg-gray-200 mx-1"></div>
                      <button type="button" onClick={() => setPresetPoints(1)} className={`py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center gap-1 ${pointsChange === 1 ? 'bg-green-600 text-white shadow-md' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-100'}`}><Plus size={14} /> 1 pt</button>
                      <button type="button" onClick={() => setPresetPoints(3)} className={`py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center gap-1 ${pointsChange === 3 ? 'bg-green-600 text-white shadow-md' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-100'}`}><Plus size={14} /> 3 pts</button>
                    </>
                  )}
                </div>
                {!isLineLeader && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Or custom amount:</span>
                    <input
                      type="number"
                      value={pointsChange}
                      onChange={(e) => setPointsChange(e.target.value ? Number(e.target.value) : '')}
                      placeholder="e.g. -1"
                      className={`w-24 p-2 text-center font-bold border rounded-lg focus:ring-2 outline-none shadow-sm ${Number(pointsChange) > 0 ? 'bg-green-50 border-green-200 text-green-700 focus:ring-green-500' : Number(pointsChange) < 0 ? 'bg-red-50 border-red-200 text-red-700 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'}`}
                      required={!isLineLeader}
                    />
                  </div>
                )}
              </div>
  
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-2">
                   Cause <span className="text-red-500">*</span>
                </label>
                {evaluationCauses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {evaluationCauses.map((cause) => (
                      <button
                        key={cause.id}
                        type="button"
                        onClick={() => setSelectedCause(cause.name)}
                        className={`py-2 px-4 rounded-lg font-bold text-sm transition-all border ${
                          selectedCause === cause.name
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
                        }`}
                      >
                        {cause.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    No evaluation causes found. An admin needs to create them in the Admin Panel.
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Comment (Optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Briefly explain the reason..."
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm resize-none"
                ></textarea>
              </div>
              
              <button
                type="submit"
                disabled={loading || !searchCode || !operatorName || pointsChange === '' || !selectedCause}
                className={`w-full py-3.5 font-bold rounded-xl transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-md ${
                  isSubmitted 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-gray-900 text-white hover:bg-black'
                }`}
              >
                <Save size={20} />
                {isSubmitted ? 'Submitted' : 'Submit Evaluation'}
              </button>
            </form>
          </div>
          
          <div className="md:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[700px]">
            <div className="flex flex-col mb-4 gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <History size={20} className="text-blue-500" /> Recent History
                </h3>
                {profile?.role === 'admin' && selectedEvaluations.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    disabled={loading}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={14} />
                    Delete ({selectedEvaluations.length})
                  </button>
                )}
              </div>
              
              {!isLineLeader && (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={14} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={historySearchCode}
                    onChange={(e) => setHistorySearchCode(e.target.value)}
                    placeholder="Search history by code"
                    className="w-full pl-9 p-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
              )}
              
              {profile?.role === 'admin' && evaluations.length > 0 && (
                <div className="flex items-center gap-2 px-1 mt-1">
                  <input
                    type="checkbox"
                    id="selectAll"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEvaluations((historySearchCode ? evaluations.filter(ev => ev.operatorCode?.toLowerCase().includes(historySearchCode.toLowerCase())) : evaluations).map(ev => ev.id));
                      } else {
                        setSelectedEvaluations([]);
                      }
                    }}
                    checked={
                      selectedEvaluations.length > 0 && 
                      selectedEvaluations.length === (historySearchCode ? evaluations.filter(ev => ev.operatorCode?.toLowerCase().includes(historySearchCode.toLowerCase())) : evaluations).length
                    }
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <label htmlFor="selectAll" className="text-sm text-gray-600 font-medium cursor-pointer">
                    Select All
                  </label>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {evaluations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                  <History size={40} className="opacity-20" />
                  <p>No evaluations yet</p>
                </div>
              ) : (
                (historySearchCode ? evaluations.filter(ev => ev.operatorCode?.toLowerCase().includes(historySearchCode.toLowerCase())) : evaluations).map(ev => (
                  <div key={ev.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors flex flex-col gap-2 relative group">
                    <div className="flex justify-between items-start pr-6 relative">
                      {profile?.role === 'admin' && (
                        <div className="absolute -left-2 -top-2">
                          <input
                            type="checkbox"
                            checked={selectedEvaluations.includes(ev.id)}
                            onChange={() => handleSelectEvaluation(ev.id)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                        </div>
                      )}
                      <div className={profile?.role === 'admin' ? "pl-5" : ""}>
                        <span className="font-bold text-gray-900 block">{ev.operatorName}</span>
                        <span className="text-xs text-blue-600 font-mono bg-blue-50 px-1.5 py-0.5 rounded">{ev.operatorCode}</span>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-sm font-black shadow-sm ${ev.pointsChange > 0 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                        {ev.pointsChange > 0 ? '+' : ''}{ev.pointsChange}
                      </span>
                    </div>
                    {(isPdEngineer || profile?.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEvaluation(ev.id)}
                        className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Evaluation"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    {ev.cause && (
                      <span className="inline-block self-start text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded-md mb-1">
                        {ev.cause}
                      </span>
                    )}
                    {ev.comment && (
                      <p className="text-sm text-gray-600 bg-white border border-gray-100 p-2 rounded-lg my-1">"{ev.comment}"</p>
                    )}
                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1 font-medium">
                      <span>{ev.evaluatorName || 'Unknown'}</span>
                      <span>{ev.createdAt?.toDate ? ev.createdAt.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analysis' && canSeeAnalysis && (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-end gap-4 relative z-10">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Preset</label>
              <select
                value={currentDatePreset}
                onChange={handlePresetChange}
                className="w-full text-sm p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm bg-gray-50"
              >
                <option value="today">Today</option>
                <option value="lastDay">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} /> Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar size={14} /> End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full text-sm p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <User size={14} /> Evaluator
              </label>
              <select
                value={selectedEvaluator}
                onChange={(e) => setSelectedEvaluator(e.target.value)}
                className="w-full text-sm p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm bg-gray-50"
              >
                <option value="all">All Evaluators</option>
                {evaluatorsList.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Search size={14} /> Operator Code/Name
              </label>
              <input
                type="text"
                value={analysisOperatorSearch}
                onChange={(e) => setAnalysisOperatorSearch(e.target.value)}
                placeholder="Search..."
                className="w-full text-sm p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
              />
            </div>
            
            <button
              onClick={handleApplyFilters}
              disabled={loading}
              className="px-5 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-md ml-auto"
            >
              Apply Filter
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-6">Evaluation Causes Distribution</h3>
              <div className="h-[300px]">
                {analysisData.causesChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analysisData.causesChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {analysisData.causesChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value} instances`, 'Count']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">No cause data available</div>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Star className="text-yellow-500" size={20} />
                Highest Point Gains
              </h3>
              <div className="flex-1 space-y-3">
                {analysisData.topPerformers.length > 0 ? (
                  analysisData.topPerformers.map((op, i) => (
                    <div 
                      key={op.code} 
                      onClick={() => setSelectedOperatorForDetails(op)}
                      className="flex justify-between items-center p-3 border border-gray-100 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <div>
                          <p className="font-bold text-gray-800">{op.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{op.code}</p>
                        </div>
                      </div>
                      <span className="font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">+{op.totalPointsChange}</span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">No positive point gains</div>
                )}
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:col-span-2">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="text-red-500" size={20} />
                Most Point Deductions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysisData.lowestPerformers.length > 0 ? (
                  analysisData.lowestPerformers.map((op, i) => (
                    <div 
                      key={op.code} 
                      onClick={() => setSelectedOperatorForDetails(op)}
                      className="flex justify-between items-center p-3 border border-red-50 bg-red-50/30 rounded-xl cursor-pointer hover:bg-red-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                        <div>
                          <p className="font-bold text-gray-800">{op.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{op.code}</p>
                        </div>
                      </div>
                      <span className="font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">{op.totalPointsChange}</span>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 p-8 col-span-full">No point deductions found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedOperatorForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedOperatorForDetails.name}</h2>
                <p className="text-sm font-mono text-gray-500">{selectedOperatorForDetails.code}</p>
              </div>
              <button onClick={() => setSelectedOperatorForDetails(null)} className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100 bg-gray-50 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {operatorDetailsData.length > 0 ? (
                operatorDetailsData.map(ev => (
                  <div key={ev.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                        <span className={`px-2 py-1 rounded-md text-sm font-black shadow-sm ${ev.pointsChange > 0 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                          {ev.pointsChange > 0 ? '+' : ''}{ev.pointsChange}
                        </span>
                        <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-md">
                          {ev.createdAt?.toDate ? format(ev.createdAt.toDate(), 'MMM d, yyyy HH:mm') : 'Unknown'}
                        </span>
                    </div>
                    {ev.cause && (
                      <span className="font-semibold text-sm text-gray-700">
                        {ev.cause}
                      </span>
                    )}
                    {ev.comment && (
                      <p className="text-sm text-gray-600 my-1 bg-white p-2 rounded-lg border border-gray-100">"{ev.comment}"</p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <User size={12} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">{ev.evaluatorName || 'Unknown Evaluator'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-500 py-8">No evaluations found for this period.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
