export type SeatTier = 'standard' | 'executive' | 'gold';

export interface SeatDefinition {
  id: string; // e.g. "C-05"
  row: string; // "A".."H"
  number: number; // 1..12
  tier: SeatTier;
  priceNpr: number;
}

export interface Movie {
  id: string;
  title: string;
  language: string;
  genre: string;
  durationMinutes: number;
  rating: string;
  synopsis: string;
  director: string;
  format: string;
}

export interface Showtime {
  id: string;
  movieId: string;
  screenName: string;
  timeLabel: string; // e.g. "11:30 AM"
  sortOrder: number;
}

export interface ShowSummary extends Showtime {
  totalSeats: number;
  bookedCount: number;
  heldCount: number;
  availableCount: number;
}

export interface SeatHold {
  seatId: string;
  clientId: string;
  expiresAt: number;
}

export interface ShowSeatState {
  showId: string;
  dateKey: string;
  bookedSeats: string[];
  heldSeats: SeatHold[];
  activeViewers: number;
}

export interface BookingRecord {
  bookingId: string;
  dateKey: string;
  showId: string;
  movieId: string;
  movieTitle: string;
  screenName: string;
  timeLabel: string;
  guestName: string;
  guestPhone: string;
  seats: Array<{ id: string; tier: SeatTier; priceNpr: number }>;
  totalNpr: number;
  createdAt: string;
  entryQrPayload: string;
}

export interface PortalStatus {
  isOpen: boolean;
  withinOperatingHours: boolean;
  gateEnabled: boolean;
  sessionValid: boolean;
  reason?: 'QR_REQUIRED' | 'INVALID_QR' | 'OUTSIDE_HOURS' | 'SESSION_EXPIRED';
  nstTimeFormatted: string;
  nstDateFormatted: string;
  nstDateKey: string;
  nstHour: number;
  nstMinute: number;
  nstSecond: number;
  opensAtLabel: string;
  closesAtLabel: string;
  msUntilNextChange: number;
  clientId?: string;
}
