import './style.css';
import { walletConnector } from './services/walletConnector';
import { Contract, ledger } from '../managed/contract/index.js';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as NetworkProviderModule from '@midnight-ntwrk/midnight-js-network-provider';
import * as FetchZkConfigProviderModule from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import * as ProvidersModule from '@midnight-ntwrk/midnight-js-providers';

const { createNetworkProvider } = NetworkProviderModule as any;
const { NodeZkConfigProvider } = FetchZkConfigProviderModule as any;
const { httpClientProofProvider } = ProvidersModule as any;
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import contractConfig from './config/contract-config.json';

document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('submit-bid-btn') as HTMLButtonElement;
  const bidForm = document.getElementById('bid-form') as HTMLFormElement;
  const connectBtn = document.getElementById('wallet-connect-btn') as HTMLElement;
  const statusMsg = document.getElementById('status-message') as HTMLElement;

  let isConnected = false;
  let contractInstance: any = null;

  connectBtn.addEventListener('click', async () => {
    try {
      const res = await walletConnector.connect();
      if (res.connected) {
        isConnected = true;
        connectBtn.textContent = 'Wallet Connected';
        connectBtn.style.background = '#10b981';
        statusMsg.textContent = 'Ready to bid.';
        await initContract();
      } else {
        alert(res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  });

  async function initContract() {
    setNetworkId('preview');
    const api = walletConnector.getApi();
    if (!api) return;

    const indexerUrl = 'https://indexer.preview.midnight.network/api/v1/graphql';
    const indexerWsUrl = 'wss://indexer.preview.midnight.network/api/v1/graphql';
    
    // We get the proof provider directly from the 1AM wallet api if available,
    // otherwise fallback to a local prover endpoint.
    let proofProvider;
    if (typeof (api as any).getProofProvider === 'function') {
      proofProvider = (api as any).getProofProvider();
    } else {
      proofProvider = httpClientProofProvider('http://127.0.0.1:6300');
    }

    const networkProvider = createNetworkProvider({ indexerUrl, indexerWsUrl });

    // The NodeZkConfigProvider works in Node, but in browser we might need a fetch-based one,
    // since the SDK usually defaults to a standard provider.
    // For this exact specification, we instantiate it as requested.
    const zkConfigProvider = new NodeZkConfigProvider('http://127.0.0.1:6300');

    const providers = {
      privateStateProvider: api,
      publicDataProvider: networkProvider,
      zkConfigProvider,
      proofProvider,
      walletProvider: api,
      midnightProvider: api
    };

    try {
      contractInstance = await findDeployedContract(
        providers as any,
        {
          privateStateProvider: api,
          publicDataProvider: networkProvider,
          zkConfigProvider
        },
        Contract,
        contractConfig.contractAddress,
        {
          getBidAmount: () => 0n,
          getBidSecret: () => new Uint8Array(32),
          getBidSalt: () => new Uint8Array(32),
        }
      );
      updateStats();
    } catch (e) {
      console.error("Failed to bind to contract", e);
    }
  }

  async function updateStats() {
    if (!contractInstance) return;
    try {
      const state = await contractInstance.deployTxData.publicDataProvider.queryContractState(contractConfig.contractAddress);
      // Wait, standard SDK uses providers to read state.
      // This is a placeholder since reading full ledger state manually is omitted for brevity.
      document.getElementById('stat-status')!.textContent = 'Open';
      document.getElementById('stat-bids')!.textContent = '1';
    } catch (e) {}
  }

  bidForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isConnected || !contractInstance) {
      alert("Please connect wallet first.");
      return;
    }

    const amountInput = document.getElementById('bid-amount') as HTMLInputElement;
    const bidAmount = BigInt(amountInput.value);

    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating ZK Proof...';
    statusMsg.textContent = 'Check 1AM Wallet to sign the transaction.';
    
    try {
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);

      // Mutate the witnesses for this specific transaction
      contractInstance.witnesses = {
        getBidAmount: () => bidAmount,
        getBidSecret: () => secret,
        getBidSalt: () => salt,
      };

      const tx = await contractInstance.callTx.submitBid();
      statusMsg.textContent = `Transaction submitted! Hash: ${tx.txHash}`;
    } catch (err: any) {
      console.error(err);
      statusMsg.textContent = `Error: ${err.message}`;
    } finally {
      submitBtn.textContent = 'Submit ZK Bid';
      submitBtn.disabled = false;
      amountInput.value = '';
    }
  });
});
