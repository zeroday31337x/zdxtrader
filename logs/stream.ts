import fs from 'node:fs/promises';
import path from 'node:path';
import { envNumber, envText } from '../policy/env.js';

let queue:{file:string;line:string}[]=[],bytes=0,writing:Promise<void>|null=null;
let timer:NodeJS.Timeout|undefined,lastWarning=0,dropped=0;
function warning() {
  dropped++;
  if(Date.now()-lastWarning>=envNumber('TELEMETRY_WARNING_INTERVAL_MS')) {
    lastWarning=Date.now();console.error(JSON.stringify({component:'telemetry',event:'backpressure_or_write_failure',dropped}));
  }
}
/** Bounded background writes: disk latency never blocks the market/order request. */
export function appendTelemetry(category:string,provider:string,value:unknown) {
  const line=JSON.stringify(value)+'\n',length=Buffer.byteLength(line);
  if(bytes+length>envNumber('TELEMETRY_MAX_QUEUE_BYTES')){warning();return;}
  const safe=provider.replace(/[^a-z0-9.-]/gi,'_');
  const file=path.join(envText('TELEMETRY_LOG_DIR'),category,`${safe}-${new Date().toISOString().slice(0,10)}.jsonl`);
  queue.push({file,line});bytes+=length;
  if(!timer)timer=setTimeout(()=>{timer=undefined;void flushTelemetry();},envNumber('TELEMETRY_FLUSH_MS'));
}
export async function flushTelemetry():Promise<void> {
  if(writing){await writing;if(queue.length)await flushTelemetry();return;}
  if(timer){clearTimeout(timer);timer=undefined;}
  if(!queue.length)return;
  const batch=queue;queue=[];
  writing=(async()=>{
    const groups=new Map<string,string[]>();
    for(const row of batch){const lines=groups.get(row.file)??[];lines.push(row.line);groups.set(row.file,lines);}
    for(const [file,lines] of groups) {
      try{await fs.mkdir(path.dirname(file),{recursive:true});await fs.appendFile(file,lines.join(''),{mode:0o600});}
      catch{warning();}
    }
  })();
  try{await writing;}finally{for(const row of batch)bytes-=Buffer.byteLength(row.line);writing=null;}
}
