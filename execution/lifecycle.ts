import { envNumber } from '../policy/env.js';
import { assertTradeSize } from '../policy/limits.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Fill = { orderId:string; quantity:number; price:number; fees:number; terminal:boolean };
export type Intent = { clientId:string; symbol:string; side:'buy'|'sell'; quoteUsd?:number; quantity?:number };
export interface ExecutionAdapter {
  // Implementations MUST return exchange-confirmed cumulative fills, including partial fills.
  submit(intent:Intent):Promise<void>;
  reconcile(intent:Intent):Promise<Fill|null>;
}
type Position={symbol:string;quantity:number;cost:number;entryTime:number;high:number};
type State={version:1;position:Position|null;pending:Intent|null;day:string;realized:number;seen:string[];events:any[]};
const day=(t:number)=>new Date(t).toISOString().slice(0,10);

/** Offline-testable execution state machine. Never instantiates an exchange client. */
export class Lifecycle {
  private state:State;
  constructor(private file:string,private adapter:ExecutionAdapter,private now=Date.now) {
    this.state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,position:null,pending:null,day:day(now()),realized:0,seen:[],events:[]};
    if(this.state.version!==1||!Array.isArray(this.state.events)||!Array.isArray(this.state.seen)||!Number.isFinite(this.state.realized))throw Error('Invalid execution state; reconciliation required');
  }
  snapshot():State{return structuredClone(this.state);}
  private save(){
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const tmp=this.file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(this.state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,this.file);const dir=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  }
  private rollDay(){if(this.state.day!==day(this.now())){this.state.day=day(this.now());this.state.realized=0;}}
  async enter(symbol:string,availableUsd:number,entryFeeRate:number,dailyLossLimit:number){
    this.rollDay();
    const entryUsd = Math.min(envNumber('BASE_SIZE_USD'), envNumber('MAX_POSITION_USD'));
    assertTradeSize(entryUsd);
    if(this.state.pending||this.state.position)throw Error('Existing position or unresolved order');
    if(!symbol.endsWith('-USD'))throw Error('USD spot products only');
    if(!Number.isFinite(dailyLossLimit)||dailyLossLimit<=0||this.state.realized<=-dailyLossLimit)throw Error('Daily loss guard');
    if(!Number.isFinite(availableUsd)||!Number.isFinite(entryFeeRate)||entryFeeRate<0||entryFeeRate>1||availableUsd<entryUsd*(1+entryFeeRate))throw Error('Insufficient verified USD balance including fees');
    this.state.pending={clientId:randomUUID(),symbol,side:'buy',quoteUsd:entryUsd};
    this.save(); // intent is durable before any submission
    await this.adapter.submit(this.state.pending);
    await this.reconcile();
  }
  async reconcile(){
    const intent=this.state.pending;if(!intent)return;
    const f=await this.adapter.reconcile(intent);
    if(!f||!f.terminal)return; // uncertain, open and partial nonterminal orders remain locked
    if(!f.orderId||!Number.isFinite(f.quantity)||f.quantity<0||!Number.isFinite(f.fees)||f.fees<0||!Number.isFinite(f.price)||(f.quantity>0&&f.price<=0))throw Error('Invalid exchange fill');
    if(this.state.seen.includes(intent.clientId))throw Error('Duplicate terminal reconciliation');
    this.rollDay();
    if(intent.side==='buy'&&f.quantity>0){
      const cost=f.quantity*f.price+f.fees;
      if(f.quantity*f.price>(intent.quoteUsd ?? 0)+.000001)throw Error('Unexpected entry cost; manual reconciliation required');
      this.state.position={symbol:intent.symbol,quantity:f.quantity,cost,entryTime:this.now(),high:f.price};
    }
    if(intent.side==='sell'){
      const p=this.state.position;if(!p||f.quantity>p.quantity*(1+1e-10))throw Error('Unexpected exit quantity');
      if(f.quantity>0){
        const basis=p.cost*(f.quantity/p.quantity);
        this.state.realized+=f.quantity*f.price-f.fees-basis;
        const remaining=p.quantity-f.quantity;
        this.state.position=remaining<=p.quantity*1e-10?null:{...p,quantity:remaining,cost:p.cost-basis};
      }
    }
    this.state.seen.push(intent.clientId);
    this.state.events.push({time:this.now(),intent,fill:f,realizedToday:this.state.realized});
    this.state.pending=null;this.save();
  }
  async exitIfNeeded(price:number,quoteTime:number,rules:{stop:number;target:number;maxHoldHours:number;trailing:number}){
    if(this.state.pending)return;
    const p=this.state.position;if(!p)return;
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(quoteTime)||Math.abs(this.now()-quoteTime)>envNumber('MAX_QUOTE_AGE_MS'))throw Error('Missing or stale executable quote');
    if(![rules.stop,rules.target,rules.maxHoldHours,rules.trailing].every(x=>Number.isFinite(x)&&x>0)||rules.stop>=1||rules.trailing>=1)throw Error('Invalid exit rules');
    p.high=Math.max(p.high,price);this.save();
    const value=p.quantity*price,change=value/p.cost-1;
    const reason=change<=-rules.stop?'stop':change>=rules.target?'target':price/p.high-1<=-rules.trailing?'trailing':this.now()-p.entryTime>=rules.maxHoldHours*3600000?'max_hold':null;
    if(!reason)return;
    this.state.pending={clientId:randomUUID(),symbol:p.symbol,side:'sell',quantity:p.quantity};
    this.state.events.push({time:this.now(),exitReason:reason});this.save();
    await this.adapter.submit(this.state.pending);await this.reconcile();
  }
}
