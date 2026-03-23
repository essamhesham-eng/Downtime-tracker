import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'admin' | 'manager' | 'engineer' | 'line_leader' | 'maintenance_engineer' | 'pending';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status?: 'invited' | 'active';
  createdAt: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithEmail, signOut }}>
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
