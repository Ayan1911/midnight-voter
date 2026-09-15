import { DAppConnectorAPI, DAppConnectorWalletAPI } from '@midnight-ntwrk/dapp-connector-api';

export class WalletConnector {
  private walletAPI: DAppConnectorWalletAPI | null = null;
  private address: string | null = null;

  async connect(): Promise<{ connected: boolean; address?: string; error?: string }> {
    try {
      // Access the 1AM wallet extension on the window object
      const mn = (window as any).midnight;
      if (!mn || !mn.mn1am) {
        throw new Error('1AM Wallet extension not found. Please install the extension.');
      }

      const connector: DAppConnectorAPI = mn.mn1am;
      
      // Request connection/enable
      const api = await connector.enable();
      this.walletAPI = api;

      const state = await api.state();
      this.address = state.address;

      return { connected: true, address: state.address };
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      return { connected: false, error: err.message || 'Connection rejected' };
    }
  }

  async disconnect(): Promise<void> {
    this.walletAPI = null;
    this.address = null;
    // The DApp connector API lacks a standard explicit disconnect,
    // so we just clear local state for the frontend.
  }

  getApi(): DAppConnectorWalletAPI | null {
    return this.walletAPI;
  }

  getAddress(): string | null {
    return this.address;
  }
}

export const walletConnector = new WalletConnector();
