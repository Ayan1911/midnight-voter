
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract, ledger } from '../managed/contract/index.js';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { Transaction, WalletBuilder } from '@midnight-ntwrk/wallet';

import * as NetworkProviderModule from '@midnight-ntwrk/midnight-js-network-provider';
import * as FetchZkConfigProviderModule from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import * as ProvidersModule from '@midnight-ntwrk/midnight-js-providers';

const { createNetworkProvider } = NetworkProviderModule as any;
const { NodeZkConfigProvider } = FetchZkConfigProviderModule as any;
const { httpClientProofProvider } = ProvidersModule as any;
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// 1. Set the Network ID
setNetworkId('preview');

async function main() {
  const mnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!mnemonic) {
    throw new Error("DEPLOYER_MNEMONIC must be set in .env");
  }

  const indexerUrl = 'https://indexer.preview.midnight.network/api/v1/graphql';
  const indexerWsUrl = 'wss://indexer.preview.midnight.network/api/v1/graphql';
  const nodeUrl = 'https://rpc.preview.midnight.network';
  const proofServerUrl = 'http://127.0.0.1:6300';

  console.log('----------------------------------------------------');
  console.log(`🚀 Initiating Genuine SDK Deployment to [${getNetworkId()}]`);
  console.log(`📡 Indexer Endpoint: ${indexerUrl}`);
  console.log(`🔐 Proof Server: ${proofServerUrl}`);
  console.log('----------------------------------------------------');

  const networkProvider = createNetworkProvider({ indexerUrl, indexerWsUrl });

  // 2. Build the wallet using the deployer mnemonic
  const wallet = await WalletBuilder.buildFromMnemonic(
    nodeUrl,
    indexerUrl,
    indexerWsUrl,
    proofServerUrl,
    mnemonic,
    getNetworkId()
  );

  const walletState = await wallet.state();
  console.log(`Wallet address initialized: ${walletState.address}`);

  const zkConfigProvider = new NodeZkConfigProvider('http://127.0.0.1:6300');

  // We must define how to get witnesses for initialization
  const witnesses = {
    getBidAmount: () => 0n,
    getBidSecret: () => new Uint8Array(32),
    getBidSalt: () => new Uint8Array(32),
  };

  const providers = {
    privateStateProvider: wallet,
    zkConfigProvider,
    publicDataProvider: networkProvider,
    proofProvider: httpClientProofProvider(proofServerUrl),
    walletProvider: wallet,
    midnightProvider: wallet,
  };

  console.log('📦 Instantiating Compact Contract and invoking deployContract...');

  // 3. Deploy the contract using native bindings
  const deployment = await deployContract(providers as any, {
    privateStateProvider: providers.privateStateProvider,
    zkConfigProvider: providers.zkConfigProvider,
    publicDataProvider: providers.publicDataProvider,
  }, Contract, witnesses);

  console.log("Wait for tx send...");
  const tx = await deployment.tx.send();

  console.log(`✅ Contract successfully deployed on-chain!`);
  console.log(`📝 Verified Contract Address: ${deployment.contractAddress}`);
  console.log(`🔗 Transaction Hash: ${tx.txHash}`);

  const configPath = path.resolve(process.cwd(), 'src/config/contract-config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    network: getNetworkId(),
    contractAddress: deployment.contractAddress,
    txHash: tx.txHash
  }, null, 2), 'utf8');

  console.log(`💾 Updated config at ${configPath}`);
}

main().catch(err => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
