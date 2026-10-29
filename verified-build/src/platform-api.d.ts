type Options = {
    root: string;
    token: string;
    origins: string[];
    maxLogBytes?: number;
};
/** Separate monitoring process: never loads broker credentials into a trading client. */
export declare function createPlatformApi(options: Options): import("express-serve-static-core").Express;
export {};
