import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'admin' | 'manager' | 'pd_engineer' | 'line_leader' | 'maintenance_engineer' | 'pending';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status?: 'invited' | 'active';
  createdAt: any;
  lastActive?: any;
}

export interface RolePermissions {
  [role: string]: string[];
}

export const DEFAULT_PERMISSIONS: RolePermissions = {
  admin: ['dashboard', 'report', 'incidents', 'analysis', 'reports', 'admin', 'profile', 'wip'],
  manager: ['dashboard', 'incidents', 'analysis', 'reports', 'profile', 'wip'],
  pd_engineer: ['dashboard', 'report', 'incidents', 'analysis', 'reports', 'profile', 'wip'],
  line_leader: ['dashboard', 'report', 'incidents', 'profile', 'wip'],
  maintenance_engineer: ['dashboard', 'incidents', 'profile', 'wip'],
  pending: []
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  permissions: RolePermissions;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    if (!user) {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }
    
    const unsub = onSnapshot(doc(db, 'settings', 'permissions'), (snapshot) => {
      if (snapshot.exists()) {
        const dbPerms = snapshot.data();
        // Ensure admin always has access to admin panel and wip if they were added later
        if (dbPerms.admin) {
          if (!dbPerms.admin.includes('admin')) dbPerms.admin.push('admin');
          if (!dbPerms.admin.includes('wip')) dbPerms.admin.push('wip');
        }
        setPermissions({ ...DEFAULT_PERMISSIONS, ...dbPerms });
      } else {
        setPermissions(DEFAULT_PERMISSIONS);
      }
    });

    return () => {
      unsub();
    };
  }, [user]);

  useEffect(() => {
    let profileUnsub: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = undefined;
      }

      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        
        profileUnsub = onSnapshot(userDocRef, { includeMetadataChanges: true }, async (userDoc: any) => {
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            
            // If user was invited and logs in, update status to active
            // Fire and forget the update to avoid blocking the UI load
            if (data.status === 'invited') {
              updateDoc(userDocRef, { status: 'active', lastActive: serverTimestamp() }).catch(console.error);
              data.status = 'active';
            } else {
              // Only update lastActive occasionally to avoid infinite loops with onSnapshot
              // We already have a 5-minute interval for this below
            }
            
            setProfile(data);
            setLoading(false);
          } else {
            // If we are offline and don't have the user cached, wait for the server.
            // Otherwise, we might incorrectly assume the user doesn't exist and try to create them,
            // which fails because we are offline.
            if (userDoc.metadata.fromCache) {
              return;
            }

            // User document doesn't exist yet, let's check for an invitation
            try {
              let assignedRole: UserRole = 'pending';
              let assignedDisplayName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User');
              let hasInvitation = false;
              
              if (currentUser.email) {
                const inviteDocRef = doc(db, 'invitations', currentUser.email.toLowerCase());
                const inviteDoc = await getDoc(inviteDocRef);
                
                if (inviteDoc.exists()) {
                  hasInvitation = true;
                  const inviteData = inviteDoc.data();
                  assignedRole = inviteData.role as UserRole;
                  if (inviteData.displayName) {
                    assignedDisplayName = inviteData.displayName;
                  }
                  // Delete the invitation since it's been claimed
                  deleteDoc(inviteDocRef).catch(console.error);
                }
              }

              const isFirstUser = currentUser.email === 'essam.bn@yahoo.com';

              if (!hasInvitation && !isFirstUser) {
                // User has no profile, no invitation, and is not admin.
                // This happens if they were deleted by admin.
                await firebaseSignOut(auth);
                setProfile(null);
                setUser(null);
                setLoading(false);
                return;
              }

              if (isFirstUser) assignedRole = 'admin';
              
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                displayName: assignedDisplayName,
                role: assignedRole,
                status: 'active',
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp(),
              };
              
              // This will trigger the snapshot again, which will then set the profile and loading=false
              await setDoc(userDocRef, newProfile);
            } catch (error) {
              console.error("Error creating user profile:", error);
              await firebaseSignOut(auth);
              setProfile(null);
              setUser(null);
              setLoading(false);
            }
          }
        }, (error) => {
          console.error("Error listening to user profile:", error);
          firebaseSignOut(auth).catch(console.error);
          setProfile(null);
          setUser(null);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Update lastActive every 5 minutes while the app is open
    const interval = setInterval(async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { lastActive: serverTimestamp() });
      } catch (error) {
        console.error("Error updating lastActive:", error);
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, permissions, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
