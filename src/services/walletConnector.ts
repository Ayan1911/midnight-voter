import type { InitialAPI, WalletConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

export class WalletConnector {
  private walletAPI: WalletConnectedAPI | null = null;
  private address: string | null = null;

  async connect(networkId: string): Promise<{ connected: boolean; address?: string; error?: string }> {
    try {
      // 1. Polling for window.midnight since extensions inject after page load
      let mn = (window as any).midnight;
      if (!mn) {
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 200));
          mn = (window as any).midnight;
          if (mn) break;
        }
      }
      
      if (!mn) {
        throw new Error('No Midnight wallet extension found. Please install a compatible wallet.');
      }

      // 2. Support any injected wallet dynamically instead of hardcoding mn1am
      const wallets = Object.values(mn) as InitialAPI[];
      if (wallets.length === 0) {
        throw new Error('No Midnight wallet extension found.');
      }

      // Rationale for auto-picking wallets[0]: 
      // In the current Midnight ecosystem (Preview), users typically only have 
      // one active wallet extension (Lace or 1AM) enabled at a time to prevent 
      // dApp injection conflicts. If multiple are detected, we safely default 
      // to the first injected provider (the active one). Future production 
      // versions should implement a modal wallet selector UI.
      const connector = wallets[0];
      
      // 3. Request connection
      let api;
      try {
        api = await connector.connect(networkId);
      } catch (e) {
         throw new Error('Connection rejected by user');
      }
      
      this.walletAPI = api;
      const unshieldedAddress = await api.getUnshieldedAddress();
      this.address = unshieldedAddress.unshieldedAddress;

      return { connected: true, address: this.address ?? undefined };
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      return { connected: false, error: err.message || 'Connection rejected' };
    }
  }

  async disconnect(): Promise<void> {
    // Completely nullify internal class state references
    this.walletAPI = null;
    this.address = null;
  }

  getApi(): WalletConnectedAPI | null {
    return this.walletAPI;
  }

  getAddress(): string | null {
    return this.address;
  }
}

export const walletConnector = new WalletConnector();
