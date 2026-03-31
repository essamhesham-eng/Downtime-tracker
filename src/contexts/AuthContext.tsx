import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'admin' | 'manager' | 'pd_engineer' | 'line_leader' | 'maintenance_engineer' | 'pending';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status?: 'invited' | 'active';
  createdAt: any;
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
    let unsub: (() => void) | undefined;
    let isMounted = true;
    import('firebase/firestore').then(({ onSnapshot, doc }) => {
      if (!isMounted) return;
      unsub = onSnapshot(doc(db, 'settings', 'permissions'), (snapshot) => {
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
    });
    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            
            // If user was invited and logs in, update status to active
            if (data.status === 'invited') {
              await updateDoc(userDocRef, { status: 'active' });
              data.status = 'active';
            }
            
            setProfile(data);
          } else {
            // Check if there is an invitation for this email
            let assignedRole: UserRole = 'pending';
            let assignedDisplayName = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'User');
            
            if (currentUser.email) {
              try {
                const inviteDocRef = doc(db, 'invitations', currentUser.email.toLowerCase());
                const inviteDoc = await getDoc(inviteDocRef);
                
                if (inviteDoc.exists()) {
                  const inviteData = inviteDoc.data();
                  assignedRole = inviteData.role as UserRole;
                  if (inviteData.displayName) {
                    assignedDisplayName = inviteData.displayName;
                  }
                  // Delete the invitation since it's been claimed
                  await deleteDoc(inviteDocRef);
                }
              } catch (inviteErr) {
                console.error("Error checking invitation:", inviteErr);
              }
            }

            // Create new user profile
            const isFirstUser = currentUser.email === 'essam.bn@yahoo.com';
            if (isFirstUser) assignedRole = 'admin';
            
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: assignedDisplayName,
              role: assignedRole,
              status: 'active',
              createdAt: serverTimestamp(),
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error signing in with email:", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error signing up with email:", error);
      throw error;
    }
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
