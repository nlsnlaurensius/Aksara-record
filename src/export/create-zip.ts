import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import type { Question, SelectedTake } from '../types';

export async function createSessionZip(
  sessionId: string,
  questions: Question[],
  takes: SelectedTake[],
): Promise<Blob> {
  if (takes.length !== questions.length) {
    throw new Error('Semua pertanyaan harus memiliki rekaman sebelum ZIP dibuat.');
  }

  const writer = new ZipWriter(new BlobWriter('application/zip'));
  const manifestEntries: Array<Record<string, unknown>> = [];

  for (const take of takes) {
    const folder = `${String(take.questionIndex + 1).padStart(2, '0')}_${take.questionId}`;
    const stem = `${sessionId}_${take.questionId}_T${String(take.takeNumber).padStart(2, '0')}`;
    const videoPath = `video/${folder}/${stem}.${take.videoExtension}`;
    const audioPath = `audio/${folder}/${stem}.wav`;
    const metadataPath = `metadata/${folder}/${stem}.json`;
    const metadata = {
      session_id: sessionId,
      question_id: take.questionId,
      take_number: take.takeNumber,
      selected: true,
      recorded_at: take.recordedAt,
      duration_ms: take.durationMs,
      video_mime_type: take.videoMimeType,
      video: videoPath,
      audio: audioPath,
    };

    await writer.add(videoPath, new BlobReader(take.videoBlob));
    await writer.add(audioPath, new BlobReader(take.audioBlob));
    await writer.add(metadataPath, new TextReader(JSON.stringify(metadata, null, 2)));
    manifestEntries.push(metadata);
  }

  const manifest = {
    format_version: 1,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    selected_takes_only: true,
    question_count: questions.length,
    recordings: manifestEntries,
  };
  await writer.add('session_manifest.json', new TextReader(JSON.stringify(manifest, null, 2)));
  return writer.close();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
