/* ══════════════════════════════════════════════
   CRYPTEX v3 PRO — Hybrid Data Architecture
   (REST Snapshot + WebSocket Stream)
══════════════════════════════════════════════ */

// 1. 설정 및 코인 리스트
const CONFIG = {
    // CORS 문제 없는 공개 데이터 API (초기 로딩용)
    REST_URL: 'https://data-api.binance.vision/api/v3/klines',
    // 실시간 데이터 스트림 (라이브 업데이트용)
    WS_URL: 'wss://stream.binance.com:9443/ws',
    LIMIT: 1000 // 불러올 캔들 개수
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
let klineWs = null;   // 차트용 소켓
let tickerWs = null;  // 상단 가격표시용 소켓
let candleData = [];  // 데이터 저장소
let lastPx = {};      // 전일 대비 가격 비교용

// DOM 요소 헬퍼
const $ = id => document.getElementById(id);
const fmtP = p => p < 0.0001 ? p.toFixed(8) : p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtV = v => v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(0);

/* ══════════════════════════════════════════════
   2. 지표 계산 엔진 (EMA, RSI)
   실시간으로 들어오는 데이터에 맞춰 즉시 계산
══════════════════════════════════════════════ */
function calcEMA(data, period) {
    if (data.length < period) return [];
    const k = 2 / (period + 1);
    const out = [];
    let ema = 0;
    
    // 초기 SMA 계산
    for (let i = 0; i < period; i++) ema += data[i].close;
    ema /= period;
    out.push({ time: data[period-1].time, value: ema });
    
    // 이후 EMA 계산
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
    
    // 첫 RSI 계산
    for (let i=1; i<=period; i++) {
        const d = data[i].close - data[i-1].close;
        if (d>0) ag+=d; else al+=Math.abs(d);
    }
    ag/=period; al/=period;
    out.push({ time: data[period].time, value: al===0?100:100-100/(1+ag/al) });
    
    // 이후 RSI (Smoothed)
    for (let i=period+1; i<data.length; i++) {
        const d = data[i].close - data[i-1].close;
        ag = (ag*(period-1)+(d>0?d:0))/period;
        al = (al*(period-1)+(d<0?Math.abs(d):0))/period;
        out.push({ time: data[i].time, value: al===0?100:100-100/(1+ag/al) });
    }
    return out;
}

/* ══════════════════════════════════════════════
   3. 차트 초기화 (Lightweight Charts)
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

    // 메인 차트 생성
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

    // RSI 차트 생성
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
    
    // RSI 기준선 (70/30)
    [70,30].forEach((lvl) => {
        rsiSeries.createPriceLine({
            price:lvl, color:'#1a2035', lineWidth:1, 
            lineStyle:LightweightCharts.LineStyle.Dashed, axisLabelVisible:false
        });
    });

    // ── 동기화 로직 ──
    // 1. 크로스헤어 동기화
    mainChart.subscribeCrosshairMove(p => { p.time ? rsiChart.setCrosshairPosition(NaN, p.time, rsiSeries) : rsiChart.clearCrosshairPosition(); });
    rsiChart.subscribeCrosshairMove(p => { p.time ? mainChart.setCrosshairPosition(NaN, p.time, candleSeries) : mainChart.clearCrosshairPosition(); });

    // 2. 스크롤/줌(TimeScale) 동기화
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

    // 3. 반응형 리사이징
    new ResizeObserver(entries => {
        for(let e of entries) {
            if(e.target.id === 'main-chart') mainChart.applyOptions({width:e.contentRect.width, height:e.contentRect.height});
            if(e.target.id === 'rsi-chart') rsiChart.applyOptions({width:e.contentRect.width, height:e.contentRect.height});
        }
    }).observe(document.querySelector('.charts-wrap'));
}

/* ══════════════════════════════════════════════
   4. 데이터 매니저 (핵심 로직)
══════════════════════════════════════════════ */

// 4-1. 모든 지표 일괄 업데이트
function updateIndicators() {
    // 캔들 데이터가 충분할 때만 계산
    if (candleData.length === 0) return;

    // EMA 업데이트
    EMAS.forEach((e, i) => {
        const emaData = calcEMA(candleData, e.len);
        emaSeries[i].setData(emaData);
    });

    // RSI 업데이트
    const rsiData = calcRSI(candleData, 14);
    rsiSeries.setData(rsiData);
}

// 4-2. 단일 캔들 업데이트 (WebSocket 수신 시)
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
        // 같은 시간대면 -> 마지막 캔들 덮어쓰기 (Update)
        candleData[candleData.length - 1] = newCandle;
    } else {
        // 새로운 시간대면 -> 새 캔들 추가 (Push)
        candleData.push(newCandle);
        // 메모리 관리를 위해 너무 오래된 데이터 제거 (선택사항)
        if (candleData.length > 2000) candleData.shift();
    }

    // 차트에 반영
    candleSeries.update(newCandle);
    volSeries.update({
        time: t,
        value: newCandle.volume,
        color: newCandle.close >= newCandle.open ? '#00e87a30' : '#ff3a5c30'
    });

    // 지표는 매 틱마다 전체 다시 계산하면 느리므로, 
    // 여기서는 마지막 값만 update하는 것이 좋지만, 
    // 코드를 단순하게 유지하기 위해 가장 최근 값만 다시 계산해서 update
    
    // (성능 최적화: 마지막 데이터만 계산해서 update)
    EMAS.forEach((e, i) => {
        const d = calcEMA(candleData, e.len);
        if(d.length) emaSeries[i].update(d[d.length-1]);
    });
    
    const r = calcRSI(candleData, 14);
    if(r.length) rsiSeries.update(r[r.length-1]);
}

