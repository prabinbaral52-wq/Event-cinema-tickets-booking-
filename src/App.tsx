import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OFFICIAL_LOGO_PATH, VENUE_INFO } from './data/cinemaCatalog';
import type {
  BookingRecord,
  Movie,
  PortalStatus,
  ShowSeatState,
  ShowSummary,
} from './types/cinema';
import { TopBar } from './components/TopBar';
import { QrGateScreen } from './components/QrGateScreen';
import { QrStandeeView } from './components/QrStandeeView';
import { MovieCatalogSection } from './components/MovieCatalogSection';
import { SeatMapBooking } from './components/SeatMapBooking';
import { DigitalTicketModal } from './components/DigitalTicketModal';
import { TicketLookupDrawer } from './components/TicketLookupDrawer';

const SESSION_STORAGE_KEY = 'ec_gole_complex_session';
const CLIENT_ID_STORAGE_KEY = 'ec_gole_complex_client_id';

export default function App() {
  const [standeeMode, setStandeeMode] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      window.location.pathname === '/qr-poster' ||
      params.get('view') === 'standee'
    );
  });
  const [gatePreviewMode, setGatePreviewMode] = useState<'closed' | 'denied' | null>(null);

  const [portalStatus, setPortalStatus] = useState<PortalStatus | null>(null);
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
  });
  const [clientId, setClientId] = useState<string>(() => {
    return sessionStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
  });
  const [gateError, setGateError] = useState<string | null>(null);
  const [verifyingQr, setVerifyingQr] = useState<boolean>(false);
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [shows, setShows] = useState<ShowSummary[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [seatState, setSeatState] = useState<ShowSeatState | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [seatError, setSeatError] = useState<string | null>(null);

  const [activeTicket, setActiveTicket] = useState<BookingRecord | null>(null);
  const [lookupOpen, setLookupOpen] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const selectedShowRef = useRef<string>('');
  selectedShowRef.current = selectedShowId;

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(CLIENT_ID_STORAGE_KEY);
    setSessionToken('');
    setClientId('');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const refreshPortalStatus = useCallback(async () => {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
    const res = await fetch('/api/portal/status', {
      headers: existing ? { 'x-ec-session': existing } : {},
    });
    const status = (await res.json()) as PortalStatus & { sessionToken?: string };
    setPortalStatus(status);
    if (status.sessionToken) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, status.sessionToken);
      setSessionToken(status.sessionToken);
    }
    if (status.clientId) {
      sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, status.clientId);
      setClientId(status.clientId);
    }
    if (!status.isOpen || !status.sessionValid) {
      clearSession();
    }
  }, [clearSession]);

  const verifyQrPayload = useCallback(
    async (rawPayload: string) => {
      setVerifyingQr(true);
      setGateError(null);
      try {
        const res = await fetch('/api/portal/verify-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrPayload: rawPayload }),
        });
        const data = await res.json();
        if (!res.ok || !data.allowed) {
          clearSession();
          if (data.portalStatus) setPortalStatus(data.portalStatus);
          setGateError(
            data.message ||
              'Access Denied: Please scan the official Event Cinema QR code to enter.'
          );
          return;
        }
        sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionToken);
        sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, data.clientId);
        setSessionToken(data.sessionToken);
        setClientId(data.clientId);
        setPortalStatus(data.portalStatus);
        setStandeeMode(false);
        setGatePreviewMode(null);
      } catch {
        setGateError('Unable to reach server to verify QR code.');
      } finally {
        setVerifyingQr(false);
      }
    },
    [clearSession]
  );

  // Bootstrap: handle ?access=qr_verified / ?qr=... scan URL or session check
  useEffect(() => {
    let active = true;
    async function init() {
      const url = new URL(window.location.href);
      const qrParam = url.searchParams.get('access') || url.searchParams.get('qr');

      if (qrParam) {
        url.searchParams.delete('access');
        url.searchParams.delete('qr');
        window.history.replaceState({}, '', url.pathname + url.search);
        await verifyQrPayload(qrParam);
        if (active) setBootstrapping(false);
        return;
      }

      try {
        await refreshPortalStatus();
      } catch {
        // Ignore transient startup error
      } finally {
        if (active) setBootstrapping(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [verifyQrPayload, refreshPortalStatus]);

  // Poll portal status every 30s while locked
  useEffect(() => {
    if (portalStatus?.isOpen && portalStatus?.sessionValid) return;
    const interval = window.setInterval(() => {
      refreshPortalStatus().catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, [portalStatus?.isOpen, portalStatus?.sessionValid, refreshPortalStatus]);

  const portalUnlocked = Boolean(
    portalStatus?.isOpen && portalStatus?.sessionValid && sessionToken
  );

  const loadShows = useCallback(async () => {
    if (!portalUnlocked) return;
    try {
      const res = await fetch('/api/shows', {
        headers: { 'x-ec-session': sessionToken },
      });
      if (res.status === 403) {
        const data = await res.json();
        if (data.portalStatus) setPortalStatus(data.portalStatus);
        clearSession();
        return;
      }
      const data = await res.json();
      setMovies(data.movies || []);
      const nextShows = (data.shows || []) as ShowSummary[];
      setShows(nextShows);
      if (nextShows.length > 0 && !nextShows.some((s) => s.id === selectedShowRef.current)) {
        setSelectedShowId(nextShows[0].id);
      } else if (nextShows.length === 0) {
        setSelectedShowId('');
        setSeatState(null);
      }
    } catch {
      // Handled cleanly
    }
  }, [portalUnlocked, sessionToken, clearSession]);

  // Load movies & shows once unlocked
  useEffect(() => {
    if (!portalUnlocked) return;
    loadShows();
  }, [portalUnlocked, loadShows]);

  // Real-Time WebSocket connection for seat availability & 3:00 PM NST cutoff
  useEffect(() => {
    if (!portalUnlocked || !sessionToken) return;

    let closedIntentionally = false;
    let reconnectTimer: number | null = null;

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${window.location.host}/ws?session=${encodeURIComponent(
          sessionToken
        )}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        if (selectedShowRef.current) {
          ws.send(
            JSON.stringify({
              type: 'show:subscribe',
              showId: selectedShowRef.current,
            })
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'show:state' || msg.type === 'seat:updated') {
            if (msg.state?.showId === selectedShowRef.current) {
              setSeatState(msg.state);
            }
          } else if (msg.type === 'shows:summary' && Array.isArray(msg.shows)) {
            setShows(msg.shows);
          } else if (msg.type === 'schedule:updated') {
            if (Array.isArray(msg.movies)) setMovies(msg.movies);
            if (Array.isArray(msg.shows)) {
              setShows(msg.shows);
              if (msg.shows.length > 0 && !msg.shows.some((s: ShowSummary) => s.id === selectedShowRef.current)) {
                setSelectedShowId(msg.shows[0].id);
              } else if (msg.shows.length === 0) {
                setSelectedShowId('');
                setSeatState(null);
              }
            }
          } else if (msg.type === 'presence:count') {
            if (msg.showId === selectedShowRef.current) {
              setSeatState((prev) =>
                prev ? { ...prev, activeViewers: msg.activeViewers } : prev
              );
            }
          } else if (msg.type === 'seat:rejected') {
            setSeatError(msg.reason || 'Seat could not be held.');
          } else if (msg.type === 'portal:closed') {
            if (msg.portalStatus) setPortalStatus(msg.portalStatus);
            clearSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = (ev) => {
        setWsConnected(false);
        if (ev.code === 4003) {
          refreshPortalStatus().catch(() => {});
          return;
        }
        if (!closedIntentionally) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      closedIntentionally = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    };
  }, [portalUnlocked, sessionToken, clearSession, refreshPortalStatus]);

  // Subscribe whenever selectedShowId changes
  useEffect(() => {
    if (!portalUnlocked || !selectedShowId) return;
    setSeatError(null);

    fetch(`/api/shows/${encodeURIComponent(selectedShowId)}/seats`, {
      headers: { 'x-ec-session': sessionToken },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.showId === selectedShowRef.current) {
          setSeatState(data);
        }
      })
      .catch(() => {});

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'show:subscribe', showId: selectedShowId })
      );
    }
  }, [portalUnlocked, selectedShowId, sessionToken]);

  const handleToggleSeatHold = (seatId: string, currentlyHeldByMe: boolean) => {
    setSeatError(null);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setSeatError('Live connection is reconnecting. Please try again in a moment.');
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: currentlyHeldByMe ? 'seat:release' : 'seat:hold',
        showId: selectedShowId,
        seatId,
      })
    );
  };

  const handleReleaseAllMyHolds = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'seat:release_all',
        showId: selectedShowId,
      })
    );
  };

  const handleConfirmBooking = async (params: {
    showId: string;
    seatIds: string[];
    guestName: string;
    guestPhone: string;
  }): Promise<BookingRecord> => {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ec-session': sessionToken,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.portalStatus) {
        setPortalStatus(data.portalStatus);
        clearSession();
      }
      throw new Error(data.error || 'Booking failed.');
    }
    return data.booking as BookingRecord;
  };

  const handleToggleGate = async (enabled: boolean) => {
    const res = await fetch('/api/portal/gate-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { 'x-ec-session': sessionToken } : {}),
      },
      body: JSON.stringify({ gateEnforced: enabled }),
    });
    if (res.ok) {
      if (enabled) clearSession();
      await refreshPortalStatus();
      if (enabled) setStandeeMode(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (bootstrapping || !portalStatus) {
    return (
      <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-white p-1.5 border border-white/20 mb-4">
          <img
            src={OFFICIAL_LOGO_PATH}
            alt="Event Cinema"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain rounded-full"
          />
        </div>
        <div className="font-display font-semibold text-white">
          Loading Event Cinema (Gole Complex)...
        </div>
      </div>
    );
  }

  if (gatePreviewMode) {
    return (
      <QrGateScreen
        portalStatus={portalStatus}
        initialError={null}
        onVerifyQrPayload={verifyQrPayload}
        onOpenStandee={() => {
          setGatePreviewMode(null);
          setStandeeMode(true);
        }}
        verifying={verifyingQr}
        previewMode={gatePreviewMode}
        onExitPreview={() => setGatePreviewMode(null)}
      />
    );
  }

  if (standeeMode) {
    return (
      <QrStandeeView
        gateEnforced={portalStatus.gateEnabled}
        onToggleGate={handleToggleGate}
        onPreviewScreen={(mode) => {
          setStandeeMode(false);
          setGatePreviewMode(mode);
        }}
        onBack={() => {
          setStandeeMode(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('view');
          if (url.pathname === '/qr-poster') url.pathname = '/';
          window.history.replaceState({}, '', url.pathname + url.search);
        }}
      />
    );
  }

  if (!portalUnlocked) {
    return (
      <QrGateScreen
        portalStatus={portalStatus}
        initialError={gateError}
        onVerifyQrPayload={verifyQrPayload}
        onOpenStandee={() => setStandeeMode(true)}
        onDisableGateForPreview={() => handleToggleGate(false)}
        verifying={verifyingQr}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      <TopBar
        onNavigateSection={scrollToSection}
        onOpenLookup={() => setLookupOpen(true)}
      />

      <main className="flex-1">
        <MovieCatalogSection
          movies={movies}
          shows={shows}
          selectedShowId={selectedShowId}
          portalStatus={portalStatus}
          onSelectShow={setSelectedShowId}
          onScrollToSeats={() => scrollToSection('seat-booking')}
        />

        <SeatMapBooking
          movies={movies}
          shows={shows}
          selectedShowId={selectedShowId}
          seatState={seatState}
          clientId={clientId}
          wsConnected={wsConnected}
          onSelectShow={setSelectedShowId}
          onToggleSeatHold={handleToggleSeatHold}
          onReleaseAllMyHolds={handleReleaseAllMyHolds}
          onConfirmBooking={handleConfirmBooking}
          seatError={seatError}
          onClearSeatError={() => setSeatError(null)}
          onBookingCreated={(booking) => setActiveTicket(booking)}
        />
      </main>

      <footer id="venue-info" className="bg-[#0B1120] border-t border-white/10 py-8 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <img
              src={OFFICIAL_LOGO_PATH}
              alt="Event Cinema"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full bg-white p-0.5 object-contain border border-white/20"
            />
            <div>
              <span className="font-semibold text-white">
                {VENUE_INFO.name} ({VENUE_INFO.complex})
              </span>
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span>{VENUE_INFO.address}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span>Booking Hours: {VENUE_INFO.windowLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Box Office: {VENUE_INFO.supportPhone}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setLookupOpen(true)}
              className="text-amber-400 font-medium hover:underline cursor-pointer"
            >
              Find Ticket
            </button>
          </div>
        </div>
      </footer>

      <DigitalTicketModal
        booking={activeTicket}
        onClose={() => setActiveTicket(null)}
      />

      <TicketLookupDrawer
        open={lookupOpen}
        sessionToken={sessionToken}
        onClose={() => setLookupOpen(false)}
        onSelectTicket={(booking) => setActiveTicket(booking)}
      />
    </div>
  );
}
