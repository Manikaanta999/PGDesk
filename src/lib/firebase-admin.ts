import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig?.projectId || '';
let adminAuthInstance: Auth | null = null;

if (projectId) {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp({ projectId });
    adminAuthInstance = getAuth(app);
  } catch {
    adminAuthInstance = null;
  }
}

export const adminAuth = adminAuthInstance;
