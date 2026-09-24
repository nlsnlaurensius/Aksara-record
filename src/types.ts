export interface Question {
  id: string;
  text: string;
  video_asset: string;
}

export interface QualityState {
  faceVisible: boolean;
  lightGood: boolean;
  positionGood: boolean;
  ready: boolean;
  message: string;
  brightness: number;
}

export interface SelectedTake {
  key: string;
  sessionId: string;
  questionId: string;
  questionIndex: number;
  takeNumber: number;
  recordedAt: string;
  durationMs: number;
  videoMimeType: string;
  videoExtension: 'mp4' | 'webm';
  videoBlob: Blob;
  audioBlob: Blob;
}

export interface RecordedMedia {
  durationMs: number;
  videoMimeType: string;
  videoExtension: 'mp4' | 'webm';
  videoBlob: Blob;
  audioBlob: Blob;
}

export const EMPTY_QUALITY: QualityState = {
  faceVisible: false,
  lightGood: false,
  positionGood: false,
  ready: false,
  message: 'Pemeriksaan kamera sedang disiapkan.',
  brightness: 0,
};