// 4-3. REST API로 과거 데이터 가져오기
async function fetchHistory(symbol, interval) {
    // data-api.binance.vision 사용 (CORS 회피)
    const url = `${CONFIG.REST_URL}?symbol=${symbol}&interval=${interval}&limit=${CONFIG.LIMIT}`;
    
    try {
        const res = await fetch(url);
        if(!res.ok) throw new Error(res.status);
        const json = await res.json();
        
        // 데이터 포맷팅
        candleData = json.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));

        // 차트에 일괄 세팅
        candleSeries.setData(candleData);
        volSeries.setData(candleData.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? '#00e87a30' : '#ff3a5c30'
        })));
        
        // 지표 일괄 계산 및 세팅
        updateIndicators();
        
        // 차트 범위 맞춤
        mainChart.timeScale().fitContent();
        
        return true;
    } catch (e) {
        console.error("History Fetch Error:", e);
        showError("데이터 로딩 실패. 잠시 후 다시 시도해주세요.");
        return false;
    }
}

// 4-4. WebSocket 연결 (차트용)
function connectChartStream(symbol, interval) {
    if (klineWs) klineWs.close(); // 기존 연결 끊기

    const wsUrl = `${CONFIG.WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
    klineWs = new WebSocket(wsUrl);

    klineWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.k) {
            updateRealtimeCandle(data.k);
        }
    };
    
    // 연결 끊기면 3초 후 재연결 (안정성)
    klineWs.onclose = () => {
        // 의도적으로 닫은게 아니면(페이지 이동 등) 재연결
        if(curCoin.s === symbol) setTimeout(() => connectChartStream(symbol, interval), 3000);
    };
}

// 4-5. WebSocket 연결 (전체 시세용)
function connectTickerStream() {
    if (tickerWs) tickerWs.close();

    // 모든 코인의 티커 스트림 구독
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
        const s = data.s.toLowerCase(); // symbol
        const p = parseFloat(data.c);   // current price
        const P = parseFloat(data.P);   // percent change
        
        // 1. 드롭다운 메뉴 가격 업데이트
        const itemPx = $(`mp-${s}`);
        const itemPct = $(`mc-${s}`);
        if(itemPx && itemPct) {
            const colorClass = P >= 0 ? 'up' : 'dn';
            itemPx.innerText = fmtP(p);
            itemPx.className = `dd-px ${colorClass}`;
            itemPct.innerText = (P>=0?'+':'') + P.toFixed(2) + '%';
            itemPct.className = `dd-pct ${colorClass}`;
        }

        // 2. 현재 보고 있는 코인이면 메인 헤더 업데이트
        if (data.s === curCoin.s) {
            const mainPx = $('disp-px');
            const colorClass = P >= 0 ? 'up' : 'dn';
            
            // 가격이 변했을 때만 애니메이션 효과
            if(lastPx[s] && lastPx[s] !== p) {
                mainPx.classList.remove('fup', 'fdn');
                void mainPx.offsetWidth; // 리플로우 강제 (애니메이션 리셋)
                mainPx.classList.add(p > lastPx[s] ? 'fup' : 'fdn');
            }
            lastPx[s] = p;

            mainPx.innerText = fmtP(p);
            mainPx.className = `px-val ${colorClass}`; // 색상 유지

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
    
    // 1. REST API로 과거 데이터 로드 (await로 완료 대기)
    const success = await fetchHistory(coin.s, interval);
    
    if (success) {
        hideLoading();
        // 2. 성공하면 WebSocket 연결하여 최신 데이터 이어붙이기
        connectChartStream(coin.s, interval);
    }
}

function showLoading() { $('loading').classList.remove('hide'); $('err-msg').classList.remove('show'); }
function hideLoading() { $('loading').classList.add('hide'); }
function showError(msg) { hideLoading(); $('err-txt').innerText = msg; $('err-msg').classList.add('show'); }
function retryLoad() { hideError(); loadCoin(curCoin, curIv); }
function hideError() { $('err-msg').classList.remove('show'); }

// 드롭다운 생성
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

// 코인 변경 함수
function changeCoin(coin) {
    curCoin = coin;
    
    // UI 업데이트
    $('disp-sym').innerText = `${coin.n} / USDT`;
    $('sym-ico').innerHTML = `<img src="${coin.logo}" alt="">`;
    ['disp-px','disp-chg','disp-hi','disp-lo','disp-vol'].forEach(id => $(id).innerText = '-');
    
    dd.classList.remove('show');
    symBtn.classList.remove('open');
    
    // 데이터 로드
    loadCoin(curCoin, curIv);
}

// 주기(Interval) 변경 함수
function setIv(iv, btn) {
    curIv = iv;
    document.querySelectorAll('.iv').forEach(b => b.classList.remove('act'));
    btn.classList.add('act');
    loadCoin(curCoin, curIv);
}

// 드롭다운 토글
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

// [진입점] 앱 시작
requestAnimationFrame(() => {
    initCharts();        // 1. 차트 틀 생성
    connectTickerStream(); // 2. 전체 시세 소켓 연결
    loadCoin(curCoin, curIv); // 3. 첫번째 코인 데이터 로드
});