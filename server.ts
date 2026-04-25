import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const formatName = (name: string) => {
  if (!name) return 'Unknown';
  if (name.includes('@')) {
    return name.split('@')[0];
  }
  return name;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase for backend
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

  // Authenticate as cron user
  try {
    await signInWithEmailAndPassword(auth, 'cron@sharestate.com', 'CronPassword123!');
    console.log('Backend authenticated with Firebase');
  } catch (error: any) {
    console.error('Backend Firebase authentication failed:', error.message);
    try {
      await createUserWithEmailAndPassword(auth, 'cron@sharestate.com', 'CronPassword123!');
      console.log('Backend cron user created and authenticated.');
    } catch (createError: any) {
      if (createError.code === 'auth/email-already-in-use') {
         console.log('Cron user exists but login failed (maybe wrong password or credential issue).');
      } else {
         console.error('Failed to create cron user:', createError.message);
      }
    }
  }

  // Set up Nodemailer (using Ethereal for testing if no real SMTP provided)
  let transporter: nodemailer.Transporter;
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('Nodemailer configured with Ethereal email. Check console for message URLs.');
  } catch (err) {
    console.error('Failed to create Ethereal account', err);
  }

  // Cron job to check every minute if it's time to send the report
  cron.schedule('* * * * *', async () => {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'report'));
      if (!settingsDoc.exists()) return;

      const settings = settingsDoc.data();
      if (!settings.time || !settings.emails || settings.emails.length === 0) return;

      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHour}:${currentMinute}`;
      const currentDay = now.getDate();

      // --- MONTHLY REPORT & CLEANUP ---
      if (settings.monthlyDay && settings.monthlyTime && settings.emails && settings.emails.length > 0) {
        if (currentDay === settings.monthlyDay && currentTimeStr === settings.monthlyTime) {
          const currentMonthStr = `${now.getFullYear()}-${now.getMonth() + 1}`;
          if (settings.lastMonthlySent !== currentMonthStr) {
            console.log('Time to send monthly report and clean up!');
            
            // Fetch all incidents
            const snapshot = await getDocs(collection(db, 'incidents'));
            const incidents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            // Generate report content
            let htmlContent = `<h2>Monthly Data Overview & Cleanup</h2>
              <p>Here is the summary of all incidents up to this point. These records have now been cleared from the database.</p>
              <table border="1" cellpadding="5" cellspacing="0">
                <tr>
                  <th>Machine</th>
                  <th>Line</th>
                  <th>Status</th>
                  <th>Start Time</th>
                  <th>Duration (mins)</th>
                  <th>Reason Code</th>
                  <th>Reported By</th>
                  <th>Fixed By</th>
                </tr>`;

            incidents.forEach((inc: any) => {
              const start = inc.startTime?.toDate ? inc.startTime.toDate() : new Date();
              htmlContent += `
                <tr>
                  <td>${inc.machineName}</td>
                  <td>${inc.lineName}</td>
                  <td>${inc.status}</td>
                  <td>${start.toLocaleString()}</td>
                  <td>${inc.durationMinutes || 'Ongoing'}</td>
                  <td>${inc.reasonCode || 'N/A'}</td>
                  <td>${formatName(inc.reportedByName || 'Unknown')}</td>
                  <td>${formatName(inc.resolvedByName || 'N/A')}</td>
                </tr>
              `;
            });
            htmlContent += `</table>`;

            // Send email
            if (transporter) {
              const info = await transporter.sendMail({
                from: '"Downtime Tracker" <noreply@downtimetracker.com>',
                to: settings.emails.join(', '),
                subject: `Monthly Data Export & Cleanup - ${currentMonthStr}`,
                html: htmlContent,
              });
              console.log('Monthly Report sent! Preview URL: %s', nodemailer.getTestMessageUrl(info));
              
              // Delete all incidents
              for (const inc of incidents) {
                await deleteDoc(doc(db, 'incidents', inc.id));
              }
              console.log(`Deleted ${incidents.length} incidents from the database.`);

              // Update lastMonthlySent
              await updateDoc(doc(db, 'settings', 'report'), {
                lastMonthlySent: currentMonthStr
              });
            }
          }
        }
      }

      // --- DAILY REPORT ---
      if (currentTimeStr === settings.time) {
        // Check if already sent today
        const todayStr = now.toISOString().split('T')[0];
        if (settings.lastSentDate === todayStr) return;

        console.log('Time to send daily report!');
        
        // Fetch current month's incidents
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const q = query(
          collection(db, 'incidents'),
          where('startTime', '>=', Timestamp.fromDate(startOfMonth))
        );
        const snapshot = await getDocs(q);
        const incidents = snapshot.docs.map(d => d.data());

        // Generate report content
        let htmlContent = `<h2>Daily Data Overview</h2>
          <p>Here is the summary of incidents for the current month (${startOfMonth.toLocaleString('default', { month: 'long' })}):</p>
          <table border="1" cellpadding="5" cellspacing="0">
            <tr>
              <th>Machine</th>
              <th>Line</th>
              <th>Status</th>
              <th>Start Time</th>
              <th>Duration (mins)</th>
              <th>Reason Code</th>
              <th>Reported By</th>
              <th>Fixed By</th>
            </tr>`;

        incidents.forEach((inc: any) => {
          const start = inc.startTime?.toDate ? inc.startTime.toDate() : new Date();
          htmlContent += `
            <tr>
              <td>${inc.machineName}</td>
              <td>${inc.lineName}</td>
              <td>${inc.status}</td>
              <td>${start.toLocaleString()}</td>
              <td>${inc.durationMinutes || 'Ongoing'}</td>
              <td>${inc.reasonCode || 'N/A'}</td>
              <td>${formatName(inc.reportedByName || 'Unknown')}</td>
              <td>${formatName(inc.resolvedByName || 'N/A')}</td>
            </tr>
          `;
        });
        htmlContent += `</table>`;

        // Send email
        if (transporter) {
          const info = await transporter.sendMail({
            from: '"Downtime Tracker" <noreply@downtimetracker.com>',
            to: settings.emails.join(', '),
            subject: `Daily Data Overview - ${todayStr}`,
            html: htmlContent,
          });
          console.log('Report sent! Preview URL: %s', nodemailer.getTestMessageUrl(info));
          
          // Update lastSentDate (we need to use the client SDK to update)
          await updateDoc(doc(db, 'settings', 'report'), {
            lastSentDate: todayStr
          });
        }
      }
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
