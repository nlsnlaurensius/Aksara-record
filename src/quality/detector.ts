import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { QualityState } from '../types';

export interface QualityDetector {
  analyze: (canvas: HTMLCanvasElement, timestamp: number) => QualityState;
  close: () => void;
}

export async function createQualityDetector(): Promise<QualityDetector> {
  const tasks = await import('@mediapipe/tasks-vision');
  const assetRoot = import.meta.env.BASE_URL;
  const vision = await tasks.FilesetResolver.forVisionTasks(`${assetRoot}mediapipe/wasm`);
  const createTasks = (delegate: 'GPU' | 'CPU') =>
    Promise.all([
      tasks.FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${assetRoot}models/blaze_face_short_range.tflite`,
          delegate,
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.6,
        minSuppressionThreshold: 0.3,
      }),
      tasks.PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${assetRoot}models/pose_landmarker_lite.task`,
          delegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.58,
        minPosePresenceConfidence: 0.58,
        minTrackingConfidence: 0.58,
        outputSegmentationMasks: false,
      }),
    ]);
  const [faceDetector, poseLandmarker] = await createTasks('GPU').catch(() => createTasks('CPU'));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 48;
  sampleCanvas.height = 64;
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const history: boolean[] = [];

  return {
    analyze(canvas, timestamp) {
      const faceResult = faceDetector.detectForVideo(canvas, timestamp);
      const poseResult = poseLandmarker.detectForVideo(canvas, timestamp);
      const face = faceResult.detections[0];
      const box = face?.boundingBox;
      const score = face?.categories[0]?.score ?? 0;
      const faceVisible = Boolean(box && score >= 0.62);
      const brightness = sampleContext
        ? measureBrightness(canvas, sampleCanvas, sampleContext)
        : 0;
      const lightGood = brightness >= 62 && brightness <= 210;
      const landmarks = poseResult.landmarks[0];
      const position = box
        ? evaluatePosition(box.originX, box.originY, box.width, box.height, canvas, landmarks)
        : { good: false, message: 'Pastikan seluruh wajah terlihat di dalam garis kepala.' };
      const positionGood = faceVisible && position.good;
      const currentReady = faceVisible && lightGood && positionGood;

      history.push(currentReady);
      if (history.length > 8) history.shift();
      const ready = history.length >= 6 && history.slice(-6).every(Boolean);

      return {
        faceVisible,
        lightGood,
        positionGood,
        ready,
        brightness,
        message: ready
          ? 'Posisi siap. Anda dapat mulai merekam.'
          : buildMessage(faceVisible, lightGood, brightness, position.message),
      };
    },
    close() {
      faceDetector.close();
      poseLandmarker.close();
    },
  };
}

function evaluatePosition(
  originX: number,
  originY: number,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
  landmarks?: NormalizedLandmark[],
): { good: boolean; message: string } {
  const faceX = originX / canvas.width;
  const faceY = originY / canvas.height;
  const faceWidth = width / canvas.width;
  const faceHeight = height / canvas.height;
  const centerX = faceX + faceWidth / 2;
  const centerY = faceY + faceHeight / 2;

  if (faceWidth > 0.52 || faceHeight > 0.43) {
    return { good: false, message: 'Mundur sedikit agar kepala, bahu, dan tubuh bagian atas terlihat.' };
  }
  if (faceWidth < 0.2 || faceHeight < 0.17) {
    return { good: false, message: 'Maju sedikit agar wajah terlihat jelas.' };
  }
  if (centerX < 0.4) {
    return { good: false, message: 'Geser sedikit ke kanan agar wajah berada di tengah.' };
  }
  if (centerX > 0.6) {
    return { good: false, message: 'Geser sedikit ke kiri agar wajah berada di tengah.' };
  }
  if (centerY < 0.18) {
    return { good: false, message: 'Turunkan posisi kamera atau duduk sedikit lebih rendah.' };
  }
  if (centerY > 0.4) {
    return { good: false, message: 'Naikkan posisi kamera atau duduk sedikit lebih tinggi.' };
  }

  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  if (!leftShoulder || !rightShoulder || leftShoulder.visibility < 0.62 || rightShoulder.visibility < 0.62) {
    return { good: false, message: 'Pastikan kedua bahu terlihat di dalam garis panduan.' };
  }

  const shoulderSpan = Math.abs(leftShoulder.x - rightShoulder.x);
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderSlope = Math.abs(leftShoulder.y - rightShoulder.y);

  if (shoulderSpan < 0.36) {
    return { good: false, message: 'Maju sedikit sampai kedua bahu mengikuti garis panduan.' };
  }
  if (shoulderSpan > 0.9) {
    return { good: false, message: 'Mundur sedikit agar kedua bahu masuk ke dalam frame.' };
  }
  if (shoulderMidX < 0.4 || shoulderMidX > 0.6) {
    return { good: false, message: 'Tengahkan tubuh mengikuti garis panduan.' };
  }
  if (shoulderMidY < 0.43 || shoulderMidY > 0.72) {
    return { good: false, message: 'Sesuaikan jarak sampai bahu berada pada garis panduan.' };
  }
  if (shoulderSlope > 0.1) {
    return { good: false, message: 'Tegakkan posisi kepala dan bahu.' };
  }

  return { good: true, message: 'Tahan posisi beberapa saat.' };
}

function measureBrightness(
  source: HTMLCanvasElement,
  sample: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): number {
  context.drawImage(source, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let total = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    total += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  }

  return Math.round(total / (pixels.length / 16));
}

function buildMessage(
  faceVisible: boolean,
  lightGood: boolean,
  brightness: number,
  positionMessage: string,
): string {
  if (!faceVisible) return 'Pastikan wajah menghadap kamera dan tidak tertutup.';
  if (!lightGood) {
    return brightness < 62
      ? 'Pencahayaan terlalu gelap. Tambahkan cahaya dari arah depan.'
      : 'Pencahayaan terlalu terang. Kurangi cahaya yang mengarah ke wajah.';
  }
  return positionMessage;
}
