declare module '@midnight-ntwrk/midnight-js-network-provider' {
  export function createNetworkProvider(config: any): any;
}

declare module '@midnight-ntwrk/midnight-js-fetch-zk-config-provider' {
  export class NodeZkConfigProvider {
    constructor(url: string);
  }
}

declare module '@midnight-ntwrk/midnight-js-providers' {
  export function httpClientProofProvider(url: string): any;
}

declare module '@midnight-ntwrk/dapp-connector-api' {
  export interface DAppConnectorAPI {
    enable(): Promise<DAppConnectorWalletAPI>;
  }
  export interface DAppConnectorWalletAPI {
    state(): Promise<{ address: string }>;
  }
}

declare module '@midnight-ntwrk/wallet' {
  export const WalletBuilder: any;
  export type Transaction = any;
}

declare module '@midnight-ntwrk/midnight-js-contracts' {
  export function deployContract(providers: any, config: any, contract: any, witnesses: any): Promise<any>;
  export function findDeployedContract(providers: any, config: any, contract: any, address: string, witnesses: any): Promise<any>;
}
