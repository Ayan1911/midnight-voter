import "core-js/proposals/iterator-helpers.js";
import { WalletFacade, NetworkId, ShieldedWallet, UnshieldedWallet, DustWallet, createKeystore, PublicKey, WalletSeeds } from '@midnight-ntwrk/wallet-sdk';
import { WalletTransaction, InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import { DustParameters } from '@midnightntwrk/ledger-v9';
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { ShieldedCoinPublicKey, ShieldedEncryptionPublicKey } from '@midnightntwrk/wallet-sdk-address-format';
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { Contract } from "../managed/contract/index.js";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { firstValueFrom } from "rxjs";
// @ts-ignore
import WebSocket from 'ws';
import path from "node:path";
import fs from "node:fs";

(globalThis as any).WebSocket = WebSocket;


const TARGET_ENV = process.env.DEPLOY_TARGET || process.argv[2] || 'preview';

async function main() {
  console.log(`====================================================`);
  console.log(`🚀 Starting Midnight Auction Contract Deployment`);
  console.log(`🌐 Target: ${TARGET_ENV.toUpperCase()}`);
  console.log(`====================================================`);

  const seedHex = process.env.WALLET_SEED || "4606de393caef4aefe1ec2122b7883ca5c5a6479cd5b12c08cf993740191812c";
  const seed = Buffer.from(seedHex, 'hex');

  let networkId: any;
  let config: any;

  if (TARGET_ENV.toLowerCase() === 'local' || TARGET_ENV.toLowerCase() === 'port') {
    // @ts-ignore
    networkId = NetworkId.NetworkId.LocalNode || (NetworkId.NetworkId as any).TestNet;
    setNetworkId("undeclared");
    config = {
      networkId,
      indexerClientConnection: {
        indexerWsUrl: 'ws://127.0.0.1:8088/api/v1/graphql/ws',
        indexerHttpUrl: 'http://127.0.0.1:8088/api/v1/graphql',
      },
      nodeClientConnection: {
        rpcUrl: 'http://127.0.0.1:9944'
      },
      relayURL: 'http://127.0.0.1:9944',
      // @ts-ignore
      txHistoryStorage: new InMemoryTransactionHistoryStorage() as any,
      provingServerUrl: 'http://127.0.0.1:6300',
      costParameters: { feeBlocksMargin: 3 }
    };
  } else {
    networkId = NetworkId.NetworkId.Preview;
    setNetworkId("preview");
    config = {
      networkId,
      indexerClientConnection: {
        indexerWsUrl: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
        indexerHttpUrl: 'https://indexer.preview.midnight.network/api/v4/graphql',
      },
      nodeClientConnection: {
        rpcUrl: 'wss://rpc.preview.midnight.network'
      },
      relayURL: 'wss://rpc.preview.midnight.network',
      // @ts-ignore
      txHistoryStorage: new InMemoryTransactionHistoryStorage() as any,
      provingServerUrl: 'http://127.0.0.1:6300',
      costParameters: { feeBlocksMargin: 3 },
      batchUpdates: { size: 5000, timeout: 50, spacing: 0 }
    };
  }

  const keystore = createKeystore({ kind: 'schnorr', secret: seed }, networkId);
  const dustParams = new DustParameters(100n, 100n, 100n);

  const unshieldedPk = PublicKey.fromKeyStore(keystore);
  console.log(`📍 Unshielded Wallet: ${(unshieldedPk as any).asBech32String ? (unshieldedPk as any).asBech32String() : JSON.stringify(unshieldedPk)}`);

  console.log("🔗 Connecting & initializing WalletFacade...");
  const facade = await WalletFacade.init({
    configuration: config,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSeed(seed),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg) => DustWallet(cfg).startWithSeed(seed, dustParams)
  });

  const seeds = WalletSeeds.fromMasterSeed(seed);
  await facade.start(seeds);

  console.log("⏳ Initializing wallet state stream...");
  const state = await Promise.race([
    facade.waitForSyncedState(),
    new Promise<any>((resolve) => {
      let latest: any = null;
      const sub = facade.state().subscribe(s => {
        latest = s;
        if (s?.shielded?.progress && 'syncHeight' in s.shielded.progress) {
          process.stdout.write(`\r[Syncing] Shielded Block Height: ${s.shielded.progress.syncHeight} ... `);
        }
      });
      setTimeout(async () => {
        sub.unsubscribe();
        const cur = latest || (await firstValueFrom(facade.state()));
        console.log(`\n✅ Ready with sync progress. Active Protocol: ${cur.activeProtocolVersion ?? 'v1'}`);
        resolve(cur);
      }, 10000);
    })
  ]);

  const pubKeys = state.shielded.state.publicKeys;
  const cpk = ShieldedCoinPublicKey.fromHexString(pubKeys.coinPublicKey);
  const epk = ShieldedEncryptionPublicKey.fromHexString(pubKeys.encryptionPublicKey);
  const cpkStr = ShieldedCoinPublicKey.codec.encode(getNetworkId() as any, cpk).asString();
  const epkStr = ShieldedEncryptionPublicKey.codec.encode(getNetworkId() as any, epk).asString();

  console.log(`📍 Signer CPK: ${cpkStr.slice(0, 32)}...`);
  console.log(`📍 Signer EPK: ${epkStr.slice(0, 32)}...`);
  console.log(`\n📊 Sync Status:`);
  console.log(`  - Shielded Progress:`, state.shielded?.progress);
  console.log(`  - Unshielded Progress:`, state.unshielded?.progress);
  console.log(`  - Dust Progress:`, state.dust?.progress);
  console.log(`💰 Unshielded Balances:`, state.unshielded?.state?.balances);
  console.log(`✨ Dust Coins:`, state.dust?.state?.coins);
  console.log(`✨ Dust Generated Coins:`, state.dust?.state?.generatedCoins);

  // Setup Providers
  const managedDir = path.resolve(process.cwd(), "managed");
  const zkConfigProvider = new NodeZkConfigProvider(managedDir);

  const walletAndMidnightProvider = {
    getCoinPublicKey: () => pubKeys.coinPublicKey,
    getEncryptionPublicKey: () => pubKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      console.log("⚖️ Balancing unbound deployment transaction...");
      const activeVersion = state.activeProtocolVersion ?? (facade as any).currentVersion();
      const walletTx = WalletTransaction.adopt('Unbound', tx, activeVersion);
      const recipe = await facade.balanceUnboundTransaction(walletTx, { 
        ttl: ttl || new Date(Date.now() + 1000 * 60 * 60) 
      });
      console.log("✅ Finalizing balanced recipe...");
      return await facade.finalizeRecipe(recipe);
    },
    submitTx(tx: any) {
      console.log("📡 Submitting balanced transaction to network...");
      return facade.submitTransaction(tx);
    },
  };

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: `auction-deploy-state-${Date.now()}`,
      accountId: "auction-deployer",
      privateStoragePasswordProvider: () => "AuctionDeploySecureKey2026!",
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexerClientConnection.indexerHttpUrl, config.indexerClientConnection.indexerWsUrl),
    zkConfigProvider,
    // @ts-ignore
    proofProvider: httpClientProofProvider(config.provingServerUrl, zkConfigProvider as any),
    walletProvider: walletAndMidnightProvider as any,
    midnightProvider: {
      submitTx: (tx: any) => facade.submitTransaction(tx),
    } as any,
  };

  const baseWitnesses = {
    getBidAmount: () => 0n,
    getBidSecret: () => new Uint8Array(32),
    getBidSalt: () => new Uint8Array(32),
    getOrganizerSecret: () => new Uint8Array(32),
  };

  const compiledContract = (CompiledContract as any).withWitnesses(
    CompiledContract.make("auction", Contract as any),
    baseWitnesses
  );

  console.log("📦 Calling deployContract with compiled circuits and witnesses...");

  const deployedContract = await deployContract(providers as any, {
    privateStateId: "auctionDeployPrivateState",
    initialPrivateState: {},
    compiledContract: compiledContract,
    signingKey: { tag: "schnorr", value: "cf340ecdd3a5bae9683b2a568f51b73fcf787f77a3fa2772bdae308afc4dc6ff" } as any,
  } as any);


  const deployedAddress = deployedContract.deployTxData.public.contractAddress;
  const txHash = (deployedContract.deployTxData.public as any).txId || (deployedContract.deployTxData.public as any).txHash || 'confirmed';
  console.log("\n🎉 ====================================================");
  console.log(`✅ CONTRACT DEPLOYED SUCCESSFULLY ON-CHAIN!`);
  console.log(`📝 Contract Address: ${deployedAddress}`);
  console.log(`🔗 Transaction Hash: ${txHash}`);
  console.log(`====================================================\n`);

  // Save config
  const configPath = path.resolve(process.cwd(), 'src/config/contract-config.json');
  fs.writeFileSync(configPath, JSON.stringify({
    network: TARGET_ENV === 'local' ? 'local' : 'preview',
    contractAddress: deployedAddress,
    txHash: txHash,
    deployedAt: new Date().toISOString()
  }, null, 2), 'utf8');
  console.log(`💾 Saved updated contract configuration to: ${configPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Deployment failed with error:", err);
  process.exit(1);
});
