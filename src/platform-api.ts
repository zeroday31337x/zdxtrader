import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';

type Options={root:string;token:string;origins:string[];maxLogBytes?:number};
const numericSettings:Record<string,[number,number]>={MIN_TRADE_USD:[1,5],MAX_TRADE_USD:[1,5],MAX_POSITION_USD:[1,5],ENTRY_COOLDOWN_MS:[1000,86400000],ENTRY_MIN_NET_PROFIT_USD:[0,100],ENTRY_MIN_NET_MARGIN_BPS:[0,10000],FIB_PIVOT_RADIUS:[1,20],FIB_MIN_SWING_ATR:[0,100],EXIT_MIN_PROFIT_BPS:[0,10000]};
const booleanSettings=['REQUIRE_FIB_BUY_ZONE','REQUIRE_TARGET_MARGIN'];
const visibleSettings=['MODE','LIVE_TRADING','DECISION_ENGINE','ENABLE_AUTO_SELL','POLL_INTERVAL_MS','FIB_SWING_METHOD','FIB_TARGET_MODE',...Object.keys(numericSettings),...booleanSettings];

async function readJson(file:string) {try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e:any){if(e.code==='ENOENT')return null;throw e;}}
async function writeJson(file:string,value:unknown) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${randomUUID()}.tmp`;
  const handle=await fs.open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
  await fs.rename(temp,file);
}
function sanitize(value:any):any {
  if(Array.isArray(value))return value.map(sanitize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/secret|token|api.?key|authorization|cookie|private.?key/i.test(key)).map(([key,item])=>[key,sanitize(item)]));
  if(typeof value==='string') {
    for(const [key,secret] of Object.entries(process.env))if(/secret|token|api.?key|private.?key/i.test(key)&&secret&&secret.length>=8)value=value.replaceAll(secret,'[redacted]');
  }
  return value;
}

/** Separate monitoring process: never loads broker credentials into a trading client. */
export function createPlatformApi(options:Options) {
  if(options.token.length<32)throw Error('PLATFORM_API_TOKEN must contain at least 32 characters');
  const app=express();app.disable('x-powered-by');
  const root=path.resolve(options.root),state=(name:string)=>path.join(root,'state',name);
  const wrap=(handler:(req:express.Request,res:express.Response)=>Promise<unknown>):express.RequestHandler=>(req,res,next)=>{Promise.resolve(handler(req,res)).catch(next);};
  app.use((req,res,next)=>{
    const id=randomUUID(),started=Date.now();res.setHeader('X-Request-ID',id);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.on('finish',()=>console.log(JSON.stringify({component:'platform-api',id,method:req.method,route:req.path,status:res.statusCode,durationMs:Date.now()-started})));
    const origin=req.get('Origin');
    if(origin&&!options.origins.includes(origin)){res.status(403).json({error:'origin_not_allowed'});return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,PATCH,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.status(204).end();return;}
    const header=req.get('Authorization')??'';
    const actual=Buffer.from(header),expected=Buffer.from(`Bearer ${options.token}`);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){res.status(401).json({error:'unauthorized'});return;}
    next();
  });
  app.use(express.json({limit:'16kb',strict:true}));
  const config=async()=>dotenv.parse(await fs.readFile(path.join(root,'.env')));
  const control=async()=>await readJson(state('platform-control.json'))??{entriesPaused:false};
  // Reads bounded tails rather than loading unbounded daily datasets into memory.
  async function events(kind:string,limit:number,offset:number,filledOnly=false) {
    let files:string[]=[];try{files=(await fs.readdir(path.join(root,'logs'))).filter(name=>new RegExp(`^${kind}-\\d{4}-\\d{2}-\\d{2}\\.jsonl$`).test(name)).sort().reverse();}catch(e:any){if(e.code!=='ENOENT')throw e;}
    const items:any[]=[];let scannedBytes=0,truncated=false;
    const budget=options.maxLogBytes??2097152;
    for(const name of files) {
      if(scannedBytes>=budget){truncated=true;break;}
      const handle=await fs.open(path.join(root,'logs',name),'r');
      try {
        const stat=await handle.stat(),bytes=Math.min(stat.size,budget-scannedBytes),start=stat.size-bytes;
        const buffer=Buffer.alloc(bytes);const {bytesRead}=await handle.read(buffer,0,bytes,start);scannedBytes+=bytesRead;
        let lines=buffer.subarray(0,bytesRead).toString('utf8').split('\n');
        if(start>0){lines.shift();truncated=true;}
        for(const line of lines.reverse())try{const row=JSON.parse(line);if(!filledOnly||row.executed?.orderId||['paper_exit','live_exit','reconciliation'].includes(row.strategy))items.push(row);}catch{/* incomplete last writes are skipped */}
      }finally{await handle.close();}
      if(items.length>offset+limit)break;
    }
    return {items:sanitize(items.slice(offset,offset+limit)),nextOffset:items.length>offset+limit?offset+limit:null,truncated,scannedBytes};
  }
  function pagination(req:express.Request) {
    const limit=Number(req.query.limit??50),offset=Number(req.query.offset??0);
    if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>10000)throw Object.assign(Error('invalid_pagination'),{status:400});
    return {limit,offset};
  }
  app.get('/api/v1/health',(_req,res)=>res.json({ok:true,service:'trading-desk-api',version:1,time:new Date().toISOString()}));
  app.get('/api/v1/telemetry',wrap(async(_req,res)=>{
    const cfg=await config(),runtime=await readJson(state('runtime.json'));
    res.json(sanitize({time:new Date().toISOString(),configuredMode:cfg.MODE,configuredLiveTrading:cfg.LIVE_TRADING==='true',runtime,runtimeStale:!runtime||Date.now()-Date.parse(runtime.updatedAt)>Number(cfg.POLL_INTERVAL_MS)*3,control:await control(),risk:await readJson(state(`risk-${cfg.MODE}.json`)),dataset:await readJson(path.join(root,'reports/dataset-manifest.json'))}));
  }));
  app.get('/api/v1/positions',wrap(async(_req,res)=>{
    const cfg=await config(),position=await readJson(state(`position-${['live','paper','shadow'].includes(cfg.MODE)?cfg.MODE:'shadow'}.json`));
    res.json({scope:'bot_managed_local_state',items:position?[sanitize(position)]:[],manualApiTest:sanitize(await readJson(state('manual-api-test.json')))});
  }));
  for(const [route,kind] of [['trades','execution'],['executions','execution'],['decisions','decisions'],['rejections','rejections']])app.get(`/api/v1/${route}`,wrap(async(req,res)=>{const {limit,offset}=pagination(req);res.json({kind:route,...await events(kind,limit,offset,route==='trades')});}));
  app.get('/api/v1/analysis',wrap(async(_req,res)=>{res.json(sanitize(await readJson(path.join(root,'reports/latest-analysis.json'))));}));
  app.get('/api/v1/settings',wrap(async(_req,res)=>{
    const cfg=await config();res.json({configured:Object.fromEntries(visibleSettings.map(key=>[key,cfg[key]??null])),staged:await readJson(state('platform-settings-staged.json')),editable:{numeric:numericSettings,boolean:booleanSettings},application:'staged only; review and apply locally; restart required'});
  }));
  app.patch('/api/v1/settings',wrap(async(req,res)=>{
    const body=req.body;
    if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length===0){res.status(400).json({error:'settings_object_required'});return;}
    for(const [key,value] of Object.entries(body)) {
      const range=Object.hasOwn(numericSettings,key)?numericSettings[key]:undefined;
      if(range) {
        if(typeof value!=='number'||!Number.isFinite(value)||value<range[0]||value>range[1]||(/_MS$|_BARS$|RADIUS$/.test(key)&&!Number.isInteger(value))){res.status(400).json({error:'invalid_setting',key});return;}
      }else if(!booleanSettings.includes(key)||typeof value!=='boolean'){res.status(400).json({error:'setting_not_editable',key});return;}
    }
    const staged={...(await readJson(state('platform-settings-staged.json')))?.settings,...body};
    const combined={...await config(),...staged};
    if(Number(combined.MIN_TRADE_USD)>Math.min(Number(combined.MAX_TRADE_USD),Number(combined.MAX_POSITION_USD))){res.status(400).json({error:'inconsistent_trade_limits'});return;}
    const saved={updatedAt:new Date().toISOString(),settings:staged};await writeJson(state('platform-settings-staged.json'),saved);res.json({applied:false,staged:saved});
  }));
  app.get('/api/v1/control',wrap(async(_req,res)=>{res.json(await control());}));
  app.post('/api/v1/control/pause',wrap(async(_req,res)=>{
    const saved={entriesPaused:true,updatedAt:new Date().toISOString()};await writeJson(state('platform-control.json'),saved);res.json({...saved,runnerAcknowledgement:'pending; verify runtime heartbeat and runner version',effect:'blocks new entry evaluations; existing position exits continue; an in-flight submission may finish'});
  }));
  app.use((_req,res)=>res.status(404).json({error:'not_found'}));
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=error.status===400?400:error.status===413?413:500;
    res.status(status).json({error:status===500?'internal_error':status===413?'body_too_large':'invalid_request'});
  });
  return app;
}
