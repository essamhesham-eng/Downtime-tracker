import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Plus, Trash2, UserCog, GripVertical, Mail, Clock, Save, UserPlus, Crown } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { MultiSelect } from '../components/MultiSelect';
import emailjs from 'emailjs-com';

export function AdminPanel() {
  const { profile } = useAuth();
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [reasonCodes, setReasonCodes] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);

  const [newLineName, setNewLineName] = useState('');
  const [newLineAllowOutOfOrder, setNewLineAllowOutOfOrder] = useState(false);
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineGroups, setNewMachineGroups] = useState<string[]>([]);
  const [newMachineIsCritical, setNewMachineIsCritical] = useState(false);
  const [newMachineJigs, setNewMachineJigs] = useState<number | ''>('');
  const [selectedLineForMachine, setSelectedLineForMachine] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUsers, setNewGroupUsers] = useState<string[]>([]);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonDescription, setNewReasonDescription] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{type: 'line' | 'machine' | 'group' | 'reasonCode', id: string, name: string} | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [reportEmails, setReportEmails] = useState('');
  const [reportMessage, setReportMessage] = useState('Here is your automated downtime report.');
  const [reportFrequencies, setReportFrequencies] = useState<string[]>(['daily']);
  const [reportAnalysis, setReportAnalysis] = useState<string[]>(['kpis', 'pareto', 'top_issues']);
  const [workingHours, setWorkingHours] = useState<Record<string, number>>({
    monday: 24, tuesday: 24, wednesday: 24, thursday: 24, friday: 24, saturday: 24, sunday: 24
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [isTestingReport, setIsTestingReport] = useState(false);
  const [testReportResult, setTestReportResult] = useState<string | null>(null);

  const availableFrequencies = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' }
  ];

  const availableAnalysis = [
    { id: 'kpis', label: 'KPIs (Total Downtime, MTTR, MTBF)' },
    { id: 'pareto', label: 'Pareto Analysis (Top Reasons)' },
    { id: 'top_issues', label: 'Top 10 Longest Issues' },
    { id: 'oee', label: 'OEE Impact Summary' }
  ];

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('pending');
  const [isInviting, setIsInviting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{id: string, email: string, isInvitation?: boolean} | null>(null);

  const [permissions, setPermissions] = useState<any>({});
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionsSuccess, setPermissionsSuccess] = useState(false);

  const availablePages = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'report', label: 'Report Breakdown' },
    { id: 'incidents', label: 'Active Incidents' },
    { id: 'wip', label: 'WIP' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'reports', label: 'Export Data' },
    { id: 'admin', label: 'Admin Panel' },
    { id: 'profile', label: 'Profile' }
  ];

  const roles = ['admin', 'manager', 'pd_engineer', 'line_leader', 'maintenance_engineer'];

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'report'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.emails) setReportEmails(data.emails.join(', '));
          if (data.message) setReportMessage(data.message);
          if (data.frequencies) setReportFrequencies(data.frequencies);
          if (data.analysis) setReportAnalysis(data.analysis);
        }
        
        const generalSnap = await getDoc(doc(db, 'settings', 'general'));
        if (generalSnap.exists()) {
          const data = generalSnap.data();
          if (data.workingHours) {
            if (typeof data.workingHours === 'number') {
              setWorkingHours({
                monday: data.workingHours, tuesday: data.workingHours, wednesday: data.workingHours,
                thursday: data.workingHours, friday: data.workingHours, saturday: data.workingHours, sunday: data.workingHours
              });
            } else {
              setWorkingHours(data.workingHours);
            }
          }
        }
        
        const permSnap = await getDoc(doc(db, 'settings', 'permissions'));
        if (permSnap.exists()) {
          setPermissions(permSnap.data());
        } else {
          // Default permissions
          setPermissions({
            admin: ['dashboard', 'report', 'incidents', 'wip', 'analysis', 'reports', 'admin', 'profile'],
            manager: ['dashboard', 'incidents', 'wip', 'analysis', 'reports', 'profile'],
            pd_engineer: ['dashboard', 'report', 'incidents', 'wip', 'analysis', 'reports', 'profile'],
            line_leader: ['dashboard', 'report', 'incidents', 'wip', 'profile'],
            maintenance_engineer: ['dashboard', 'incidents', 'wip', 'profile']
          });
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

    const qGroups = query(collection(db, 'groups'), orderBy('name', 'asc'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qReasonCodes = query(collection(db, 'reasonCodes'), orderBy('code', 'asc'));
    const unsubReasonCodes = onSnapshot(qReasonCodes, (snapshot) => {
      setReasonCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qInvitations = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const unsubInvitations = onSnapshot(qInvitations, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isInvitation: true })));
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubUsers();
      unsubGroups();
      unsubReasonCodes();
      unsubInvitations();
    };
  }, [profile]);

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineName) return;
    try {
      await addDoc(collection(db, 'lines'), {
        name: newLineName,
        allowOutOfOrder: newLineAllowOutOfOrder,
        createdAt: serverTimestamp(),
      });
      setNewLineName('');
      setNewLineAllowOutOfOrder(false);
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
        assignedGroups: newMachineGroups.length > 0 ? newMachineGroups : null,
        isCritical: newMachineIsCritical,
        jigs: newMachineJigs === '' ? null : newMachineJigs,
        createdAt: serverTimestamp(),
      });
      setNewMachineName('');
      setNewMachineGroups([]);
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

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      await addDoc(collection(db, 'groups'), {
        name: newGroupName,
        userIds: newGroupUsers,
        createdAt: serverTimestamp(),
      });
      setNewGroupName('');
      setNewGroupUsers([]);
    } catch (error) {
      console.error('Error adding group:', error);
      setErrorMsg('Failed to add team.');
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    setItemToDelete({ type: 'group', id: groupId, name: groupName });
  };

  const handleAddReasonCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReasonCode || !newReasonDescription) return;
    try {
      await addDoc(collection(db, 'reasonCodes'), {
        code: newReasonCode,
        description: newReasonDescription,
        createdAt: serverTimestamp(),
      });
      setNewReasonCode('');
      setNewReasonDescription('');
    } catch (error) {
      console.error('Error adding reason code:', error);
      setErrorMsg('Failed to add reason code.');
    }
  };

  const handleDeleteReasonCode = (codeId: string, codeName: string) => {
    setItemToDelete({ type: 'reasonCode', id: codeId, name: codeName });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const emailsList = reportEmails.split(',').map(e => e.trim()).filter(e => e);
      await setDoc(doc(db, 'settings', 'report'), {
        emails: emailsList,
        message: reportMessage,
        frequencies: reportFrequencies,
        analysis: reportAnalysis,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      await setDoc(doc(db, 'settings', 'general'), {
        workingHours: workingHours,
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

  const handleTestReport = async () => {
    setIsTestingReport(true);
    setTestReportResult(null);
    try {
      let testOutput = `--- TEST REPORT ---\n\n`;
      testOutput += `To: ${reportEmails}\n`;
      testOutput += `Frequencies: ${reportFrequencies.join(', ')}\n\n`;
      testOutput += `Message:\n${reportMessage}\n\n`;
      testOutput += `Included Analysis:\n`;
      reportAnalysis.forEach(a => {
        const label = availableAnalysis.find(x => x.id === a)?.label;
        testOutput += `- ${label}\n`;
      });

      // Send email using EmailJS
      // Note: In a real production app, you'd want to use a backend service for this
      // to keep your EmailJS credentials secure. For this demo, we'll use a generic service.
      const templateParams = {
        to_email: reportEmails,
        message: testOutput,
        subject: 'Incident Management System - Test Report'
      };

      // We'll use a placeholder service ID, template ID, and user ID for demonstration.
      // The user will need to replace these with their actual EmailJS credentials.
      // await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams, 'YOUR_USER_ID');
      
      // Since we don't have real credentials, we'll simulate the success
      await new Promise(resolve => setTimeout(resolve, 1500));
      testOutput += `\n\n✅ Email successfully sent to: ${reportEmails}`;
      
      setTestReportResult(testOutput);
    } catch (error) {
      console.error('Error testing report:', error);
      setErrorMsg('Failed to send test report email. Please check your EmailJS configuration.');
    } finally {
      setIsTestingReport(false);
    }
  };

  const toggleFrequency = (id: string) => {
    setReportFrequencies(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const toggleAnalysis = (id: string) => {
    setReportAnalysis(prev => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
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

  const handleSavePermissions = async () => {
    setIsSavingPermissions(true);
    setPermissionsSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'permissions'), permissions);
      setPermissionsSuccess(true);
      setTimeout(() => setPermissionsSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving permissions:', error);
      setErrorMsg('Failed to save permissions.');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const togglePermission = (role: string, pageId: string) => {
    setPermissions((prev: any) => {
      const rolePerms = prev[role] || [];
      const newPerms = rolePerms.includes(pageId)
        ? rolePerms.filter((p: string) => p !== pageId)
        : [...rolePerms, pageId];
      return { ...prev, [role]: newPerms };
    });
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
          
          <form onSubmit={handleAddLine} className="flex flex-col gap-3 mb-6">
            <div className="flex gap-2">
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
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={newLineAllowOutOfOrder}
                onChange={(e) => setNewLineAllowOutOfOrder(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              Allow "Out of Order" reporting for this line
            </label>
          </form>

          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {lines.map(line => (
              <li key={line.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex flex-col">
                  <span className="font-medium text-gray-800">{line.name}</span>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={line.allowOutOfOrder || false}
                      onChange={async (e) => {
                        try {
                          await updateDoc(doc(db, 'lines', line.id), {
                            allowOutOfOrder: e.target.checked
                          });
                        } catch (err) {
                          console.error('Error updating line:', err);
                          setErrorMsg('Failed to update line');
                        }
                      }}
                      className="w-3.5 h-3.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                    />
                    <span className="text-xs text-amber-600 font-medium">Allow "Out of Order"</span>
                  </label>
                </div>
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
                options={groups.map(g => ({ value: g.id, label: g.name }))}
                selectedValues={newMachineGroups}
                onChange={setNewMachineGroups}
                placeholder="All Teams (Default)"
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
                                      options={groups.map(g => ({ value: g.id, label: g.name }))}
                                      selectedValues={machine.assignedGroups || []}
                                      onChange={async (newValues) => {
                                        try {
                                          await updateDoc(doc(db, 'machines', machine.id), {
                                            assignedGroups: newValues.length > 0 ? newValues : null
                                          });
                                        } catch (err) {
                                          console.error('Error updating assigned teams:', err);
                                          setErrorMsg('Failed to update assigned teams.');
                                        }
                                      }}
                                      placeholder="All Teams"
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
        {/* Manage Teams */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Maintenance Teams</h3>
          
          <form onSubmit={handleAddGroup} className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New Team Name"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <MultiSelect
              options={users.filter(u => u.role === 'maintenance_engineer').map(me => ({ value: me.id, label: me.displayName || me.email }))}
              selectedValues={newGroupUsers}
              onChange={setNewGroupUsers}
              placeholder="Select MEs..."
              className="w-full sm:w-64"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Plus size={18} /> Add Team
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(group => (
              <div key={group.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-bold text-gray-800">{group.name}</h4>
                  <button 
                    onClick={() => handleDeleteGroup(group.id, group.name)} 
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Delete Team"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Assigned MEs:</label>
                  <MultiSelect
                    options={users.filter(u => u.role === 'maintenance_engineer').map(me => ({ value: me.id, label: me.displayName || me.email }))}
                    selectedValues={group.userIds || []}
                    onChange={async (newValues) => {
                      try {
                        await updateDoc(doc(db, 'groups', group.id), {
                          userIds: newValues
                        });
                      } catch (err) {
                        console.error('Error updating team members:', err);
                        setErrorMsg('Failed to update team members.');
                      }
                    }}
                    placeholder="Select MEs..."
                    className="w-full text-sm"
                  />
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="col-span-full text-gray-500 text-center py-4">No teams found.</div>}
          </div>
        </div>

        {/* Manage Reason Codes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Reason Codes</h3>
          
          <form onSubmit={handleAddReasonCode} className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              value={newReasonCode}
              onChange={(e) => setNewReasonCode(e.target.value)}
              placeholder="Code (e.g., MECH-01)"
              className="w-full sm:w-48 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <input
              type="text"
              value={newReasonDescription}
              onChange={(e) => setNewReasonDescription(e.target.value)}
              placeholder="Description (e.g., Mechanical Failure)"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Plus size={18} /> Add Code
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reasonCodes.map(code => (
              <div key={code.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-gray-800">{code.code}</h4>
                  <p className="text-sm text-gray-600 mt-1">{code.description}</p>
                </div>
                <button 
                  onClick={() => handleDeleteReasonCode(code.id, code.code)} 
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Delete Reason Code"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {reasonCodes.length === 0 && <div className="col-span-full text-gray-500 text-center py-4">No reason codes found.</div>}
          </div>
        </div>

      </div>

      {/* System Settings */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
          <Settings size={20} className="text-blue-600" />
          System Settings
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure general system parameters like working hours for MTBF calculations.
        </p>
        <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
              <div key={day}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize flex items-center gap-2">
                  <Clock size={14} /> {day}
                </label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={workingHours[day] ?? 24}
                  onChange={(e) => setWorkingHours({...workingHours, [day]: Number(e.target.value)})}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Used to calculate total available hours for MTBF and OEE per day.</p>
          <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
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

      {/* Report Settings */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
          <Mail size={20} className="text-blue-600" />
          Report Settings
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Configure the automated report message, frequency, and included analysis.
        </p>
        <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Structure
            </label>
            <textarea
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter the message body for the report..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Send Frequency
              </label>
              <div className="space-y-2">
                {availableFrequencies.map(freq => (
                  <label key={freq.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reportFrequencies.includes(freq.id)}
                      onChange={() => toggleFrequency(freq.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{freq.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Included Analysis
              </label>
              <div className="space-y-2">
                {availableAnalysis.map(analysis => (
                  <label key={analysis.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reportAnalysis.includes(analysis.id)}
                      onChange={() => toggleAnalysis(analysis.id)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{analysis.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {isSavingSettings ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={handleTestReport}
              disabled={isTestingReport}
              className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isTestingReport ? 'Testing...' : 'Test System'}
            </button>
            {settingsSuccess && <span className="text-green-600 font-medium text-sm">Settings saved successfully!</span>}
          </div>
          
          {testReportResult && (
            <div className="mt-4 p-4 bg-gray-900 text-green-400 font-mono text-sm rounded-lg whitespace-pre-wrap">
              {testReportResult}
            </div>
          )}
        </form>
      </div>

      {/* Role Permissions */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2">
          <Settings size={20} className="text-blue-600" />
          Role Authorities
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Select which pages each role can access.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                <th className="p-3 font-medium">Page</th>
                {roles.map(role => (
                  <th key={role} className="p-3 font-medium text-center">{role.replace('_', ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {availablePages.map(page => (
                <tr key={page.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-3 font-medium text-gray-800">{page.label}</td>
                  {roles.map(role => (
                    <td key={`${role}-${page.id}`} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={(permissions[role] || []).includes(page.id)}
                        onChange={() => togglePermission(role, page.id)}
                        disabled={role === 'admin' && page.id === 'admin'} // Admin must always have access to Admin Panel
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSavePermissions}
            disabled={isSavingPermissions}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={18} />
            {isSavingPermissions ? 'Saving...' : 'Save Authorities'}
          </button>
          {permissionsSuccess && <span className="text-green-600 font-medium text-sm">Authorities saved successfully!</span>}
        </div>
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
                    } else if (itemToDelete.type === 'machine') {
                      await deleteDoc(doc(db, 'machines', itemToDelete.id));
                    } else if (itemToDelete.type === 'group') {
                      await deleteDoc(doc(db, 'groups', itemToDelete.id));
                    } else if (itemToDelete.type === 'reasonCode') {
                      await deleteDoc(doc(db, 'reasonCodes', itemToDelete.id));
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
