/* ══════════════════════════════════════════════
   CRYPTEX v3 PRO — Proxy Bypass Version
   (CORS 해결을 위한 프록시 서버 사용)
══════════════════════════════════════════════ */

// 1. 설정 및 코인 리스트
const CONFIG = {
    // [핵심 변경] 바이낸스 주소를 프록시(AllOrigins)를 통해 우회 접속
    // 원본 주소: https://api.binance.com/api/v3/klines
    PROXY_BASE: 'https://api.allorigins.win/raw?url=',
    TARGET_API: 'https://api.binance.com/api/v3/klines',
    
    // 웹소켓은 프록시 필요 없음 (보통 차단 안됨)
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
let klineWs = null;
let tickerWs = null;
let candleData = [];
let lastPx = {};

// DOM 요소 헬퍼
const $ = id => document.getElementById(id);
const fmtP = p => p < 0.0001 ? p.toFixed(8) : p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtV = v => v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(0);

/* ══════════════════════════════════════════════
   2. 지표 계산 엔진
══════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════
   3. 차트 초기화
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
        width: rsiEl.clientWidth, height: rsiEl.clientHeight,
        timeScale: { ...sharedOpts.timeScale, visible:false },
        rightPriceScale: { borderColor:'#1a2035', scaleMargins:{top:0.08,bottom:0.08} },
    });

    rsiSeries = rsiChart.addLineSeries({
        color:'#c8a84b', lineWidth:2,
        priceLineVisible:false, lastValueVisible:true,
    });
    
    [70,30].forEach((lvl) => {
        rsiSeries.createPriceLine({
            price:lvl, color:'#1a2035', lineWidth:1, 
            lineStyle:LightweightCharts.LineStyle.Dashed, axisLabelVisible:false
        });
    });

    mainChart.subscribeCrosshairMove(p => { p.time ? rsiChart.setCrosshairPosition(NaN, p.time, rsiSeries) : rsiChart.clearCrosshairPosition(); });
    rsiChart.subscribeCrosshairMove(p => { p.time ? mainChart.setCrosshairPosition(NaN, p.time, candleSeries) : mainChart.clearCrosshairPosition(); });

    let syncing = false;
    const sync = (source, target) => {
        source.timeScale().subscribeVisibleLogicalRangeChange(r => {
            if (syncing || !r) return;
            syncing = true;
            target.timeScale().setVisibleLogicalRange(r);
            syncing = false;
        });
    };
    sync(mainChart, rsiChart);
    sync(rsiChart, mainChart);

    new ResizeObserver(entries => {
        for(let e of entries) {
            if(e.target.id === 'main-chart') mainChart.applyOptions({width:e.contentRect.width, height:e.contentRect.height});
            if(e.target.id === 'rsi-chart') rsiChart.applyOptions({width:e.contentRect.width, height:e.contentRect.height});
        }
    }).observe(document.querySelector('.charts-wrap'));
}

/* ══════════════════════════════════════════════
   4. 데이터 매니저 (핵심 변경 부분)
══════════════════════════════════════════════ */

function updateIndicators() {
    if (candleData.length === 0) return;
    EMAS.forEach((e, i) => {
        const emaData = calcEMA(candleData, e.len);
        emaSeries[i].setData(emaData);
    });
    const rsiData = calcRSI(candleData, 14);
    rsiSeries.setData(rsiData);
}

function updateRealtimeCandle(k) {
    const t = Math.floor(k.t / 1000);
    const newCandle = {
        time: t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v)
    };
    const lastCandle = candleData[candleData.length - 1];
    if (lastCandle && lastCandle.time === t) {
        candleData[candleData.length - 1] = newCandle;
    } else {
        candleData.push(newCandle);
        if (candleData.length > 2000) candleData.shift();
    }
    candleSeries.update(newCandle);
    volSeries.update({
        time: t,
        value: newCandle.volume,
        color: newCandle.close >= newCandle.open ? '#00e87a30' : '#ff3a5c30'
    });
    EMAS.forEach((e, i) => {
        const d = calcEMA(candleData, e.len);
        if(d.length) emaSeries[i].update(d[d.length-1]);
    });
    const r = calcRSI(candleData, 14);
    if(r.length) rsiSeries.update(r[r.length-1]);
}

// [중요] 프록시를 통해 데이터 가져오기
async function fetchHistory(symbol, interval) {
    // 1. 실제 요청할 바이낸스 주소 만들기
    const targetUrl = `${CONFIG.TARGET_API}?symbol=${symbol}&interval=${interval}&limit=${CONFIG.LIMIT}`;
    
    // 2. 프록시 서버(AllOrigins)를 경유하도록 주소 감싸기
    // encodeURIComponent는 주소 안의 특수문자를 안전하게 변환해줍니다.
    const proxyUrl = `${CONFIG.PROXY_BASE}${encodeURIComponent(targetUrl)}`;
    
    try {
        const res = await fetch(proxyUrl);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        
        // AllOrigins는 결과를 contents 필드에 담아서 줍니다.
        // 또는 raw 모드일 경우 바로 텍스트로 줄 수도 있음.
        // 여기서는 raw 모드를 썼으므로 바로 json 파싱
        const json = await res.json();
        
        // 데이터가 없는 경우 처리
        if (!Array.isArray(json) || json.length === 0) {
            throw new Error("빈 데이터 수신");
        }

        candleData = json.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));

        candleSeries.setData(candleData);
        volSeries.setData(candleData.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? '#00e87a30' : '#ff3a5c30'
        })));
        
        updateIndicators();
        mainChart.timeScale().fitContent();
        return true;

    } catch (e) {
        console.error("Proxy Fetch Error:", e);
        // 에러 내용을 화면에 표시
        showError(`데이터 로드 실패 (Proxy): ${e.message}`);
        return false;
    }
}

