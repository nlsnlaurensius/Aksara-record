const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function createSessionId(): string {
  let value = 'S-';

  while (value.length < 12) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= 252) continue;
      value += ALPHABET[byte % ALPHABET.length];
      if (value.length === 12) break;
    }
  }

  return value;
}
