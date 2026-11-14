import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    typeof firebaseConfig.apiKey === 'string' &&
    firebaseConfig.apiKey.trim().length > 0 &&
    typeof firebaseConfig.projectId === 'string' &&
    firebaseConfig.projectId.trim().length > 0
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch {
    app = null;
    authInstance = null;
    googleProvider = null;
  }
}

export const auth = authInstance;
export const googleAuthProvider = googleProvider;
