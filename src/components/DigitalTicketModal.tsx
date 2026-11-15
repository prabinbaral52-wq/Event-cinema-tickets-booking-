import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Printer, X } from 'lucide-react';
import { OFFICIAL_LOGO_PATH, VENUE_INFO } from '../data/cinemaCatalog';
import type { BookingRecord } from '../types/cinema';

interface DigitalTicketModalProps {
  booking: BookingRecord | null;
  onClose: () => void;
}

export const DigitalTicketModal: React.FC<DigitalTicketModalProps> = ({
  booking,
  onClose,
}) => {
  const [entryQrUrl, setEntryQrUrl] = useState<string>('');

  useEffect(() => {
    if (!booking) return;
    let active = true;
    QRCode.toDataURL(booking.entryQrPayload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#081B4B',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setEntryQrUrl(url);
      })
      .catch(() => {
        if (active) setEntryQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [booking]);

  if (!booking) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#070B14]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-modal-title"
    >
      <div className="bg-[#0F172A] text-white rounded-2xl max-w-md w-full border border-white/15 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-[#0B1120] px-6 py-5 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white p-0.5 shrink-0">
              <img
                src={OFFICIAL_LOGO_PATH}
                alt="Event Cinema"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div>
              <h2 id="ticket-modal-title" className="font-display font-bold text-base text-white">
                {VENUE_INFO.name} ({VENUE_INFO.complex})
              </h2>
              <p className="text-xs text-amber-400">
                {VENUE_INFO.address}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close ticket modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer no-print"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Confirmation Banner */}
        <div className="px-6 py-3.5 bg-emerald-950/60 border-b border-emerald-500/30 flex items-center gap-2.5 text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>E-Ticket Confirmed · Present QR at Hall Gate</span>
        </div>

        {/* Ticket Body */}
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-slate-400">Movie & Showtime</div>
              <div className="font-display text-xl font-bold text-white mt-0.5">
                {booking.movieTitle}
              </div>
              <div className="text-sm text-slate-300 mt-1">
                {booking.screenName} · {booking.timeLabel}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                Show Date: {booking.dateKey}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-400">Booking ID</div>
              <div className="font-mono text-sm font-bold text-amber-400 mt-0.5">
                {booking.bookingId}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-dashed border-white/15 text-sm">
            <div>
              <div className="text-xs text-slate-400">Guest Name</div>
              <div className="font-semibold text-white mt-0.5 truncate">
                {booking.guestName}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Phone / Email</div>
              <div className="font-mono text-xs font-medium text-slate-200 mt-0.5 truncate">
                {booking.guestPhone}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Seats ({booking.seats.length})</div>
              <div className="font-mono font-semibold text-amber-400 mt-0.5">
                {booking.seats.map((s) => s.id).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Total Amount</div>
              <div className="font-mono font-bold text-white tabular-nums mt-0.5">
                NPR {booking.totalNpr.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Entry QR Code on white contrast pad for easy scanning */}
          <div className="flex flex-col items-center text-center">
            {entryQrUrl ? (
              <div className="bg-white p-2 rounded-xl">
                <img
                  src={entryQrUrl}
                  alt={`Entry QR Code for booking ${booking.bookingId}`}
                  className="w-40 h-40"
                />
              </div>
            ) : (
              <div className="w-40 h-40 bg-white/10 rounded-xl" />
            )}
            <p className="text-xs text-slate-400 mt-2.5">
              Scan at Gole Complex screen entrance
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer min-h-[44px]"
            >
              <Printer className="w-4 h-4" />
              Print Ticket
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-400 text-[#070B14] text-sm font-semibold hover:bg-amber-300 transition-colors cursor-pointer min-h-[44px]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
