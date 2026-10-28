import { choice, noul } from '../judge/index.js';
/**
 * Spy bot: copies wallets that already have an edge.
 */
export const spyQuestions = {
    wallet_skill: choice("This wallet's record looks:", {
        skilled: 'Consistent edge beyond luck',
        lucky: 'Positive results that look like variance',
        bot_like: 'Automated, mechanical patterns',
        insider_like: 'Suspicious timing or information edge',
        other: 'Does not fit',
    }),
    move_consistent: noul('Is this move consistent with how this wallet usually trades?'),
    mirror_decision: choice('Mirror it?', {
        full: 'Full size',
        partial: 'Reduced size',
        skip: 'Do not mirror',
    }),
    rug_risk: noul('Given the flags, does this token look like a rug?'),
};
//# sourceMappingURL=spy.js.map