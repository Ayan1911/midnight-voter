/**
 * Tests for formatUtils utility.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  formatTNight,
  parseTNightInput,
  abbreviateHex,
  relativeTime,
  formatBidderId,
  countdownTo,
  capitalise,
} from '../src/utils/formatUtils';

describe('formatTNight', () => {
  it('formats zero correctly', () => {
    expect(formatTNight(0n)).toBe('0 tNIGHT');
  });

  it('formats a large amount with commas', () => {
    expect(formatTNight(1234567n)).toBe('1,234,567 tNIGHT');
  });

  it('formats 1 tNIGHT', () => {
    expect(formatTNight(1n)).toBe('1 tNIGHT');
  });
});

describe('parseTNightInput', () => {
  it('parses a valid integer string', () => {
    expect(parseTNightInput('500')).toBe(500n);
  });

  it('parses a comma-formatted number', () => {
    expect(parseTNightInput('1,000')).toBe(1000n);
  });

  it('returns null for non-numeric input', () => {
    expect(parseTNightInput('abc')).toBeNull();
  });

  it('returns null for a decimal input', () => {
    expect(parseTNightInput('3.14')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseTNightInput('')).toBeNull();
  });
});

describe('abbreviateHex', () => {
  it('returns the string unchanged if short enough', () => {
    expect(abbreviateHex('0xDEAD', 10, 8)).toBe('0xDEAD');
  });

  it('abbreviates a long hash correctly', () => {
    const long = '0x' + 'a'.repeat(30);
    const result = abbreviateHex(long, 6, 6);
    expect(result).toContain('…');
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBeLessThan(long.length);
  });
});

describe('relativeTime', () => {
  it('returns "just now" for very recent timestamps', () => {
    expect(relativeTime(Date.now() - 2000)).toBe('just now');
  });

  it('returns seconds ago', () => {
    expect(relativeTime(Date.now() - 30000)).toMatch(/\d+s ago/);
  });

  it('returns minutes ago', () => {
    expect(relativeTime(Date.now() - 90000)).toMatch(/\d+ min ago/);
  });
});

describe('formatBidderId', () => {
  it('returns icon + 8-char prefix for a full bidder id', () => {
    const id = 'deadbeefcafebabe1234567890abcdef';
    const result = formatBidderId(id);
    expect(result.startsWith('🎭 ')).toBe(true);
    expect(result).toContain('deadbeef');
  });

  it('returns the id unchanged if too short', () => {
    expect(formatBidderId('abc')).toBe('abc');
  });
});

describe('countdownTo', () => {
  it('returns "Ended" for past timestamps', () => {
    expect(countdownTo(Date.now() - 1000)).toBe('Ended');
  });

  it('returns seconds for near-future timestamps', () => {
    const result = countdownTo(Date.now() + 30000);
    expect(result).toMatch(/^\d+s$/);
  });

  it('returns h/m/s format for timestamps hours away', () => {
    const result = countdownTo(Date.now() + 3723000); // 1h 2m 3s
    expect(result).toMatch(/^\d+h \d+m \d+s$/);
  });
});

describe('capitalise', () => {
  it('capitalises the first letter', () => {
    expect(capitalise('hello')).toBe('Hello');
  });
  it('leaves an already-capitalised string unchanged', () => {
    expect(capitalise('Hello')).toBe('Hello');
  });
  it('handles empty string', () => {
    expect(capitalise('')).toBe('');
  });
});
