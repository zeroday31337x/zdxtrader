import { envText } from '../policy/env.js';
import { MetaAnalysisAdapter } from './meta.js';
export function analysisAdapter(provider = envText('ANALYSIS_PROVIDER')) {
    if (provider === 'meta')
        return new MetaAnalysisAdapter();
    throw Error(`Unsupported analysis provider: ${provider}`);
}
//# sourceMappingURL=index.js.map