import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { X, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getServerTime } from '../utils/time';

interface ProductionHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  lines: any[];
}

export function ProductionHoursModal({ isOpen, onClose, lines }: ProductionHoursModalProps) {
  const { user, profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(getServerTime(), 'yyyy-MM-dd'));
  const [hours, setHours] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchHours = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(db, 'production_hours'), where('date', '==', selectedDate));
        const snapshot = await getDocs(q);
        
        const fetchedHours: Record<string, number> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          fetchedHours[data.lineId] = data.hours;
        });
        
        // Initialize missing lines with 9 hours default
        const newHours = { ...fetchedHours };
        lines.forEach(line => {
          if (newHours[line.id] === undefined) {
            newHours[line.id] = 9;
          }
        });
        
        setHours(newHours);
      } catch (error) {
        console.error('Error fetching production hours:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHours();
  }, [isOpen, selectedDate, lines]);

  const handleSetAllHours = (value: number) => {
    const newHours = { ...hours };
    lines.forEach(line => {
      newHours[line.id] = value;
    });
    setHours(newHours);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setSuccessMsg('');
    
    try {
      const promises = lines.map(line => {
        const docId = `${selectedDate}_${line.id}`;
        return setDoc(doc(db, 'production_hours', docId), {
          date: selectedDate,
          lineId: line.id,
          hours: hours[line.id] || 0,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        }, { merge: true });
      });
      
      await Promise.all(promises);
      setSuccessMsg('Production hours saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error('Error saving production hours:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">Manage Production Hours</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Shift Hours per Line</h3>
              
              {lines.length > 0 && (
                <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                  <span className="text-sm font-bold text-blue-800">Set all lines to:</span>
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => {
                        if (e.target.value) handleSetAllHours(Number(e.target.value));
                        e.target.value = ""; // Reset after selection
                      }}
                      className="w-24 p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Select...</option>
                      <option value={0}>0</option>
                      <option value={9}>9</option>
                      <option value={12}>12</option>
                    </select>
                    <span className="text-sm text-blue-600">hrs</span>
                  </div>
                </div>
              )}

              {lines.map(line => (
                <div key={line.id} className="flex items-center justify-between">
                  <span className="text-gray-800 font-medium">{line.name}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={hours[line.id] ?? 9}
                      onChange={(e) => setHours({ ...hours, [line.id]: Number(e.target.value) })}
                      className="w-24 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={0}>0</option>
                      <option value={9}>9</option>
                      <option value={12}>12</option>
                    </select>
                    <span className="text-sm text-gray-500">hrs</span>
                  </div>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No production lines found.</p>
              )}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-green-600 text-sm font-medium">{successMsg}</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-200 font-medium rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Save Hours
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
