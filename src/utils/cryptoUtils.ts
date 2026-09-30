/**
 * cryptoUtils.ts - Pure cryptographic helper functions for ZK auction commitment scheme.
 *
 * These utilities mirror the Compact circuit logic on the client side so commitments
 * can be verified locally before submitting a ZK proof on-chain.
 *
 * All functions are deterministic given the same inputs, enabling replay and reveal.
 */

/**
 * Generate a cryptographically random 32-byte Uint8Array using the Web Crypto API.
 * Suitable for use as bid secrets or salts.
 */
export function randomBytes32(): Uint8Array {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

/**
 * Encode a Uint8Array to a lower-case hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Decode a hex string to a Uint8Array.
 * Throws if the string is not valid hex or has the wrong length.
 */
export function fromHex(hex: string, expectedLength?: number): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`[cryptoUtils] Hex string has odd length: ${hex.length}`);
  }
  if (expectedLength !== undefined && hex.length !== expectedLength * 2) {
    throw new Error(
      `[cryptoUtils] Expected ${expectedLength} bytes (${expectedLength * 2} hex chars), got ${hex.length}`
    );
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Compute SHA-256 over a Uint8Array and return raw digest bytes.
 * Uses the Web Crypto SubtleCrypto API (available in all modern browsers and Node ≥ 18).
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

/**
 * Derive the bidder identity hash from a 32-byte secret.
 * Mirrors: `persistentHash<Bytes<32>>(secret)` in the Compact circuit.
 */
export async function deriveBidderId(secret: Uint8Array): Promise<Uint8Array> {
  return sha256(secret);
}

/**
 * Compute the sealed-bid commitment from (amount, salt).
 * Mirrors: `persistentHash<[Uint<64>, Bytes<32>]>([amount, salt])` in the Compact circuit.
 *
 * Serialisation: 8-byte big-endian amount || 32-byte salt
 */
export async function computeCommitment(amount: bigint, salt: Uint8Array): Promise<Uint8Array> {
  if (salt.length !== 32) {
    throw new Error(`[cryptoUtils] Salt must be 32 bytes, got ${salt.length}`);
  }
  // Encode amount as 8-byte big-endian
  const amountBytes = new Uint8Array(8);
  const view = new DataView(amountBytes.buffer);
  view.setBigUint64(0, amount, false /* big-endian */);

  const payload = new Uint8Array(8 + 32);
  payload.set(amountBytes, 0);
  payload.set(salt, 8);

  return sha256(payload);
}

/**
 * Verify a bid reveal: re-derives the commitment from (amount, salt) and checks
 * it matches the stored on-chain commitment for the bidder.
 *
 * Returns true if valid; false otherwise.
 */
export async function verifyReveal(
  amount: bigint,
  secret: Uint8Array,
  salt: Uint8Array,
  storedCommitment: Uint8Array
): Promise<boolean> {
  try {
    const recomputed = await computeCommitment(amount, salt);
    if (recomputed.length !== storedCommitment.length) return false;
    // Constant-time-ish comparison (best effort in JS)
    let diff = 0;
    for (let i = 0; i < recomputed.length; i++) {
      diff |= recomputed[i] ^ storedCommitment[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Encode organizer secret from localStorage hex string to Uint8Array.
 * Creates and persists a new random secret if none is found.
 */
export function loadOrCreateOrganizerSecret(storageKey = 'zk_auction_org_secret'): Uint8Array {
  let saved = localStorage.getItem(storageKey);
  if (!saved || saved.length !== 64) {
    const sec = randomBytes32();
    saved = toHex(sec);
    localStorage.setItem(storageKey, saved);
  }
  return fromHex(saved, 32);
}
