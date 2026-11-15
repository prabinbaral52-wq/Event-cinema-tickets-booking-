import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAMY63jHY8YfWidX_fwJHbu_j0NgpRwoCE",
  authDomain: "event-cinema-ticket.firebaseapp.com",
  databaseURL: "https://event-cinema-ticket-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "event-cinema-ticket",
  storageBucket: "event-cinema-ticket.firebasestorage.app",
  messagingSenderId: "79304425831",
  appId: "1:79304425831:web:4bb53c018eb68ef1322fc2",
  measurementId: "G-L2E7XLKWKM"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export default app;
