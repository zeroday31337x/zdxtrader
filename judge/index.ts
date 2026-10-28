import { TypeSafeClient, noul, choice, score } from '@typesafe-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const MODEL = process.env.MODEL_VERSION || 'jev-1.13.0';
const API_KEY = process.env.TYPESAFE_API_KEY;
const DESK_SECRET = process.env.DESK_SECRET;

if (!API_KEY) {
  throw new Error('TYPESAFE_API_KEY missing. Set in .env. Never commit it.');
}

const client = new TypeSafeClient({
  apiKey: API_KEY,
  defaultModel: MODEL,
});

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
export async function askJev(req: JudgeRequest): Promise<JudgeResponse> {
  if (req.secret !== DESK_SECRET) {
    throw new Error('Invalid desk secret');
  }

  const response = await client.systemOne({
    state: typeof req.state === 'string' ? req.state : JSON.stringify(req.state),
    questions: req.questions,
    model: MODEL,
  });

  return {
    answers: response.answers,
    model: response.model || MODEL,
    raw: response,
  };
}

export { noul, choice, score };
