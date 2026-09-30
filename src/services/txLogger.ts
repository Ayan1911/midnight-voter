/**
 * txLogger.ts - Immutable append-only transaction log for recording auction
 * on-chain events with their transaction hashes, timestamps, and human-readable labels.
 *
 * Persists to localStorage so the activity feed survives page reloads.
 */

export type TxType =
  | 'deploy'
  | 'initialize'
  | 'place_bid'
  | 'close_auction'
  | 'reveal_bid'
  | 'unknown';

export interface TxRecord {
  id: string;           // UUID generated at insert time
  txHash: string;       // On-chain transaction hash / ID
  type: TxType;
  label: string;        // Human-readable description
  timestamp: number;    // ms since epoch
  status: 'pending' | 'confirmed' | 'failed';
  contractAddress?: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'zk_auction_tx_log_v1';
const MAX_RECORDS = 200; // Bound localStorage growth

function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export class TxLogger {
  private records: TxRecord[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.records = JSON.parse(raw) as TxRecord[];
    } catch {
      this.records = [];
    }
  }

  private persist(): void {
    // Trim to MAX_RECORDS (keep newest)
    if (this.records.length > MAX_RECORDS) {
      this.records = this.records.slice(this.records.length - MAX_RECORDS);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch (err) {
      console.warn('[TxLogger] Storage quota exceeded; oldest records may be lost.', err);
    }
  }

  /**
   * Append a new transaction record.
   * Returns the generated record ID for subsequent status updates.
   */
  append(entry: Omit<TxRecord, 'id' | 'timestamp'>): string {
    const record: TxRecord = {
      ...entry,
      id: uuid(),
      timestamp: Date.now(),
    };
    this.records.push(record);
    this.persist();
    return record.id;
  }

  /**
   * Update the status of a previously logged transaction (e.g., pending → confirmed).
   */
  updateStatus(id: string, status: TxRecord['status'], metadata?: Record<string, unknown>): void {
    const record = this.records.find((r) => r.id === id);
    if (!record) {
      console.warn(`[TxLogger] Record ${id} not found for status update.`);
      return;
    }
    record.status = status;
    if (metadata) Object.assign(record.metadata ?? (record.metadata = {}), metadata);
    this.persist();
  }

  /**
   * Return all records, newest-first.
   */
  getAll(): TxRecord[] {
    return [...this.records].reverse();
  }

  /**
   * Return records filtered by type.
   */
  getByType(type: TxType): TxRecord[] {
    return this.records.filter((r) => r.type === type).reverse();
  }

  /**
   * Return records for a specific contract address.
   */
  getByContract(contractAddress: string): TxRecord[] {
    return this.records.filter((r) => r.contractAddress === contractAddress).reverse();
  }

  /**
   * Render an activity feed entry as an HTML string.
   * Includes a clickable link to the Midnight explorer.
   */
  toActivityHtml(record: TxRecord, explorerBase = 'https://explorer.midnight.network'): string {
    const time = new Date(record.timestamp).toLocaleTimeString();
    const short = record.txHash.length > 20
      ? `${record.txHash.slice(0, 10)}…${record.txHash.slice(-8)}`
      : record.txHash;
    const statusBadge =
      record.status === 'confirmed'
        ? '<span style="color:#10b981">✓</span>'
        : record.status === 'failed'
        ? '<span style="color:#ef4444">✗</span>'
        : '<span style="color:#f59e0b">⏳</span>';
    return `
      <div class="tx-record" data-id="${record.id}">
        ${statusBadge}
        <span class="tx-label">${record.label}</span>
        <a href="${explorerBase}/tx/${record.txHash}" target="_blank" rel="noopener" class="tx-hash">${short}</a>
        <span class="tx-time">${time}</span>
      </div>
    `.trim();
  }

  clear(): void {
    this.records = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  get count(): number {
    return this.records.length;
  }
}

/** Application-wide singleton transaction logger. */
export const txLogger = new TxLogger();
