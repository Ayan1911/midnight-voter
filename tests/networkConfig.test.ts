/**
 * Tests for networkConfig module.
 */
import { describe, it, expect } from 'vitest';
import { getNetworkConfig, allNetworkConfigs } from '../src/config/networkConfig';

describe('getNetworkConfig', () => {
  it('returns preview config for "preview"', () => {
    const config = getNetworkConfig('preview');
    expect(config.name).toBe('preview');
    expect(config.networkId).toBe('preview');
    expect(config.indexerHttpUrl).toContain('preview.midnight.network');
  });

  it('returns local config for "local"', () => {
    const config = getNetworkConfig('local');
    expect(config.name).toBe('local');
    expect(config.indexerHttpUrl).toContain('127.0.0.1');
    expect(config.provingServerUrl).toContain('127.0.0.1');
  });

  it('returns devnet config for "devnet"', () => {
    const config = getNetworkConfig('devnet');
    expect(config.name).toBe('devnet');
    expect(config.explorerBaseUrl).toContain('devnet');
  });

  it('is case-insensitive', () => {
    const config = getNetworkConfig('PREVIEW');
    expect(config.name).toBe('preview');
  });

  it('defaults to preview for unrecognised names', () => {
    const config = getNetworkConfig('mainnet-doesnt-exist-yet');
    expect(config.name).toBe('preview');
  });

  it('all configs have required fields', () => {
    for (const config of Object.values(allNetworkConfigs)) {
      expect(config.name).toBeTruthy();
      expect(config.networkId).toBeTruthy();
      expect(config.indexerHttpUrl).toContain('http');
      expect(config.indexerWsUrl).toContain('ws');
      expect(config.provingServerUrl).toContain('http');
    }
  });

  it('preview config WebSocket URL uses wss', () => {
    const config = getNetworkConfig('preview');
    expect(config.indexerWsUrl.startsWith('wss://')).toBe(true);
  });

  it('local config WebSocket URL uses ws (not wss)', () => {
    const config = getNetworkConfig('local');
    expect(config.indexerWsUrl.startsWith('ws://')).toBe(true);
    expect(config.indexerWsUrl.startsWith('wss://')).toBe(false);
  });
});
