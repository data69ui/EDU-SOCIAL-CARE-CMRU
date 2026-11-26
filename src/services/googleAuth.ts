import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'consent select_account',
});

let isSigningIn = false;
// Store Google OAuth access token strictly in memory (never localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let currentGoogleUser: User | null = auth.currentUser;

export interface GoogleWorkspaceAuthSnapshot {
  user: User | null;
  accessToken: string | null;
  needsAuth: boolean;
}

type AuthListener = (snapshot: GoogleWorkspaceAuthSnapshot) => void;
const listeners = new Set<AuthListener>();
let initialized = false;

function getSnapshot(): GoogleWorkspaceAuthSnapshot {
  return {
    user: currentGoogleUser,
    accessToken: cachedAccessToken,
    needsAuth: !cachedAccessToken,
  };
}

function notifyListeners() {
  const snapshot = getSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function initGoogleWorkspaceAuth(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  return onAuthStateChanged(auth, (user: User | null) => {
    currentGoogleUser = user;
    if (user) {
      if (!cachedAccessToken && !isSigningIn) {
        cachedAccessToken = null;
      }
    } else {
      cachedAccessToken = null;
    }
    notifyListeners();
  });
}

export function subscribeGoogleWorkspaceAuth(listener: AuthListener): () => void {
  initGoogleWorkspaceAuth();
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export async function googleWorkspaceSignIn(): Promise<{ user: User; accessToken: string }> {
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับสิทธิ์เข้าถึง Google Sheets และ Google Drive ได้ กรุณาลองใหม่อีกครั้ง');
    }
    cachedAccessToken = credential.accessToken;
    currentGoogleUser = result.user;
    notifyListeners();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('ยกเลิกการเข้าสู่ระบบด้วย Google');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง');
    }
    if (code === 'auth/unauthorized-domain') {
      const host =
        typeof window !== 'undefined' ? window.location.hostname : 'โดเมนปัจจุบัน';
      throw new Error(
        `โดเมน "${host}" ยังไม่ได้รับอนุญาตใน Firebase Authentication — กรุณาไปที่ Firebase Console > Authentication > Settings > Authorized domains แล้วกด Add domain เพื่อเพิ่ม "${host}"`
      );
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function getGoogleWorkspaceUser(): User | null {
  return currentGoogleUser;
}

export async function googleWorkspaceLogout(): Promise<void> {
  cachedAccessToken = null;
  currentGoogleUser = null;
  try {
    await auth.signOut();
  } finally {
    notifyListeners();
  }
}
