/* ══════════════════════════════════════════════
   CRYPTEX v3 — Lightweight Charts + Binance API
   지표: EMA 20/60/120/200 + RSI(14) + Volume
══════════════════════════════════════════════ */

const COINS = [
  { s:'BTCUSDT',  n:'BTC',  name:'Bitcoin',  logo:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  { s:'ETHUSDT',  n:'ETH',  name:'Ethereum', logo:'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  { s:'XRPUSDT',  n:'XRP',  name:'Ripple',   logo:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
  { s:'SOLUSDT',  n:'SOL',  name:'Solana',   logo:'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  { s:'BNBUSDT',  n:'BNB',  name:'BNB',      logo:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
  { s:'DOGEUSDT', n:'DOGE', name:'Dogecoin', logo:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
  { s:'ADAUSDT',  n:'ADA',  name:'Cardano',  logo:'https://assets.coingecko.com/coins/images/975/small/cardano.png' },
  { s:'PEPEUSDT', n:'PEPE', name:'Pepe',     logo:'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg' },
];

const EMAS = [
  { len:20,  color:'#ff8c00', width:1 },
  { len:60,  color:'#00e87a', width:1 },
  { len:120, color:'#ff3a5c', width:1 },
  { len:200, color:'#4d9fff', width:2 },
];

let curCoin = COINS[0], curIv = '1d';
let mainChart, rsiChart;
let candleSeries, volSeries, emaSeries = [], rsiSeries;
let klineWs = null, tickerWs = null;
let lastPx = {}, candleData = [];

// 유틸리티
const fmtP = p => p < 0.0001 ? p.toFixed(8) : p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtV = v => v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(0);
const $  = id => document.getElementById(id);

// 로딩/에러 UI 제어
function showLoading() { $('loading').classList.remove('hide'); $('err-msg').classList.remove('show'); }
function hideLoading() { $('loading').classList.add('hide'); }
function showError(msg) { hideLoading(); $('err-txt').textContent = msg || '데이터 로드 실패'; $('err-msg').classList.add('show'); }
function hideError()    { $('err-msg').classList.remove('show'); }
function retryLoad()    { hideError(); loadData(curCoin, curIv); }

// 지표 계산 함수 (EMA, RSI)
function calcEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let ema = 0;
  for (let i = 0; i < period; i++) ema += data[i].close;
  ema /= period;
  out.push({ time: data[period-1].time, value: ema });
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1-k);
    out.push({ time: data[i].time, value: ema });
  }
  return out;
}

function calcRSI(data, period=14) {
  if (data.length < period+1) return [];
  const out = [];
  let ag=0, al=0;
  for (let i=1; i<=period; i++) {
    const d = data[i].close - data[i-1].close;
    if (d>0) ag+=d; else al+=Math.abs(d);
  }
  ag/=period; al/=period;
  out.push({ time: data[period].time, value: al===0?100:100-100/(1+ag/al) });
  for (let i=period+1; i<data.length; i++) {
    const d = data[i].close - data[i-1].close;
    ag = (ag*(period-1)+(d>0?d:0))/period;
    al = (al*(period-1)+(d<0?Math.abs(d):0))/period;
    out.push({ time: data[i].time, value: al===0?100:100-100/(1+ag/al) });
  }
  return out;
}

// 차트 초기화
function initCharts() {
  const mainEl = $('main-chart');
  const rsiEl  = $('rsi-chart');

  const mW = mainEl.clientWidth  || window.innerWidth;
  const mH = mainEl.clientHeight || 400;
  const rW = rsiEl.clientWidth   || window.innerWidth;
  const rH = rsiEl.clientHeight  || 130;

  const sharedOpts = {
    layout: { background:{color:'#060810'}, textColor:'#4e5a72' },
    grid:   { vertLines:{color:'#0f1420',style:1}, horzLines:{color:'#0f1420',style:1} },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color:'#c8a84b55', labelBackgroundColor:'#0d1017' },
      horzLine: { color:'#c8a84b55', labelBackgroundColor:'#0d1017' },
    },
    timeScale:        { borderColor:'#1a2035', timeVisible:true, secondsVisible:false },
    rightPriceScale: { borderColor:'#1a2035' },
  };

  mainChart = LightweightCharts.createChart(mainEl, { ...sharedOpts, width:mW, height:mH });

  candleSeries = mainChart.addCandlestickSeries({
    upColor:'#00e87a', downColor:'#ff3a5c',
    borderUpColor:'#00e87a', borderDownColor:'#ff3a5c',
    wickUpColor:'#00e87a88', wickDownColor:'#ff3a5c88',
    priceLineColor:'#c8a84b', priceLineWidth:1,
  });

  volSeries = mainChart.addHistogramSeries({
    priceFormat:{type:'volume'}, priceScaleId:'vol',
    lastValueVisible:false, priceLineVisible:false,
  });
  mainChart.priceScale('vol').applyOptions({ scaleMargins:{top:0.82,bottom:0} });

  emaSeries = EMAS.map(e => mainChart.addLineSeries({
    color:e.color, lineWidth:e.width,
    priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false,
  }));

  rsiChart = LightweightCharts.createChart(rsiEl, {
    ...sharedOpts,
    width: rW, height: rH,
    timeScale: { ...sharedOpts.timeScale, visible:false },
    rightPriceScale: { borderColor:'#1a2035', scaleMargins:{top:0.08,bottom:0.08} },
  });

  rsiSeries = rsiChart.addLineSeries({
    color:'#c8a84b', lineWidth:2,
    priceLineVisible:false, lastValueVisible:true,
  });
  [70,50,30].forEach((lvl,i) => {
    rsiSeries.createPriceLine({
      price:lvl, color:i===1?'#2a3348':'#1a2035',
      lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dashed,
      axisLabelVisible:true,
      title: lvl===70?'OB':lvl===30?'OS':'',
    });
  });

  // 크로스헤어 및 타임스케일 동기화
  mainChart.subscribeCrosshairMove(p => {
    if (p.time) rsiChart.setCrosshairPosition(NaN, p.time, rsiSeries);
    else        rsiChart.clearCrosshairPosition();
  });
  rsiChart.subscribeCrosshairMove(p => {
    if (p.time) mainChart.setCrosshairPosition(NaN, p.time, candleSeries);
    else        mainChart.clearCrosshairPosition();
  });

  let syncing = false;
  mainChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (syncing||!r) return; syncing=true; rsiChart.timeScale().setVisibleLogicalRange(r); syncing=false;
  });
  rsiChart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (syncing||!r) return; syncing=true; mainChart.timeScale().setVisibleLogicalRange(r); syncing=false;
  });

  const ro = new ResizeObserver(() => {
    const mw=mainEl.clientWidth, mh=mainEl.clientHeight;
    const rw=rsiEl.clientWidth,  rh=rsiEl.clientHeight;
    if (mw>0&&mh>0) mainChart.applyOptions({width:mw,height:mh});
    if (rw>0&&rh>0) rsiChart.applyOptions({width:rw,height:rh});
  });
  ro.observe(mainEl);
  ro.observe(rsiEl);
}

