type Position = {
    symbol: string;
    size: number;
    entry: number;
    entryTime: string;
    status: 'pending' | 'open';
    clientOrderId?: string;
};
export declare class Book {
    private file;
    private open;
    constructor(file?: string);
    private save;
    hasOpen(): boolean;
    reserve(symbol: string, size: number, clientOrderId: string): void;
    openPosition(symbol: string, size: number, entry: number): void;
    close(): Position | null;
    getOpen(): Position | null;
}
export {};
