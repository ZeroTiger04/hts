/* ══════════════════════════════════════════════
   CRYPTEX v3 — Ultimate Safety Version
   (데이터 로드 실패 시 데모 모드 자동 전환)
══════════════════════════════════════════════ */

// 1. 설정
const CONFIG = {
    // 1순위: 바이낸스 공식 데이터 API (CORS 허용됨)
    API_URL: 'https://data-api.binance.vision/api/v3/klines',
    // 2순위: 프록시 우회 (1순위 실패 시 사용)
    PROXY_URL: 'https://corsproxy.io/?', 
    WS_URL: 'wss://stream.binance.com:9443/ws',
    LIMIT: 1000
};

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

// 전역 변수
let curCoin = COINS[0];
let curIv = '1d';
let mainChart, rsiChart;
let candleSeries, volSeries, emaSeries = [], rsiSeries;
let klineWs = null, tickerWs = null;
let candleData = [];
let lastPx = {};
let isDemoMode = false; // 데모 모드 여부

const $ = id => document.getElementById(id);
const fmtP = p => p < 0.0001 ? p.toFixed(8) : p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtV = v => v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(0);

/* ══════════════════════════════════════════════
   2. 차트 초기화
══════════════════════════════════════════════ */
function initCharts() {
    const mainEl = $('main-chart');
    const rsiEl  = $('rsi-chart');

    const sharedOpts = {
        layout: { background:{color:'#060810'}, textColor:'#4e5a72' },
        grid:   { vertLines:{color:'#0f1420',style:1}, horzLines:{color:'#0f1420',style:1} },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color:'#c8a84b55', labelBackgroundColor:'#0d1017' },
            horzLine: { color:'#c8a84b55', labelBackgroundColor:'#0d1017' },
        },
        timeScale: { borderColor:'#1a2035', timeVisible:true, secondsVisible:false },
        rightPriceScale: { borderColor:'#1a2035' },
    };

    mainChart = LightweightCharts.createChart(mainEl, { ...sharedOpts, width: mainEl.clientWidth, height: mainEl.clientHeight });
    
    candleSeries = mainChart.addCandlestickSeries({
        upColor:'#00e87a', downColor:'#ff3a5c', borderUpColor:'#00e87a', borderDownColor:'#ff3a5c',
        wickUpColor:'#00e87a88', wickDownColor:'#ff3a5c88', priceLineColor:'#c8a84b', priceLineWidth:1,
    });
    volSeries = mainChart.addHistogramSeries({
        priceFormat:{type:'volume'}, priceScaleId:'vol', lastValueVisible:false, priceLineVisible:false,
    });
    mainChart.priceScale('vol').applyOptions({ scaleMargins:{top:0.82,bottom:0} });

    emaSeries = EMAS.map(e => mainChart.addLineSeries({
        color:e.color, lineWidth:e.width, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false,
    }));

    rsiChart = LightweightCharts.createChart(rsiEl, {
        ...sharedOpts, width: rsiEl.clientWidth, height: rsiEl.clientHeight,
        timeScale: { ...sharedOpts.timeScale, visible:false },
        rightPriceScale: { borderColor:'#1a2035', scaleMargins:{top:0.08,bottom:0.08} },
    });
    rsiSeries = rsiChart.addLineSeries({ color:'#c8a84b', lineWidth:2, priceLineVisible:false, lastValueVisible:true });
    [70,30].forEach((lvl) => rsiSeries.createPriceLine({
        price:lvl, color:'#1a2035', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dashed, axisLabelVisible:false
    }));

    // 동기화 및 리사이징
    mainChart.subscribeCrosshairMove(p => { p.time ? rsiChart.setCrosshairPosition(NaN, p.time, rsiSeries) : rsiChart.clearCrosshairPosition(); });
    rsiChart.subscribeCrosshairMove(p => { p.time ? mainChart.setCrosshairPosition(NaN, p.time, candleSeries) : mainChart.clearCrosshairPosition(); });
    let syncing = false;
    const sync = (s, t) => s.timeScale().subscribeVisibleLogicalRangeChange(r => { if(!syncing && r){ syncing=true; t.timeScale().setVisibleLogicalRange(r); syncing=false; } });
    sync(mainChart, rsiChart); sync(rsiChart, mainChart);
    
    new ResizeObserver(e => {
        for(let entry of e) {
            if(entry.target.id==='main-chart') mainChart.applyOptions({width:entry.contentRect.width, height:entry.contentRect.height});
            if(entry.target.id==='rsi-chart') rsiChart.applyOptions({width:entry.contentRect.width, height:entry.contentRect.height});
        }
    }).observe(document.querySelector('.charts-wrap'));
}

