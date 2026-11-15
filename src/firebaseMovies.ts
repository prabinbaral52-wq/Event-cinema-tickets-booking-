import { ref, onValue, push, set } from 'firebase/database';
import { db } from './firebase';

export interface LiveMovie {
  id: string;
  title: string;
  poster?: string;
  posterUrl?: string;
  showtime: string;
  showtimes?: string[];
  price?: number;
  createdAt?: number;
}

export function getTodayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function listenMovies(callback: (movies: LiveMovie[]) => void) {
  const moviesRef = ref(db, 'movies');
  return onValue(moviesRef, (snap) => {
    const data = snap.val() || {};
    const movies = Object.entries(data).map(([id, val]: [string, any]) => ({
      id,
      ...val,
    }));
    movies.sort((a: LiveMovie, b: LiveMovie) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(movies);
  });
}

export async function createBooking(data: {
  movieId: string;
  movieTitle?: string;
  showtime?: string;
  seats: string[];
  payment: 'online' | 'cash';
  amount: number;
  customerPhone?: string;
}) {
  const timestamp = Date.now();
  const dateKey = getTodayDateKey();
  const ticketId = `EC-${timestamp.toString(36).toUpperCase().slice(-5)}`;
  const payload = {
    ...data,
    ticketId,
    seatCount: data.seats.length,
    totalAmount: data.amount,
    dateKey,
    timestamp,
  };

  const bookingsRef = ref(db, 'bookings');
  const newRef = push(bookingsRef);
  await set(newRef, payload);

  const notificationsRef = ref(db, 'notifications');
  await set(push(notificationsRef), {
    type: data.payment === 'online' ? 'ONLINE_BOOKING_PAID' : 'CASH_BOOKING',
    ticketId,
    movieId: data.movieId,
    movieTitle: data.movieTitle || '',
    showtime: data.showtime || '',
    seats: data.seats,
    seatCount: data.seats.length,
    payment: data.payment,
    amount: data.amount,
    customerPhone: data.customerPhone || '',
    dateKey,
    read: false,
    timestamp,
  });

  return newRef.key;
}
