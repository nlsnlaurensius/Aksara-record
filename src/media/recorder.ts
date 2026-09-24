import type { RecordedMedia } from '../types';
import { createWavBlob } from './wav';

interface AudioCapture {
  sampleRate: number;
  chunks: Float32Array[];
  stop: () => Promise<void>;
}

export interface ActiveRecording {
  stop: () => Promise<RecordedMedia>;
}

export async function startRecording(
  canvas: HTMLCanvasElement,
  microphoneTrack: MediaStreamTrack,
): Promise<ActiveRecording> {
  const canvasStream = canvas.captureStream(30);
  const format = pickVideoFormat();
  const recorder = new MediaRecorder(canvasStream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 2_500_000,
  });
  const videoChunks: Blob[] = [];
  const audioCapture = await startAudioCapture(microphoneTrack);
  const startedAt = performance.now();

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      videoChunks.push(event.data);
    }
  });
  recorder.start(1_000);

  return {
    stop: () =>
      new Promise<RecordedMedia>((resolve, reject) => {
        recorder.addEventListener(
          'error',
          () => reject(new Error('Perekaman video gagal.')),
          { once: true },
        );
        recorder.addEventListener(
          'stop',
          async () => {
            try {
              await audioCapture.stop();
              canvasStream.getTracks().forEach((track) => track.stop());
              resolve({
                durationMs: Math.round(performance.now() - startedAt),
                videoMimeType: format.mimeType,
                videoExtension: format.extension,
                videoBlob: new Blob(videoChunks, { type: format.mimeType }),
                audioBlob: createWavBlob(audioCapture.chunks, audioCapture.sampleRate),
              });
            } catch (error) {
              reject(error);
            }
          },
          { once: true },
        );
        recorder.stop();
      }),
  };
}

function pickVideoFormat(): { mimeType: string; extension: 'mp4' | 'webm' } {
  const options: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  const supported = options.find((option) => MediaRecorder.isTypeSupported(option.mimeType));

  if (!supported) {
    throw new Error('Browser ini tidak menyediakan format perekaman video yang didukung.');
  }

  return supported;
}

async function startAudioCapture(microphoneTrack: MediaStreamTrack): Promise<AudioCapture> {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  await context.resume();
  const chunks: Float32Array[] = [];
  const source = context.createMediaStreamSource(new MediaStream([microphoneTrack]));
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  if (context.audioWorklet) {
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
    const worklet = new AudioWorkletNode(context, 'pcm-capture');
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      chunks.push(new Float32Array(event.data));
    };
    source.connect(worklet).connect(silentGain).connect(context.destination);

    return {
      sampleRate: context.sampleRate,
      chunks,
      stop: async () => {
        source.disconnect();
        worklet.disconnect();
        silentGain.disconnect();
        await context.close();
      },
    };
  }

  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor).connect(silentGain).connect(context.destination);

  return {
    sampleRate: context.sampleRate,
    chunks,
    stop: async () => {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silentGain.disconnect();
      await context.close();
    },
  };
}