function connectChartStream(symbol, interval) {
    if (klineWs) klineWs.close();
    const wsUrl = `${CONFIG.WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
    klineWs = new WebSocket(wsUrl);
    klineWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.k) updateRealtimeCandle(data.k);
    };
    klineWs.onclose = () => {
        if(curCoin.s === symbol) setTimeout(() => connectChartStream(symbol, interval), 3000);
    };
}

function connectTickerStream() {
    if (tickerWs) tickerWs.close();
    const streams = COINS.map(c => `${c.s.toLowerCase()}@ticker`).join('/');
    tickerWs = new WebSocket(`${CONFIG.WS_URL}/${streams}`);
    const badge = $('ws-badge');
    const badgeText = $('ws-text');
    tickerWs.onopen = () => {
        badge.classList.add('on');
        badgeText.innerText = "LIVE DATA";
    };
    tickerWs.onclose = () => {
        badge.classList.remove('on');
        badgeText.innerText = "CONNECTING...";
        setTimeout(connectTickerStream, 3000);
    };
    tickerWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const s = data.s.toLowerCase();
        const p = parseFloat(data.c);
        const P = parseFloat(data.P);
        
        const itemPx = $(`mp-${s}`);
        const itemPct = $(`mc-${s}`);
        if(itemPx && itemPct) {
            const colorClass = P >= 0 ? 'up' : 'dn';
            itemPx.innerText = fmtP(p);
            itemPx.className = `dd-px ${colorClass}`;
            itemPct.innerText = (P>=0?'+':'') + P.toFixed(2) + '%';
            itemPct.className = `dd-pct ${colorClass}`;
        }

        if (data.s === curCoin.s) {
            const mainPx = $('disp-px');
            const colorClass = P >= 0 ? 'up' : 'dn';
            if(lastPx[s] && lastPx[s] !== p) {
                mainPx.classList.remove('fup', 'fdn');
                void mainPx.offsetWidth;
                mainPx.classList.add(p > lastPx[s] ? 'fup' : 'fdn');
            }
            lastPx[s] = p;
            mainPx.innerText = fmtP(p);
            mainPx.className = `px-val ${colorClass}`;
            const mainChg = $('disp-chg');
            mainChg.innerText = (P>=0?'+':'') + P.toFixed(2) + '%';
            mainChg.className = `s-val ${colorClass}`;
            $('disp-hi').innerText = fmtP(parseFloat(data.h));
            $('disp-lo').innerText = fmtP(parseFloat(data.l));
            $('disp-vol').innerText = fmtV(parseFloat(data.q));
        }
    };
}

/* ══════════════════════════════════════════════
   5. UI 인터랙션 및 실행
══════════════════════════════════════════════ */
async function loadCoin(coin, interval) {
    showLoading();
    const success = await fetchHistory(coin.s, interval);
    if (success) {
        hideLoading();
        connectChartStream(coin.s, interval);
    }
}

function showLoading() { $('loading').classList.remove('hide'); $('err-msg').classList.remove('show'); }
function hideLoading() { $('loading').classList.add('hide'); }
function showError(msg) { hideLoading(); $('err-txt').innerText = msg; $('err-msg').classList.add('show'); }
function retryLoad() { hideError(); loadCoin(curCoin, curIv); }
function hideError() { $('err-msg').classList.remove('show'); }

const dd = $('dd');
const symBtn = $('sym-btn');

COINS.forEach(c => {
    const el = document.createElement('div');
    el.className = 'dd-item';
    el.innerHTML = `
        <div class="dd-left">
            <div class="dd-ico"><img src="${c.logo}" alt=""></div>
            <div>
                <div class="dd-sym">${c.n}/USDT</div>
                <div class="dd-name">${c.name}</div>
            </div>
        </div>
        <div class="dd-right">
            <div class="dd-px" id="mp-${c.s.toLowerCase()}">-</div>
            <div class="dd-pct" id="mc-${c.s.toLowerCase()}">0.00%</div>
        </div>
    `;
    el.onclick = (e) => {
        e.stopPropagation();
        changeCoin(c);
    };
    dd.appendChild(el);
});

function changeCoin(coin) {
    curCoin = coin;
    $('disp-sym').innerText = `${coin.n} / USDT`;
    $('sym-ico').innerHTML = `<img src="${coin.logo}" alt="">`;
    ['disp-px','disp-chg','disp-hi','disp-lo','disp-vol'].forEach(id => $(id).innerText = '-');
    dd.classList.remove('show');
    symBtn.classList.remove('open');
    loadCoin(curCoin, curIv);
}

function setIv(iv, btn) {
    curIv = iv;
    document.querySelectorAll('.iv').forEach(b => b.classList.remove('act'));
    btn.classList.add('act');
    loadCoin(curCoin, curIv);
}

symBtn.addEventListener('click', () => {
    dd.classList.toggle('show');
    symBtn.classList.toggle('open');
});
document.addEventListener('click', (e) => {
    if(!symBtn.contains(e.target)) {
        dd.classList.remove('show');
        symBtn.classList.remove('open');
    }
});

requestAnimationFrame(() => {
    initCharts();
    connectTickerStream();
    loadCoin(curCoin, curIv);
});