import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=cache-20261122';

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
