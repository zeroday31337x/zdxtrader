/** Persist attempts before submission so a restart cannot erase the cooldown. */
export declare class EntryCooldown {
    private file;
    private delayMs;
    constructor(file: string, delayMs: number);
    remaining(now?: number): number;
    claim(now?: number): void;
}
