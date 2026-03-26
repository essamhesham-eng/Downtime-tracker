import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Plus, Trash2, UserCog, GripVertical, Mail, Clock, Save, UserPlus, Crown } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { MultiSelect } from '../components/MultiSelect';

export function AdminPanel() {
  const { profile } = useAuth();
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);

  const [newLineName, setNewLineName] = useState('');
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineMEs, setNewMachineMEs] = useState<string[]>([]);
  const [newMachineIsCritical, setNewMachineIsCritical] = useState(false);
  const [newMachineJigs, setNewMachineJigs] = useState<number | ''>('');
  const [selectedLineForMachine, setSelectedLineForMachine] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{type: 'line' | 'machine', id: string, name: string} | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [reportTime, setReportTime] = useState('08:00');
  const [reportEmails, setReportEmails] = useState('');
  const [monthlyReportDay, setMonthlyReportDay] = useState('1');
  const [monthlyReportTime, setMonthlyReportTime] = useState('08:00');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('pending');
  const [isInviting, setIsInviting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{id: string, email: string, isInvitation?: boolean} | null>(null);

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'report'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.time) setReportTime(data.time);
          if (data.emails) setReportEmails(data.emails.join(', '));
          if (data.monthlyDay) setMonthlyReportDay(data.monthlyDay.toString());
          if (data.monthlyTime) setMonthlyReportTime(data.monthlyTime);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();

    const qLines = query(collection(db, 'lines'), orderBy('createdAt', 'asc'));
    const unsubLines = onSnapshot(qLines, (snapshot) => {
      setLines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qMachines = query(collection(db, 'machines'), orderBy('createdAt', 'asc'));
    const unsubMachines = onSnapshot(qMachines, (snapshot) => {
      const fetchedMachines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedMachines.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      });
      setMachines(fetchedMachines);
    });

    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qInvitations = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const unsubInvitations = onSnapshot(qInvitations, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isInvitation: true })));
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubUsers();
      unsubInvitations();
    };
  }, [profile]);

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineName) return;
    try {
      await addDoc(collection(db, 'lines'), {
        name: newLineName,
        createdAt: serverTimestamp(),
      });
      setNewLineName('');
    } catch (error) {
      console.error('Error adding line:', error);
      setErrorMsg('Failed to add line.');
    }
  };

  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachineName || !selectedLineForMachine) return;
    try {
      const lineMachines = machines.filter(m => m.lineId === selectedLineForMachine);
      const nextOrder = lineMachines.length > 0 ? Math.max(...lineMachines.map(m => m.order || 0)) + 1 : 0;

      await addDoc(collection(db, 'machines'), {
        lineId: selectedLineForMachine,
        name: newMachineName,
        status: 'running',
        currentIncidentId: null,
        order: nextOrder,
        defaultMEs: newMachineMEs.length > 0 ? newMachineMEs : null,
        isCritical: newMachineIsCritical,
        jigs: newMachineJigs === '' ? null : newMachineJigs,
        createdAt: serverTimestamp(),
      });
      setNewMachineName('');
      setNewMachineMEs([]);
      setNewMachineIsCritical(false);
      setNewMachineJigs('');
      setSelectedLineForMachine('');
    } catch (error) {
      console.error('Error adding machine:', error);
      setErrorMsg('Failed to add machine.');
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination } = result;

    if (source.droppableId !== destination.droppableId) {
      // Moving between lines
      const sourceLineId = source.droppableId;
      const destLineId = destination.droppableId;
      
      const sourceMachines = machines.filter(m => m.lineId === sourceLineId);
      const destMachines = machines.filter(m => m.lineId === destLineId);
      
      const [movedMachine] = sourceMachines.splice(source.index, 1);
      destMachines.splice(destination.index, 0, movedMachine);

      try {
        for (let i = 0; i < sourceMachines.length; i++) {
          await updateDoc(doc(db, 'machines', sourceMachines[i].id), { order: i });
        }
        for (let i = 0; i < destMachines.length; i++) {
          await updateDoc(doc(db, 'machines', destMachines[i].id), { 
            order: i,
            lineId: destLineId 
          });
        }
      } catch (error) {
        console.error('Error reordering machines:', error);
        setErrorMsg('Failed to reorder machines.');
      }
      return;
    }

    // Reordering within the same line
    const lineId = source.droppableId;
    const lineMachines = machines.filter(m => m.lineId === lineId);
    
    if (source.index === destination.index) return;

    const [movedMachine] = lineMachines.splice(source.index, 1);
    lineMachines.splice(destination.index, 0, movedMachine);

    try {
      for (let i = 0; i < lineMachines.length; i++) {
        await updateDoc(doc(db, 'machines', lineMachines[i].id), { order: i });
      }
    } catch (error) {
      console.error('Error reordering machines:', error);
      setErrorMsg('Failed to reorder machines.');
    }
  };

  const handleDeleteLine = (lineId: string, lineName: string) => {
    setItemToDelete({ type: 'line', id: lineId, name: lineName });
  };

  const handleDeleteMachine = (machineId: string, machineName: string) => {
    setItemToDelete({ type: 'machine', id: machineId, name: machineName });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const emailsList = reportEmails.split(',').map(e => e.trim()).filter(e => e);
      await setDoc(doc(db, 'settings', 'report'), {
        time: reportTime,
        emails: emailsList,
        monthlyDay: parseInt(monthlyReportDay),
        monthlyTime: monthlyReportTime,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setErrorMsg('Failed to save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !invitePassword) return;
    
    const cleanEmail = inviteEmail.trim().toLowerCase();
    const cleanName = inviteName.trim();
    
    setIsInviting(true);
    try {
      // Check if user already exists in the users collection
      const existingUser = users.find(u => u.email?.toLowerCase() === cleanEmail);
      if (existingUser) {
        // Just update their role and maybe displayName if provided
        const updates: any = { role: inviteRole };
        if (cleanName) updates.displayName = cleanName;
        
        await updateDoc(doc(db, 'users', existingUser.id), updates);
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePassword('');
        setInviteRole('pending');
        setIsInviting(false);
        return;
      }

      // Check if user already exists in the invitations collection
      const existingInvitation = invitations.find(inv => inv.email?.toLowerCase() === cleanEmail);
      if (existingInvitation) {
        const updates: any = { role: inviteRole };
        if (cleanName) updates.displayName = cleanName;
        
        await updateDoc(doc(db, 'invitations', existingInvitation.id), updates);
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteName('');
        setInvitePassword('');
        setInviteRole('pending');
        setIsInviting(false);
        return;
      }

      // Use direct REST API call to avoid secondary app issues and get better error messages
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: invitePassword,
          returnSecureToken: true
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create user account');
      }
      
      const newUid = data.localId;
      
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        email: cleanEmail,
        displayName: cleanName,
        role: inviteRole,
        status: 'invited',
        createdAt: serverTimestamp()
      });
      
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      setInviteRole('pending');
    } catch (error: any) {
      console.error('Error inviting user:', error);
      
      // Provide more helpful error messages
      let errorMsg = error.message || 'Failed to invite user.';
      if (errorMsg.includes('OPERATION_NOT_ALLOWED')) {
        errorMsg = 'Email/Password sign-in is not enabled in Firebase. Please enable it in the Firebase Console (Authentication > Sign-in method).';
      } else if (errorMsg.includes('EMAIL_EXISTS')) {
        // User exists in Firebase Auth, but might not be in the users collection.
        // We can create an invitation for them.
        try {
          await setDoc(doc(db, 'invitations', cleanEmail), {
            email: cleanEmail,
            displayName: cleanName,
            role: inviteRole,
            status: 'invited',
            createdAt: serverTimestamp(),
            invitedBy: profile?.uid || 'admin'
          });
          setIsInviteModalOpen(false);
          setInviteEmail('');
          setInviteName('');
          setInvitePassword('');
          setInviteRole('pending');
          return; // Exit successfully
        } catch (invError) {
          console.error('Error creating invitation:', invError);
          errorMsg = 'The email address is already in use, and failed to create an invitation.';
        }
      } else if (errorMsg.includes('WEAK_PASSWORD')) {
        errorMsg = 'The password must be at least 6 characters long.';
      }
      
      setErrorMsg(errorMsg);
    } finally {
      setIsInviting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      if (userToDelete.isInvitation) {
        await deleteDoc(doc(db, 'invitations', userToDelete.id));
      } else {
        await deleteDoc(doc(db, 'users', userToDelete.id));
      }
      setUserToDelete(null);
    } catch (error) {
      console.error('Error deleting user:', error);
      setErrorMsg('Failed to delete user.');
      setUserToDelete(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string, isInvitation?: boolean) => {
    try {
      if (isInvitation) {
        await updateDoc(doc(db, 'invitations', userId), { role: newRole });
      } else {
        await updateDoc(doc(db, 'users', userId), { role: newRole });
      }
    } catch (error) {
      console.error('Error updating role:', error);
      setErrorMsg('Failed to update user role.');
    }
  };

  if (profile?.role !== 'admin') {
    return <div className="p-8 text-center text-red-600 font-bold">Access Denied. Admins only.</div>;
  }

  const userEmails = new Set(users.map(u => u.email?.toLowerCase()).filter(Boolean));
  const filteredInvitations = invitations.filter(inv => !userEmails.has(inv.email?.toLowerCase()));
  
  const allUsers = [...users, ...filteredInvitations].sort((a, b) => {
    const timeA = a.createdAt?.toMillis() || 0;
    const timeB = b.createdAt?.toMillis() || 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gray-100 text-gray-800 rounded-full">
          <Settings size={24} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Admin Panel</h2>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Manage Lines */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Production Lines</h3>
          
          <form onSubmit={handleAddLine} className="flex gap-2 mb-6">
            <input
              type="text"
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="New Line Name"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              <Plus size={18} /> Add
            </button>
          </form>

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {lines.map(line => (
              <li key={line.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="font-medium text-gray-800">{line.name}</span>
                <button onClick={() => handleDeleteLine(line.id, line.name)} className="text-red-500 hover:text-red-700 p-1">
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
            {lines.length === 0 && <li className="text-gray-500 text-center py-4">No lines found.</li>}
          </ul>
        </div>

        {/* Manage Machines */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Machines</h3>
          
          <form onSubmit={handleAddMachine} className="flex flex-col gap-3 mb-6">
            <select
              value={selectedLineForMachine}
              onChange={(e) => setSelectedLineForMachine(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select Line...</option>
              {lines.map(line => (
                <option key={line.id} value={line.id}>{line.name}</option>
              ))}
            </select>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newMachineName}
                onChange={(e) => setNewMachineName(e.target.value)}
                placeholder="New Machine Name"
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <MultiSelect
                options={users.filter(u => u.role === 'maintenance_engineer').map(me => ({ value: me.id, label: me.displayName || me.email }))}
                selectedValues={newMachineMEs}
                onChange={setNewMachineMEs}
                placeholder="All MEs (Default)"
                className="w-full sm:w-48"
              />
              <select
                value={newMachineIsCritical ? 'true' : 'false'}
                onChange={(e) => setNewMachineIsCritical(e.target.value === 'true')}
                className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="false">Normal</option>
                <option value="true">Critical</option>
              </select>
              <input
                type="number"
                min="0"
                value={newMachineJigs}
                onChange={(e) => setNewMachineJigs(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="Jigs (opt)"
                className="w-24 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
                <Plus size={18} /> Add
              </button>
            </div>
          </form>

          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {lines.map(line => {
                const lineMachines = machines.filter(m => m.lineId === line.id);
                if (lineMachines.length === 0) return null;
                
                return (
                  <div key={line.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 border-b border-gray-200">
                      {line.name}
                    </div>
                    <Droppable droppableId={line.id}>
                      {(provided) => (
                        <ul 
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="divide-y divide-gray-100 min-h-[10px]"
                        >
                          {lineMachines.map((machine, index) => (
                            // @ts-ignore
                            <Draggable key={machine.id} draggableId={machine.id} index={index}>
                              {(provided, snapshot) => (
                                <li 
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 bg-white hover:bg-gray-50 ${snapshot.isDragging ? 'shadow-lg ring-1 ring-blue-500 z-10' : ''}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                                      <GripVertical size={18} />
                                    </div>
                                    <span className="font-medium text-gray-800">{machine.name}</span>
                                    {machine.isCritical && <Crown size={16} className="text-yellow-500" />}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={machine.isCritical ? 'true' : 'false'}
                                      onChange={async (e) => {
                                        try {
                                          await updateDoc(doc(db, 'machines', machine.id), {
                                            isCritical: e.target.value === 'true'
                                          });
                                        } catch (err) {
                                          console.error('Error updating critical status:', err);
                                          setErrorMsg('Failed to update critical status.');
                                        }
                                      }}
                                      className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    >
                                      <option value="false">Normal</option>
                                      <option value="true">Critical</option>
                                    </select>
                                    <input
                                      type="number"
                                      min="0"
                                      value={machine.jigs || ''}
                                      onChange={async (e) => {
                                        try {
                                          await updateDoc(doc(db, 'machines', machine.id), {
                                            jigs: e.target.value ? parseInt(e.target.value) : null
                                          });
                                        } catch (err) {
                                          console.error('Error updating jigs:', err);
                                          setErrorMsg('Failed to update jigs.');
                                        }
                                      }}
                                      placeholder="Jigs"
                                      className="w-16 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    />
                                    <MultiSelect
                                      options={users.filter(u => u.role === 'maintenance_engineer').map(me => ({ value: me.id, label: me.displayName || me.email }))}
                                      selectedValues={machine.defaultMEs || []}
                                      onChange={async (newValues) => {
                                        try {
                                          await updateDoc(doc(db, 'machines', machine.id), {
                                            defaultMEs: newValues.length > 0 ? newValues : null
                                          });
                                        } catch (err) {
                                          console.error('Error updating default MEs:', err);
                                          setErrorMsg('Failed to update default MEs.');
                                        }
                                      }}
                                      placeholder="All MEs"
                                      className="w-full sm:w-48"
                                    />
                                    <button 
                                      onClick={() => handleDeleteMachine(machine.id, machine.name)} 
                                      className="text-red-500 hover:text-red-700 p-1 ml-2"
                                      title="Delete Machine"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </li>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </ul>
                      )}
                    </Droppable>
                  </div>
                );
              })}
              {machines.length === 0 && <div className="text-gray-500 text-center py-4">No machines found.</div>}
            </div>
          </DragDropContext>
        </div>
      </div>

      {/* Report Settings */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
          <Mail size={20} className="text-blue-600" />
          Report Settings
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure the time and recipients for the daily and monthly data overview emails. The monthly report will also delete the data from the database.
        </p>
        <form onSubmit={handleSaveSettings} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Clock size={16} /> Daily Send Time (24h format)
              </label>
              <input
                type="time"
                value={reportTime}
                onChange={(e) => setReportTime(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Mail size={16} /> Recipient Emails
              </label>
              <input
                type="text"
                value={reportEmails}
                onChange={(e) => setReportEmails(e.target.value)}
                placeholder="admin@example.com, manager@example.com"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Clock size={16} /> Monthly Send Day (1-28)
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={monthlyReportDay}
                onChange={(e) => setMonthlyReportDay(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Clock size={16} /> Monthly Send Time (24h format)
              </label>
              <input
                type="time"
                value={monthlyReportTime}
                onChange={(e) => setMonthlyReportTime(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {isSavingSettings ? 'Saving...' : 'Save Settings'}
            </button>
            {settingsSuccess && <span className="text-green-600 font-medium text-sm">Settings saved successfully!</span>}
          </div>
        </form>
      </div>

      {/* Manage Users */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserCog size={20} className="text-blue-600" />
            User Management
          </h3>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} /> Invite User
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-800">{u.displayName || 'N/A'}</td>
                  <td className="p-4 text-gray-600">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    {u.status === 'invited' ? (
                      <span className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-orange-100 text-orange-800">
                        Invited
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-bold uppercase bg-green-100 text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="p-4 flex items-center gap-2">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value, u.isInvitation)}
                      className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      disabled={u.email === 'essam.bn@yahoo.com' || u.email === 'cron@sharestate.com'} // Prevent changing main admin
                    >
                      <option value="pending">Pending</option>
                      <option value="line_leader">Line Leader</option>
                      <option value="maintenance_engineer">Maintenance Engineer</option>
                      <option value="pd_engineer">PD Engineer</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    
                    {u.email !== 'essam.bn@yahoo.com' && u.email !== 'cron@sharestate.com' && (
                      <button 
                        onClick={() => setUserToDelete({ id: u.id, email: u.email, isInvitation: u.isInvitation })}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the {itemToDelete.type} <strong>{itemToDelete.name}</strong>?
              {itemToDelete.type === 'line' && ' All associated machines must be deleted first.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    if (itemToDelete.type === 'line') {
                      await deleteDoc(doc(db, 'lines', itemToDelete.id));
                    } else {
                      await deleteDoc(doc(db, 'machines', itemToDelete.id));
                    }
                    setItemToDelete(null);
                  } catch (error) {
                    console.error('Error deleting:', error);
                    setErrorMsg('Failed to delete item.');
                    setItemToDelete(null);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm User Deletion</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the user <strong>{userToDelete.email}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <UserPlus size={24} className="text-blue-600" />
              Invite New User
            </h3>
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="line_leader">Line Leader</option>
                  <option value="maintenance_engineer">Maintenance Engineer</option>
                  <option value="pd_engineer">PD Engineer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                  disabled={isInviting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isInviting ? 'Inviting...' : 'Invite User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorMsg && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-white/80 hover:text-white">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
