import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { scannerSound } from './scanner-sound';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Flashlight,
  LogOut,
  Search,
  UserPlus,
  WifiOff,
  XCircle,
  Utensils,
  PackageCheck,
  DoorOpen,
} from 'lucide-react';

export type ScanMode = 'GATE' | 'MEAL' | 'KIT';

export const YELLOW_REASONS = {
  WRONG_EVENT: 'Wrong Event — Ticket registered for another event',
  INVALID_TOKEN: 'Invalid Ticket — Unrecognized token',
  VOID: 'Ticket Voided — Cancelled registration',
  NOT_CHECKED_IN: 'Not Checked In — Entry check-in required before Meal/Kit redemption',
};

interface ScanFeedbackState {
  result: 'GREEN' | 'RED' | 'YELLOW';
  title: string;
  subtitle: string;
  detail?: string;
  meta?: string;
}

interface GateStats {
  gate: {
    checkedIn: number;
    total: number;
  };
  meal: {
    claimed: number;
    total: number;
  };
  kit: {
    claimed: number;
    total: number;
  };
}

function parseScannerToken(token: string): {
  eventId?: string;
  eventTitle?: string;
  volunteerName?: string;
  exp?: number;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const base64Url = parts[1]!;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      let json = '';
      try {
        json = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
      } catch {
        json = atob(base64);
      }
      return JSON.parse(json);
    }
  } catch {
    // Malformed token or non-JWT
  }
  return null;
}

