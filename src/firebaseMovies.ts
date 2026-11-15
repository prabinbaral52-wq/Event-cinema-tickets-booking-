import { ref, onValue, push, set } from 'firebase/database';
import { db } from './firebase';

export interface LiveMovie {
  id: string;
  title: string;
  poster?: string;
  showtime: string;
}

export function listenMovies(callback: (movies: LiveMovie[]) => void) {
  const moviesRef = ref(db, 'movies');
  return onValue(moviesRef, (snap) => {
    const data = snap.val() || {};
    const movies = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
    movies.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(movies);
  });
}

export async function createBooking(data: {
  movieId: string;
  seats: string[];
  payment: 'online' | 'cash';
  amount: number;
}) {
  const bookingsRef = ref(db, 'bookings');
  const newRef = push(bookingsRef);
  await set(newRef, {
    ...data,
    timestamp: Date.now()
  });
  return newRef.key;
}
