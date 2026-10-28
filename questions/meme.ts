import { choice, noul } from '../judge/index.js';
export const memeQuestions = {
  regime: choice('Based only on the supplied completed hourly candles, is there evidence of a sustainable upward trend for a 24–72 hour spot hold? Missing minute-scale fields are intentionally omitted. Do not infer social sentiment or token safety.', {
    trending_up: 'Upward trend supported by price and volume',
    ranging: 'Sideways or insufficient trend evidence',
    trending_down: 'Downward trend',
    other: 'Insufficient data or unclear regime',
  }),
  setup_quality: noul('Is this a high-quality spot long setup for a 24–72 hour outlook, supported by the supplied history and liquidity?'),
  worth_trading: noul('Does this setup justify considering a $9 spot buy after costs? A momentum screen is not evidence of expected profit.'),
  toxicity: noul('Do the supplied price, volume and spread indicate unstable liquidity, an overextended move, or adverse-selection risk?'),
};
