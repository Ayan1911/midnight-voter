import './style.css';
import { walletConnector } from './services/walletConnector';
import { Contract, ledger } from '../managed/contract/index.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { findDeployedContract, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import contractConfig from './config/contract-config.json';
import { dappConnectorProofProvider } from '@midnight-ntwrk/midnight-js-dapp-connector-proof-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { CostModel } from '@midnight-ntwrk/compact-runtime';

document.addEventListener('DOMContentLoaded', async () => {
  const submitBtn = document.getElementById('submit-bid-btn') as HTMLButtonElement;
  const bidForm = document.getElementById('bid-form') as HTMLFormElement;
  const connectBtn = document.getElementById('wallet-connect-btn') as HTMLElement;
  const statusMsg = document.getElementById('status-message') as HTMLElement;
  const activityLog = document.getElementById('activity-log') as HTMLElement;
  const deploySection = document.getElementById('deploy-section') as HTMLElement;
  const deployBtn = document.getElementById('deploy-btn') as HTMLButtonElement;
  const savedBidCard = document.getElementById('saved-bid-card') as HTMLElement;
  const savedBidText = document.getElementById('saved-bid-text') as HTMLElement;
  const revealSection = document.getElementById('reveal-section') as HTMLElement;
  const revealBtn = document.getElementById('reveal-bid-btn') as HTMLButtonElement;
  const closeAuctionBtn = document.getElementById('close-auction-btn') as HTMLButtonElement;

  let isConnected = false;
  let contractInstance: any = null;

  const targetNetwork = (contractConfig as any).network || 'preview';
  setNetworkId(targetNetwork as any);
  const indexerUrl = `https://indexer.${targetNetwork}.midnight.network/api/v1/graphql`;
  const indexerWsUrl = `wss://indexer.${targetNetwork}.midnight.network/api/v1/graphql`;

  // Organizer entropy helper
  function getOrganizerSecret(): Uint8Array {
    let saved = localStorage.getItem('zk_auction_org_secret');
    if (!saved) {
      const sec = new Uint8Array(32);
      crypto.getRandomValues(sec);
      saved = Array.from(sec).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('zk_auction_org_secret', saved);
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(saved.substring(i * 2, i * 2 + 2), 16) || 0;
    }
    return bytes;
  }

  function getBaseWitnesses() {
    return {
      getBidAmount: () => 0n,
      getBidSecret: () => new Uint8Array(32),
      getBidSalt: () => new Uint8Array(32),
      getOrganizerSecret: () => getOrganizerSecret(),
    };
  }

  function checkSavedBid() {
    const saved = localStorage.getItem('zk_auction_my_bid');
    if (saved && savedBidCard && savedBidText) {
      try {
        const parsed = JSON.parse(saved);
        savedBidCard.style.display = 'block';
        savedBidText.textContent = `Sealed bid for ${parsed.amount} tNIGHT saved (${new Date(parsed.timestamp).toLocaleTimeString()})`;
      } catch (e) {
        savedBidCard.style.display = 'none';
      }
    } else if (savedBidCard) {
      savedBidCard.style.display = 'none';
    }
  }

  checkSavedBid();

  const savedAddress = localStorage.getItem('walletAddress');
  if (savedAddress) {
    const res = await walletConnector.connect(targetNetwork);
    if (res.connected) {
      handleConnected();
    }
  }

  connectBtn.addEventListener('click', async () => {
    try {
      if (isConnected) {
        await walletConnector.disconnect();
        isConnected = false;
        localStorage.removeItem('walletAddress');
        connectBtn.textContent = 'Connect 1AM Wallet';
        connectBtn.style.background = 'rgba(255,255,255,0.1)';
        statusMsg.textContent = 'Wallet disconnected.';
        return;
      }
      
      const res = await walletConnector.connect(targetNetwork);
      if (res.connected) {
        localStorage.setItem('walletAddress', res.address!);
        handleConnected();
      } else {
        alert(res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  });

  async function handleConnected() {
    isConnected = true;
    connectBtn.textContent = `Disconnect (${walletConnector.getAddress()?.slice(0, 10)}...)`;
    connectBtn.style.background = '#10b981';
    statusMsg.textContent = 'Ready to bid.';
    await initContract();
  }

  async function initContract() {
    const api = walletConnector.getApi();
    if (!api) return;

    const networkProvider = indexerPublicDataProvider(indexerUrl, indexerWsUrl);
    const zkConfigProvider = new FetchZkConfigProvider('http://127.0.0.1:6300');

    let proofProvider;
    if (typeof (api as any).getProvingProvider === 'function') {
      proofProvider = await dappConnectorProofProvider(
        api as any,
        zkConfigProvider as any,
        CostModel.initialCostModel()
      );
    } else {
      proofProvider = httpClientProofProvider('http://127.0.0.1:6300', zkConfigProvider as any);
    }

    const address = walletConnector.getAddress() || 'default';
    // SEC-08: Derive a dynamic per-account secret key rather than static password
    let storagePassword = localStorage.getItem(`dapp-state-key-${address}`);
    if (!storagePassword) {
      const rand = new Uint8Array(32);
      crypto.getRandomValues(rand);
      storagePassword = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(`dapp-state-key-${address}`, storagePassword);
    }

    const privateState = await levelPrivateStateProvider({
      privateStateStoreName: `dapp-state-${address}`,
      accountId: address,
      privateStoragePasswordProvider: async () => storagePassword
    });

    const providers = {
      privateStateProvider: privateState,
      publicDataProvider: networkProvider,
      zkConfigProvider,
      proofProvider,
      walletProvider: api,
      midnightProvider: api
    };

    const cAddress = (contractConfig as any).contractAddress;
    if (!cAddress) {
      deploySection.style.display = 'block';
      bidForm.style.display = 'none';

      deployBtn.addEventListener('click', async () => {
        try {
          deployBtn.disabled = true;
          deployBtn.textContent = "Deploying... sign in wallet";
          statusMsg.textContent = "Initiating deployment...";

          const deployment = await deployContract(
            providers as any,
            {
              privateStateProvider: privateState,
              publicDataProvider: networkProvider,
              zkConfigProvider,
              contract: Contract,
              initialState: getBaseWitnesses()
            } as any
          );

          const deployedAddress = (deployment as any).deployTxData?.public?.contractAddress || (deployment as any).contractAddress;
          const deployTxId = (deployment as any).deployTxData?.public?.txId || (deployment as any).deployTxData?.public?.txHash || 'deploy-tx';

          statusMsg.textContent = `Deployed! Initializing auction with 100 tNIGHT reserve...`;
          addActivity(deployTxId);
          contractInstance = deployment;

          // SEC-07: Automatically initialize contract so isOpen = true
          try {
            const initTx = await (contractInstance as any).callTx.initialize(100n);
            const initHash = initTx.txHash || initTx.public?.txId || 'init-tx';
            addActivity(initHash);
            statusMsg.textContent = `Auction Active! Update config with: ${deployedAddress}`;
          } catch (initErr: any) {
            console.error("Auto-initialization note:", initErr);
            statusMsg.textContent = `Deployed at ${deployedAddress}. Ready to initialize.`;
          }
          
          deploySection.style.display = 'none';
          bidForm.style.display = 'block';
          await updateStats();
        } catch (e: any) {
          console.error(e);
          statusMsg.textContent = "Deployment failed. See console.";
        } finally {
          deployBtn.disabled = false;
          deployBtn.textContent = "Deploy & Initialize Contract";
        }
      });
      return;
    }

    try {
      contractInstance = await findDeployedContract(
        providers as any,
        {
          privateStateProvider: privateState,
          publicDataProvider: networkProvider,
          zkConfigProvider,
          contract: Contract,
          contractAddress: cAddress,
          initialState: getBaseWitnesses()
        } as any
      );
      await updateStats();
    } catch (e) {
      console.error("Failed to bind to contract", e);
      statusMsg.textContent = "Could not find contract on-chain. Check config.";
    }
  }

  function addActivity(txHash: string) {
    const div = document.createElement('div');
    const explorerBase = `https://explorer.${targetNetwork}.midnight.network/transaction/`;
    div.innerHTML = `Tx: <a href="${explorerBase}${txHash}" target="_blank" style="color: #10b981">${txHash.slice(0,18)}...</a>`;
    activityLog.prepend(div);
  }

  async function updateStats() {
    if (!contractInstance) return;
    try {
      const cAddr = (contractConfig as any).contractAddress || (contractInstance as any).deployTxData?.public?.contractAddress || contractInstance.contractAddress;
      const rawState = await contractInstance.deployTxData.publicDataProvider.queryContractState(cAddr);
      if (!rawState) return;
      const state = ledger(rawState);
      
      const isOpen = Boolean(state.isOpen);
      document.getElementById('stat-status')!.textContent = isOpen ? 'Open (Bidding)' : 'Closed (Revealing)';
      document.getElementById('stat-status')!.style.color = isOpen ? '#10b981' : '#f59e0b';
      document.getElementById('stat-reserve')!.textContent = state.minReserveBid.toString();
      document.getElementById('stat-bids')!.textContent = state.highestBid.toString();
      
      if (state.highestBidder && state.highestBidder.length > 0) {
        const hashArr = Array.from(state.highestBidder);
        const hashHex = hashArr.map((b: any) => b.toString(16).padStart(2, '0')).join('');
        document.getElementById('stat-highest-hash')!.textContent = hashHex.slice(0, 16) + '...';
      } else {
        document.getElementById('stat-highest-hash')!.textContent = '---';
      }

      // If auction is closed, show the Reveal Section
      if (!isOpen && revealSection) {
        revealSection.style.display = 'block';
      }
    } catch (e) {
      console.error("Error reading state", e);
      document.getElementById('stat-status')!.textContent = 'Connected';
    }
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
    statusMsg.textContent = 'Generating proof & signing in wallet...';
    
    try {
      // SEC-01 & SEC-04: Generate cryptographically secure secret and salt, then persist locally
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);

      const secretHex = Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('');
      const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

      // Bind witnesses for place_bid
      contractInstance.witnesses = {
        getBidAmount: () => bidAmount,
        getBidSecret: () => secret,
        getBidSalt: () => salt,
        getOrganizerSecret: () => getOrganizerSecret(),
      };

      const tx = await contractInstance.callTx.place_bid();

      // Store in localStorage after successful placement
      const bidData = {
        amount: bidAmount.toString(),
        secret: secretHex,
        salt: saltHex,
        timestamp: Date.now()
      };
      localStorage.setItem('zk_auction_my_bid', JSON.stringify(bidData));
      checkSavedBid();

      statusMsg.textContent = `Sealed bid submitted successfully! Secret saved to browser.`;
      addActivity(tx.txHash || (tx as any).public?.txId || 'tx-confirmed');
      await updateStats();
    } catch (err: any) {
      console.error("Full transaction error:", err);
      const msg = err?.message || String(err);
      if (msg.includes("User rejected") || msg.includes("cancelled")) {
        statusMsg.textContent = "Transaction rejected in your wallet.";
      } else if (msg.includes("below reserve")) {
        statusMsg.textContent = "Bid rejected: amount is below minimum reserve.";
      } else {
        statusMsg.textContent = "Transaction failed: " + msg.slice(0, 100);
      }
    } finally {
      submitBtn.textContent = 'Submit Sealed ZK Bid';
      submitBtn.disabled = false;
      amountInput.value = '';
    }
  });

  // SEC-11: Reveal Bid handler
  if (revealBtn) {
    revealBtn.addEventListener('click', async () => {
      if (!isConnected || !contractInstance) {
        alert("Please connect wallet first.");
        return;
      }

      const saved = localStorage.getItem('zk_auction_my_bid');
      if (!saved) {
        alert("No saved sealed bid found in your local browser storage.");
        return;
      }

      try {
        const { amount, secret, salt } = JSON.parse(saved);
        const secBytes = new Uint8Array(32);
        const saltBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          secBytes[i] = parseInt(secret.substring(i * 2, i * 2 + 2), 16);
          saltBytes[i] = parseInt(salt.substring(i * 2, i * 2 + 2), 16);
        }

        revealBtn.disabled = true;
        revealBtn.textContent = "Revealing Bid...";
        statusMsg.textContent = "Submitting ZK reveal proof to blockchain...";

        contractInstance.witnesses = {
          getBidAmount: () => BigInt(amount),
          getBidSecret: () => secBytes,
          getBidSalt: () => saltBytes,
          getOrganizerSecret: () => getOrganizerSecret(),
        };

        const tx = await contractInstance.callTx.reveal_bid();
        statusMsg.textContent = `Bid revealed successfully! Value: ${amount} tNIGHT`;
        addActivity(tx.txHash || (tx as any).public?.txId || 'reveal-tx');
        await updateStats();
      } catch (err: any) {
        console.error("Reveal error:", err);
        statusMsg.textContent = "Reveal failed: " + (err?.message || String(err)).slice(0, 80);
      } finally {
        revealBtn.disabled = false;
        revealBtn.textContent = "Reveal My Sealed Bid";
      }
    });
  }

  // SEC-02: Close Auction (Organizer) handler
  if (closeAuctionBtn) {
    closeAuctionBtn.addEventListener('click', async () => {
      if (!isConnected || !contractInstance) {
        alert("Please connect wallet first.");
        return;
      }

      try {
        closeAuctionBtn.disabled = true;
        closeAuctionBtn.textContent = "Closing Auction...";
        statusMsg.textContent = "Executing close_auction() with organizer key...";

        contractInstance.witnesses = {
          getBidAmount: () => 0n,
          getBidSecret: () => new Uint8Array(32),
          getBidSalt: () => new Uint8Array(32),
          getOrganizerSecret: () => getOrganizerSecret(),
        };

        const tx = await contractInstance.callTx.close_auction();
        statusMsg.textContent = "Auction closed! Bidders may now reveal.";
        addActivity(tx.txHash || (tx as any).public?.txId || 'close-tx');
        await updateStats();
      } catch (err: any) {
        console.error("Close auction error:", err);
        statusMsg.textContent = "Close failed: " + (err?.message || String(err)).slice(0, 80);
      } finally {
        closeAuctionBtn.disabled = false;
        closeAuctionBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Close Auction (Organizer)';
      }
    });
  }
});
