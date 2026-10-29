import { envText } from '../policy/env.js';
/** UTC entry windows. Overnight windows use the weekday on which the window begins. */
export function entriesScheduled(now = new Date()): boolean {
  const days=envText('TRADING_DAYS_UTC').split(',').map(Number);
  if(!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Invalid TRADING_DAYS_UTC');
  const minute=now.getUTCHours()*60+now.getUTCMinutes();
  const parse=(s:string)=>{
    if(!/^\d{2}:\d{2}$/.test(s))throw Error('Invalid TRADING_WINDOWS_UTC');
    const [h,m]=s.split(':').map(Number);
    if(h>24||m>59||(h===24&&m!==0))throw Error('Invalid UTC schedule time');
    return h*60+m;
  };
  return envText('TRADING_WINDOWS_UTC').split(',').some(window=>{
    const parts=window.trim().split('-');if(parts.length!==2)throw Error('Invalid TRADING_WINDOWS_UTC');
    const [start,end]=parts.map(parse);
    if(start===end)throw Error('Empty UTC entry window');
    if(start<end)return days.includes(now.getUTCDay())&&minute>=start&&minute<end;
    return (minute>=start&&days.includes(now.getUTCDay()))||(minute<end&&days.includes((now.getUTCDay()+6)%7));
  });
}
