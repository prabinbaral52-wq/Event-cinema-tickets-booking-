import React, { useState } from 'react';
import { Search, Ticket, X } from 'lucide-react';
import type { BookingRecord } from '../types/cinema';

interface TicketLookupDrawerProps {
  open: boolean;
  sessionToken: string;
  onClose: () => void;
  onSelectTicket: (booking: BookingRecord) => void;
}

export const TicketLookupDrawer: React.FC<TicketLookupDrawerProps> = ({
  open,
  sessionToken,
  onClose,
  onSelectTicket,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookingRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch(
        `/api/bookings/lookup?q=${encodeURIComponent(query.trim())}`,
        {
          headers: sessionToken ? { 'x-ec-session': sessionToken } : {},
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not retrieve tickets.');
        setResults([]);
      } else {
        setResults(data.bookings || []);
      }
    } catch {
      setError('Network error while looking up tickets.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#070B14]/75 backdrop-blur-sm flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Find Your Ticket"
    >
      <div className="bg-[#0F172A] text-white w-full max-w-md h-full shadow-2xl border-l border-white/10 flex flex-col">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Find Your E-Ticket
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Retrieve today&apos;s booking without logging in
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ticket lookup"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <form onSubmit={handleSearch} className="space-y-3">
            <label
              htmlFor="lookup-input"
              className="block text-xs font-medium text-slate-300"
            >
              Booking ID, Phone Number, or Email
            </label>
            <div className="flex gap-2">
              <input
                id="lookup-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="EC-A1B2C3 or 98XXXXXXXX"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#0B1120] border border-white/15 text-sm font-mono text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-amber-400 min-h-[44px]"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-4 py-2.5 rounded-xl bg-amber-400 text-[#070B14] text-sm font-semibold hover:bg-amber-300 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <Search className="w-4 h-4" />
                Find
              </button>
            </div>
          </form>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-sm text-slate-400 py-8 text-center">
              Searching today&apos;s bookings...
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div className="text-sm text-slate-400 py-8 text-center bg-[#0B1120] rounded-xl border border-dashed border-white/10 px-4">
              No confirmed tickets found matching &ldquo;{query}&rdquo; for today.
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((b) => (
                <button
                  key={b.bookingId}
                  type="button"
                  onClick={() => {
                    onSelectTicket(b);
                    onClose();
                  }}
                  className="w-full text-left p-4 rounded-xl bg-[#162038] border border-white/10 hover:border-amber-400 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {b.bookingId}
                    </span>
                    <span className="font-mono text-xs font-semibold text-white tabular-nums">
                      NPR {b.totalNpr.toLocaleString()}
                    </span>
                  </div>
                  <div className="font-display font-bold text-white mt-1">
                    {b.movieTitle}
                  </div>
                  <div className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {b.timeLabel} · Seats {b.seats.map((s) => s.id).join(', ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
