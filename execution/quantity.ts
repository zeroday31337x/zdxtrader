/** Round down with decimal integers; never round a sale above the recorded holding. */
export function floorQuantity(quantity: string, increment: string): string {
  const decimal=/^\d+(?:\.\d+)?$/;
  if(!decimal.test(quantity)||!decimal.test(increment))throw Error('Invalid decimal quantity or base increment');
  const digits=Math.max(quantity.split('.')[1]?.length??0,increment.split('.')[1]?.length??0);
  const scaled=(s:string)=>{const [whole,fraction='']=s.split('.');return BigInt(whole+fraction.padEnd(digits,'0'));};
  const step=scaled(increment),owned=scaled(quantity);
  if(step<=0n||owned<=0n)throw Error('Quantity and increment must be positive');
  const units=owned/step*step;
  if(units<=0n)throw Error('Holding is below base increment');
  const raw=units.toString().padStart(digits+1,'0');
  return digits?`${raw.slice(0,-digits)}.${raw.slice(-digits)}`:raw;
}

export function subtractQuantity(owned:string,sold:string):string {
  if(!/^\d+(?:\.\d+)?$/.test(owned)||!/^\d+(?:\.\d+)?$/.test(sold))throw Error('Invalid confirmed quantity');
  const digits=Math.max(owned.split('.')[1]?.length??0,sold.split('.')[1]?.length??0);
  const scaled=(s:string)=>{const [whole,fraction='']=s.split('.');return BigInt(whole+fraction.padEnd(digits,'0'));};
  const difference=scaled(owned)-scaled(sold);if(difference<0n)throw Error('Confirmed sale exceeds owned quantity');
  const raw=difference.toString().padStart(digits+1,'0');
  return digits?`${raw.slice(0,-digits)}.${raw.slice(-digits)}`:raw;
}
