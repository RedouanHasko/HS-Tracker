import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "kempt-buckeye-dd2jw",
  appId: "1:718530567572:web:3443664162c19d4adec381",
  apiKey: "AIzaSyBmNH8ZCLqCz74psLW3hPMjCEt-w3HlXxk",
  authDomain: "kempt-buckeye-dd2jw.firebaseapp.com",
  storageBucket: "kempt-buckeye-dd2jw.firebasestorage.app",
  messagingSenderId: "718530567572",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-0f8cbc0a-fa06-4db7-9b58-f0100279c85e");
