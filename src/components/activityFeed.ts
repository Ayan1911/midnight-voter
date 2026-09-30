/**
 * activityFeed.ts - Renders the live transaction activity feed.
 *
 * Subscribes to AuctionEventEmitter and TxLogger to build an auto-updating
 * feed without coupling to main.ts DOM queries.
 */

import { auctionEvents } from '../services/auctionEventEmitter';
import { txLogger } from '../services/txLogger';
import type { TxRecord } from '../services/txLogger';

const EXPLORER_BASE = 'https://explorer.midnight.network';

export interface ActivityFeedOptions {
  container: HTMLElement;
  maxItems?: number;
  explorerBase?: string;
}

function shortHash(hash: string): string {
  if (hash.length <= 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function statusIcon(status: TxRecord['status']): string {
  return { confirmed: '✓', failed: '✗', pending: '⏳' }[status] ?? '?';
}

function statusColor(status: TxRecord['status']): string {
  return { confirmed: '#10b981', failed: '#ef4444', pending: '#f59e0b' }[status] ?? '#94a3b8';
}

function renderRecord(record: TxRecord, explorerBase: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tx-record';
  row.dataset.id = record.id;
  row.style.cssText = [
    'display:flex', 'align-items:center', 'gap:0.5rem',
    'padding:0.5rem 0.75rem', 'border-radius:0.5rem',
    'background:rgba(255,255,255,0.03)', 'font-size:0.8rem',
    'color:#cbd5e1', 'border:1px solid rgba(255,255,255,0.06)',
    'margin-bottom:0.4rem',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = statusIcon(record.status);
  icon.style.color = statusColor(record.status);
  icon.style.fontWeight = '700';
  icon.style.minWidth = '1rem';
  row.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = record.label;
  label.style.flex = '1';
  row.appendChild(label);

  const link = document.createElement('a');
  link.textContent = shortHash(record.txHash);
  link.href = `${explorerBase}/tx/${record.txHash}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'color:#60a5fa;text-decoration:none;font-family:monospace;';
  link.onmouseenter = () => { link.style.textDecoration = 'underline'; };
  link.onmouseleave = () => { link.style.textDecoration = 'none'; };
  row.appendChild(link);

  const time = document.createElement('span');
  time.textContent = new Date(record.timestamp).toLocaleTimeString();
  time.style.color = '#64748b';
  time.style.minWidth = '4rem';
  time.style.textAlign = 'right';
  row.appendChild(time);

  return row;
}

/**
 * Mount the activity feed, render history, and subscribe to future events.
 * Returns a cleanup function.
 */
export function mountActivityFeed(options: ActivityFeedOptions): () => void {
  const { container, maxItems = 50, explorerBase = EXPLORER_BASE } = options;

  function refresh(): void {
    const records = txLogger.getAll().slice(0, maxItems);
    container.innerHTML = '';
    if (records.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No transactions yet.';
      empty.style.cssText = 'color:#64748b;font-size:0.85rem;text-align:center;padding:1rem 0;';
      container.appendChild(empty);
      return;
    }
    for (const record of records) {
      container.appendChild(renderRecord(record, explorerBase));
    }
  }

  // Initial render from persisted log
  refresh();

  // Subscribe to new events that should append to the feed
  const unsubDeploy = auctionEvents.on('contract:deployed', (e) => {
    txLogger.append({
      txHash: e.txId,
      type: 'deploy',
      label: 'Contract Deployed',
      status: 'confirmed',
      contractAddress: e.address,
    });
    refresh();
  });

  const unsubError = auctionEvents.on('contract:error', (e) => {
    console.error('[ActivityFeed] Contract error:', e.message);
  });

  return () => {
    unsubDeploy();
    unsubError();
  };
}
