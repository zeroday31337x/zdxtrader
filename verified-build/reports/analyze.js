import { scanProducts } from '../state/scanner.js';
import { saveAnalysis } from './live-analysis.js';
await saveAnalysis(await scanProducts());
console.log('Market analysis saved to reports/latest-analysis.json');
//# sourceMappingURL=analyze.js.map