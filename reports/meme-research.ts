import { researchMemes } from '../market/meme-research.js';
const report=await researchMemes();
console.log(JSON.stringify({report:'reports/meme-research.json',candidates:report.candidates.length,screened:report.candidates.filter(c=>c.research_candidate).map(c=>c.symbol),feeBps:report.fee_bps_per_side,horizonHours:report.horizon_hours}));
