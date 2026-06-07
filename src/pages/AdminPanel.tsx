import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Plus, Trash2, UserCog, GripVertical, Mail, Clock, Save, UserPlus, Crown, Edit2, X, Check, Upload, Image } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { MultiSelect } from '../components/MultiSelect';
import { ProductionHoursModal } from '../components/ProductionHoursModal';

import { DataManagement } from '../components/DataManagement';

export function AdminPanel() {
  const { profile, logoSettings, saveLogoSettings } = useAuth();
  const [lines, setLines] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [reasonCodes, setReasonCodes] = useState<any[]>([]);
  const [evaluationCauses, setEvaluationCauses] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);

  const [localDesktopHeight, setLocalDesktopHeight] = useState(44);
  const [desktopWidthType, setDesktopWidthType] = useState<'auto' | 'custom'>('auto');
  const [localDesktopWidthVal, setLocalDesktopWidthVal] = useState('auto');
  const [localMobileHeight, setLocalMobileHeight] = useState(32);
  const [mobileWidthType, setMobileWidthType] = useState<'auto' | 'custom'>('auto');
  const [localMobileWidthVal, setLocalMobileWidthVal] = useState('auto');
  const [uploadedLogoBase64, setUploadedLogoBase64] = useState<string>('');
  const [isSavingLogo, setIsSavingLogo] = useState(false);
  const [logoSuccess, setLogoSuccess] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string>('');

  useEffect(() => {
    if (logoSettings) {
      setLocalDesktopHeight(logoSettings.desktopHeight ?? 44);
      setDesktopWidthType(logoSettings.desktopWidth === 'auto' ? 'auto' : 'custom');
      setLocalDesktopWidthVal(logoSettings.desktopWidth === 'auto' ? '150' : logoSettings.desktopWidth);
      setLocalMobileHeight(logoSettings.mobileHeight ?? 32);
      setMobileWidthType(logoSettings.mobileWidth === 'auto' ? 'auto' : 'custom');
      setLocalMobileWidthVal(logoSettings.mobileWidth === 'auto' ? '100' : logoSettings.mobileWidth);
      setUploadedLogoBase64(logoSettings.customLogo ?? '');
    }
  }, [logoSettings]);

  const handleSaveLogoSettings = async () => {
    setIsSavingLogo(true);
    setLogoSuccess(false);
    setLogoUploadError('');
    try {
      await saveLogoSettings({
        desktopHeight: localDesktopHeight,
        desktopWidth: desktopWidthType === 'auto' ? 'auto' : localDesktopWidthVal || 'auto',
        mobileHeight: localMobileHeight,
        mobileWidth: mobileWidthType === 'auto' ? 'auto' : localMobileWidthVal || 'auto',
        customLogo: uploadedLogoBase64
      });
      setLogoSuccess(true);
      setTimeout(() => setLogoSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving logo settings:', err);
      setLogoUploadError(err.message || 'Failed to save logo options.');
    } finally {
      setIsSavingLogo(false);
    }
  };

  const [newLineName, setNewLineName] = useState('');
  const [newLineAllowOutOfOrder, setNewLineAllowOutOfOrder] = useState(false);
  const [newLineColor, setNewLineColor] = useState('blue');
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineGroups, setNewMachineGroups] = useState<string[]>([]);
  const [newMachineIsCritical, setNewMachineIsCritical] = useState(false);
  const [newMachineJigs, setNewMachineJigs] = useState<number | ''>('');
  const [selectedLineForMachine, setSelectedLineForMachine] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUsers, setNewGroupUsers] = useState<string[]>([]);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonDescription, setNewReasonDescription] = useState('');
  const [newCauseName, setNewCauseName] = useState('');
  const [itemToDelete, setItemToDelete] = useState<{type: 'line' | 'machine' | 'group' | 'reasonCode' | 'evaluationCause', id: string, name: string} | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineName, setEditingLineName] = useState('');
  const [editingLineColor, setEditingLineColor] = useState('blue');
  const [editingLineAllowOutOfOrder, setEditingLineAllowOutOfOrder] = useState(false);
  
  const lineColors = [
    { value: 'blue', label: 'Blue' },
    { value: 'emerald', label: 'Green' },
    { value: 'purple', label: 'Purple' },
    { value: 'amber', label: 'Amber' },
    { value: 'pink', label: 'Pink' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'rose', label: 'Rose' },
    { value: 'cyan', label: 'Cyan' },
  ];
  
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [editingMachineName, setEditingMachineName] = useState('');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('pending');
  const [isInviting, setIsInviting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{id: string, email: string, isInvitation?: boolean} | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<any>({});
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [permissionsSuccess, setPermissionsSuccess] = useState(false);
  const [isProductionHoursModalOpen, setIsProductionHoursModalOpen] = useState(false);

  const availablePages = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'report', label: 'Report Breakdown' },
    { id: 'line_breakdown_report', label: 'Report Line Issue' },
    { id: 'incidents', label: 'Active Incidents' },
    { id: 'wip', label: 'WIP' },
    { id: 'evaluation', label: 'Evaluation' },
    { id: 'evaluation_analysis', label: 'Evaluation Analysis' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'reports', label: 'Export Data' },
    { id: 'admin', label: 'Admin Panel' },
    { id: 'profile', label: 'Profile' }
  ];

  const [roles, setRoles] = useState<string[]>(['admin', 'manager', 'pd_engineer', 'line_leader', 'maintenance_engineer']);
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    if (profile?.role !== 'admin') return;

    const fetchSettings = async () => {
      try {
        const generalSnap = await getDoc(doc(db, 'settings', 'general'));
        if (generalSnap.exists()) {
          const data = generalSnap.data();
        }
        
        const permSnap = await getDoc(doc(db, 'settings', 'permissions'));
        let perms: any = {};
        if (permSnap.exists()) {
          perms = permSnap.data();
          setPermissions(perms);
        } else {
          // Default permissions
          perms = {
            admin: ['dashboard', 'report', 'line_breakdown_report', 'incidents', 'wip', 'analysis', 'reports', 'admin', 'profile', 'evaluation'],
            manager: ['dashboard', 'incidents', 'wip', 'analysis', 'reports', 'profile', 'evaluation'],
            pd_engineer: ['dashboard', 'report', 'line_breakdown_report', 'incidents', 'wip', 'analysis', 'reports', 'profile', 'evaluation'],
            line_leader: ['dashboard', 'report', 'incidents', 'wip', 'profile', 'evaluation'],
            maintenance_engineer: ['dashboard', 'incidents', 'wip', 'profile']
          };
          setPermissions(perms);
        }

        const defaultRoles = ['admin', 'manager', 'pd_engineer', 'line_leader', 'maintenance_engineer'];
        const allRoles = Array.from(new Set([...defaultRoles, ...Object.keys(perms).filter(k => k !== 'pending')]));
        setRoles(allRoles);
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();

    const qLines = query(collection(db, 'lines'));
    const unsubLines = onSnapshot(qLines, (snapshot) => {
      const fetchedLines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedLines.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      });
      setLines(fetchedLines);
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

    const qGroups = query(collection(db, 'groups'));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sorted.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
      setGroups(sorted);
    });

    const qReasonCodes = query(collection(db, 'reasonCodes'));
    const unsubReasonCodes = onSnapshot(qReasonCodes, (snapshot) => {
      const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sorted.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.code || '').localeCompare(b.code || '');
      });
      setReasonCodes(sorted);
    });

    const qInvitations = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const unsubInvitations = onSnapshot(qInvitations, (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isInvitation: true })));
    });

    const qCauses = query(collection(db, 'evaluationCauses'));
    const unsubCauses = onSnapshot(qCauses, (snapshot) => {
      const sorted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sorted.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0);
      });
      setEvaluationCauses(sorted);
    });

    return () => {
      unsubLines();
      unsubMachines();
      unsubUsers();
      unsubGroups();
      unsubReasonCodes();
      unsubInvitations();
      unsubCauses();
    };
  }, [profile]);

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineName) return;
    try {
      await addDoc(collection(db, 'lines'), {
        name: newLineName,
        allowOutOfOrder: newLineAllowOutOfOrder,
        colorCode: newLineColor,
        createdAt: serverTimestamp(),
      });
      setNewLineName('');
      setNewLineAllowOutOfOrder(false);
      setNewLineColor('blue');
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

  const handleUpdateLine = async (id: string) => {
    if (!editingLineName.trim()) return;
    try {
      await updateDoc(doc(db, 'lines', id), {
        name: editingLineName.trim(),
        colorCode: editingLineColor
      });
      setEditingLineId(null);
    } catch (err) {
      console.error('Error updating line:', err);
      setErrorMsg('Failed to update line');
    }
  };

  const handleUpdateMachineName = async (id: string) => {
    if (!editingMachineName.trim()) return;
    try {
      await updateDoc(doc(db, 'machines', id), {
        name: editingMachineName.trim()
      });
      setEditingMachineId(null);
    } catch (err) {
      console.error('Error updating machine name:', err);
      setErrorMsg('Failed to update machine name');
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
      const nextOrder = groups.length > 0 ? Math.max(...groups.map(g => g.order || 0)) + 1 : 0;
      await addDoc(collection(db, 'groups'), {
        name: newGroupName,
        userIds: newGroupUsers,
        order: nextOrder,
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
      const nextOrder = reasonCodes.length > 0 ? Math.max(...reasonCodes.map(rc => rc.order || 0)) + 1 : 0;
      await addDoc(collection(db, 'reasonCodes'), {
        code: newReasonCode,
        description: newReasonDescription,
        order: nextOrder,
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

  const handleAddEvaluationCause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCauseName) return;
    try {
      const nextOrder = evaluationCauses.length > 0 ? Math.max(...evaluationCauses.map(ec => ec.order || 0)) + 1 : 0;
      await addDoc(collection(db, 'evaluationCauses'), {
        name: newCauseName,
        order: nextOrder,
        createdAt: serverTimestamp(),
      });
      setNewCauseName('');
    } catch (error) {
      console.error('Error adding cause:', error);
      setErrorMsg('Failed to add cause.');
    }
  };

  const handleDeleteEvaluationCause = (causeId: string, causeName: string) => {
    setItemToDelete({ type: 'evaluationCause', id: causeId, name: causeName });
  };

  const handleDragEndLines = async (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(lines);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setLines(items);
    
    try {
      const promises = items.map((item, index) => 
        updateDoc(doc(db, 'lines', item.id), { order: index })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error updating line order:', error);
      setErrorMsg('Failed to update line order.');
    }
  };

  const handleDragEndGroups = async (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(groups);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setGroups(items);
    
    try {
      const promises = items.map((item, index) => 
        updateDoc(doc(db, 'groups', item.id), { order: index })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error updating group order:', error);
      setErrorMsg('Failed to update team order.');
    }
  };

  const handleDragEndReasonCodes = async (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(reasonCodes);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setReasonCodes(items);
    
    try {
      const promises = items.map((item, index) => 
        updateDoc(doc(db, 'reasonCodes', item.id), { order: index })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error updating reason code order:', error);
      setErrorMsg('Failed to update reason code order.');
    }
  };

  const handleDragEndEvaluationCauses = async (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(evaluationCauses);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setEvaluationCauses(items);
    
    try {
      const promises = items.map((item, index) => 
        updateDoc(doc(db, 'evaluationCauses', item.id), { order: index })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error updating evaluation cause order:', error);
      setErrorMsg('Failed to update evaluation cause order.');
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
      const response = await window.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
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
      let errorMsg = typeof error === 'string' ? error : (error.message || 'Failed to invite user.');
      
      if (errorMsg.includes('EMAIL_EXISTS')) {
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
          setErrorMsg(errorMsg);
        }
      } else {
        console.error('Error inviting user:', error);
        
        if (errorMsg.includes('OPERATION_NOT_ALLOWED')) {
          errorMsg = 'Email/Password sign-in is not enabled in Firebase. Please enable it in the Firebase Console (Authentication > Sign-in method).';
        } else if (errorMsg.includes('WEAK_PASSWORD')) {
          errorMsg = 'The password must be at least 6 characters long.';
        }
        
        setErrorMsg(errorMsg);
      }
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

  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!sanitized) return;
    if (roles.includes(sanitized) || sanitized === 'pending') {
      setErrorMsg('Role already exists.');
      return;
    }
    
    // Add to local state first
    setRoles(prev => [...prev, sanitized]);
    setPermissions(prev => ({
      ...prev,
      [sanitized]: ['dashboard', 'profile'] // Standard default permissions
    }));
    setNewRoleName('');
  };

  const confirmDeleteRole = (role: string) => {
    const defaultRoles = ['admin', 'manager', 'pd_engineer', 'line_leader', 'maintenance_engineer'];
    if (defaultRoles.includes(role)) {
      setErrorMsg('Standard system roles cannot be deleted.');
      return;
    }
    setRoleToDelete(role);
  };

  const handleDeleteRoleSubmit = async () => {
    if (!roleToDelete) return;
    
    try {
      const updatedPerms = { ...permissions };
      delete updatedPerms[roleToDelete];
      
      await setDoc(doc(db, 'settings', 'permissions'), updatedPerms);
      
      setPermissions(updatedPerms);
      setRoles(prev => prev.filter(r => r !== roleToDelete));
      setRoleToDelete(null);
    } catch (err) {
      console.error('Error deleting custom role:', err);
      setErrorMsg('Failed to delete custom role.');
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

  const handleGlobalDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceId = result.source.droppableId;
    if (sourceId === 'lines-list') {
      return handleDragEndLines(result);
    }
    if (sourceId === 'groups-list') {
      return handleDragEndGroups(result);
    }
    if (sourceId === 'reason-codes-list') {
      return handleDragEndReasonCodes(result);
    }
    if (sourceId === 'evaluation-causes-list') {
      return handleDragEndEvaluationCauses(result);
    }
    return handleDragEnd(result);
  };

  return (
    <DragDropContext onDragEnd={handleGlobalDragEnd}>
      <div className="space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-gray-100 text-gray-800 rounded-2xl shadow-sm">
              <Settings size={28} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Admin Panel</h2>
              <p className="text-sm text-gray-500 mt-1">Manage system configurations, teams, and users</p>
            </div>
          </div>
          <button
            onClick={() => setIsProductionHoursModalOpen(true)}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Clock size={20} />
            Manage Production Hours
          </button>
        </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Manage Lines */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Production Lines</h3>
          
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
              <select
                value={newLineColor}
                onChange={(e) => setNewLineColor(e.target.value)}
                className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[120px]"
              >
                {lineColors.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
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

          <Droppable droppableId="lines-list">
              {(provided) => (
                <ul 
                  className="space-y-2 max-h-64 overflow-y-auto"
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {lines.map((line, index) => (
                    <Draggable key={line.id} draggableId={line.id} index={index}>
                      {(provided) => (
                        <li 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100"
                        >
                          <div {...provided.dragHandleProps} className="mr-3 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                            <GripVertical size={20} />
                          </div>
                          <div className="flex flex-col flex-1 mr-4">
                            {editingLineId === line.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingLineName}
                                  onChange={(e) => setEditingLineName(e.target.value)}
                                  className="flex-1 p-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateLine(line.id);
                                    if (e.key === 'Escape') setEditingLineId(null);
                                  }}
                                />
                                <select
                                  value={editingLineColor}
                                  onChange={(e) => setEditingLineColor(e.target.value)}
                                  className="p-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                                >
                                  {lineColors.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                                <button onClick={() => handleUpdateLine(line.id)} className="text-green-600 hover:text-green-700 p-1">
                                  <Check size={16} />
                                </button>
                                <button onClick={() => setEditingLineId(null)} className="text-gray-500 hover:text-gray-700 p-1">
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full bg-${line.colorCode || 'blue'}-500`}></div>
                                  {line.name}
                                </span>
                                <button 
                                  onClick={() => {
                                    setEditingLineId(line.id);
                                    setEditingLineName(line.name);
                                    setEditingLineColor(line.colorCode || 'blue');
                                  }} 
                                  className="text-gray-400 hover:text-blue-600 p-1"
                                >
                                  <Edit2 size={14} />
                                </button>
                              </div>
                            )}
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
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {lines.length === 0 && <li className="text-gray-500 text-center py-4">No lines found.</li>}
                </ul>
              )}
            </Droppable>
        </div>

        {/* Manage Machines */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Machines</h3>
          
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
                                  <div className="flex items-center gap-3 flex-1">
                                    <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                                      <GripVertical size={18} />
                                    </div>
                                    {editingMachineId === machine.id ? (
                                      <div className="flex items-center gap-2 flex-1 max-w-xs">
                                        <input
                                          type="text"
                                          value={editingMachineName}
                                          onChange={(e) => setEditingMachineName(e.target.value)}
                                          className="flex-1 p-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleUpdateMachineName(machine.id);
                                            if (e.key === 'Escape') setEditingMachineId(null);
                                          }}
                                        />
                                        <button onClick={() => handleUpdateMachineName(machine.id)} className="text-green-600 hover:text-green-700 p-1">
                                          <Check size={16} />
                                        </button>
                                        <button onClick={() => setEditingMachineId(null)} className="text-gray-500 hover:text-gray-700 p-1">
                                          <X size={16} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-800">{machine.name}</span>
                                        <button 
                                          onClick={() => {
                                            setEditingMachineId(machine.id);
                                            setEditingMachineName(machine.name);
                                          }} 
                                          className="text-gray-400 hover:text-blue-600 p-1"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                      </div>
                                    )}
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
        </div>
        {/* Manage Teams */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Teams</h3>
          
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
              options={users.filter(u => u.role !== 'admin').map(u => ({ value: u.id, label: u.displayName || u.email }))}
              selectedValues={newGroupUsers}
              onChange={setNewGroupUsers}
              placeholder="Select PIC..."
              className="w-full sm:w-64"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Plus size={18} /> Add Team
            </button>
          </form>

          <Droppable droppableId="groups-list">
              {(provided) => (
                <ul
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2 max-h-96 overflow-y-auto pr-2"
                >
                  {groups.map((group, index) => (
                    <Draggable key={group.id} draggableId={group.id} index={index}>
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors ${
                            snapshot.isDragging ? 'shadow-lg ring-1 ring-blue-500 bg-white z-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div
                              {...provided.dragHandleProps}
                              className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing p-1"
                            >
                              <GripVertical size={20} />
                            </div>
                            <div className="flex items-center gap-2">
                              {editingGroupId === group.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={editGroupName}
                                    onChange={(e) => setEditGroupName(e.target.value)}
                                    className="p-1 border border-gray-300 rounded text-sm w-40"
                                    autoFocus
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter' && editGroupName.trim()) {
                                        try {
                                          await updateDoc(doc(db, 'groups', group.id), { name: editGroupName.trim() });
                                          setEditingGroupId(null);
                                        } catch (err) { }
                                      } else if (e.key === 'Escape') {
                                        setEditingGroupId(null);
                                      }
                                    }}
                                  />
                                  <button onClick={async () => {
                                    if (editGroupName.trim()) {
                                       await updateDoc(doc(db, 'groups', group.id), { name: editGroupName.trim() });
                                       setEditingGroupId(null);
                                    }
                                  }} className="text-green-600 p-1"><Save size={16}/></button>
                                  <button onClick={() => setEditingGroupId(null)} className="text-gray-500 p-1"><X size={16}/></button>
                                </div>
                              ) : (
                                <>
                                  <h4 className="font-bold text-gray-800 select-none">{group.name}</h4>
                                  <button onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); }} className="text-blue-500 hover:text-blue-700 p-1">
                                    <Edit2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-1 w-full sm:w-auto justify-end flex-wrap">
                            <div className="flex flex-col flex-1 sm:flex-none sm:min-w-[120px]">
                                <label className="block text-xs font-medium text-gray-500 mb-1 truncate" title="Show in Out of Order popup">Show in OOO Visibility:</label>
                                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2.5 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors h-[38px]">
                                  <input
                                    type="checkbox"
                                    checked={!!group.showInOutofOrder}
                                    onChange={async (e) => {
                                      try {
                                        await updateDoc(doc(db, 'groups', group.id), {
                                          showInOutofOrder: e.target.checked
                                        });
                                      } catch (err) {
                                        console.error('Error updating team settings:', err);
                                        setErrorMsg('Failed to update team settings.');
                                      }
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className="text-sm font-medium text-gray-700 select-none">Visible</span>
                                </label>
                            </div>
                            <div className="w-full sm:max-w-xs text-sm flex-1">
                              <label className="block text-xs font-medium text-gray-500 mb-1">Assigned PIC:</label>
                              <MultiSelect
                                options={users.filter(u => u.role !== 'admin').map(u => ({ value: u.id, label: u.displayName || u.email }))}
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
                                placeholder="Select PIC..."
                                className="w-full text-sm bg-white"
                              />
                            </div>
                            <div className="flex flex-col pt-5">
                              <button
                                onClick={() => handleDeleteGroup(group.id, group.name)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg border border-transparent hover:border-red-200 bg-white shadow-sm h-[38px] flex items-center justify-center transition-colors"
                                title="Delete Team"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {groups.length === 0 && <li className="text-gray-500 text-center py-4">No teams found.</li>}
                </ul>
              )}
            </Droppable>
        </div>

        {/* Manage Reason Codes */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Reason Codes</h3>
          
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

          <Droppable droppableId="reason-codes-list">
              {(provided) => (
                <ul
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2 max-h-96 overflow-y-auto pr-2"
                >
                  {reasonCodes.map((code, index) => (
                    <Draggable key={code.id} draggableId={code.id} index={index}>
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors ${
                            snapshot.isDragging ? 'shadow-lg ring-1 ring-blue-500 bg-white z-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              {...provided.dragHandleProps}
                              className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing p-1"
                            >
                              <GripVertical size={20} />
                            </div>
                            <div>
                              <span className="inline-block px-2.5 py-1 text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 rounded mr-2">
                                {code.code}
                              </span>
                              <span className="text-gray-700 font-medium">{code.description}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteReasonCode(code.id, code.code)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded border border-transparent hover:border-red-200 bg-white shadow-sm"
                            title="Delete Reason Code"
                          >
                            <Trash2 size={18} />
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {reasonCodes.length === 0 && <li className="text-gray-500 text-center py-4">No reason codes found.</li>}
                </ul>
              )}
            </Droppable>
        </div>

        {/* Manage Evaluation Causes */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">Evaluation Causes</h3>
          
          <form onSubmit={handleAddEvaluationCause} className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              value={newCauseName}
              onChange={(e) => setNewCauseName(e.target.value)}
              placeholder="Cause (e.g., Good Performance, Late)"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Plus size={18} /> Add Cause
            </button>
          </form>

          <Droppable droppableId="evaluation-causes-list">
              {(provided) => (
                <ul
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2 max-h-96 overflow-y-auto pr-2"
                >
                  {evaluationCauses.map((cause, index) => (
                    <Draggable key={cause.id} draggableId={cause.id} index={index}>
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors ${
                            snapshot.isDragging ? 'shadow-lg ring-1 ring-blue-500 bg-white z-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              {...provided.dragHandleProps}
                              className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing p-1"
                            >
                              <GripVertical size={20} />
                            </div>
                            <span className="font-medium text-gray-800 select-none">{cause.name}</span>
                          </div>

                          <button
                            onClick={() => handleDeleteEvaluationCause(cause.id, cause.name)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded border border-transparent hover:border-red-200 bg-white shadow-sm"
                            title="Delete Evaluation Cause"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {evaluationCauses.length === 0 && <li className="text-gray-500 text-center py-4">No evaluation causes found.</li>}
                </ul>
              )}
            </Droppable>
        </div>

      </div>

      {/* Role Permissions */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4 flex items-center gap-2">
          <Settings size={20} className="text-blue-600" />
          Role Authorities
        </h3>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <p className="text-sm text-gray-600">
            Select which pages each role can access. System roles are preserved. Add custom roles and configure their authorities.
          </p>
          <form onSubmit={handleAddRole} className="flex gap-2 max-w-sm w-full">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Add New Role (e.g. Inspector)"
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus size={16} /> Add Role
            </button>
          </form>
        </div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider border-b border-gray-200">
                <th className="p-3 font-medium">Page</th>
                {roles.map(role => {
                  const isDefaultRole = ['admin', 'manager', 'pd_engineer', 'line_leader', 'maintenance_engineer'].includes(role);
                  return (
                    <th key={role} className="p-3 font-medium text-center">
                      <div className="flex items-center justify-center gap-1.5 min-w-[125px]">
                        {editingRoleId === role ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editRoleName}
                              onChange={(e) => setEditRoleName(e.target.value)}
                              className="p-1 border border-gray-300 rounded text-sm w-24"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setPermissions((prev: any) => ({
                                    ...prev,
                                    _displayNames: { ...(prev._displayNames || {}), [role]: editRoleName.trim() }
                                  }));
                                  setEditingRoleId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingRoleId(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                setPermissions((prev: any) => ({
                                  ...prev,
                                  _displayNames: { ...(prev._displayNames || {}), [role]: editRoleName.trim() }
                                }));
                                setEditingRoleId(null);
                              }}
                              className="text-green-600 hover:text-green-800"
                            >
                              <Save size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="capitalize">{permissions._displayNames?.[role] || role.replace(/_/g, ' ')}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRoleId(role);
                                setEditRoleName(permissions._displayNames?.[role] || role.replace(/_/g, ' '));
                              }}
                              className="text-blue-500 hover:text-blue-700 p-1"
                            >
                              <Edit2 size={12} />
                            </button>
                            {!isDefaultRole && (
                              <button
                                type="button"
                                onClick={() => confirmDeleteRole(role)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                title="Delete custom role"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </th>
                  );
                })}
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

      {/* Logo Configuration */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4 flex items-center gap-2">
          <Settings size={20} className="text-blue-600" />
          Logo Settings & Brand Assets
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Upload your organization's logo file and customize its proportions across devices. Proportional values are dynamically synced in real-time.
        </p>

        {/* Upload Logo File */}
        <div className="mb-8 p-6 bg-gray-50 border border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-center relative group hover:border-blue-500 transition-colors">
          {uploadedLogoBase64 ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Logo Live Preview</p>
              <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-xs inline-flex items-center justify-center min-h-[90px]">
                <img 
                  src={uploadedLogoBase64} 
                  alt="App Logo" 
                  className="max-h-20 max-w-xs object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadedLogoBase64('')}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  Restore Default Logo
                </button>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer space-y-2 py-4 px-6 flex flex-col items-center justify-center w-full">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-full group-hover:bg-blue-100 transition-colors">
                <Upload size={24} />
              </div>
              <div>
                <span className="text-sm font-semibold text-blue-600 hover:text-blue-700">Click to upload brand logo</span>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG, SVG, or WebP (max 800KB)</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 800 * 1024) {
                    setLogoUploadError('Image is too large. Please select an image under 800KB.');
                    return;
                  }
                  setLogoUploadError('');
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    if (event.target?.result) {
                      setUploadedLogoBase64(event.target.result as string);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
            </label>
          )}
          {logoUploadError && (
            <p className="text-xs font-medium text-red-600 mt-2 bg-red-50 px-3 py-1 rounded-full border border-red-100">
              {logoUploadError}
            </p>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Desktop Sizing */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h4 className="font-bold text-gray-800 text-sm">Desktop View (Sidebar)</h4>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Height: {localDesktopHeight}px
              </label>
              <input
                type="range"
                min="20"
                max="120"
                value={localDesktopHeight}
                onChange={(e) => setLocalDesktopHeight(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>20px</span>
                <span>120px</span>
              </div>
            </div>
            <div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="desktopWidthType"
                    checked={desktopWidthType === 'auto'}
                    onChange={() => setDesktopWidthType('auto')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Auto Width
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="desktopWidthType"
                    checked={desktopWidthType === 'custom'}
                    onChange={() => setDesktopWidthType('custom')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Custom Width (px)
                </label>
              </div>
              {desktopWidthType === 'custom' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={localDesktopWidthVal}
                    onChange={(e) => setLocalDesktopWidthVal(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 150"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile Sizing */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h4 className="font-bold text-gray-800 text-sm">Mobile View (Header)</h4>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Height: {localMobileHeight}px
              </label>
              <input
                type="range"
                min="16"
                max="80"
                value={localMobileHeight}
                onChange={(e) => setLocalMobileHeight(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>16px</span>
                <span>80px</span>
              </div>
            </div>
            <div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mobileWidthType"
                    checked={mobileWidthType === 'auto'}
                    onChange={() => setMobileWidthType('auto')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Auto Width
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mobileWidthType"
                    checked={mobileWidthType === 'custom'}
                    onChange={() => setMobileWidthType('custom')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Custom Width (px)
                </label>
              </div>
              {mobileWidthType === 'custom' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={localMobileWidthVal}
                    onChange={(e) => setLocalMobileWidthVal(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 120"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveLogoSettings}
            disabled={isSavingLogo}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={18} />
            {isSavingLogo ? 'Saving Brand...' : 'Save Settings'}
          </button>
          {logoSuccess && <span className="text-green-600 font-medium text-sm">Logo and dimension settings saved successfully!</span>}
          {logoUploadError && <span className="text-red-600 font-medium text-sm">{logoUploadError}</span>}
        </div>
      </div>

      {/* Manage Users */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
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
                      {permissions._displayNames?.[u.role] || u.role.replace(/_/g, ' ')}
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
                      className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm capitalize"
                      disabled={u.email === 'essam.bn@yahoo.com' || u.email === 'cron@sharestate.com'} // Prevent changing main admin
                    >
                      <option value="pending">Pending</option>
                      {roles.map(r => (
                        <option key={r} value={r}>{permissions._displayNames?.[r] || r.replace(/_/g, ' ')}</option>
                      ))}
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

      <DataManagement />

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
                    } else if (itemToDelete.type === 'evaluationCause') {
                      await deleteDoc(doc(db, 'evaluationCauses', itemToDelete.id));
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

      {/* Delete Custom Role Confirmation Modal */}
      {roleToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Role Deletion</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete the custom role <strong>{permissions._displayNames?.[roleToDelete] || roleToDelete.replace(/_/g, ' ')}</strong>? Custom authorities for this role will be removed. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRoleToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRoleSubmit}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete Role
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
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 capitalize"
                >
                  <option value="pending">Pending</option>
                  {roles.map(r => (
                    <option key={r} value={r}>{permissions._displayNames?.[r] || r.replace(/_/g, ' ')}</option>
                  ))}
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

      <ProductionHoursModal
        isOpen={isProductionHoursModalOpen}
        onClose={() => setIsProductionHoursModalOpen(false)}
        lines={lines}
      />
      </div>
    </DragDropContext>
  );
}
