import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  AUDITORIUM_SEATS,
  OFFICIAL_QR_ACCESS_KEY,
  SEAT_MAP_BY_ID,
  VENUE_INFO,
} from './src/data/cinemaCatalog.ts';
import type {
  BookingRecord,
  Movie,
  PortalStatus,
  SeatHold,
  ShowSeatState,
  ShowSummary,
  Showtime,
} from './src/types/cinema.ts';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const HOLD_TTL_MS = 5 * 60 * 1000; // 5 minutes seat hold
const MAX_SEATS_PER_BOOKING = 8;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface PortalSession {
  token: string;
  clientId: string;
  dateKey: string;
  createdAt: number;
}

interface PersistedData {
  movies: Movie[];
  shows: Showtime[];
  bookingsByDate: Record<string, BookingRecord[]>;
}

const activeSessions = new Map<string, PortalSession>();
// key: `${dateKey}:${showId}` -> Map<seatId, SeatHold>
const activeHolds = new Map<string, Map<string, SeatHold>>();
// Gate enforcement paused by default so owner can enter & preview freely before deploying QR standee
let gateEnforced = false;

interface ExtendedWebSocket extends WebSocket {
  clientId?: string;
  sessionToken?: string;
  subscribedShowId?: string;
  isAlive?: boolean;
}

function getNepalTimeInfo() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  const second = Number(map.second);

  const nstDateKey = `${map.year}-${map.month}-${map.day}`;

  const nstTimeFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kathmandu',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  const nstDateFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kathmandu',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  // Portal strictly open between 12:00 PM (12:00) and 3:00 PM (15:00) Nepal Standard Time
  const withinOperatingHours = hour >= 12 && hour < 15;

  const secondsSinceMidnight = hour * 3600 + minute * 60 + second;
  let remainingSeconds: number;
  if (withinOperatingHours) {
    remainingSeconds = Math.max(1, 15 * 3600 - secondsSinceMidnight);
  } else if (hour < 12) {
    remainingSeconds = Math.max(1, 12 * 3600 - secondsSinceMidnight);
  } else {
    remainingSeconds = Math.max(1, 36 * 3600 - secondsSinceMidnight);
  }

  return {
    withinOperatingHours,
    nstTimeFormatted: `${nstTimeFormatted} NST`,
    nstDateFormatted,
    nstDateKey,
    nstHour: hour,
    nstMinute: minute,
    nstSecond: second,
    opensAtLabel: '12:00 PM NST',
    closesAtLabel: '3:00 PM NST',
    msUntilNextChange: remainingSeconds * 1000,
  };
}

function loadStore(): PersistedData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(BOOKINGS_FILE)) {
      const raw = fs.readFileSync(BOOKINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedData>;
      if (parsed && typeof parsed.bookingsByDate === 'object') {
        return {
          movies: Array.isArray(parsed.movies) ? parsed.movies : [],
          shows: Array.isArray(parsed.shows) ? parsed.shows : [],
          bookingsByDate: parsed.bookingsByDate || {},
        };
      }
    }
  } catch (err) {
    console.error('Failed to load bookings store:', err);
  }
  return { movies: [], shows: [], bookingsByDate: {} };
}

const store: PersistedData = loadStore();

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${BOOKINGS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmp, BOOKINGS_FILE);
  } catch (err) {
    console.error('Failed to persist bookings store:', err);
  }
}

function ensureDateInitialized(dateKey: string) {
  if (!store.bookingsByDate[dateKey]) {
    store.bookingsByDate[dateKey] = [];
  }
}

function getShowKey(dateKey: string, showId: string) {
  return `${dateKey}:${showId}`;
}

function getBookedSeatSet(dateKey: string, showId: string): Set<string> {
  ensureDateInitialized(dateKey);
  const bookings = store.bookingsByDate[dateKey] || [];
  const booked = new Set<string>();
  for (const b of bookings) {
    if (b.showId === showId) {
      for (const s of b.seats) {
        booked.add(s.id);
      }
    }
  }
  return booked;
}