// 데이터 그리기
function renderAll(data) {
  candleData = data;
  candleSeries.setData(data.map(d=>({time:d.time,open:d.open,high:d.high,low:d.low,close:d.close})));
  volSeries.setData(data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?'#00e87a30':'#ff3a5c30'})));
  EMAS.forEach((e,i) => emaSeries[i].setData(calcEMA(data, e.len)));
  rsiSeries.setData(calcRSI(data, 14));
  mainChart.timeScale().fitContent();
}

function updateCandle(k) {
  const c = { time:Math.floor(k.t/1000), open:parseFloat(k.o), high:parseFloat(k.h), low:parseFloat(k.l), close:parseFloat(k.c), volume:parseFloat(k.v) };
  const last = candleData[candleData.length-1];
  if (last && last.time===c.time)       candleData[candleData.length-1]=c;
  else if (!last || c.time>last.time) { candleData.push(c); if(candleData.length>1000) candleData.shift(); }
  else return;
  candleSeries.update({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close});
  volSeries.update({time:c.time,value:c.volume,color:c.close>=c.open?'#00e87a30':'#ff3a5c30'});
  EMAS.forEach((e,i) => { const d=calcEMA(candleData,e.len); if(d.length) emaSeries[i].update(d[d.length-1]); });
  const rd=calcRSI(candleData,14); if(rd.length) rsiSeries.update(rd[rd.length-1]);
}

// Binance API 호출
async function fetchKlines(symbol, interval, limit=600) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length===0) throw new Error('빈 데이터');
  return raw.map(k=>({
    time:  Math.floor(k[0]/1000),
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume:parseFloat(k[5]),
  }));
}

