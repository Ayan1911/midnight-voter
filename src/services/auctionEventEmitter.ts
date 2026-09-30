/**
 * AuctionEventEmitter - Lightweight typed event bus for auction state changes.
 * Decouples UI components from contract state polling logic.
 */

export type AuctionEvent =
  | { type: 'auction:initialized'; reserve: bigint; organizer: string }
  | { type: 'auction:bid_placed'; bidderId: string; commitment: string; timestamp: number }
  | { type: 'auction:closed'; finalHighestBid: bigint }
  | { type: 'auction:bid_revealed'; bidderId: string; amount: bigint; isWinner: boolean }
  | { type: 'auction:state_updated'; isOpen: boolean; highestBid: bigint; commitmentCount: number }
  | { type: 'wallet:connected'; address: string }
  | { type: 'wallet:disconnected' }
  | { type: 'contract:deploy_started' }
  | { type: 'contract:deployed'; address: string; txId: string }
  | { type: 'contract:error'; message: string; code?: string };

type AuctionEventType = AuctionEvent['type'];
type AuctionEventPayload<T extends AuctionEventType> = Extract<AuctionEvent, { type: T }>;
type Listener<T extends AuctionEventType> = (event: AuctionEventPayload<T>) => void;

export class AuctionEventEmitter {
  private listeners: Map<AuctionEventType, Set<Listener<any>>> = new Map();

  /**
   * Subscribe to an auction event.
   * Returns an unsubscribe function for easy cleanup.
   */
  on<T extends AuctionEventType>(eventType: T, listener: Listener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => this.off(eventType, listener);
  }

  /** Subscribe to an event exactly once; auto-removes after first fire. */
  once<T extends AuctionEventType>(eventType: T, listener: Listener<T>): () => void {
    const wrapper: Listener<T> = (event) => {
      listener(event);
      this.off(eventType, wrapper);
    };
    return this.on(eventType, wrapper);
  }

  /** Unsubscribe a listener. */
  off<T extends AuctionEventType>(eventType: T, listener: Listener<T>): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /** Emit an event to all listeners. */
  emit<T extends AuctionEventType>(event: AuctionEventPayload<T>): void {
    const eventListeners = this.listeners.get(event.type);
    if (eventListeners) {
      for (const listener of eventListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[AuctionEventEmitter] Listener error on event "${event.type}":`, err);
        }
      }
    }
  }

  /** Remove all listeners for a given event type, or all listeners globally. */
  removeAllListeners(eventType?: AuctionEventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /** Returns the count of active listeners for a given event type. */
  listenerCount(eventType: AuctionEventType): number {
    return this.listeners.get(eventType)?.size ?? 0;
  }
}

/** Singleton instance shared across the application. */
export const auctionEvents = new AuctionEventEmitter();
