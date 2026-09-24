import { useEffect, useRef, useState, type RefObject } from 'react';
import { createQualityDetector } from '../quality/detector';
import { EMPTY_QUALITY, type QualityState } from '../types';
import { BodyGuide } from './BodyGuide';

interface CameraPreviewProps {
  stream: MediaStream | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  quality: QualityState;
  onQualityChange: (quality: QualityState) => void;
  demo?: boolean;
  recording?: boolean;
  elapsed?: string;
}

export function CameraPreview({
  stream,
  canvasRef,
  quality,
  onQualityChange,
  demo = false,
  recording = false,
  elapsed = '00:00',
}: CameraPreviewProps) {
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const [detectorStatus, setDetectorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    demo ? 'ready' : 'idle',
  );

  useEffect(() => {
    const video = sourceVideoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play();
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let animationFrame = 0;
    let phase = 0;

    const draw = () => {
      const video = sourceVideoRef.current;
      if (demo) {
        drawDemoFrame(context, canvas, phase);
        phase += 0.012;
      } else if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawCover(context, canvas, video);
      } else {
        context.fillStyle = '#0c1b18';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      animationFrame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, [canvasRef, demo, stream]);

  useEffect(() => {
    if (demo) {
      onQualityChange({
        faceVisible: true,
        lightGood: true,
        positionGood: true,
        ready: true,
        message: 'Posisi siap. Anda dapat mulai merekam.',
        brightness: 128,
      });
      return;
    }
    if (!stream || !canvasRef.current) {
      onQualityChange(EMPTY_QUALITY);
      setDetectorStatus('idle');
      return;
    }

    let cancelled = false;
    let timer = 0;
    let detector: Awaited<ReturnType<typeof createQualityDetector>> | null = null;
    setDetectorStatus('loading');

    void createQualityDetector()
      .then((loadedDetector) => {
        if (cancelled) {
          loadedDetector.close();
          return;
        }
        detector = loadedDetector;
        setDetectorStatus('ready');
        timer = window.setInterval(() => {
          const canvas = canvasRef.current;
          if (!canvas || !detector) return;
          try {
            onQualityChange(detector.analyze(canvas, performance.now()));
          } catch {
            onQualityChange({
              ...EMPTY_QUALITY,
              message: 'Pemeriksaan gambar terhenti. Muat ulang halaman lalu coba lagi.',
            });
            setDetectorStatus('error');
          }
        }, 280);
      })
      .catch(() => {
        if (!cancelled) {
          setDetectorStatus('error');
          onQualityChange({
            ...EMPTY_QUALITY,
            message: 'Model pemeriksaan tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.',
          });
        }
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      detector?.close();
    };
  }, [canvasRef, demo, onQualityChange, stream]);

  const displayMessage =
    detectorStatus === 'loading' ? 'Menyiapkan pemeriksaan posisi…' : quality.message;

  return (
    <div className="camera-block">
      <div className={`camera-frame ${quality.ready ? 'is-ready' : ''}`}>
        <video ref={sourceVideoRef} className="source-video" muted playsInline aria-hidden="true" />
        <canvas ref={canvasRef} width="720" height="960" aria-label="Pratinjau kamera" />
        <BodyGuide ready={quality.ready} />
        <div className={`position-label ${quality.ready ? 'is-ready' : ''}`}>{displayMessage}</div>
        {recording && (
          <div className="recording-badge" aria-live="polite">
            <span /> Merekam {elapsed}
          </div>
        )}
      </div>
      <div className="quality-row" aria-label="Hasil pemeriksaan kamera">
        <QualityChip label="Wajah terlihat" active={quality.faceVisible} />
        <QualityChip label="Cahaya cukup" active={quality.lightGood} />
        <QualityChip label="Posisi sesuai" active={quality.positionGood} />
      </div>
    </div>
  );
}

function QualityChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`quality-chip ${active ? 'is-active' : ''}`}>
      <span aria-hidden="true">{active ? '✓' : '!'}</span>
      {label}
    </div>
  );
}

function drawCover(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = canvas.width / canvas.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  context.restore();
}

function drawDemoFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  phase: number,
): void {
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#d7ddd7');
  gradient.addColorStop(1, '#889b91');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#233a34';
  context.beginPath();
  context.ellipse(360 + Math.sin(phase) * 3, 248, 145, 178, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(240, 420);
  context.bezierCurveTo(120, 450, 38, 600, 16, 930);
  context.lineTo(704, 930);
  context.bezierCurveTo(682, 600, 600, 450, 480, 420);
  context.closePath();
  context.fill();
}
