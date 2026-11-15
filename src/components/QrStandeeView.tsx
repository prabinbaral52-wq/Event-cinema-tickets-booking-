import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Download, Eye, Lock, Printer, ShieldCheck, Unlock } from 'lucide-react';
import { OFFICIAL_LOGO_PATH, VENUE_INFO } from '../data/cinemaCatalog';

interface QrStandeeViewProps {
  gateEnforced: boolean;
  onToggleGate: (enabled: boolean) => Promise<void>;
  onPreviewScreen: (mode: 'closed' | 'denied') => void;
  onBack: () => void;
}

export const QrStandeeView: React.FC<QrStandeeViewProps> = ({
  gateEnforced,
  onToggleGate,
  onPreviewScreen,
  onBack,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [entryUrl, setEntryUrl] = useState<string>('');
  const [withinHours, setWithinHours] = useState<boolean>(true);
  const [nstTime, setNstTime] = useState<string>('');
  const [toggling, setToggling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadStandee() {
      try {
        const res = await fetch('/api/qr-standee-payload');
        const data = await res.json();
        if (!active) return;
        setEntryUrl(data.entryUrl);
        setWithinHours(Boolean(data.isOpen));
        setNstTime(data.nstTimeFormatted || '');

        const url = await QRCode.toDataURL(data.entryUrl, {
          width: 480,
          margin: 2,
          color: {
            dark: '#081B4B',
            light: '#FFFFFF',
          },
          errorCorrectionLevel: 'H',
        });
        if (active) setQrDataUrl(url);
      } catch {
        if (active) setError('Unable to generate the official venue QR code.');
      }
    }
    loadStandee();
    return () => {
      active = false;
    };
  }, [gateEnforced]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = 'event-cinema-gole-complex-qr.png';
    link.click();
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggleGate(!gateEnforced);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 no-print">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Booking Portal
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 bg-[#0F172A] text-sm font-medium text-white hover:bg-[#162038] disabled:opacity-50 transition-colors cursor-pointer min-h-[40px]"
            >
              <Download className="w-4 h-4" />
              Save QR PNG
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 text-[#070B14] text-sm font-semibold hover:bg-amber-300 transition-colors cursor-pointer min-h-[40px]"
            >
              <Printer className="w-4 h-4" />
              Print Counter Standee
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Gate Controls & Screen Previews (No Print) */}
          <div className="lg:col-span-5 space-y-5 no-print">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                {gateEnforced ? (
                  <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Unlock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    QR & Time-Lock Gate Control
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Currently <strong className="text-white">{gateEnforced ? 'ENFORCED' : 'OPEN (Paused for Setup)'}</strong> so you can test the booking portal freely without scanning the QR first. Turn enforcement ON when deploying the standee at Gole Complex.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={toggling}
                onClick={handleToggle}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[44px] ${
                  gateEnforced
                    ? 'bg-emerald-500 text-[#070B14] hover:bg-emerald-400'
                    : 'bg-amber-400 text-[#070B14] hover:bg-amber-300'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                {toggling
                  ? 'Updating...'
                  : gateEnforced
                  ? 'Pause Gate Lock (Allow Direct Entry)'
                  : 'Activate Strict QR + 12 PM–3 PM Gate'}
              </button>

              {nstTime && (
                <div className="pt-3 border-t border-white/10 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Server Time:</span>
                    <span className="font-mono text-white tabular-nums">{nstTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>12:00 PM – 3:00 PM Window:</span>
                    <span className={withinHours ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                      {withinHours ? 'Currently Inside Window' : 'Currently Outside Hours'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 space-y-3">
              <h3 className="font-display text-sm font-bold text-white">
                Preview Restricted Screens
              </h3>
              <p className="text-xs text-slate-400">
                Inspect how the blocked screens look to visitors without turning off direct access:
              </p>
              <div className="grid grid-cols-1 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onPreviewScreen('denied')}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-[#162038] text-xs font-medium text-white hover:border-amber-400 flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Preview &ldquo;Access Denied (Scan QR)&rdquo;
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewScreen('closed')}
                  className="w-full px-4 py-2.5 rounded-xl border border-white/15 bg-[#162038] text-xs font-medium text-white hover:border-amber-400 flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Preview &ldquo;Portal Closed (12 PM–3 PM)&rdquo;
                </button>
              </div>
            </div>
          </div>

          {/* Printable Counter QR Standee */}
          <div className="lg:col-span-7 bg-white text-[#081B4B] border-2 border-[#081B4B] rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-[#081B4B] text-white px-8 py-6 text-center">
              <div className="w-24 h-24 mx-auto rounded-full bg-white p-1.5 mb-4">
                <img
                  src={OFFICIAL_LOGO_PATH}
                  alt="Event Cinema Official Logo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-full"
                />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {VENUE_INFO.name} ({VENUE_INFO.complex})
              </h1>
              <p className="text-sm text-amber-300 font-medium mt-1">
                {VENUE_INFO.address}
              </p>
            </div>

            <div className="p-8 text-center space-y-6">
              <div>
                <h2 className="font-display text-lg font-bold text-[#081B4B]">
                  Scan to Book Movie Tickets Online
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Real-Time Seat Map · Instant E-Ticket · No Login Required
                </p>
              </div>

              <div className="inline-flex items-center justify-center p-4 bg-white border border-slate-200 rounded-xl">
                {error ? (
                  <div className="w-56 h-56 flex items-center justify-center text-sm text-red-700">
                    {error}
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Official Event Cinema Gole Complex Entry QR Code"
                    className="w-56 h-56"
                  />
                ) : (
                  <div className="w-56 h-56 bg-slate-100 animate-pulse rounded-lg" />
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-sm font-bold text-[#081B4B]">
                  Active Booking Hours: 12:00 PM – 3:00 PM NST
                </div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Scanning this QR code opens the booking portal during daytime hours (12:00 PM to 3:00 PM). Outside these hours, the portal remains closed.
                </p>
                {entryUrl && (
                  <p className="text-[11px] font-mono text-slate-400 break-all pt-1 no-print">
                    {entryUrl}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
