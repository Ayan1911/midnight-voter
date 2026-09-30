/**
 * walletMultiSelector.ts - Multi-wallet detection and selection UI.
 *
 * Midnight's ecosystem now supports multiple wallet extensions (Lace, 1AM, etc.).
 * This service discovers all injected Midnight providers and presents a selection
 * modal when more than one is detected, rather than silently auto-picking.
 */

import type { InitialAPI, WalletConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';

export interface WalletProvider {
  id: string;
  name: string;
  icon?: string;
  api: InitialAPI;
}

/**
 * Discover all injected Midnight wallet providers.
 * Polls for up to `timeoutMs` ms to handle slow extension injection.
 */
export async function discoverWallets(timeoutMs = 3000): Promise<WalletProvider[]> {
  const deadline = Date.now() + timeoutMs;
  let mn: Record<string, InitialAPI> | undefined;

  while (Date.now() < deadline) {
    mn = (window as any).midnight as Record<string, InitialAPI> | undefined;
    if (mn && Object.keys(mn).length > 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!mn) return [];

  return Object.entries(mn).map(([id, api]) => ({
    id,
    name: formatWalletName(id),
    icon: walletIcons[id.toLowerCase()],
    api,
  }));
}

const walletIcons: Record<string, string> = {
  mn1am: '🌙',
  lace:  '⚡',
};

function formatWalletName(id: string): string {
  const known: Record<string, string> = {
    mn1am: '1AM Wallet',
    lace:  'Lace Wallet',
  };
  return known[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Show a modal to let the user pick from discovered wallets.
 * Resolves with the chosen WalletProvider, or null if the user dismisses.
 */
export function showWalletSelectionModal(wallets: WalletProvider[]): Promise<WalletProvider | null> {
  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'wallet-selector-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:10000',
      'background:rgba(0,0,0,0.7)', 'backdrop-filter:blur(6px)',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');

    // Dialog
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'wallet-selector-title');
    dialog.style.cssText = [
      'background:#0f172a', 'border:1px solid rgba(255,255,255,0.1)',
      'border-radius:1rem', 'padding:2rem', 'max-width:360px', 'width:90%',
      'font-family:Inter,sans-serif', 'color:#f8fafc',
    ].join(';');

    const title = document.createElement('h2');
    title.id = 'wallet-selector-title';
    title.textContent = 'Select Wallet';
    title.style.cssText = 'margin:0 0 1.5rem;font-size:1.25rem;font-weight:600;';
    dialog.appendChild(title);

    for (const wallet of wallets) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:0.75rem',
        'width:100%', 'padding:0.875rem 1rem', 'margin-bottom:0.75rem',
        'background:rgba(255,255,255,0.05)', 'border:1px solid rgba(255,255,255,0.1)',
        'border-radius:0.625rem', 'color:#f8fafc', 'cursor:pointer',
        'font-size:0.95rem', 'font-weight:500', 'text-align:left',
        'transition:background 0.2s',
      ].join(';');
      btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.1)'; };
      btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.05)'; };
      btn.innerHTML = `<span style="font-size:1.5rem">${wallet.icon ?? '💼'}</span><span>${wallet.name}</span>`;
      btn.addEventListener('click', () => { overlay.remove(); resolve(wallet); });
      dialog.appendChild(btn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = [
      'width:100%', 'padding:0.75rem', 'background:transparent',
      'border:none', 'color:#94a3b8', 'cursor:pointer', 'font-size:0.875rem',
    ].join(';');
    cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
    dialog.appendChild(cancelBtn);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(null); }
    });
    document.body.appendChild(overlay);
  });
}

/**
 * High-level helper: discover wallets, prompt user if multiple found,
 * and return an established WalletConnectedAPI.
 */
export async function connectBestWallet(networkId: string): Promise<{ api: WalletConnectedAPI; walletId: string } | null> {
  const wallets = await discoverWallets();
  if (wallets.length === 0) throw new Error('No Midnight wallet extension found. Please install Lace or 1AM wallet.');

  let chosen: WalletProvider | null = null;
  if (wallets.length === 1) {
    chosen = wallets[0];
  } else {
    chosen = await showWalletSelectionModal(wallets);
  }

  if (!chosen) return null;

  const api = await chosen.api.connect(networkId);
  return { api, walletId: chosen.id };
}