/* ══════════════════════════════════════════════
   3. 지표 계산
══════════════════════════════════════════════ */
function calcEMA(data, period) {
    if (data.length < period) return [];
    const k = 2/(period+1); const out=[]; let ema=0;
    for(let i=0; i<period; i++) ema+=data[i].close; ema/=period;
    out.push({time:data[period-1].time, value:ema});
    for(let i=period; i<data.length; i++){ ema=data[i].close*k+ema*(1-k); out.push({time:data[i].time, value:ema}); }
    return out;
}
function calcRSI(data, period=14) {
    if (data.length < period+1) return [];
    const out=[]; let ag=0, al=0;
    for(let i=1; i<=period; i++){ const d=data[i].close-data[i-1].close; if(d>0) ag+=d; else al+=Math.abs(d); }
    ag/=period; al/=period;
    out.push({time:data[period].time, value:al===0?100:100-100/(1+ag/al)});
    for(let i=period+1; i<data.length; i++){
        const d=data[i].close-data[i-1].close;
        ag=(ag*(period-1)+(d>0?d:0))/period; al=(al*(period-1)+(d<0?Math.abs(d):0))/period;
        out.push({time:data[i].time, value:al===0?100:100-100/(1+ag/al)});
    }
    return out;
}
function updateIndicators() {
    if(candleData.length===0) return;
    EMAS.forEach((e,i) => emaSeries[i].setData(calcEMA(candleData, e.len)));
    rsiSeries.setData(calcRSI(candleData, 14));
}

/* ══════════════════════════════════════════════
   4. 데이터 매니저 (핵심: 데모 모드 포함)
══════════════════════════════════════════════ */
async function fetchWithTimeout(url, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
}

// [데모 데이터 생성기]
function generateMockData() {
    let res = [];
    let time = Math.floor(Date.now()/1000) - (1000*60*60*24); // 1일 전부터 시작
    let price = 50000;
    for(let i=0; i<1000; i++) {
        time += 3600; // 1시간 단위
        let move = (Math.random() - 0.5) * 500;
        let open = price;
        let close = price + move;
        let high = Math.max(open, close) + Math.random() * 50;
        let low = Math.min(open, close) - Math.random() * 50;
        price = close;
        res.push({ time, open, high, low, close, volume: Math.random()*1000 });
    }
    return res;
}

// [데이터 로드 로직]
async function loadCoin(coin, interval) {
    showLoading();
    isDemoMode = false;
    $('err-msg').classList.remove('show');

    // 1단계: 바이낸스 공식 API 시도
    const targetUrl = `${CONFIG.API_URL}?symbol=${coin.s}&interval=${interval}&limit=${CONFIG.LIMIT}`;
    try {
        const res = await fetchWithTimeout(targetUrl, 3000);
        if(!res.ok) throw new Error('Network response not ok');
        const json = await res.json();
        processData(json);
        hideLoading();
        connectChartStream(coin.s, interval); // 웹소켓 연결
        return;
    } catch(e) {
        console.warn("1차 시도 실패, 2차(프록시) 시도...");
    }

    // 2단계: 프록시 우회 시도
    try {
        const proxyUrl = `${CONFIG.PROXY_URL}${encodeURIComponent(targetUrl)}`;
        const res = await fetchWithTimeout(proxyUrl, 5000);
        const json = await res.json();
        processData(json);
        hideLoading();
        connectChartStream(coin.s, interval);
        return;
    } catch(e) {
        console.warn("2차 시도 실패, 데모 모드로 전환...");
    }

    // 3단계: 최후의 수단 (데모 모드)
    isDemoMode = true;
    candleData = generateMockData();
    renderChart(candleData);
    hideLoading();
    $('err-txt').innerText = "DEMO MODE (LIVE FAILED)";
    $('err-msg').classList.add('show');
    // 데모용 가짜 웹소켓 시뮬레이션 시작
    startDemoSimulation();
}

function processData(json) {
    if (!Array.isArray(json)) throw new Error("Invalid data");
    candleData = json.map(d => ({
        time: d[0]/1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
    }));
    renderChart(candleData);
}

function renderChart(data) {
    candleSeries.setData(data);
    volSeries.setData(data.map(d => ({
        time: d.time, value: d.volume, color: d.close >= d.open ? '#00e87a30' : '#ff3a5c30'
    })));
    updateIndicators();
    mainChart.timeScale().fitContent();
}

