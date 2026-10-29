import { collectPredictionOnce, startPredictionCollector } from '../market/predictions.js';
import { writePredictionStudy } from './prediction-study.js';
if(process.argv.includes('--study')){const report=await writePredictionStudy();console.log(JSON.stringify({status:report.status,holdout:report.chronological_holdout}));}
else if(process.argv.includes('--watch'))startPredictionCollector();
else {const report=await collectPredictionOnce();await writePredictionStudy();console.log(JSON.stringify({series:report.series,active:report.active_markets,observations:report.observations.length,settlementsAdded:report.settlements_added,mode:report.mode}));}
