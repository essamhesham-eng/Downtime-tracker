import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useAlarmNotification() {
  const { profile, user } = useAuth();
  const notifiedIntervals = useRef<Record<string, number>>({});
  const [activeAlarm, setActiveAlarm] = useState<{ message: string; id: string } | null>(null);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubGroups = onSnapshot(collection(db, 'groups'), snapshot => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubGroups();
  }, [user]);

  useEffect(() => {
    if (profile?.role !== 'maintenance_engineer' && profile?.role !== 'admin') return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const q = query(
      collection(db, 'incidents'),
      where('status', 'in', ['open', 'acknowledged'])
    );

    let currentIncidents: any[] = [];

    const playAlarm = (incident: any, duration: number) => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
          osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.2); // C#6
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        }
      } catch (e) {
        console.error('Audio play failed', e);
      }

      const message = `${incident.machineName} on ${incident.lineName} has been down for ${duration} minutes!`;

      // Fix for "Failed to construct 'Notification': Illegal constructor"
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          // Try standard constructor first
          new Notification('Machine Breakdown Alarm', {
            body: message,
            icon: '/vite.svg'
          });
        } catch (e) {
          // Fallback to Service Worker if constructor fails
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification('Machine Breakdown Alarm', {
                body: message,
                icon: '/vite.svg'
              });
            }).catch(swErr => {
              console.error('Service Worker notification failed', swErr);
            });
          } else {
            console.error('Notification failed and no service worker available', e);
          }
        }
      }

      setActiveAlarm({ message, id: Date.now().toString() });
      setTimeout(() => setActiveAlarm(null), 10000); // Hide toast after 10s
    };

    const checkAlarms = () => {
      const now = new Date();
      currentIncidents.forEach(incident => {
        if (incident.type === 'out_of_order') return; // Don't notify MEs for out of order

        if (profile?.role === 'maintenance_engineer' && user) {
          const hasGroups = incident.assignedGroups && incident.assignedGroups.length > 0;
          const hasIndividuals = incident.assignedTo && incident.assignedTo.length > 0;
          
          if (hasGroups || hasIndividuals) {
            const userGroups = groups.filter(g => g.userIds?.includes(user.uid));
            const inGroup = hasGroups && userGroups.some(g => incident.assignedGroups.includes(g.id));
            const isIndividual = hasIndividuals && incident.assignedTo.includes(user.uid);
            
            if (!inGroup && !isIndividual) {
              return; // Not assigned to this user or their groups
            }
          }
        }

        const start = incident.startTime?.toDate ? incident.startTime.toDate() : new Date(incident.startTime);
        const duration = Math.ceil((now.getTime() - start.getTime()) / 60000);
        
        // Notify at 0, 5, 10, 15... minutes
        const interval = Math.floor(duration / 5);
        
        if (notifiedIntervals.current[incident.id] !== interval) {
          playAlarm(incident, duration);
          notifiedIntervals.current[incident.id] = interval;
        }
      });
    };

    const unsub = onSnapshot(q, (snapshot) => {
      currentIncidents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      checkAlarms();
    });

    const timer = setInterval(checkAlarms, 30000); // Check every 30 seconds

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [profile, user, groups]);

  return { activeAlarm, setActiveAlarm };
}
