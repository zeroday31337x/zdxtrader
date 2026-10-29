import { Book } from './index.js';
/** Age alone cannot prove an exchange order failed. Require matching rejection evidence. */
export declare function flushFailedReservation(book: Book, rejections: unknown[], now?: number): boolean;
