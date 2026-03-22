import admin from 'firebase-admin';

try {
  admin.initializeApp({
    projectId: 'sharestate-8973d'
  });
  const db = admin.firestore();
  db.settings({ databaseId: 'ai-studio-9b40c6b7-2943-4ab2-9a54-4cff77608c2a' });
  const snapshot = await db.collection('incidents').limit(1).get();
  console.log('Read successful, docs:', snapshot.size);
} catch (error) {
  console.error('Error reading Firestore:', error);
}