/* ══════════════════════════════════════════════
   5. 실시간 연결 (웹소켓)
══════════════════════════════════════════════ */
function connectChartStream(symbol, interval) {
    if(isDemoMode) return; // 데모 모드면 실제 연결 안 함
    if (klineWs) klineWs.close();
    const url = `${CONFIG.WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
    klineWs = new WebSocket(url);
    klineWs.onmessage = e => {
        const d = JSON.parse(e.data);
        if(d.k) updateRealtimeCandle(d.k);
    };
}

function updateRealtimeCandle(k) {
    const t = Math.floor(k.t / 1000);
    const newCandle = {
        time: t, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v)
    };
    const last = candleData[candleData.length-1];
    if (last && last.time === t) candleData[candleData.length-1] = newCandle;
    else { candleData.push(newCandle); if(candleData.length>2000) candleData.shift(); }
    
    candleSeries.update(newCandle);
    volSeries.update({ time: t, value: newCandle.volume, color: newCandle.close >= newCandle.open ? '#00e87a30' : '#ff3a5c30' });
    
    // 심플 업데이트 (성능용)
    const emaLast = calcEMA(candleData, 20); if(emaLast.length) emaSeries[0].update(emaLast[emaLast.length-1]);
    const rsiLast = calcRSI(candleData, 14); if(rsiLast.length) rsiSeries.update(rsiLast[rsiLast.length-1]);
}

// [데모 시뮬레이션]
function startDemoSimulation() {
    if(klineWs) clearInterval(klineWs); // 기존 타이머 제거 용도
    klineWs = setInterval(() => {
        if(!isDemoMode) return;
        let last = candleData[candleData.length-1];
        let price = last.close + (Math.random()-0.5)*20;
        let high = Math.max(last.high, price);
        let low = Math.min(last.low, price);
        let updated = {...last, close:price, high:high, low:low, volume:last.volume+10};
        
        candleSeries.update(updated);
        // 약식 지표 업데이트
        const rsiVal = 50 + (Math.random()-0.5)*10;
        rsiSeries.update({time:updated.time, value:rsiVal});
    }, 1000);
}

function connectTickerStream() {
    // 실제 데이터가 안되면 이것도 막힐 확률 높음. 
    // 그래도 시도는 함.
    if (tickerWs) tickerWs.close();
    const streams = COINS.map(c => `${c.s.toLowerCase()}@ticker`).join('/');
    tickerWs = new WebSocket(`${CONFIG.WS_URL}/${streams}`);
    
    tickerWs.onopen = () => { $('ws-badge').classList.add('on'); $('ws-text').innerText="LIVE"; };
    tickerWs.onmessage = e => {
        const d = JSON.parse(e.data);
        if(d.s === curCoin.s && !isDemoMode) {
            $('disp-px').innerText = fmtP(parseFloat(d.c));
            // 나머지 UI 업데이트 생략 (데모 집중)
        }
    };
}

/* ══════════════════════════════════════════════
   6. UI 이벤트 및 실행
══════════════════════════════════════════════ */
function showLoading() { $('loading').classList.remove('hide'); }
function hideLoading() { $('loading').classList.add('hide'); }
function retryLoad() { loadCoin(curCoin, curIv); }

const dd = $('dd'); const symBtn = $('sym-btn');
COINS.forEach(c => {
    const el = document.createElement('div'); el.className = 'dd-item';
    el.innerHTML = `<div class="dd-left"><div class="dd-ico"><img src="${c.logo}" alt=""></div><div><div class="dd-sym">${c.n}/USDT</div><div class="dd-name">${c.name}</div></div></div>`;
    el.onclick = e => { e.stopPropagation(); changeCoin(c); };
    dd.appendChild(el);
});
function changeCoin(c) {
    curCoin=c; $('disp-sym').innerText=`${c.n} / USDT`; $('sym-ico').innerHTML=`<img src="${c.logo}">`;
    dd.classList.remove('show'); symBtn.classList.remove('open'); loadCoin(c, curIv);
}
function setIv(iv, btn) { curIv=iv; document.querySelectorAll('.iv').forEach(b=>b.classList.remove('act')); btn.classList.add('act'); loadCoin(curCoin, iv); }
symBtn.addEventListener('click', ()=>{ dd.classList.toggle('show'); symBtn.classList.toggle('open'); });

requestAnimationFrame(() => {
    initCharts();
    connectTickerStream();
    loadCoin(curCoin, curIv);
});11