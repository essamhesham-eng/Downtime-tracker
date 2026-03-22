import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function setCronAdmin() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'cron@sharestate.com', 'CronPassword123!');
    // Wait, the user can't write to users collection unless they are an admin.
    // But I can't write to users collection because I'm not an admin yet.
    // How do I make this user an admin?
    // The rules say: allow create: if isAuthenticated() && isOwner(userId) && isValidUser(request.resource.data) && (request.resource.data.role == 'pending' || isAdmin());
    // So I can create myself as 'pending', but not 'admin'.
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

setCronAdmin();
