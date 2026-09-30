/**
 * networkConfig.ts - Centralised network configuration for all Midnight environments.
 *
 * Single source of truth for endpoint URLs, chain IDs, and explorer links.
 * Avoids hard-coded strings scattered across the codebase.
 */

export type NetworkName = 'preview' | 'local' | 'devnet';

export interface NetworkConfig {
  name: NetworkName;
  displayName: string;
  networkId: string;
  indexerHttpUrl: string;
  indexerWsUrl: string;
  nodeRpcUrl: string;
  provingServerUrl: string;
  explorerBaseUrl: string;
  faucetUrl: string;
}

const configs: Record<NetworkName, NetworkConfig> = {
  preview: {
    name: 'preview',
    displayName: 'Preview Testnet',
    networkId: 'preview',
    indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v1/graphql',
    nodeRpcUrl: 'https://rpc.preview.midnight.network',
    provingServerUrl: 'https://proving.preview.midnight.network',
    explorerBaseUrl: 'https://explorer.midnight.network',
    faucetUrl: 'https://faucet.midnight.network',
  },
  devnet: {
    name: 'devnet',
    displayName: 'Developer Network',
    networkId: 'devnet',
    indexerHttpUrl: 'https://indexer.devnet.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.devnet.midnight.network/api/v1/graphql',
    nodeRpcUrl: 'https://rpc.devnet.midnight.network',
    provingServerUrl: 'https://proving.devnet.midnight.network',
    explorerBaseUrl: 'https://explorer.devnet.midnight.network',
    faucetUrl: 'https://faucet.devnet.midnight.network',
  },
  local: {
    name: 'local',
    displayName: 'Local Node',
    networkId: 'undeclared',
    indexerHttpUrl: 'http://127.0.0.1:8088/api/v1/graphql',
    indexerWsUrl: 'ws://127.0.0.1:8088/api/v1/graphql',
    nodeRpcUrl: 'http://127.0.0.1:9944',
    provingServerUrl: 'http://127.0.0.1:6300',
    explorerBaseUrl: 'http://127.0.0.1:3000',
    faucetUrl: '',
  },
};

/**
 * Resolve a network config by name (case-insensitive).
 * Defaults to 'preview' if the name is unrecognised.
 */
export function getNetworkConfig(name: string): NetworkConfig {
  const key = name.toLowerCase() as NetworkName;
  return configs[key] ?? configs.preview;
}

/**
 * Detect the intended network from the current URL hostname.
 * Useful for environment-less deployments.
 */
export function detectNetworkFromHostname(): NetworkConfig {
  if (typeof window === 'undefined') return configs.preview;
  const host = window.location.hostname;
  if (host.includes('devnet')) return configs.devnet;
  if (host === 'localhost' || host === '127.0.0.1') return configs.local;
  return configs.preview;
}

export { configs as allNetworkConfigs };
