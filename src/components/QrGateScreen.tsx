import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Clock, Lock, QrCode, Upload, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { OFFICIAL_LOGO_PATH, VENUE_INFO } from '../data/cinemaCatalog';
import type { PortalStatus } from '../types/cinema';

interface QrGateScreenProps {
  portalStatus: PortalStatus;
  initialError?: string | null;
  onVerifyQrPayload: (payload: string) => Promise<void>;
  onOpenStandee: () => void;
  onDisableGateForPreview?: () => void;
  verifying: boolean;
  previewMode?: 'closed' | 'denied' | null;
  onExitPreview?: () => void;
}

function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export const QrGateScreen: React.FC<QrGateScreenProps> = ({
  portalStatus,
  initialError,
  onVerifyQrPayload,
  onOpenStandee,
  onDisableGateForPreview,
  verifying,
  previewMode = null,
  onExitPreview,
}) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(initialError || null);
  const [countdownMs, setCountdownMs] = useState(portalStatus.msUntilNextChange);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setScanError(initialError || null);
  }, [initialError]);

  useEffect(() => {
    setCountdownMs(portalStatus.msUntilNextChange);
    const timer = window.setInterval(() => {
      setCountdownMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [portalStatus.msUntilNextChange]);

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCameraScanner = async () => {
    setScanError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError('Camera access is not supported in this browser. You can upload a QR image instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setScannerOpen(true);

      window.setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.play().catch(() => {});

        const scanFrame = () => {
          const vid = videoRef.current;
          const canvas = canvasRef.current;
          if (!vid || !canvas || !streamRef.current) return;

          if (vid.readyState === vid.HAVE_ENOUGH_DATA) {
            canvas.width = vid.videoWidth;
            canvas.height = vid.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (code?.data) {
                stopCamera();
                onVerifyQrPayload(code.data);
                return;
              }
            }
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };
        rafRef.current = requestAnimationFrame(scanFrame);
      }, 80);
    } catch {
      setScanError(
        'Camera permission was denied or no camera was detected. Scan with your phone camera or upload the official QR image.'
      );
      stopCamera();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setScanError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setScanError('Could not process the selected image.');
        return;
      }
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (!code?.data) {
        setScanError('No valid QR code was detected in that image.');
        return;
      }
      await onVerifyQrPayload(code.data);
    } catch {
      setScanError('Unable to decode QR code from the uploaded image.');
    }
  };

  const isClosed =
    previewMode === 'closed' ||
    (previewMode !== 'denied' && !portalStatus.withinOperatingHours);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col justify-between px-4 py-8 sm:py-12">
      <div className="max-w-2xl w-full mx-auto my-auto">
        {previewMode && onExitPreview && (
          <div className="mb-4 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-200 text-xs">
            <span>
              Previewing <strong>{previewMode === 'closed' ? 'Portal Closed (3:01 PM – 11:59 AM)' : 'Access Denied (No QR)'}</strong> screen
            </span>
            <button
              type="button"
              onClick={onExitPreview}
              className="font-semibold text-amber-300 hover:text-white underline cursor-pointer"
            >
              Return to Portal
            </button>
          </div>
        )}

        <div className="bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Top Brand Header Strip */}
          <div className="bg-[#0B1120] border-b border-white/10 px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-white p-1 shrink-0 shadow-lg">
              <img
                src={OFFICIAL_LOGO_PATH}
                alt="Event Cinema Gole Complex Official Logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-xs font-medium tracking-wider uppercase text-amber-400 mb-1">
                {VENUE_INFO.complex} · {VENUE_INFO.address}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {VENUE_INFO.name} ({VENUE_INFO.complex})
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Online Ticket Booking Portal · No Login Required
              </p>
            </div>
          </div>

          {/* Operating Schedule & Live Clock Bar */}
          <div className="border-b border-white/10 bg-[#0B1120]/60 px-6 py-3.5 sm:px-8 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Active Booking Hours: <strong className="font-semibold text-white">12:00 PM – 3:00 PM</strong>
              </span>
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-400">
              {portalStatus.nstDateFormatted} · {portalStatus.nstTimeFormatted}
            </div>
          </div>

          {/* Main Gate Body */}
          <div className="p-6 sm:p-8">
            {isClosed ? (
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-5 rounded-xl bg-amber-950/40 border border-amber-500/30">
                  <Lock className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">
                      Portal Closed
                    </h2>
                    <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                      Online booking at Event Cinema (Gole Complex) is strictly open during daytime hours between{' '}
                      <strong className="text-amber-300">12:00 PM (noon) and 3:00 PM</strong> daily. Outside these hours (3:01 PM to 11:59 AM), portal access is closed even with a valid QR scan.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 rounded-xl border border-white/10 bg-[#0B1120]">
                    <div className="text-xs font-medium text-slate-400">Active Booking Hours</div>
                    <div className="font-display text-xl font-bold text-white mt-1">
                      12:00 PM – 3:00 PM
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Daily (Nepal Standard Time)
                    </div>
                  </div>
                  <div className="p-5 rounded-xl border border-white/10 bg-[#0B1120]">
                    <div className="text-xs font-medium text-slate-400">Opens In</div>
                    <div className="font-mono text-xl font-bold text-amber-400 tabular-nums mt-1">
                      {formatDurationMs(countdownMs)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Next opening at 12:00 PM NST
                    </div>
                  </div>
                </div>

                {scanError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-sm text-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{scanError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start gap-4 p-5 rounded-xl bg-red-950/35 border border-red-500/30">
                  <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                      Access Denied: Please scan the official Event Cinema QR code to enter
                    </h2>
                    <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
                      Direct browser entry is restricted. Scan the official Event Cinema (Gole Complex) QR standee (<code className="font-mono text-amber-300">?access=qr_verified</code>) using your phone camera or the scanner below.
                    </p>
                  </div>
                </div>

                {scanError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-sm text-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{scanError}</span>
                  </div>
                )}

                {scannerOpen ? (
                  <div className="rounded-xl border border-white/15 bg-black overflow-hidden relative">
                    <video
                      ref={videoRef}
                      className="w-full max-h-[320px] object-cover"
                      muted
                      playsInline
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-48 h-48 border-2 border-amber-400 rounded-xl shadow-[0_0_0_9999px_rgba(7,11,20,0.6)]" />
                    </div>
                    <div className="p-3 bg-[#0B1120] text-white flex items-center justify-between text-xs">
                      <span>Point camera at the Event Cinema QR code</span>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Close Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      disabled={verifying || Boolean(previewMode)}
                      onClick={startCameraScanner}
                      className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-amber-400 text-[#070B14] font-semibold text-sm hover:bg-amber-300 disabled:opacity-60 transition-colors cursor-pointer min-h-[48px]"
                    >
                      <Camera className="w-4 h-4" />
                      {verifying ? 'Verifying QR Code...' : 'Scan Official QR Code'}
                    </button>

                    <button
                      type="button"
                      disabled={verifying || Boolean(previewMode)}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl border border-white/15 bg-[#162038] text-white font-medium text-sm hover:bg-[#1E2C4D] disabled:opacity-60 transition-colors cursor-pointer min-h-[48px]"
                    >
                      <Upload className="w-4 h-4" />
                      Upload QR Image
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                )}

                <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    Window closes in{' '}
                    <strong className="font-mono tabular-nums text-white">
                      {formatDurationMs(countdownMs)}
                    </strong>
                  </span>
                  <span>Box Office: {VENUE_INFO.supportPhone}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 px-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={onOpenStandee}
            className="text-amber-400 font-medium underline underline-offset-4 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Open Venue QR Generator & Gate Settings
          </button>
          {onDisableGateForPreview && (
            <button
              type="button"
              onClick={onDisableGateForPreview}
              className="text-slate-300 hover:text-white underline underline-offset-4 cursor-pointer"
            >
              Pause Gate Lock (Open Preview Mode)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
