import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface LiveMovie {
  id: string;
  title: string;
  poster?: string;
  showtime: string;
}

export function listenMovies(callback: (movies: LiveMovie[]) => void) {
  const q = query(collection(db, 'movies'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const movies = snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveMovie));
    callback(movies);
  });
}

export async function createBooking(data: {
  movieId: string;
  seats: string[];
  payment: 'online' | 'cash';
  amount: number;
}) {
  return addDoc(collection(db, 'bookings'), {
    ...data,
    timestamp: Date.now(),
    createdAt: serverTimestamp()
  });
}
