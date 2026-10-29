import fs from 'node:fs';
import path from 'node:path';

/** Persist attempts before submission so a restart cannot erase the cooldown. */
export class EntryCooldown {
  constructor(private file:string,private delayMs:number) {
    if(!Number.isFinite(delayMs)||delayMs<0)throw Error('Invalid ENTRY_COOLDOWN_MS');
  }
  remaining(now=Date.now()):number {
    if(!fs.existsSync(this.file))return 0;
    const {attemptedAt}=JSON.parse(fs.readFileSync(this.file,'utf8'));
    if(!Number.isFinite(attemptedAt)||attemptedAt>now)throw Error('Invalid entry cooldown state or clock moved backwards');
    return Math.max(0,attemptedAt+this.delayMs-now);
  }
  claim(now=Date.now()) {
    if(this.remaining(now)>0)throw Error('Entry cooldown active');
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temporary=`${this.file}.${process.pid}.tmp`;
    const fd=fs.openSync(temporary,'w',0o600);
    try {fs.writeFileSync(fd,JSON.stringify({attemptedAt:now}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,this.file);
  }
}
