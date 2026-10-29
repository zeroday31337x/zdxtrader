import { loggedApiCall } from '../logs/http.js';
import { envText } from '../policy/env.js';
import { TypeSafeClient, noul, choice, score } from '@typesafe-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();
const readEnv = (name, fallbackName) => {
    const value = process.env[name] ?? process.env[fallbackName ?? name.toLowerCase()] ?? '';
    return typeof value === 'string' ? value.trim() : '';
};
const MODEL = envText('MODEL_VERSION');
const API_KEY = readEnv('TYPESAFE_API_KEY', 'typesafe_api_key');
const DESK_SECRET = readEnv('DESK_SECRET', 'desk_secret');
let client;
/**
 * The only thing on the desk that talks to Jev.
 * Bots call this with the desk secret. It returns raw answers.
 * Makes NO trading decisions. Caller owns the thresholds.
 */
export async function askJev(req) {
    if (req.secret !== DESK_SECRET) {
        throw new Error('Invalid desk secret');
    }
    if (!API_KEY)
        throw Error('TYPESAFE_API_KEY is required only for model decision mode');
    client ??= new TypeSafeClient({ apiKey: API_KEY, defaultModel: MODEL });
    const response = await loggedApiCall('typesafe', 'POST', 'systemOne', () => client.systemOne({
        state: typeof req.state === 'string' ? req.state : JSON.stringify(req.state),
        questions: req.questions,
        model: MODEL,
    }));
    return {
        answers: response.answers,
        model: response.model || MODEL,
        raw: response,
    };
}
export { noul, choice, score };
//# sourceMappingURL=index.js.map