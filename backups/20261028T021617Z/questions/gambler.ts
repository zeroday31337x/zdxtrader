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
  setup_quality: choice('How high quality is this directional setup?', {
    low: 'Weak or conflicting signals',
    medium: 'Reasonable but not compelling',
    high: 'Clean, multiple confirming factors',
    other: 'Does not fit the above',
  }),
  worth_trading: noul('Is this setup worth taking a directional bet on at all?'),
  toxicity: noul('Does this look toxic (adverse selection, manipulation, or trap)?'),
};
