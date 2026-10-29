import type { Evidence } from './types.js';
/** Explicit data directories and formats only; configuration and source code are never ingested. */
export declare function buildEvidence(root?: string): Promise<Evidence[]>;
