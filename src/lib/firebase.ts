import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
