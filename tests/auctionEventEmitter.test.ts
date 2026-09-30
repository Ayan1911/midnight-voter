/**
 * Tests for AuctionEventEmitter service.
 *
 * Verifies the pub/sub contract: subscribe, emit, unsubscribe, once, and removeAll.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuctionEventEmitter } from '../src/services/auctionEventEmitter';

describe('AuctionEventEmitter', () => {
  let emitter: AuctionEventEmitter;

  afterEach(() => emitter.removeAllListeners());

  it('creates a new instance without throwing', () => {
    emitter = new AuctionEventEmitter();
    expect(emitter).toBeInstanceOf(AuctionEventEmitter);
  });

  it('delivers events to registered listeners', () => {
    emitter = new AuctionEventEmitter();
    const handler = vi.fn();
    emitter.on('wallet:connected', handler);
    emitter.emit({ type: 'wallet:connected', address: '0xABC' });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'wallet:connected', address: '0xABC' });
  });

  it('does not deliver events to listeners for other event types', () => {
    emitter = new AuctionEventEmitter();
    const handler = vi.fn();
    emitter.on('wallet:disconnected', handler);
    emitter.emit({ type: 'wallet:connected', address: '0xABC' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('removes a listener via the returned unsubscribe function', () => {
    emitter = new AuctionEventEmitter();
    const handler = vi.fn();
    const unsub = emitter.on('wallet:connected', handler);
    unsub();
    emitter.emit({ type: 'wallet:connected', address: '0xABC' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('once() fires exactly once and auto-removes', () => {
    emitter = new AuctionEventEmitter();
    const handler = vi.fn();
    emitter.once('wallet:connected', handler);
    emitter.emit({ type: 'wallet:connected', address: '0x1' });
    emitter.emit({ type: 'wallet:connected', address: '0x2' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('listenerCount() returns correct count after subscribe/unsubscribe', () => {
    emitter = new AuctionEventEmitter();
    expect(emitter.listenerCount('wallet:connected')).toBe(0);
    const h1 = vi.fn();
    const h2 = vi.fn();
    const u1 = emitter.on('wallet:connected', h1);
    emitter.on('wallet:connected', h2);
    expect(emitter.listenerCount('wallet:connected')).toBe(2);
    u1();
    expect(emitter.listenerCount('wallet:connected')).toBe(1);
  });

  it('removeAllListeners() clears all listeners for a type', () => {
    emitter = new AuctionEventEmitter();
    emitter.on('wallet:connected', vi.fn());
    emitter.on('wallet:connected', vi.fn());
    emitter.removeAllListeners('wallet:connected');
    expect(emitter.listenerCount('wallet:connected')).toBe(0);
  });

  it('does not propagate exceptions from a faulty listener to others', () => {
    emitter = new AuctionEventEmitter();
    const faultyHandler = vi.fn(() => { throw new Error('boom'); });
    const goodHandler = vi.fn();
    emitter.on('wallet:disconnected', faultyHandler);
    emitter.on('wallet:disconnected', goodHandler);
    // Should not throw; good handler should still be called
    expect(() => emitter.emit({ type: 'wallet:disconnected' })).not.toThrow();
    expect(goodHandler).toHaveBeenCalled();
  });

  it('handles auction:state_updated events with correct payload', () => {
    emitter = new AuctionEventEmitter();
    const handler = vi.fn();
    emitter.on('auction:state_updated', handler);
    emitter.emit({ type: 'auction:state_updated', isOpen: true, highestBid: 500n, commitmentCount: 3 });
    expect(handler).toHaveBeenCalledWith({
      type: 'auction:state_updated',
      isOpen: true,
      highestBid: 500n,
      commitmentCount: 3,
    });
  });
});
