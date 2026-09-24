import { describe, expect, it } from 'vitest';
import { createWavBlob } from './wav';

describe('createWavBlob', () => {
  it('writes mono 16-bit PCM with a valid RIFF header', async () => {
    const blob = createWavBlob([new Float32Array([0, 0.5, -0.5])], 48_000);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));

    expect(blob.type).toBe('audio/wav');
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(buffer.byteLength).toBe(50);
  });
});