async function loadData(coin, interval) {
  showLoading();
  if (klineWs) { try{klineWs.close();}catch(e){} klineWs=null; }
  try {
    const data = await fetchKlines(coin.s, interval);
    renderAll(data);
    hideLoading();
    connectKlineWs(coin.s, interval);
  } catch(e) {
    console.error('[loadData]', e);
    showError('데이터 로드 실패: ' + e.message);
  }
}

// 웹소켓 연결
function connectKlineWs(symbol, interval) {
  const url = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
  klineWs = new WebSocket(url);
  klineWs.onmessage = e => { const d=JSON.parse(e.data); if(d.k) updateCandle(d.k); };
  klineWs.onclose   = () => { setTimeout(()=>{ if(curCoin.s===symbol) connectKlineWs(symbol,interval); },3000); };
  klineWs.onerror   = () => klineWs.close();
}

function connectTickerWs() {
  if (tickerWs) { try{tickerWs.close();}catch(e){} }
  const streams = COINS.map(c=>`${c.s.toLowerCase()}@ticker`).join('/');
  tickerWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
  const badge=$('ws-badge'), wsText=$('ws-text');
  tickerWs.onopen  = ()=>{ badge.classList.add('on'); wsText.textContent='LIVE'; };
  tickerWs.onclose = ()=>{ badge.classList.remove('on'); wsText.textContent='RECONNECTING'; setTimeout(connectTickerWs,3000); };
  tickerWs.onerror = ()=>tickerWs.close();
  tickerWs.onmessage = e => {
    const d=JSON.parse(e.data);
    const s=d.s.toLowerCase(), p=parseFloat(d.c), P=parseFloat(d.P);
    const up=P>=0, cls=up?'up':'dn', pct=(up?'+':'')+P.toFixed(2)+'%';
    const mpEl=$('mp-'+s), mcEl=$('mc-'+s);
    if(mpEl){ mpEl.textContent=fmtP(p); mpEl.className='dd-px '+cls; mcEl.textContent=pct; mcEl.className='dd-pct '+cls; }
    if(d.s===curCoin.s) {
      const pxEl=$('disp-px'), prev=lastPx[s];
      pxEl.textContent=fmtP(p); pxEl.className='px-val '+cls;
      if(prev!==undefined){ pxEl.classList.remove('fup','fdn'); void pxEl.offsetWidth; pxEl.classList.add(p>=prev?'fup':'fdn'); }
      lastPx[s]=p;
      const ce=$('disp-chg'); ce.textContent=pct; ce.className='s-val '+cls;
      $('disp-hi').textContent=fmtP(parseFloat(d.h));
      $('disp-lo').textContent=fmtP(parseFloat(d.l));
      $('disp-vol').textContent=fmtV(parseFloat(d.q));
    }
  };
}

// 이벤트 리스너 설정
const ddEl=$('dd'), symBtn=$('sym-btn');
COINS.forEach(c=>{
  const el=document.createElement('div');
  el.className='dd-item';
  el.onclick=e=>{e.stopPropagation();selectCoin(c);};
  el.innerHTML=`<div class="dd-left"><div class="dd-ico"><img src="${c.logo}" alt="${c.n}"></div><div><div class="dd-sym">${c.n}/USDT</div><div class="dd-name">${c.name}</div></div></div><div class="dd-right"><div class="dd-px" id="mp-${c.s.toLowerCase()}">—</div><div class="dd-pct" id="mc-${c.s.toLowerCase()}">0.00%</div></div>`;
  ddEl.appendChild(el);
});
symBtn.addEventListener('click',()=>{ddEl.classList.toggle('show');symBtn.classList.toggle('open');});
document.addEventListener('click',e=>{if(!symBtn.contains(e.target)){ddEl.classList.remove('show');symBtn.classList.remove('open');}});

function selectCoin(c) {
  curCoin=c;
  $('disp-sym').textContent=`${c.n} / USDT`;
  $('sym-ico').innerHTML=`<img src="${c.logo}" alt="${c.n}">`;
  ['disp-px','disp-chg','disp-hi','disp-lo','disp-vol'].forEach(id=>$(id).textContent='—');
  ddEl.classList.remove('show'); symBtn.classList.remove('open');
  loadData(c, curIv);
}

function setIv(iv, btn) {
  curIv=iv;
  document.querySelectorAll('.iv').forEach(b=>b.classList.remove('act'));
  btn.classList.add('act');
  loadData(curCoin, iv);
}

// 시작
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    initCharts();
    connectTickerWs();
    loadData(curCoin, curIv);
  });
});