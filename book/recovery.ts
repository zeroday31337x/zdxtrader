import { envNumber } from '../policy/env.js';
import { Book } from './index.js';

const FAILED_ORDER_TTL_MS = envNumber('FAILED_ORDER_TTL_MS');

/** Age alone cannot prove an exchange order failed. Require matching rejection evidence. */
export function flushFailedReservation(book: Book, rejections: unknown[], now = Date.now()): boolean {
  const pending = book.getOpen();
  if (pending?.status !== 'pending' || !pending.clientOrderId) return false;
  const created = Date.parse(pending.entryTime);
  if (!Number.isFinite(created) || !Number.isFinite(now) || now - created < FAILED_ORDER_TTL_MS) return false;
  const confirmedFailure = rejections.some((value) => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    const rejectedAt = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
    return row.clientOrderId === pending.clientOrderId && row.check === 'broker' &&
      Number.isFinite(rejectedAt) && rejectedAt >= created && rejectedAt <= now &&
      (row.notSubmitted === true || row.reason === 'Short entries are unsupported by this spot broker');
  });
  return confirmedFailure && book.release(pending.clientOrderId);
}
