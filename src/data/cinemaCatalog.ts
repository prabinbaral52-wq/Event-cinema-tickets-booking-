import type { Movie, SeatDefinition, SeatTier, Showtime } from '../types/cinema.ts';

export const OFFICIAL_LOGO_PATH = '/assets/aistudio/file_00000000e3308246981feffaf116deaa_ae312269.png';

export const VENUE_INFO = {
  name: 'Event Cinema',
  complex: 'Gole Complex',
  address: 'Lalbandi-7, Sarlahi, Nepal',
  windowLabel: '12:00 PM – 3:00 PM NST',
  supportPhone: '+977-046-501420',
};

export const OFFICIAL_QR_ACCESS_KEY = 'qr_verified';

export const TIER_CONFIG: Record<
  SeatTier,
  { label: string; priceNpr: number; rows: string[] }
> = {
  standard: {
    label: 'Front Standard',
    priceNpr: 250,
    rows: ['A', 'B'],
  },
  executive: {
    label: 'Executive',
    priceNpr: 350,
    rows: ['C', 'D', 'E', 'F'],
  },
  gold: {
    label: 'Gold Balcony',
    priceNpr: 500,
    rows: ['G', 'H'],
  },
};

export const AUDITORIUM_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const SEATS_PER_ROW = 12;

export function getTierForRow(row: string): SeatTier {
  if (TIER_CONFIG.standard.rows.includes(row)) return 'standard';
  if (TIER_CONFIG.gold.rows.includes(row)) return 'gold';
  return 'executive';
}

export function buildAuditoriumSeats(): SeatDefinition[] {
  const seats: SeatDefinition[] = [];
  for (const row of AUDITORIUM_ROWS) {
    const tier = getTierForRow(row);
    const priceNpr = TIER_CONFIG[tier].priceNpr;
    for (let num = 1; num <= SEATS_PER_ROW; num++) {
      const padded = num < 10 ? `0${num}` : `${num}`;
      seats.push({
        id: `${row}-${padded}`,
        row,
        number: num,
        tier,
        priceNpr,
      });
    }
  }
  return seats;
}

export const AUDITORIUM_SEATS: SeatDefinition[] = buildAuditoriumSeats();
export const SEAT_MAP_BY_ID: Record<string, SeatDefinition> = Object.fromEntries(
  AUDITORIUM_SEATS.map((s) => [s.id, s])
);

// Kept intentionally blank: no fabricated film names or showtimes
export const MOVIES: Movie[] = [];
export const SHOWTIMES: Showtime[] = [];
