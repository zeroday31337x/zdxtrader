// Preloaded only by the isolated paper integration test. No network or credentials.
let coinbaseBooks=0;
globalThis.fetch=async input=>{
 const url=new URL(input);let data;
 const end=Math.floor(Date.now()/60000)*60;
 const bars=Array.from({length:66},(_,i)=>({start:end-(66-i)*60,close:100+i,high:101+i,low:99+i,volume:100}));
 if(url.pathname.endsWith('/candles')) data={candles:bars};
 else if(url.pathname.includes('product_book')) {coinbaseBooks++;const p=coinbaseBooks===1?165:210;data={pricebook:{bids:[{price:String(p-.01),size:'100'}],asks:[{price:String(p+.01),size:'100'}]}};}
 else if(url.pathname.endsWith('/products/TEST-USD'))data={product_type:'SPOT',quote_currency_id:'USD',status:'online',quote_min_size:'1',quote_max_size:'1000',base_min_size:'0.000001',base_increment:'0.000001'};
 else if(url.pathname.endsWith('/klines')) data=bars.map(b=>[b.start*1000,b.close,b.high,b.low,b.close,b.volume]);
 else if(url.pathname.endsWith('bookTicker'))data={bidPrice:'164',askPrice:'166'};
 else if(url.pathname.endsWith('public/get-candlestick'))data={code:0,result:{data:bars.map(b=>({t:b.start*1000,o:b.close,c:b.close,h:b.high,l:b.low,v:b.volume}))}};
 else if(url.pathname.endsWith('public/get-book'))data={code:0,result:{data:[{bids:[['164','100','1']],asks:[['166','100','1']]}]}};
 else throw Error(`Unexpected offline URL: ${url.pathname}`);
 return new Response(JSON.stringify(data),{status:200});
};
