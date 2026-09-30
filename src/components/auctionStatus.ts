/**
 * auctionStatus.ts - Renders the live auction status panel in the DApp header.
 *
 * Subscribes to AuctionEventEmitter events and updates the DOM reactively,
 * keeping all status rendering logic out of main.ts.
 */

import { auctionEvents } from '../services/auctionEventEmitter';
import type { AuctionOnChainState } from '../services/auctionPoller';

export interface StatusPanelElements {
  statusBadge: HTMLElement;
  reserveLabel: HTMLElement;
  highestBidLabel: HTMLElement;
  commitmentCountLabel: HTMLElement;
  countdownContainer?: HTMLElement;
}

function formatTNight(amount: bigint): string {
  return `${amount.toLocaleString()} tNIGHT`;
}

/**
 * Mount the status panel and wire it to auction events.
 * Returns a cleanup function that removes all event listeners.
 */
export function mountStatusPanel(elements: StatusPanelElements): () => void {
  const { statusBadge, reserveLabel, highestBidLabel, commitmentCountLabel } = elements;

  function setOpen(open: boolean): void {
    statusBadge.textContent = open ? '🟢 LIVE' : '🔴 CLOSED';
    statusBadge.style.color = open ? '#10b981' : '#ef4444';
  }

  function applyState(state: {
    isOpen: boolean;
    highestBid: bigint;
    commitmentCount: number;
    minReserveBid?: bigint;
  }): void {
    setOpen(state.isOpen);
    if (state.minReserveBid !== undefined) {
      reserveLabel.textContent = formatTNight(state.minReserveBid);
    }
    highestBidLabel.textContent = state.highestBid > 0n
      ? formatTNight(state.highestBid)
      : '–';
    commitmentCountLabel.textContent = String(state.commitmentCount);
  }

  // Subscribe to auction events
  const unsubUpdate  = auctionEvents.on('auction:state_updated', (e) => applyState(e));
  const unsubClosed  = auctionEvents.on('auction:closed', (e) => {
    setOpen(false);
    highestBidLabel.textContent = formatTNight(e.finalHighestBid);
  });
  const unsubInit    = auctionEvents.on('auction:initialized', (e) => {
    setOpen(true);
    reserveLabel.textContent = formatTNight(e.reserve);
    highestBidLabel.textContent = '–';
    commitmentCountLabel.textContent = '0';
  });

  // Cleanup function
  return () => {
    unsubUpdate();
    unsubClosed();
    unsubInit();
  };
}

/**
 * Populate the status panel once from an initial on-chain state snapshot
 * (e.g. on page load before events start flowing).
 */
export function populateStatusPanelFromSnapshot(
  elements: StatusPanelElements,
  state: AuctionOnChainState
): void {
  const { statusBadge, reserveLabel, highestBidLabel, commitmentCountLabel } = elements;
  statusBadge.textContent = state.isOpen ? '🟢 LIVE' : '🔴 CLOSED';
  statusBadge.style.color  = state.isOpen ? '#10b981' : '#ef4444';
  reserveLabel.textContent = `${state.minReserveBid.toLocaleString()} tNIGHT`;
  highestBidLabel.textContent = state.highestBid > 0n
    ? `${state.highestBid.toLocaleString()} tNIGHT`
    : '–';
  commitmentCountLabel.textContent = String(state.commitmentCount);
}
