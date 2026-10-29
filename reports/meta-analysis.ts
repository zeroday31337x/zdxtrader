import { runCorrelationAgent } from '../inference/agent.js';
const report=await runCorrelationAgent();
console.log(JSON.stringify({model:report.model,inputTokens:report.inputTokens,outputTokens:report.outputTokens,findings:report.analysis.findings.length,omittedEvidence:report.omittedEvidence,report:'reports/meta-correlations.json'}));
