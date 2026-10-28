import { choice, noul } from '../judge/index.js';

/**
 * Gambler bot: bets on direction.
 * One judgment per question. Every Choice has "other".
 * Send only the fields the questions read.
 */
export const gamblerQuestions = {
  regime: choice('Current market regime?', {
    trending_up: 'Clear directional move higher',
    trending_down: 'Clear directional move lower',
    ranging: 'Sideways, mean-reverting',
    volatile: 'High vol, no clear direction',
    other: 'Does not fit the above',
  }),
  setup_quality: noul('Is this a high-quality directional setup with clean, multiple confirming factors?'),
  worth_trading: noul('Is this setup worth taking a directional bet on at all?'),
  toxicity: noul('Does this look toxic (adverse selection, manipulation, or trap)?'),
};
