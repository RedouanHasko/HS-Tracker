import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDbx4Eev3q5FY3STNrY4nk475KPERKe9V8',
  authDomain: 'hs-tracker-1.firebaseapp.com',
  projectId: 'hs-tracker-1',
  storageBucket: 'hs-tracker-1.firebasestorage.app',
  messagingSenderId: '785042769614',
  appId: '1:785042769614:web:ac80603d8af1054e62729f',
  measurementId: 'G-9XZXS5FZ84',
};

const app = initializeApp(firebaseConfig);

const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
export const appCheck: AppCheck | null = appCheckSiteKey
  ? initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

export const auth = getAuth(app);
export const authReady = setPersistence(auth, browserLocalPersistence).catch(async (error) => {
  console.warn('Local authentication persistence is unavailable; using this browser session.', error);
  await setPersistence(auth, browserSessionPersistence);
});
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
