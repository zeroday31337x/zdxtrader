import { envText } from '../policy/env.js';
import type { AnalysisAdapter } from './types.js';
import { MetaAnalysisAdapter } from './meta.js';
export function analysisAdapter(provider=envText('ANALYSIS_PROVIDER')):AnalysisAdapter {
  if(provider==='meta')return new MetaAnalysisAdapter();
  throw Error(`Unsupported analysis provider: ${provider}`);
}
