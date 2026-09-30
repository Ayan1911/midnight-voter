/**
 * formatUtils.ts - Human-readable formatting helpers for the auction DApp.
 *
 * Centralises all display formatting so there's one place to update
 * units, locales, or precision rules.
 */

/** tNIGHT display precision: number of decimal places to show. */
const TNIGHT_DECIMALS = 0; // tNIGHT is an integer unit on Preview

/**
 * Format a raw tNIGHT amount (bigint) as a human-readable string.
 *
 * @example
 * formatTNight(1234567n) // "1,234,567 tNIGHT"
 */
export function formatTNight(amount: bigint, decimals = TNIGHT_DECIMALS): string {
  const num = Number(amount);
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} tNIGHT`;
}

/**
 * Parse a user-entered amount string (possibly with commas) into a bigint.
 * Returns null if parsing fails.
 */
export function parseTNightInput(raw: string): bigint | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/**
 * Abbreviate a long hex string for display.
 *
 * @example
 * abbreviateHex('0x1234abcd...ef', 8, 6) // "0x1234ab…abcdef"
 */
export function abbreviateHex(hex: string, prefixLen = 10, suffixLen = 8): string {
  if (hex.length <= prefixLen + suffixLen + 1) return hex;
  return `${hex.slice(0, prefixLen)}…${hex.slice(-suffixLen)}`;
}

/**
 * Format a UNIX timestamp (ms) as a relative time string.
 *
 * @example
 * relativeTime(Date.now() - 65000) // "1 min ago"
 */
export function relativeTime(timestampMs: number): string {
  const deltaS = Math.floor((Date.now() - timestampMs) / 1000);
  if (deltaS < 5)  return 'just now';
  if (deltaS < 60) return `${deltaS}s ago`;
  const deltaM = Math.floor(deltaS / 60);
  if (deltaM < 60) return `${deltaM} min ago`;
  const deltaH = Math.floor(deltaM / 60);
  if (deltaH < 24) return `${deltaH}h ago`;
  return new Date(timestampMs).toLocaleDateString();
}

/**
 * Format a bidder ID (32-byte hex) for display.
 * Shows icon + short prefix to distinguish identities at a glance.
 */
export function formatBidderId(bidderId: string): string {
  if (bidderId.length < 8) return bidderId;
  return `🎭 ${bidderId.slice(0, 8)}…`;
}

/**
 * Produce a countdown string from now to a future timestamp.
 * Returns 'Ended' when the deadline has passed.
 *
 * @example
 * countdownTo(Date.now() + 3723000) // "1h 02m 03s"
 */
export function countdownTo(futureMs: number): string {
  const remaining = Math.max(0, futureMs - Date.now());
  if (remaining === 0) return 'Ended';

  const totalS = Math.floor(remaining / 1000);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);

  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Capitalise the first letter of a string (useful for status display).
 */
export function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
