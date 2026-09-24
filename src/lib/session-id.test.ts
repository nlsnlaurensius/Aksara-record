import { describe, expect, it } from 'vitest';
import { createSessionId } from './session-id';

describe('createSessionId', () => {
  it('creates a session identifier without participant data', () => {
    expect(createSessionId()).toMatch(/^S-[A-Z0-9]{10}$/);
  });

  it('does not reuse identifiers in a normal batch', () => {
    const identifiers = new Set(Array.from({ length: 100 }, createSessionId));
    expect(identifiers.size).toBe(100);
  });
});