function getActiveHoldsForShow(dateKey: string, showId: string): SeatHold[] {
  const key = getShowKey(dateKey, showId);
  const map = activeHolds.get(key);
  if (!map) return [];
  const now = Date.now();
  const list: SeatHold[] = [];
  for (const [seatId, hold] of map.entries()) {
    if (hold.expiresAt <= now) {
      map.delete(seatId);
    } else {
      list.push(hold);
    }
  }
  return list;
}

function buildShowSummaries(dateKey: string): ShowSummary[] {
  const totalSeats = AUDITORIUM_SEATS.length;
  return store.shows.map((show) => {
    const bookedCount = getBookedSeatSet(dateKey, show.id).size;
    const heldCount = getActiveHoldsForShow(dateKey, show.id).length;
    const availableCount = Math.max(0, totalSeats - bookedCount - heldCount);
    return {
      ...show,
      totalSeats,
      bookedCount,
      heldCount,
      availableCount,
    };
  });
}

function extractQrToken(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  if (trimmed === OFFICIAL_QR_ACCESS_KEY) return trimmed;
  try {
    const url = new URL(trimmed);
    const param = url.searchParams.get('access') || url.searchParams.get('qr');
    return param ? param.trim() : '';
  } catch {
    const match = trimmed.match(/[?&](?:access|qr)=([^&#]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).trim();
    }
    return trimmed;
  }
}

function createPortalSession(dateKey: string): PortalSession {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${sessionId}:${dateKey}`)
    .digest('hex')
    .slice(0, 16);
  const sessionToken = `${sessionId}.${sig}`;
  const clientId = `guest-${crypto.randomBytes(4).toString('hex')}`;
  const session: PortalSession = {
    token: sessionToken,
    clientId,
    dateKey,
    createdAt: Date.now(),
  };
  activeSessions.set(sessionToken, session);
  return session;
}

function validateSessionToken(token: string | undefined, dateKey: string): PortalSession | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  if (session.dateKey !== dateKey) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function buildPortalStatus(sessionToken?: string): PortalStatus {
  const time = getNepalTimeInfo();
  const isOpen = gateEnforced ? time.withinOperatingHours : true;
  const session = isOpen ? validateSessionToken(sessionToken, time.nstDateKey) : null;

  let reason: PortalStatus['reason'];
  if (gateEnforced && !time.withinOperatingHours) {
    reason = 'OUTSIDE_HOURS';
  } else if (gateEnforced && !session) {
    reason = sessionToken ? 'SESSION_EXPIRED' : 'QR_REQUIRED';
  }

  return {
    isOpen,
    withinOperatingHours: time.withinOperatingHours,
    gateEnabled: gateEnforced,
    sessionValid: gateEnforced ? Boolean(isOpen && session) : true,
    reason,
    nstTimeFormatted: time.nstTimeFormatted,
    nstDateFormatted: time.nstDateFormatted,
    nstDateKey: time.nstDateKey,
    nstHour: time.nstHour,
    nstMinute: time.nstMinute,
    nstSecond: time.nstSecond,
    opensAtLabel: time.opensAtLabel,
    closesAtLabel: time.closesAtLabel,
    msUntilNextChange: time.msUntilNextChange,
    clientId: session?.clientId,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Serve public assets directly in all environments
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  function getActiveViewersCount(showId: string): number {
    let count = 0;
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (ws.readyState === WebSocket.OPEN && ws.subscribedShowId === showId) {
        count += 1;
      }
    });
    return count;
  }

  function buildShowSeatState(dateKey: string, showId: string): ShowSeatState {
    return {
      showId,
      dateKey,
      bookedSeats: Array.from(getBookedSeatSet(dateKey, showId)),
      heldSeats: getActiveHoldsForShow(dateKey, showId),
      activeViewers: getActiveViewersCount(showId),
    };
  }

  function broadcastToShow(showId: string, payload: unknown) {
    const data = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (ws.readyState === WebSocket.OPEN && ws.subscribedShowId === showId) {
        ws.send(data);
      }
    });
  }

  function broadcastToAllAuthorized(payload: unknown) {
    const data = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  function broadcastShowUpdated(dateKey: string, showId: string) {
    const state = buildShowSeatState(dateKey, showId);
    broadcastToShow(showId, { type: 'seat:updated', state });
    broadcastToAllAuthorized({
      type: 'shows:summary',
      shows: buildShowSummaries(dateKey),
    });
  }

  // Middleware for gated portal endpoints
  function requirePortalAccess(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const token = req.header('x-ec-session') || undefined;
    const time = getNepalTimeInfo();

    if (!gateEnforced) {
      let session = validateSessionToken(token, time.nstDateKey);
      if (!session) {
        session = createPortalSession(time.nstDateKey);
      }
      (req as express.Request & { portalSession?: PortalSession }).portalSession =
        session;
      return next();
    }

    const status = buildPortalStatus(token);
    if (!status.isOpen) {
      return res.status(403).json({
        error: 'Portal is closed outside 12:00 PM – 3:00 PM NST.',
        code: 'OUTSIDE_HOURS',
        portalStatus: status,
      });
    }
    if (!status.sessionValid) {
      return res.status(403).json({
        error: 'Access Denied: Please scan the official Event Cinema QR code to enter.',
        code: status.reason || 'QR_REQUIRED',
        portalStatus: status,
      });
    }
    (req as express.Request & { portalSession?: PortalSession }).portalSession =
      activeSessions.get(token!)!;
    next();
  }

  // --- Portal Gate & QR Endpoints ---
  app.get('/api/portal/status', (req, res) => {
    const token = req.header('x-ec-session') || undefined;
    const time = getNepalTimeInfo();
    if (!gateEnforced) {
      let session = validateSessionToken(token, time.nstDateKey);
      if (!session) {
        session = createPortalSession(time.nstDateKey);
      }
      return res.json({
        ...buildPortalStatus(session.token),
        sessionToken: session.token,
        clientId: session.clientId,
      });
    }
    res.json(buildPortalStatus(token));
  });

  app.post('/api/portal/gate-config', (req, res) => {
    const nextEnabled = Boolean(req.body?.gateEnforced);
    gateEnforced = nextEnabled;
    if (gateEnforced) {
      activeSessions.clear();
      const time = getNepalTimeInfo();
      if (!time.withinOperatingHours) {
        const closedStatus = buildPortalStatus();
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'portal:closed',
                portalStatus: closedStatus,
              })
            );
            client.close(4003, 'Gate enabled outside 12:00 PM - 3:00 PM NST');
          }
        });
      }
    }
    res.json({
      gateEnforced,
      portalStatus: buildPortalStatus(req.header('x-ec-session') || undefined),
    });
  });

  app.post('/api/portal/verify-qr', (req, res) => {
    const time = getNepalTimeInfo();
    const rawPayload = String(req.body?.qrPayload || '');
    const extracted = extractQrToken(rawPayload);

    // 1. Always enforce 12:00 PM - 3:00 PM NST window when gate is active
    if (gateEnforced && !time.withinOperatingHours) {
      return res.status(403).json({
        allowed: false,
        reason: 'OUTSIDE_HOURS',
        message:
          'Portal Closed: Even with the official QR code, booking is strictly open between 12:00 PM and 3:00 PM NST.',
        portalStatus: buildPortalStatus(),
      });
    }

    // 2. Verify QR token matches official Event Cinema (Gole Complex) QR
    if (!extracted || extracted !== OFFICIAL_QR_ACCESS_KEY) {
      return res.status(403).json({
        allowed: false,
        reason: 'INVALID_QR',
        message:
          'Access Denied: Please scan the official Event Cinema QR code to enter.',
        portalStatus: buildPortalStatus(),
      });
    }

    // 3. Issue session token bound to today's NST date
    const session = createPortalSession(time.nstDateKey);

    return res.json({
      allowed: true,
      sessionToken: session.token,
      clientId: session.clientId,
      portalStatus: buildPortalStatus(session.token),
    });
  });

  app.get('/api/qr-standee-payload', (req, res) => {
    const proto = req.header('x-forwarded-proto') || req.protocol || 'https';
    const host = req.header('x-forwarded-host') || req.get('host');
    const baseUrl = process.env.APP_URL || `${proto}://${host}`;
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const entryUrl = `${cleanBase}/?access=${encodeURIComponent(OFFICIAL_QR_ACCESS_KEY)}`;
    const time = getNepalTimeInfo();

    res.json({
      venue: VENUE_INFO,
      entryUrl,
      qrKey: OFFICIAL_QR_ACCESS_KEY,
      isOpen: time.withinOperatingHours,
      gateEnforced,
      nstTimeFormatted: time.nstTimeFormatted,
    });
  });

  // --- Protected Booking & Real-Time Seat Endpoints ---
  app.get('/api/shows', requirePortalAccess, (_req, res) => {
    const time = getNepalTimeInfo();
    ensureDateInitialized(time.nstDateKey);
    res.json({
      dateKey: time.nstDateKey,
      dateFormatted: time.nstDateFormatted,
      movies: store.movies,
      shows: buildShowSummaries(time.nstDateKey),
    });
  });

  app.get('/api/shows/:showId/seats', requirePortalAccess, (req, res) => {
    const { showId } = req.params;
    const show = store.shows.find((s) => s.id === showId);
    if (!show) {
      return res.status(404).json({ error: 'Showtime not found.' });
    }
    const time = getNepalTimeInfo();
    res.json(buildShowSeatState(time.nstDateKey, showId));
  });

  app.post('/api/bookings', requirePortalAccess, (req, res) => {
    const session = (req as express.Request & { portalSession?: PortalSession })
      .portalSession!;
    const time = getNepalTimeInfo();
    const { showId, seatIds, guestName, guestPhone } = req.body || {};

    const show = store.shows.find((s) => s.id === showId);
    if (!show) {
      return res.status(404).json({ error: 'Selected showtime was not found.' });
    }
    const movie = store.movies.find((m) => m.id === show.movieId);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found.' });
    }

    const cleanName = String(guestName || '').trim();
    const cleanContact = String(guestPhone || '').trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanContact);
    const digitsOnly = cleanContact.replace(/\D/g, '');
    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name for ticket issuance.' });
    }
    if (!isEmail && (digitsOnly.length < 7 || digitsOnly.length > 15)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number or email address.' });
    }
    const cleanPhone = cleanContact;

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one seat to book.' });
    }
    const uniqueSeatIds = Array.from(new Set(seatIds.map((id) => String(id))));
    if (uniqueSeatIds.length > MAX_SEATS_PER_BOOKING) {
      return res
        .status(400)
        .json({ error: `Maximum ${MAX_SEATS_PER_BOOKING} seats can be booked per transaction.` });
    }

    const seatDefs = uniqueSeatIds.map((id) => SEAT_MAP_BY_ID[id]);
    if (seatDefs.some((s) => !s)) {
      return res.status(400).json({ error: 'One or more selected seats are invalid.' });
    }

    // Authoritative conflict check against booked seats and other clients' active holds
    const bookedSet = getBookedSeatSet(time.nstDateKey, showId);
    const activeShowHolds = getActiveHoldsForShow(time.nstDateKey, showId);

    for (const seatId of uniqueSeatIds) {
      if (bookedSet.has(seatId)) {
        return res.status(409).json({
          error: `Seat ${seatId} was just booked by another guest. Please select another seat.`,
          code: 'SEAT_CONFLICT',
        });
      }
      const hold = activeShowHolds.find((h) => h.seatId === seatId);
      if (hold && hold.clientId !== session.clientId) {
        return res.status(409).json({
          error: `Seat ${seatId} is currently held by another guest.`,
          code: 'SEAT_CONFLICT',
        });
      }
    }

    // Remove holds for booked seats
    const key = getShowKey(time.nstDateKey, showId);
    const showHoldMap = activeHolds.get(key);
    if (showHoldMap) {
      for (const seatId of uniqueSeatIds) {
        showHoldMap.delete(seatId);
      }
    }

    const bookingId = `EC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const seats = seatDefs.map((s) => ({
      id: s.id,
      tier: s.tier,
      priceNpr: s.priceNpr,
    }));
    const totalNpr = seats.reduce((sum, s) => sum + s.priceNpr, 0);

    const booking: BookingRecord = {
      bookingId,
      dateKey: time.nstDateKey,
      showId: show.id,
      movieId: movie.id,
      movieTitle: movie.title,
      screenName: show.screenName,
      timeLabel: show.timeLabel,
      guestName: cleanName,
      guestPhone: cleanPhone,
      seats,
      totalNpr,
      createdAt: new Date().toISOString(),
      entryQrPayload: `EC-ENTRY|${bookingId}|${show.id}|${uniqueSeatIds.join(',')}|${time.nstDateKey}`,
    };

    ensureDateInitialized(time.nstDateKey);
    store.bookingsByDate[time.nstDateKey].push(booking);
    saveStore();

    // Real-time broadcast to all connected viewers
    broadcastShowUpdated(time.nstDateKey, showId);

    return res.status(201).json({ booking });
  });

  app.get('/api/bookings/lookup', requirePortalAccess, (req, res) => {
    const query = String(req.query.q || '').trim().toLowerCase();
    if (!query) {
      return res.json({ bookings: [] });
    }
    const time = getNepalTimeInfo();
    ensureDateInitialized(time.nstDateKey);
    const allToday = store.bookingsByDate[time.nstDateKey] || [];
    const matches = allToday.filter(
      (b) =>
        (b.bookingId.toLowerCase() === query ||
          b.guestPhone.toLowerCase() === query ||
          (b.guestPhone.replace(/\D/g, '').endsWith(query.replace(/\D/g, '')) &&
            query.replace(/\D/g, '').length >= 7))
    );
    return res.json({ bookings: matches.slice(-10).reverse() });
  });

  // --- WebSocket Upgrade & Real-Time Seat Handlers ---
  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host}`);
    if (reqUrl.pathname !== '/ws') {
      return; // Let Vite handle any non-/ws upgrade or ignore
    }

    const token = reqUrl.searchParams.get('session') || undefined;
    const time = getNepalTimeInfo();
    const isOpen = gateEnforced ? time.withinOperatingHours : true;
    let session = isOpen ? validateSessionToken(token, time.nstDateKey) : null;

    if (!gateEnforced && !session) {
      session = createPortalSession(time.nstDateKey);
    }

    if (!isOpen || !session) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.clientId = session.clientId;
      extWs.sessionToken = session.token;
      extWs.isAlive = true;
      wss.emit('connection', extWs, request);
    });
  });

  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      const time = getNepalTimeInfo();
      if (gateEnforced && !time.withinOperatingHours) {
        ws.send(
          JSON.stringify({
            type: 'portal:closed',
            portalStatus: buildPortalStatus(ws.sessionToken),
          })
        );
        ws.close(4003, 'Portal closed outside 12:00 PM - 3:00 PM NST');
        return;
      }

      let msg: { type?: string; showId?: string; seatId?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const clientId = ws.clientId;
      if (!clientId) return;

      if (msg.type === 'show:subscribe' && msg.showId) {
        const prevShowId = ws.subscribedShowId;
        const showExists = store.shows.some((s) => s.id === msg.showId);
        if (!showExists) return;

        ws.subscribedShowId = msg.showId;

        if (prevShowId && prevShowId !== msg.showId) {
          broadcastToShow(prevShowId, {
            type: 'presence:count',
            showId: prevShowId,
            activeViewers: getActiveViewersCount(prevShowId),
          });
        }

        ws.send(
          JSON.stringify({
            type: 'show:state',
            state: buildShowSeatState(time.nstDateKey, msg.showId),
          })
        );

        broadcastToShow(msg.showId, {
          type: 'presence:count',
          showId: msg.showId,
          activeViewers: getActiveViewersCount(msg.showId),
        });
      } else if (msg.type === 'seat:hold' && msg.showId && msg.seatId) {
        const { showId, seatId } = msg;
        if (!SEAT_MAP_BY_ID[seatId]) return;
        const booked = getBookedSeatSet(time.nstDateKey, showId);
        if (booked.has(seatId)) {
          ws.send(
            JSON.stringify({
              type: 'seat:rejected',
              showId,
              seatId,
              reason: 'Seat already booked.',
            })
          );
          return;
        }

        const key = getShowKey(time.nstDateKey, showId);
        let showMap = activeHolds.get(key);
        if (!showMap) {
          showMap = new Map();
          activeHolds.set(key, showMap);
        }

        // Purge expired
        const now = Date.now();
        for (const [id, hold] of showMap.entries()) {
          if (hold.expiresAt <= now) showMap.delete(id);
        }

        const existing = showMap.get(seatId);
        if (existing && existing.clientId !== clientId) {
          ws.send(
            JSON.stringify({
              type: 'seat:rejected',
              showId,
              seatId,
              reason: 'Seat is currently held by another guest.',
            })
          );
          return;
        }

        // Count this client's holds
        let clientHoldCount = 0;
        for (const hold of showMap.values()) {
          if (hold.clientId === clientId) clientHoldCount += 1;
        }
        if (!existing && clientHoldCount >= MAX_SEATS_PER_BOOKING) {
          ws.send(
            JSON.stringify({
              type: 'seat:rejected',
              showId,
              seatId,
              reason: `Maximum ${MAX_SEATS_PER_BOOKING} seats can be held at once.`,
            })
          );
          return;
        }

        showMap.set(seatId, {
          seatId,
          clientId,
          expiresAt: now + HOLD_TTL_MS,
        });
        broadcastShowUpdated(time.nstDateKey, showId);
      } else if (msg.type === 'seat:release' && msg.showId && msg.seatId) {
        const key = getShowKey(time.nstDateKey, msg.showId);
        const showMap = activeHolds.get(key);
        if (!showMap) return;
        const existing = showMap.get(msg.seatId);
        if (existing && existing.clientId === clientId) {
          showMap.delete(msg.seatId);
          broadcastShowUpdated(time.nstDateKey, msg.showId);
        }
      } else if (msg.type === 'seat:release_all' && msg.showId) {
        const key = getShowKey(time.nstDateKey, msg.showId);
        const showMap = activeHolds.get(key);
        if (!showMap) return;
        let changed = false;
        for (const [seatId, hold] of showMap.entries()) {
          if (hold.clientId === clientId) {
            showMap.delete(seatId);
            changed = true;
          }
        }
        if (changed) {
          broadcastShowUpdated(time.nstDateKey, msg.showId);
        }
      }
    });

    ws.on('close', () => {
      const time = getNepalTimeInfo();
      const clientId = ws.clientId;
      const showId = ws.subscribedShowId;

      if (clientId) {
        // Release unconfirmed holds for this disconnected client
        for (const [key, showMap] of activeHolds.entries()) {
          let changed = false;
          for (const [seatId, hold] of showMap.entries()) {
            if (hold.clientId === clientId) {
              showMap.delete(seatId);
              changed = true;
            }
          }
          if (changed) {
            const [dateKey, sId] = key.split(':');
            if (dateKey === time.nstDateKey && sId) {
              broadcastShowUpdated(dateKey, sId);
            }
          }
        }
      }

      if (showId) {
        broadcastToShow(showId, {
          type: 'presence:count',
          showId,
          activeViewers: getActiveViewersCount(showId),
        });
      }
    });
  });

  // Periodic sweep: expire holds + enforce 3:00 PM NST portal cutoff in real time when gate is enabled
  let lastOpenState = getNepalTimeInfo().withinOperatingHours;
  setInterval(() => {
    const time = getNepalTimeInfo();
    const now = Date.now();

    // Heartbeat ping
    wss.clients.forEach((client) => {
      const extWs = client as ExtendedWebSocket;
      if (extWs.isAlive === false) {
        extWs.terminate();
        return;
      }
      extWs.isAlive = false;
      extWs.ping();
    });

    // If gate is enforced and portal transitioned from open -> closed at 3:00 PM NST, lock everyone out immediately
    if (gateEnforced && lastOpenState && !time.withinOperatingHours) {
      activeSessions.clear();
      activeHolds.clear();
      const closedStatus = buildPortalStatus();
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: 'portal:closed',
              portalStatus: closedStatus,
            })
          );
          client.close(4003, 'Booking window ended at 3:00 PM NST');
        }
      });
    }
    lastOpenState = time.withinOperatingHours;

    // Expire timed-out holds
    for (const [key, showMap] of activeHolds.entries()) {
      let changed = false;
      for (const [seatId, hold] of showMap.entries()) {
        if (hold.expiresAt <= now) {
          showMap.delete(seatId);
          changed = true;
        }
      }
      if (changed) {
        const [dateKey, showId] = key.split(':');
        if (dateKey === time.nstDateKey && showId) {
          broadcastShowUpdated(dateKey, showId);
        }
      }
    }
  }, 5000);

  // Vite middleware in dev, static dist in production
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' &&
      fs.existsSync(path.join(distDir, 'index.html')));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Event Cinemas (Gole Complex) server listening on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
