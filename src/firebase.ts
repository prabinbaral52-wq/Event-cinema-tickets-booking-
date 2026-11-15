import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAMY63jHY8YfWidX_fwJHbu_j0NgpRwoCE",
  authDomain: "event-cinema-ticket.firebaseapp.com",
  projectId: "event-cinema-ticket",
  storageBucket: "event-cinema-ticket.firebasestorage.app",
  messagingSenderId: "79304425831",
  appId: "1:79304425831:web:4bb53c018eb68ef1322fc2",
  measurementId: "G-L2E7XLKWKM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
