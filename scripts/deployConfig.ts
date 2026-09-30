/**
 * deployConfig.ts - CLI deployment configuration schema and loader.
 *
 * Centralises all deployment parameters so deploy-auction.ts stays
 * focused on orchestration rather than config parsing.
 */

import fs from 'node:fs';
import path from 'node:path';

export type DeployTarget = 'preview' | 'local' | 'devnet';

export interface DeployConfig {
  target: DeployTarget;
  networkId: string;
  seedHex: string;
  indexerHttpUrl: string;
  indexerWsUrl: string;
  nodeRpcUrl: string;
  provingServerUrl: string;
  reserveBid: bigint;
  outputFile: string;
}

const DEFAULTS: Record<DeployTarget, Omit<DeployConfig, 'seedHex' | 'reserveBid' | 'outputFile' | 'target'>> = {
  preview: {
    networkId: 'preview',
    indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v1/graphql',
    nodeRpcUrl: 'https://rpc.preview.midnight.network',
    provingServerUrl: 'https://proving.preview.midnight.network',
  },
  devnet: {
    networkId: 'devnet',
    indexerHttpUrl: 'https://indexer.devnet.midnight.network/api/v1/graphql',
    indexerWsUrl: 'wss://indexer.devnet.midnight.network/api/v1/graphql',
    nodeRpcUrl: 'https://rpc.devnet.midnight.network',
    provingServerUrl: 'https://proving.devnet.midnight.network',
  },
  local: {
    networkId: 'undeclared',
    indexerHttpUrl: 'http://127.0.0.1:8088/api/v1/graphql',
    indexerWsUrl: 'ws://127.0.0.1:8088/api/v1/graphql',
    nodeRpcUrl: 'http://127.0.0.1:9944',
    provingServerUrl: 'http://127.0.0.1:6300',
  },
};

/**
 * Build a DeployConfig from environment variables and CLI args.
 *
 * Priority: env vars > CLI args > built-in defaults.
 */
export function loadDeployConfig(): DeployConfig {
  const rawTarget = (process.env.DEPLOY_TARGET ?? process.argv[2] ?? 'preview').toLowerCase();
  const target: DeployTarget = ['preview', 'local', 'devnet'].includes(rawTarget)
    ? (rawTarget as DeployTarget)
    : 'preview';

  const base = DEFAULTS[target];

  const seedHex =
    process.env.WALLET_SEED ??
    process.env.MIDNIGHT_SEED ??
    '4606de393caef4aefe1ec2122b7883ca5c5a6479cd5b12c08cf993740191812c';

  const reserveBid = BigInt(process.env.RESERVE_BID ?? '100');

  const outputFile =
    process.env.DEPLOY_OUTPUT ??
    path.resolve(process.cwd(), 'src/config/contract-config.json');

  return {
    target,
    ...base,
    // Allow per-env override via env vars
    indexerHttpUrl: process.env.INDEXER_HTTP_URL ?? base.indexerHttpUrl,
    indexerWsUrl:   process.env.INDEXER_WS_URL   ?? base.indexerWsUrl,
    nodeRpcUrl:     process.env.NODE_RPC_URL      ?? base.nodeRpcUrl,
    provingServerUrl: process.env.PROVING_URL     ?? base.provingServerUrl,
    seedHex,
    reserveBid,
    outputFile,
  };
}

/**
 * Write the deployed contract address back into contract-config.json.
 */
export function saveDeployResult(
  outputFile: string,
  contractAddress: string,
  deployTxId: string,
  network: string
): void {
  const existing: Record<string, unknown> = fs.existsSync(outputFile)
    ? JSON.parse(fs.readFileSync(outputFile, 'utf-8'))
    : {};

  const updated = {
    ...existing,
    contractAddress,
    deployTxId,
    network,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(updated, null, 2), 'utf-8');
  console.log(`[deployConfig] Saved deployment result to ${outputFile}`);
}
