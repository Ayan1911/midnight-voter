/**
 * Tests for txLogger service.
 *
 * Uses a stubbed localStorage to avoid DOM dependency.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
});

// Also stub crypto.randomUUID for test environment
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${Math.random().toString(36).slice(2)}`,
  getRandomValues: (buf: Uint8Array) => { buf.fill(0xAA); return buf; },
  subtle: {},
});

import { TxLogger } from '../src/services/txLogger';

describe('TxLogger', () => {
  let logger: TxLogger;

  beforeEach(() => {
    localStorage.clear();
    logger = new TxLogger();
  });

  it('starts empty', () => {
    expect(logger.count).toBe(0);
    expect(logger.getAll()).toHaveLength(0);
  });

  it('appends a record and increments count', () => {
    logger.append({
      txHash: '0xabc',
      type: 'deploy',
      label: 'Contract Deployed',
      status: 'pending',
    });
    expect(logger.count).toBe(1);
  });

  it('returns records newest-first', () => {
    logger.append({ txHash: '0x001', type: 'deploy', label: 'First', status: 'confirmed' });
    logger.append({ txHash: '0x002', type: 'initialize', label: 'Second', status: 'confirmed' });
    const all = logger.getAll();
    expect(all[0].txHash).toBe('0x002'); // newest first
    expect(all[1].txHash).toBe('0x001');
  });

  it('filters by type', () => {
    logger.append({ txHash: '0x001', type: 'deploy', label: 'Deploy', status: 'confirmed' });
    logger.append({ txHash: '0x002', type: 'place_bid', label: 'Bid', status: 'pending' });
    logger.append({ txHash: '0x003', type: 'place_bid', label: 'Bid 2', status: 'confirmed' });
    expect(logger.getByType('place_bid')).toHaveLength(2);
    expect(logger.getByType('deploy')).toHaveLength(1);
  });

  it('updates status of an existing record', () => {
    const id = logger.append({ txHash: '0xpending', type: 'place_bid', label: 'Bid', status: 'pending' });
    logger.updateStatus(id, 'confirmed', { blockHeight: 42 });
    const record = logger.getAll().find(r => r.id === id);
    expect(record?.status).toBe('confirmed');
    expect(record?.metadata?.blockHeight).toBe(42);
  });

  it('persists across logger instances (simulating reload)', () => {
    logger.append({ txHash: '0xreloaded', type: 'deploy', label: 'Persist test', status: 'confirmed' });
    const logger2 = new TxLogger();
    expect(logger2.count).toBe(1);
    expect(logger2.getAll()[0].txHash).toBe('0xreloaded');
  });

  it('clear() empties the log and removes from localStorage', () => {
    logger.append({ txHash: '0xabc', type: 'deploy', label: 'Test', status: 'confirmed' });
    logger.clear();
    expect(logger.count).toBe(0);
    expect(localStorage.getItem('zk_auction_tx_log_v1')).toBeNull();
  });

  it('getByContract returns only matching records', () => {
    logger.append({ txHash: '0x001', type: 'deploy', label: 'A', status: 'confirmed', contractAddress: '0xAAA' });
    logger.append({ txHash: '0x002', type: 'place_bid', label: 'B', status: 'pending', contractAddress: '0xBBB' });
    expect(logger.getByContract('0xAAA')).toHaveLength(1);
  });

  it('toActivityHtml returns a string containing the tx hash', () => {
    const id = logger.append({ txHash: '0xdeadbeef', type: 'place_bid', label: 'My Bid', status: 'confirmed' });
    const record = logger.getAll().find(r => r.id === id)!;
    const html = logger.toActivityHtml(record);
    expect(html).toContain('0xdeadbeef');
    expect(html).toContain('My Bid');
  });
});
