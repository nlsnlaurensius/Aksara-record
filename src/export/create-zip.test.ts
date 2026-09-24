import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import type { Question, SelectedTake } from '../types';
import { createSessionZip } from './create-zip';

describe('createSessionZip', () => {
  it('contains only the selected take and relative metadata paths', async () => {
    const questions: Question[] = [
      { id: 'P01', text: 'Pertanyaan 1', video_asset: 'assets/question_videos/Pertanyaan1.mp4' },
    ];
    const take: SelectedTake = {
      key: 'S-ABCDEFGHIJ:P01',
      sessionId: 'S-ABCDEFGHIJ',
      questionId: 'P01',
      questionIndex: 0,
      takeNumber: 2,
      recordedAt: '2026-09-24T00:00:00.000Z',
      durationMs: 4_000,
      videoMimeType: 'video/mp4',
      videoExtension: 'mp4',
      videoBlob: new Blob(['video'], { type: 'video/mp4' }),
      audioBlob: new Blob(['audio'], { type: 'audio/wav' }),
    };

    const archive = await createSessionZip('S-ABCDEFGHIJ', questions, [take]);
    const reader = new ZipReader(new BlobReader(archive));
    const entries = await reader.getEntries();
    const names = entries.map((entry) => entry.filename).sort();
    const manifestEntry = entries.find((entry) => entry.filename === 'session_manifest.json');
    const manifestText = manifestEntry && !manifestEntry.directory
      ? await manifestEntry.getData(new TextWriter())
      : '';
    await reader.close();

    expect(names).toEqual([
      'audio/01_P01/S-ABCDEFGHIJ_P01_T02.wav',
      'metadata/01_P01/S-ABCDEFGHIJ_P01_T02.json',
      'session_manifest.json',
      'video/01_P01/S-ABCDEFGHIJ_P01_T02.mp4',
    ]);
    expect(manifestText).not.toContain('C:\\Users');
    expect(JSON.parse(manifestText).selected_takes_only).toBe(true);
  });
});
