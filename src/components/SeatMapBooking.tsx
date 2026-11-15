import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Users, X, AlertCircle, Ticket } from 'lucide-react';
import {
  AUDITORIUM_ROWS,
  AUDITORIUM_SEATS,
  SEATS_PER_ROW,
  SEAT_MAP_BY_ID,
  TIER_CONFIG,
} from '../data/cinemaCatalog';
import type {
  BookingRecord,
  Movie,
  ShowSeatState,
  ShowSummary,
} from '../types/cinema';

interface SeatMapBookingProps {
  movies: Movie[];
  shows: ShowSummary[];
  selectedShowId: string;
  seatState: ShowSeatState | null;
  clientId: string;
  wsConnected: boolean;
  onSelectShow: (showId: string) => void;
  onToggleSeatHold: (seatId: string, currentlyHeldByMe: boolean) => void;
  onReleaseAllMyHolds: () => void;
  onConfirmBooking: (params: {
    showId: string;
    seatIds: string[];
    guestName: string;
    guestPhone: string;
  }) => Promise<BookingRecord>;
  seatError: string | null;
  onClearSeatError: () => void;
  onBookingCreated: (booking: BookingRecord) => void;
}

function formatHoldRemaining(expiresAt: number, now: number): string {
  const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const SeatMapBooking: React.FC<SeatMapBookingProps> = ({
  movies,
  shows,
  selectedShowId,
  seatState,
  clientId,
  wsConnected,
  onSelectShow,
  onToggleSeatHold,
  onReleaseAllMyHolds,
  onConfirmBooking,
  seatError,
  onClearSeatError,
  onBookingCreated,
}) => {
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const currentShow = shows.find((s) => s.id === selectedShowId) || shows[0];
  const currentMovie = movies.find((m) => m.id === currentShow?.movieId);
  const hasActiveShow = Boolean(currentShow);

  const bookedSet = useMemo(
    () => new Set(seatState?.bookedSeats || []),
    [seatState?.bookedSeats]
  );

  const holdBySeat = useMemo(() => {
    const map = new Map<string, { clientId: string; expiresAt: number }>();
    for (const h of seatState?.heldSeats || []) {
      if (h.expiresAt > nowTick) {
        map.set(h.seatId, { clientId: h.clientId, expiresAt: h.expiresAt });
      }
    }
    return map;
  }, [seatState?.heldSeats, nowTick]);

  const myHeldSeats = useMemo(() => {
    const list: Array<{ id: string; priceNpr: number; tierLabel: string; expiresAt: number }> = [];
    for (const [seatId, hold] of holdBySeat.entries()) {
      if (hold.clientId === clientId) {
        const def = SEAT_MAP_BY_ID[seatId];
        if (def) {
          list.push({
            id: seatId,
            priceNpr: def.priceNpr,
            tierLabel: TIER_CONFIG[def.tier].label,
            expiresAt: hold.expiresAt,
          });
        }
      }
    }
    return list.sort((a, b) => a.id.localeCompare(b.id));
  }, [holdBySeat, clientId]);

  const earliestExpiry = useMemo(() => {
    if (myHeldSeats.length === 0) return null;
    return Math.min(...myHeldSeats.map((s) => s.expiresAt));
  }, [myHeldSeats]);

  const totalNpr = myHeldSeats.reduce((sum, s) => sum + s.priceNpr, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    onClearSeatError();

    if (!currentShow) return;
    if (myHeldSeats.length === 0) {
      setFormError('Please tap at least one available seat on the map.');
      return;
    }
    if (guestName.trim().length < 2) {
      setFormError('Please enter your full name for the ticket.');
      return;
    }
    const trimmedContact = guestContact.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact);
    const digits = trimmedContact.replace(/\D/g, '');
    if (!isEmail && (digits.length < 7 || digits.length > 15)) {
      setFormError('Please enter a valid mobile number or email address.');
      return;
    }

    setSubmitting(true);
    try {
      const booking = await onConfirmBooking({
        showId: currentShow.id,
        seatIds: myHeldSeats.map((s) => s.id),
        guestName: guestName.trim(),
        guestPhone: trimmedContact,
      });
      setGuestName('');
      setGuestContact('');
      onBookingCreated(booking);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to complete booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="seat-booking"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16"
    >
      <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Live Auditorium Seat Map
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Seats sync in real time across all connected guests. Selected seats are held for 5 minutes.
          </p>
        </div>

        {/* Live WebSocket Telemetry & Active Viewers */}
        <div className="flex items-center gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {wsConnected ? 'Live Sync Connected' : 'Reconnecting Sync...'}
            </span>
          </div>
          {seatState && (
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-slate-300">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>{seatState.activeViewers} viewing hall</span>
            </div>
          )}
        </div>
      </div>

      {/* Showtime Quick Switcher */}
      {shows.length > 0 ? (
        <div className="mb-6 bg-[#0F172A] border border-white/10 rounded-xl p-2 flex items-center gap-2 overflow-x-auto">
          {shows.map((show) => {
            const movie = movies.find((m) => m.id === show.movieId);
            const active = show.id === currentShow?.id;
            return (
              <button
                key={show.id}
                type="button"
                onClick={() => onSelectShow(show.id)}
                className={`px-4 py-2 rounded-lg text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] ${
                  active
                    ? 'bg-amber-400 text-[#070B14]'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <div className="text-xs font-semibold truncate max-w-[160px]">
                  {movie?.title}
                </div>
                <div
                  className={`text-[11px] font-mono tabular-nums ${
                    active ? 'text-[#070B14]/80 font-medium' : 'text-slate-400'
                  }`}
                >
                  {show.timeLabel} · {show.availableCount} left
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mb-6 bg-[#0F172A] border border-white/10 rounded-xl px-5 py-4">
          <div className="text-sm text-slate-300">
            No active showtimes posted yet. Live seat selection will open automatically once showtimes are published.
          </div>
        </div>
      )}

      {/* 2-Column Auditorium + Contiguous Guest Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Auditorium Canvas */}
        <div className="lg:col-span-8 bg-[#0B1120] text-white rounded-2xl p-5 sm:p-8 border border-white/10 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <div className="text-xs font-medium text-amber-400">
                {currentShow ? `${currentShow.screenName} · ${currentShow.timeLabel}` : 'Auditorium Seat Layout'}
              </div>
              <h3 className="font-display text-xl font-bold text-white mt-0.5">
                {currentMovie?.title || 'No Film Scheduled'}
              </h3>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-300">
              {currentShow
                ? `${currentShow.availableCount} / ${AUDITORIUM_SEATS.length} seats available`
                : `${AUDITORIUM_SEATS.length} total seats`}
            </div>
          </div>

          {/* Cinema Screen Arc */}
          <div className="mb-8 text-center">
            <div className="mx-auto max-w-md h-3 rounded-t-[100%] bg-gradient-to-b from-amber-300/80 to-transparent border-t-2 border-amber-400" />
            <div className="text-[11px] tracking-[0.22em] uppercase text-slate-400 mt-1.5">
              Screen This Way
            </div>
          </div>

          {/* Seat Grid */}
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[560px] space-y-2.5">
              {AUDITORIUM_ROWS.map((row, rowIndex) => {
                const showTierHeader =
                  row === 'A' || row === 'C' || row === 'G';
                const tierKey =
                  row === 'A'
                    ? 'standard'
                    : row === 'C'
                    ? 'executive'
                    : row === 'G'
                    ? 'gold'
                    : null;

                return (
                  <React.Fragment key={row}>
                    {showTierHeader && tierKey && (
                      <div
                        className={`flex items-center justify-between text-[11px] font-medium text-slate-300 ${
                          rowIndex > 0 ? 'pt-4 mt-2 border-t border-white/10' : ''
                        } pb-1`}
                      >
                        <span>{TIER_CONFIG[tierKey].label}</span>
                        <span className="font-mono tabular-nums text-amber-400">
                          NPR {TIER_CONFIG[tierKey].priceNpr}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="w-6 text-xs font-mono font-semibold text-slate-400 shrink-0">
                        {row}
                      </span>

                      <div className="flex-1 grid grid-cols-13 gap-1.5 items-center">
                        {Array.from({ length: SEATS_PER_ROW }, (_, idx) => {
                          const num = idx + 1;
                          const padded = num < 10 ? `0${num}` : `${num}`;
                          const seatId = `${row}-${padded}`;
                          const isBooked = bookedSet.has(seatId);
                          const hold = holdBySeat.get(seatId);
                          const heldByMe = hold?.clientId === clientId;
                          const heldByOther = Boolean(hold && hold.clientId !== clientId);

                          const seatButton = (
                            <button
                              key={seatId}
                              type="button"
                              disabled={!hasActiveShow || isBooked || heldByOther}
                              onClick={() => onToggleSeatHold(seatId, heldByMe)}
                              title={
                                isBooked
                                  ? `${seatId} · Booked`
                                  : heldByOther
                                  ? `${seatId} · Held by another guest`
                                  : heldByMe
                                  ? `${seatId} · Selected (click to release)`
                                  : `${seatId} · Available (NPR ${
                                      SEAT_MAP_BY_ID[seatId]?.priceNpr || 350
                                    })`
                              }
                              aria-label={`Seat ${seatId}, ${
                                isBooked
                                  ? 'Booked'
                                  : heldByOther
                                  ? 'Held by another guest'
                                  : heldByMe
                                  ? 'Selected by you'
                                  : 'Available'
                              }`}
                              className={`h-10 rounded-md font-mono text-[11px] font-medium tabular-nums flex items-center justify-center transition-all duration-150 ${
                                isBooked
                                  ? 'bg-slate-800/80 border border-slate-700/60 text-slate-500 cursor-not-allowed'
                                  : heldByOther
                                  ? 'bg-amber-950/70 border border-amber-500/40 text-amber-300/80 cursor-not-allowed'
                                  : heldByMe
                                  ? 'bg-amber-400 border border-amber-200 text-[#070B14] font-bold shadow-sm scale-[1.03] cursor-pointer'
                                  : 'bg-[#162038] border border-slate-600/70 text-slate-200 hover:border-amber-400 hover:bg-[#1E2C4D] cursor-pointer'
                              }`}
                            >
                              {isBooked ? (
                                <X className="w-3.5 h-3.5 opacity-60" />
                              ) : heldByOther ? (
                                <Lock className="w-3 h-3" />
                              ) : heldByMe ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              ) : (
                                padded
                              )}
                            </button>
                          );

                          if (num === 6) {
                            return (
                              <React.Fragment key={seatId}>
                                {seatButton}
                                <div className="h-10 flex items-center justify-center text-[10px] text-slate-600 select-none">
                                  │
                                </div>
                              </React.Fragment>
                            );
                          }
                          return seatButton;
                        })}
                      </div>

                      <span className="w-6 text-xs font-mono font-semibold text-slate-400 text-right shrink-0">
                        {row}
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Seat Legend (Color + Icon + Label) */}
          <div className="mt-8 pt-5 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-[#162038] border border-slate-600/70 inline-flex items-center justify-center font-mono text-[10px]">
                01
              </span>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-amber-400 border border-amber-200 text-[#070B14] inline-flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </span>
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-amber-950/70 border border-amber-500/40 text-amber-300 inline-flex items-center justify-center">
                <Lock className="w-3 h-3" />
              </span>
              <span>Held Live</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-slate-800/80 border border-slate-700/60 text-slate-500 inline-flex items-center justify-center">
                <X className="w-3.5 h-3.5" />
              </span>
              <span>Booked</span>
            </div>
          </div>
        </div>

        {/* Sticky Contiguous Guest Checkout Module */}
        <aside className="lg:col-span-4 bg-[#0F172A] border border-white/10 rounded-2xl p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-white/10">
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                Guest Checkout
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Instant e-ticket · No login required
              </p>
            </div>
            {earliestExpiry !== null && (
              <div className="text-right">
                <div className="text-[11px] text-slate-400">Hold timer</div>
                <div className="font-mono text-sm font-semibold text-amber-400 tabular-nums">
                  {formatHoldRemaining(earliestExpiry, nowTick)}
                </div>
              </div>
            )}
          </div>

          {(seatError || formError) && (
            <div className="mt-4 p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{formError || seatError}</span>
            </div>
          )}

          {/* Selected Seats List */}
          <div className="py-5 border-b border-white/10">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-3">
              <span>Selected Seats ({myHeldSeats.length}/8)</span>
              {myHeldSeats.length > 0 && (
                <button
                  type="button"
                  onClick={onReleaseAllMyHolds}
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            {myHeldSeats.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400 bg-[#0B1120] rounded-xl border border-dashed border-white/10">
                Tap available seats on the auditorium map to select them.
              </div>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {myHeldSeats.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-[#162038] border border-white/10"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-amber-400">
                        {s.id}
                      </span>
                      <span className="text-xs text-slate-300">{s.tierLabel}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-semibold tabular-nums text-white">
                        NPR {s.priceNpr}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleSeatHold(s.id, true)}
                        aria-label={`Remove seat ${s.id}`}
                        className="text-slate-400 hover:text-red-400 transition-colors cursor-pointer p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Guest Details Form (No Login) */}
          <form onSubmit={handleCheckout} className="pt-5 space-y-4">
            <div>
              <label
                htmlFor="guest-name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Full Name
              </label>
              <input
                id="guest-name"
                type="text"
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Aarav Shrestha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1120] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 min-h-[44px]"
              />
            </div>

            <div>
              <label
                htmlFor="guest-contact"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Phone Number or Email
              </label>
              <input
                id="guest-contact"
                type="text"
                required
                value={guestContact}
                onChange={(e) => setGuestContact(e.target.value)}
                placeholder="98XXXXXXXX or you@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1120] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 min-h-[44px]"
              />
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Total Payable</span>
              <span className="font-mono text-xl font-bold text-amber-400 tabular-nums">
                NPR {totalNpr.toLocaleString()}
              </span>
            </div>

            <button
              type="submit"
              disabled={submitting || myHeldSeats.length === 0}
              className="w-full py-3.5 px-5 rounded-xl bg-amber-400 text-[#070B14] font-semibold text-sm hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
            >
              <Ticket className="w-4 h-4" />
              {submitting ? 'Generating E-Ticket...' : 'Confirm & Issue E-Ticket'}
            </button>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Present your digital e-ticket QR at Gole Complex box office 15 minutes before showtime.
            </p>
          </form>
        </aside>
      </div>
    </section>
  );
};
