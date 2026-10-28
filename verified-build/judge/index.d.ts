import { noul, choice, score } from '@typesafe-ai/sdk';
export interface JudgeRequest {
    secret: string;
    state: Record<string, unknown> | string;
    questions: Record<string, any>;
}
export interface JudgeResponse {
    answers: any;
    model: string;
    raw: any;
}
/**
 * The only thing on the desk that talks to Jev.
 * Bots call this with the desk secret. It returns raw answers.
 * Makes NO trading decisions. Caller owns the thresholds.
 */
export declare function askJev(req: JudgeRequest): Promise<JudgeResponse>;
export { noul, choice, score };