const TOKEN_REGEX = /^ev_tok_[A-Za-z0-9]{25}$/;

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();

  // Session state from sessionStorage
  const [sessionInfo, setSessionInfo] = useState<{
    eventId: string;
    eventTitle: string;
    volunteerName: string;
  } | null>(null);

  // Hardware / Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isInitializingRef = useRef(false);
  const isMountedRef = useRef(true);

  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // App & Scan states
  const [mode, setMode] = useState<ScanMode>('GATE');
  const [feedback, setFeedback] = useState<ScanFeedbackState | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const isOfflineRef = useRef(isOffline);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);
  const [stats, setStats] = useState<GateStats>({
    gate: { checkedIn: 0, total: 0 },
    meal: { claimed: 0, total: 0 },
    kit: { claimed: 0, total: 0 },
  });

  // Sheets state
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [lookupRollNumber, setLookupRollNumber] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [isSpotOpen, setIsSpotOpen] = useState(false);
  const [spotRollNumber, setSpotRollNumber] = useState('');
  const [isSpotSubmitting, setIsSpotSubmitting] = useState(false);

  // Debouncing token processing
  const lastScannedRef = useRef<{ token: string; timestamp: number }>({
    token: '',
    timestamp: 0,
  });
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial authentication and authoritative event context resolution
  useEffect(() => {
    const token =
      sessionStorage.getItem('eventora_scanner_token') ||
      localStorage.getItem('eventora_scanner_token') ||
      localStorage.getItem('scanner_token');

    if (!token) {
      navigate('/scanner/unlock', { replace: true });
      return;
    }

    // Decode token payload
    const decoded = parseScannerToken(token);

    // Inspect stored event
    const rawStored =
      sessionStorage.getItem('eventora_scanner_event') ||
      localStorage.getItem('eventora_scanner_event') ||
      localStorage.getItem('scanner_session');

    let parsedStored: { eventId?: string; eventTitle?: string; volunteerName?: string } | null = null;
    if (rawStored) {
      try {
        parsedStored = JSON.parse(rawStored);
      } catch {
        // ignore
      }
    }

    // If token is a 3-part JWT, validate expiration and event consistency
    if (decoded) {
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        sessionStorage.removeItem('eventora_scanner_token');
        sessionStorage.removeItem('eventora_scanner_event');
        localStorage.removeItem('eventora_scanner_token');
        localStorage.removeItem('eventora_scanner_event');
        localStorage.removeItem('scanner_token');
        localStorage.removeItem('scanner_session');
        navigate('/scanner/unlock', { replace: true });
        return;
      }

      // Crucial: Discard stale stored event if its eventId does not match the token's authoritative eventId
      if (parsedStored && parsedStored.eventId && decoded.eventId && parsedStored.eventId !== decoded.eventId) {
        parsedStored = null;
      }
    }

    const eventId = decoded?.eventId || parsedStored?.eventId;
    if (!eventId) {
      navigate('/scanner/unlock', { replace: true });
      return;
    }

    const authoritativeEvent = {
      eventId,
      eventTitle: decoded?.eventTitle || parsedStored?.eventTitle || 'Campus Gate',
      volunteerName: decoded?.volunteerName || parsedStored?.volunteerName || 'Volunteer',
    };

    setSessionInfo(authoritativeEvent);

    // Synchronize storage
    sessionStorage.setItem('eventora_scanner_token', token);
    sessionStorage.setItem('eventora_scanner_event', JSON.stringify(authoritativeEvent));

    // Verify and hydrate authoritative context from server
    api
      .get<{
        eventId: string;
        eventTitle: string;
        volunteerName: string;
      }>('/gate/context', { showToast: false })
      .then((res) => {
        if (res && res.eventId) {
          setSessionInfo({
            eventId: res.eventId,
            eventTitle: res.eventTitle,
            volunteerName: res.volunteerName,
          });
          const updated = JSON.stringify({
            eventId: res.eventId,
            eventTitle: res.eventTitle,
            volunteerName: res.volunteerName,
          });
          sessionStorage.setItem('eventora_scanner_event', updated);
          localStorage.setItem('eventora_scanner_event', updated);
        }
      })
      .catch((err: any) => {
        if (err?.statusCode === 401 || err?.statusCode === 403 || err?.status === 401 || err?.status === 403) {
          sessionStorage.removeItem('eventora_scanner_token');
          sessionStorage.removeItem('eventora_scanner_event');
          localStorage.removeItem('eventora_scanner_token');
          localStorage.removeItem('eventora_scanner_event');
          localStorage.removeItem('scanner_token');
          localStorage.removeItem('scanner_session');
          navigate('/scanner/unlock', { replace: true });
        }
      });
  }, [navigate]);

  // 2. Offline network listener (Atomic guard: pauses processing when offline)
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      isOfflineRef.current = false;
    };
    const handleOffline = () => {
      setIsOffline(true);
      isOfflineRef.current = true;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. Load stats
  const fetchStats = useCallback(async () => {
    if (!sessionInfo?.eventId) return;
    try {
      const res = await api.get<{
        stats: {
          checkedInCount?: number;
          totalRegistrations?: number;
          mealClaimedCount?: number;
          kitClaimedCount?: number;
        };
      }>(`/gate/stats?eventId=${sessionInfo.eventId}`, { showToast: false });

      if (res && res.stats) {
        setStats({
          gate: {
            checkedIn: res.stats.checkedInCount || 0,
            total: res.stats.totalRegistrations || 0,
          },
          meal: {
            claimed: res.stats.mealClaimedCount || 0,
            total: res.stats.totalRegistrations || 0,
          },
          kit: {
            claimed: res.stats.kitClaimedCount || 0,
            total: res.stats.totalRegistrations || 0,
          },
        });
      }
    } catch {
      // Non-blocking
    }
  }, [sessionInfo?.eventId]);

  useEffect(() => {
    if (sessionInfo?.eventId) {
      void fetchStats();
      const interval = setInterval(fetchStats, 10000);
      return () => clearInterval(interval);
    }
  }, [sessionInfo?.eventId, fetchStats]);

  // 4. Trigger feedback view with audio and auto-reset
  const showFeedback = useCallback((fb: ScanFeedbackState) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }

    setFeedback(fb);

    if (fb.result === 'GREEN') {
      scannerSound.playSuccessChime();
    } else if (fb.result === 'RED') {
      scannerSound.playErrorBuzzer();
    } else {
      scannerSound.playWarningTone();
    }

    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(null);
    }, 1500);
  }, []);

  const dismissFeedback = () => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedback(null);
  };

  // 5. Submit Scan to backend
  const handleTokenScanned = useCallback(
    async (token: string) => {
      if (!sessionInfo?.eventId) return;

      // Offline check: Atomic guard - halt and prohibit scan attempts immediately
      if (typeof navigator !== 'undefined' && (!navigator.onLine || isOfflineRef.current)) {
        setIsOffline(true);
        isOfflineRef.current = true;
        return;
      }

      // Local Regex format validation: map malformed tokens directly to YELLOW INVALID_TOKEN
      if (!TOKEN_REGEX.test(token)) {
        showFeedback({
          result: 'YELLOW',
          title: 'TICKET REJECTED',
          subtitle: YELLOW_REASONS.INVALID_TOKEN,
          detail: 'INVALID_TOKEN',
        });
        return;
      }

      // 2000ms debounce per identical token
      const now = Date.now();
      if (
        lastScannedRef.current.token === token &&
        now - lastScannedRef.current.timestamp < 2000
      ) {
        return;
      }
      lastScannedRef.current = { token, timestamp: now };

      try {
        const res = await api.post<any>(
          '/gate/scan',
          {
            eventId: sessionInfo.eventId,
            token,
            mode,
          },
          { showToast: false }
        );

        if (res.result === 'GREEN') {
          const attendeeName =
            res.attendee?.fullName || res.attendee?.firstName || 'Attendee';
          const roll = res.attendee?.rollNumber ? ` (${res.attendee.rollNumber})` : '';
          showFeedback({
            result: 'GREEN',
            title: mode === 'GATE' ? 'ENTRY VALIDATED' : `${mode} REDEEMED`,
            subtitle: `${attendeeName}${roll}`,
            detail: res.message || 'Access granted.',
            meta: `Ticket: ${token.slice(0, 11)}...`,
          });
          void fetchStats();
        } else if (res.result === 'RED') {
          const firstScanTime = res.scannedAt
            ? new Date(res.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Earlier';
          const scannerBy = res.scannedByLabel ? ` by ${res.scannedByLabel}` : '';
          showFeedback({
            result: 'RED',
            title: 'DUPLICATE TICKET',
            subtitle: `First scanned: ${firstScanTime}${scannerBy}`,
            detail: 'Entry rejected. Potential screenshot sharing detected.',
            meta: `Token: ${token.slice(0, 11)}...`,
          });
        } else {
          // Accurate YELLOW feedback mapping
          const code = (res.code || res.error || (res as any).reason || 'INVALID_TOKEN') as string;
          const subtitle =
            (YELLOW_REASONS as Record<string, string>)[code] ||
            res.message ||
            YELLOW_REASONS.INVALID_TOKEN;
          showFeedback({
            result: 'YELLOW',
            title: 'TICKET REJECTED',
            subtitle,
            detail: code,
          });
        }
      } catch (err: any) {
        // Connection error detection: immediately pause processing, show amber banner, drop unconfirmed scan
        const isConnError =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          err?.name === 'TypeError' ||
          err?.message?.toLowerCase().includes('network') ||
          err?.message?.toLowerCase().includes('failed to fetch') ||
          err?.message?.toLowerCase().includes('connection');

        if (isConnError) {
          setIsOffline(true);
          isOfflineRef.current = true;
          // Live database connection required - unconfirmed scan dropped completely, never queued or cached
          return;
        }

        const code = (err.code || 'INVALID_TOKEN') as string;
        const subtitle =
          (YELLOW_REASONS as Record<string, string>)[code] ||
          err.message ||
          YELLOW_REASONS.INVALID_TOKEN;
        showFeedback({
          result: 'YELLOW',
          title: 'TICKET REJECTED',
          subtitle,
          detail: code,
        });
      }
    },
    [sessionInfo?.eventId, mode, showFeedback, fetchStats]
  );

  // 6. Camera scanning loop (active while camera stream is live)
  useEffect(() => {
    if (!isCameraActive) return;

    let active = true;

    const tick = async () => {
      if (!active) return;

      // Atomic offline guard: immediately pause camera processing loop when offline
      if (typeof navigator !== 'undefined' && (!navigator.onLine || isOfflineRef.current)) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
        // Fast path: BarcodeDetector API if available
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: ['qr_code'],
            });
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
              const detected = barcodes[0].rawValue;
              void handleTokenScanned(detected);
            }
          } catch {
            // Fall through to jsQR
          }
        } else {
          // Fallback: Canvas snapshot + jsQR
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              void handleTokenScanned(code.data);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isCameraActive, handleTokenScanned]);

  // Test event listener to simulate scans in automated test runners
  useEffect(() => {
    const handleTestScanEvent = (e: any) => {
      if (e.detail?.token) {
        void handleTokenScanned(e.detail.token);
      }
    };
    window.addEventListener('eventora:test-scan', handleTestScanEvent);
    return () => {
      window.removeEventListener('eventora:test-scan', handleTestScanEvent);
    };
  }, [handleTokenScanned]);

  // 7. Stop Camera Stream
  const stopCameraStream = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    trackRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // 8. Initialize Camera with Progressive Constraints and Error Recovery
  const initCamera = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API is not supported in this browser.');
        return;
      }

      // If active stream is already live, keep running without redundant hardware request
      if (
        streamRef.current &&
        streamRef.current.active &&
        streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
      ) {
        setIsCameraActive(true);
        setCameraError(null);
        return;
      }

      // Step A: Request camera with progressive fallback (ideal environment -> basic video)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (constraintErr: any) {
        if (
          constraintErr.name === 'OverconstrainedError' ||
          constraintErr.name === 'ConstraintNotSatisfiedError'
        ) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        } else {
          throw constraintErr;
        }
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      trackRef.current = track;

      if (track) {
        track.onended = () => {
          if (isMountedRef.current) {
            setIsCameraActive(false);
          }
        };

        const capabilities = (track.getCapabilities?.() as any) || {};
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;

        video.onplaying = () => {
          if (isMountedRef.current) {
            setIsCameraActive(true);
            setCameraError(null);
          }
        };

        try {
          await video.play();
          if (isMountedRef.current) {
            setIsCameraActive(true);
            setCameraError(null);
          }
        } catch (playErr: any) {
          // In Edge / Chromium, video.play() can reject with AbortError if interrupted
          if (playErr.name === 'AbortError') {
            if (video.readyState >= 2 || !video.paused) {
              setIsCameraActive(true);
              setCameraError(null);
            }
          } else if (playErr.name === 'NotAllowedError') {
            try {
              video.muted = true;
              await video.play();
              setIsCameraActive(true);
              setCameraError(null);
            } catch {
              setCameraError('Tap anywhere to enable camera preview.');
            }
          } else {
            if (!stream.active) {
              setCameraError('Failed to start video stream playback.');
            }
          }
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission denied. Please allow camera access in browser settings to scan tickets.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('No camera device found on this system.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          'Camera is in use by another application. Please close other camera tabs and retry.'
        );
      } else {
        setCameraError('Failed to access camera stream. Please check camera connection.');
      }
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  const retryCamera = useCallback(async () => {
    setCameraError(null);
    stopCameraStream();
    await initCamera();
  }, [stopCameraStream, initCamera]);

  useEffect(() => {
    isMountedRef.current = true;
    void initCamera();

    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, [initCamera, stopCameraStream]);

  // Torch toggle
  const toggleTorch = async () => {
    if (!trackRef.current || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await (trackRef.current as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch {
      // Ignore torch error
    }
  };

  // Exit Scanner
  const handleExit = () => {
    stopCameraStream();
    sessionStorage.removeItem('eventora_scanner_token');
    sessionStorage.removeItem('eventora_scanner_event');
    localStorage.removeItem('eventora_scanner_token');
    localStorage.removeItem('eventora_scanner_event');
    localStorage.removeItem('scanner_token');
    localStorage.removeItem('scanner_session');
    navigate('/scanner/unlock', { replace: true });
  };

  // Manual Roll Number Lookup
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRollNumber.trim() || !sessionInfo?.eventId) return;

    setIsLookingUp(true);
    setLookupResult(null);

    try {
      const res = await api.get<any>(
        `/gate/lookup?eventId=${sessionInfo.eventId}&rollNumber=${encodeURIComponent(
          lookupRollNumber.trim()
        )}`,
        { showToast: false }
      );
      setLookupResult(res);
    } catch (err: any) {
      setLookupResult({
        error: err.message || 'Attendee not found with this roll number.',
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  // Manual Check-In
  const handleManualCheckin = async () => {
    if (!lookupRollNumber.trim() || !sessionInfo?.eventId) return;
    setIsLookingUp(true);

    try {
      const res = await api.post<any>(
        '/gate/manual-checkin',
        {
          eventId: sessionInfo.eventId,
          rollNumber: lookupRollNumber.trim(),
        },
        { showToast: false }
      );

      setIsLookupOpen(false);
      setLookupRollNumber('');
      setLookupResult(null);

      showFeedback({
        result: res.result || 'GREEN',
        title: 'MANUAL ENTRY CONFIRMED',
        subtitle: `${res.attendee?.fullName || lookupRollNumber} (${res.attendee?.rollNumber || lookupRollNumber})`,
        detail: res.message || 'Checked in successfully.',
      });
      void fetchStats();
    } catch (err: any) {
      showFeedback({
        result: 'YELLOW',
        title: 'MANUAL ENTRY FAILED',
        subtitle: err.message || 'Check-in error',
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  // Spot Register
  const handleSpotRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotRollNumber.trim() || !sessionInfo?.eventId) return;

    setIsSpotSubmitting(true);
    try {
      const res = await api.post<any>(
        '/gate/spot-register',
        {
          eventId: sessionInfo.eventId,
          rollNumber: spotRollNumber.trim(),
        },
        { showToast: false }
      );

      setIsSpotOpen(false);
      setSpotRollNumber('');

      showFeedback({
        result: 'GREEN',
        title: 'SPOT WALK-IN REGISTERED',
        subtitle: `${res.attendee?.fullName || spotRollNumber} (${res.attendee?.rollNumber || spotRollNumber})`,
        detail: res.message || 'Spot pass issued and checked in.',
      });
      void fetchStats();
    } catch (err: any) {
      showFeedback({
        result: 'YELLOW',
        title: 'SPOT REGISTER REJECTED',
        subtitle: err.message || 'Walk-in registration failed',
      });
    } finally {
      setIsSpotSubmitting(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none text-white font-sans flex flex-col justify-between">
      {/* Offscreen canvas for jsQR analysis */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden input for test scan simulation */}
      <input
        type="text"
        data-testid="scanner-simulated-input"
        className="sr-only"
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.value) {
            void handleTokenScanned(e.target.value);
            e.target.value = '';
          }
        }}
      />

      {/* Edge-to-edge camera viewport */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        data-testid="scanner-video-feed"
        className="absolute inset-0 h-full w-full object-cover z-0"
      />

      {/* Dim vignette / gradient on top and bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none z-10" />

      {/* Offline banner guard: Amber (#D97706) with dark slate text (#0F172A) */}
      {isOffline && (
        <div
          data-testid="scanner-offline-banner"
          className="absolute top-0 inset-x-0 z-50 bg-[#D97706] text-[#0F172A] px-4 py-3 font-bold text-center text-sm flex items-center justify-center gap-2 shadow-lg animate-in slide-in-from-top"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-[#0F172A]" />
          <span>Offline: scanning paused. Live database connection required.</span>
        </div>
      )}

      {/* Top Header bar with Volunteer session info */}
      <header className="relative z-20 flex items-center justify-between px-4 pt-4 sm:pt-6">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            {sessionInfo?.eventTitle || 'Campus Gate'}
          </span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-white">
              {sessionInfo?.volunteerName || 'Volunteer'}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExit}
          data-testid="scanner-exit-button"
          className="border-white/20 bg-black/40 text-white hover:bg-white/20 gap-1.5 h-9 backdrop-blur-md rounded-full px-3"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-xs font-semibold">Lock</span>
        </Button>
      </header>

      {/* Center Target Frame */}
      <div className="relative z-20 flex flex-col items-center justify-center pointer-events-none my-auto">
        {cameraError && !isCameraActive ? (
          <div className="max-w-xs text-center p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-300 space-y-3 pointer-events-auto backdrop-blur-lg">
            <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
            <p className="text-sm font-medium">{cameraError}</p>
            <Button
              size="sm"
              onClick={retryCamera}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              Retry Camera
            </Button>
          </div>
        ) : (
          <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
            {/* Glowing corners */}
            <div className="absolute inset-0 border-2 border-indigo-400/40 rounded-3xl" />
            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-2xl shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-2xl shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-2xl shadow-[0_0_15px_rgba(99,102,241,0.8)]" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-2xl shadow-[0_0_15px_rgba(99,102,241,0.8)]" />

            {/* Scanning line animation */}
            <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_8px_rgba(129,140,248,0.9)] animate-pulse" />

            <div className="text-center space-y-1">
              <Camera className="h-8 w-8 text-white/40 mx-auto animate-bounce" />
              <p className="text-xs font-semibold tracking-wider uppercase text-white/70">
                Align QR Code
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen 3-Colour Feedback Overlay */}
      {feedback && (
        <div
          onClick={dismissFeedback}
          data-testid={`scanner-feedback-${feedback.result.toLowerCase()}`}
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer animate-in fade-in zoom-in-95 duration-150 ${
            feedback.result === 'GREEN'
              ? 'bg-[#059669] text-white'
              : feedback.result === 'RED'
              ? 'bg-[#E11D48] text-white'
              : 'bg-[#D97706] text-[#0F172A]'
          }`}
        >
          <div className="space-y-4 max-w-md mx-auto">
            {feedback.result === 'GREEN' && (
              <CheckCircle2 className="h-24 w-24 text-white mx-auto drop-shadow-md animate-bounce" />
            )}
            {feedback.result === 'RED' && (
              <XCircle className="h-24 w-24 text-white mx-auto drop-shadow-md animate-pulse" />
            )}
            {feedback.result === 'YELLOW' && (
              <AlertTriangle className="h-24 w-24 text-[#0F172A] mx-auto drop-shadow-md" />
            )}

            <div className="space-y-1">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight uppercase">
                {feedback.title}
              </h2>
              <p className="text-xl sm:text-2xl font-bold opacity-95">
                {feedback.subtitle}
              </p>
            </div>

            {feedback.detail && (
              <p className="text-sm font-medium opacity-85 px-4">
                {feedback.detail}
              </p>
            )}

            {feedback.meta && (
              <p className="font-mono text-xs opacity-75 pt-2">
                {feedback.meta}
              </p>
            )}

            <p className="text-xs font-semibold uppercase tracking-widest pt-6 opacity-60">
              Tap anywhere to resume
            </p>
          </div>
        </div>
      )}

      {/* Bottom Reach Controls (Single Handed Thumb Zone) */}
      <div className="relative z-20 pb-safe pt-2 px-3 sm:px-4 space-y-3">
        {/* Live Counters Pill: Checked In, Total Remaining, Meals, Kits */}
        <div className="flex items-center justify-around bg-slate-900/80 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 text-xs font-medium">
          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold flex items-center gap-1 text-[11px]">
              <DoorOpen className="h-3.5 w-3.5 text-indigo-400" />
              Checked In
            </span>
            <span className="font-bold text-white text-sm tabular-nums">
              {stats.gate.checkedIn}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold flex items-center gap-1 text-[11px]">
              Remaining
            </span>
            <span className="font-bold text-white text-sm tabular-nums">
              {Math.max(0, stats.gate.total - stats.gate.checkedIn)}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold flex items-center gap-1 text-[11px]">
              <Utensils className="h-3.5 w-3.5 text-amber-400" />
              Meals
            </span>
            <span className="font-bold text-white text-sm tabular-nums">
              {stats.meal.claimed}
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex flex-col items-center">
            <span className="text-slate-400 font-semibold flex items-center gap-1 text-[11px]">
              <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
              Kits
            </span>
            <span className="font-bold text-white text-sm tabular-nums">
              {stats.kit.claimed}
            </span>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/60 backdrop-blur-md rounded-2xl border border-white/15">
          <button
            type="button"
            onClick={() => setMode('GATE')}
            data-testid="scanner-mode-gate"
            className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'GATE'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <DoorOpen className="h-4 w-4" />
            Gate Entry
          </button>

          <button
            type="button"
            onClick={() => setMode('MEAL')}
            data-testid="scanner-mode-meal"
            className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'MEAL'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Utensils className="h-4 w-4" />
            Lunch Counter
          </button>

          <button
            type="button"
            onClick={() => setMode('KIT')}
            data-testid="scanner-mode-kit"
            className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'KIT'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <PackageCheck className="h-4 w-4" />
            Kit Desk
          </button>
        </div>

        {/* Action Row: Flash Torch, Roll Lookup, Spot Walk-In */}
        <div className="grid grid-cols-3 gap-2 pb-2">
          {/* Torch Button */}
          <Button
            type="button"
            variant="outline"
            disabled={!hasTorch}
            onClick={toggleTorch}
            data-testid="scanner-torch-button"
            className={`h-12 rounded-2xl border-white/20 backdrop-blur-md font-semibold text-xs gap-1.5 ${
              isTorchOn
                ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                : 'bg-slate-900/80 text-white hover:bg-white/10'
            }`}
          >
            <Flashlight className="h-4 w-4" />
            Torch
          </Button>

          {/* Roll Number Lookup */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLookupRollNumber('');
              setLookupResult(null);
              setIsLookupOpen(true);
            }}
            data-testid="scanner-lookup-button"
            className="h-12 rounded-2xl border-white/20 bg-slate-900/80 backdrop-blur-md text-white hover:bg-white/10 font-semibold text-xs gap-1.5"
          >
            <Search className="h-4 w-4" />
            Roll Lookup
          </Button>

          {/* Spot Register Walk-In */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSpotRollNumber('');
              setIsSpotOpen(true);
            }}
            data-testid="scanner-spot-button"
            className="h-12 rounded-2xl border-white/20 bg-slate-900/80 backdrop-blur-md text-white hover:bg-white/10 font-semibold text-xs gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            Spot Walk-In
          </Button>
        </div>
      </div>

      {/* Manual Roll Number Lookup Sheet */}
      <Sheet open={isLookupOpen} onOpenChange={setIsLookupOpen}>
        <SheetContent side="bottom" className="bg-slate-950 border-slate-800 text-white rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="text-xl font-bold text-white">Manual Roll Lookup</SheetTitle>
            <SheetDescription className="text-slate-400 text-xs">
              Search attendee by student roll number if camera scanner cannot read their screen.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleLookup} className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter Roll Number (e.g. 21BCE1024)"
                value={lookupRollNumber}
                onChange={(e) => setLookupRollNumber(e.target.value.toUpperCase())}
                autoFocus
                className="h-14 font-mono font-bold tracking-wider text-lg uppercase bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500"
              />
              <Button
                type="submit"
                disabled={!lookupRollNumber.trim() || isLookingUp}
                className="h-14 px-6 bg-indigo-600 hover:bg-indigo-500 font-bold text-white shrink-0"
              >
                {isLookingUp ? 'Searching...' : 'Find'}
              </Button>
            </div>
          </form>

          {lookupResult && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
              {lookupResult.error ? (
                <div className="text-rose-400 text-sm font-semibold flex items-center gap-2">
                  <XCircle className="h-5 w-5 shrink-0" />
                  <span>{lookupResult.error}</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-lg text-white">
                        {lookupResult.attendee?.fullName || lookupResult.attendee?.firstName || 'Student'}
                      </h4>
                      <p className="font-mono text-xs text-indigo-400 font-semibold">
                        {lookupResult.attendee?.rollNumber || lookupRollNumber}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        lookupResult.ticket?.checkedInAt
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {lookupResult.ticket?.checkedInAt ? 'Already Checked In' : 'Valid Ticket'}
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={handleManualCheckin}
                    disabled={isLookingUp}
                    className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base gap-2 rounded-xl shadow-lg shadow-emerald-600/30"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Confirm Gate Check-In
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Spot Walk-In Sheet */}
      <Sheet open={isSpotOpen} onOpenChange={setIsSpotOpen}>
        <SheetContent side="bottom" className="bg-slate-950 border-slate-800 text-white rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="text-xl font-bold text-white">Spot Walk-In Registration</SheetTitle>
            <SheetDescription className="text-slate-400 text-xs">
              Instantly admit un-registered attendees directly at the gate.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSpotRegister} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Student Roll Number
              </label>
              <Input
                type="text"
                placeholder="e.g. 21BCE1024"
                value={spotRollNumber}
                onChange={(e) => setSpotRollNumber(e.target.value.toUpperCase())}
                autoFocus
                className="h-14 font-mono font-bold tracking-wider text-lg uppercase bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-indigo-500"
              />
            </div>

            <Button
              type="submit"
              disabled={!spotRollNumber.trim() || isSpotSubmitting}
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base gap-2 rounded-xl shadow-lg shadow-indigo-600/30"
            >
              <UserPlus className="h-5 w-5" />
              {isSpotSubmitting ? 'Registering...' : 'Admit Spot Walk-In'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ScannerPage;
