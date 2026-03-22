import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function createCronUser() {
  try {
    const email = 'cron@sharestate.com';
    const password = 'CronPassword123!';
    await createUserWithEmailAndPassword(auth, email, password);
    console.log('Cron user created successfully');
  } catch (error) {
    console.error('Error creating cron user:', error);
  }
  process.exit(0);
}

createCronUser();
