import { choice, noul } from '../judge/index.js';

/**
 * House bot: gets paid whatever the price does (market making / liquidity).
 */
export const houseQuestions = {
  inventory_risk: noul('Is current inventory risk too high to quote?'),
  spread_attractive: noul('Is the current spread attractive enough to quote both sides?'),
  regime_for_mm: choice('Is this regime suitable for market making?', {
    good: 'Calm, mean-reverting, healthy flow',
    caution: 'Elevated vol or directional pressure',
    avoid: 'Toxic flow or extreme moves',
    other: 'Unclear',
  }),
};
