import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs, addDoc, serverTimestamp, setDoc, doc, getDoc, limit, deleteDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Save, User, Star, History, AlertTriangle, Minus, Plus, Trash2 } from 'lucide-react';

export function Evaluation() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
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

    return () => unsubOps();
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
      orderBy('createdAt', 'desc'),
      limit(5000)
    );
    
    const unsubEvals = onSnapshot(qEvals, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const periodEvals = data.filter((e: any) => {
        const d = e.createdAt?.toDate ? e.createdAt.toDate() : (e.createdAt ? new Date(e.createdAt) : new Date());
        return d >= currentPeriod.start && d <= currentPeriod.end;
      });
      setEvaluations(periodEvals);
    });

    return () => unsubEvals();
  }, [canEvaluate, currentPeriod]);

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
    
    if (!code || !name || pointsChange === '' || !comment.trim()) {
      setErrorCode('Please fill out all fields.');
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
      setErrorCode('Line Leaders can only subtract up to 3 points per comment.');
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
        comment: comment.trim(),
        evaluatorId: profile?.uid,
        evaluatorName: profile?.displayName,
        createdAt: serverTimestamp()
      });
      
      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 2000);
      
      setSuccessMsg(`Evaluation saved for ${name} (${pts > 0 ? '+' : ''}${pts} pts).`);
      setPointsChange('');
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Star className="text-yellow-500" /> Operator Evaluation
        </h2>
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Briefly explain the reason..."
                rows={3}
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm resize-none"
                required
              ></textarea>
            </div>
            
            <button
              type="submit"
              disabled={loading || !searchCode || !operatorName || pointsChange === '' || !comment}
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
                  <p className="text-sm text-gray-600 bg-white border border-gray-100 p-2 rounded-lg my-1">"{ev.comment}"</p>
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
    </div>
  );
}
