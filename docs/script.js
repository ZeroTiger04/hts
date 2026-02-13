/* ══════════════════════════════════════════════
   CRYPTEX v3 — Public Data Version
   (Source: CryptoCompare Free API)
   (Mode: REST API + Polling / No WebSockets)
══════════════════════════════════════════════ */

// 1. 코인 설정 (CryptoCompare 심볼 매핑)
const COINS = [
    { s:'BTC',  n:'BTC',  name:'Bitcoin',  logo:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
    { s:'ETH',  n:'ETH',  name:'Ethereum', logo:'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
    { s:'XRP',  n:'XRP',  name:'Ripple',   logo:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
    { s:'SOL',  n:'SOL',  name:'Solana',   logo:'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
    { s:'BNB',  n:'BNB',  name:'BNB',      logo:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
    { s:'DOGE', n:'DOGE', name:'Dogecoin', logo:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
    { s:'ADA',  n:'ADA',  name:'Cardano',  logo:'https://assets.coingecko.com/coins/images/975/small/cardano.png' },
    { s:'PEPE', n:'PEPE', name:'Pepe',     logo:'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg' },
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
let pollInterval = null; // 실시간 갱신용 타이머
let candleData = [];

// DOM 헬퍼
const $ = id => document.getElementById(id);
const fmtP = p => p < 0.0001 ? p.toFixed(8) : p < 0.01 ? p.toFixed(6) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtV = v => v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(0);

/* ══════════════════════════════════════════════
   2. 차트 초기화 (Lightweight Charts)
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

    // 동기화
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
   4. 데이터 API (CryptoCompare)
   무료, 퍼블릭, CORS 문제 없음
══════════════════════════════════════════════ */

// API 주소 변환 (Binance -> CryptoCompare 방식)
function getApiParams(coinSymbol, intervalStr) {
    let endpoint = 'histoday'; // 기본값 1d
    let limit = 300;
    
    // 시간 단위 매핑
    if(intervalStr.includes('m')) endpoint = 'histominute'; // 1m, 5m...
    else if(intervalStr.includes('h')) endpoint = 'histohour'; // 1h, 4h...
    else endpoint = 'histoday'; // 1d, 1w...

    // CryptoCompare는 분봉 API에서 Limit 제한이 있을 수 있어 적절히 조절
    return { 
        url: `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${coinSymbol}&tsym=USDT&limit=${limit}`,
        priceUrl: `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${coinSymbol}&tsyms=USDT`
    };
}

// 4-1. 과거 데이터 로드
async function loadCoin(coin, interval) {
    showLoading();
    $('err-msg').classList.remove('show');
    
    // 이전 폴링 중지
    if(pollInterval) clearInterval(pollInterval);
    
    // API 호출
    const params = getApiParams(coin.s, interval);
    try {
        const res = await fetch(params.url);
        const json = await res.json();
        
        if (json.Response === 'Error') throw new Error(json.Message);
        
        const rawData = json.Data.Data;
        
        // 데이터 포맷팅
        candleData = rawData.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volumeto // USDT 볼륨
        }));

        // 차트 그리기
        candleSeries.setData(candleData);
        volSeries.setData(candleData.map(d => ({
            time: d.time, 
            value: d.volume, 
            color: d.close >= d.open ? '#00e87a30' : '#ff3a5c30'
        })));
        
        updateIndicators();
        mainChart.timeScale().fitContent();
        
        hideLoading();

        // 4-2. 실시간 가격 폴링 시작 (2초마다 최신가 가져오기)
        startPolling(coin.s);
        
        // 상태 표시
        $('ws-badge').classList.add('on');
        $('ws-text').innerText = "LIVE (POLLING)";

    } catch(e) {
        console.error(e);
        $('err-txt').innerText = "데이터 로드 실패 (Free API)";
        $('err-msg').classList.add('show');
        hideLoading();
    }
}

// 4-3. 실시간 폴링 (웹소켓 대신 안전한 HTTP 요청 반복)
function startPolling(symbol) {
    const fetchPrice = async () => {
        try {
            const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbol}&tsyms=USDT`;
            const res = await fetch(url);
            const json = await res.json();
            
            const raw = json.RAW[symbol].USDT;
            const p = raw.PRICE;
            const P = raw.CHANGEPCT24HOUR;
            const h = raw.HIGH24HOUR;
            const l = raw.LOW24HOUR;
            const v = raw.VOLUME24HOURTO; // USDT Volume

            // UI 업데이트
            const colorClass = P >= 0 ? 'up' : 'dn';
            
            $('disp-px').innerText = fmtP(p);
            $('disp-px').className = `px-val ${colorClass}`;
            
            $('disp-chg').innerText = (P>=0?'+':'') + P.toFixed(2) + '%';
            $('disp-chg').className = `s-val ${colorClass}`;
            
            $('disp-hi').innerText = fmtP(h);
            $('disp-lo').innerText = fmtP(l);
            $('disp-vol').innerText = fmtV(v);

            // 차트 캔들 업데이트
            updateLastCandle(p);

        } catch(e) {
            // 조용히 실패 (다음 틱에 재시도)
        }
    };

    fetchPrice(); // 즉시 실행
    pollInterval = setInterval(fetchPrice, 2000); // 2초마다 실행
}

// 차트의 마지막 캔들을 현재가로 움직이게 하기
function updateLastCandle(currentPrice) {
    if(candleData.length === 0) return;
    
    let last = candleData[candleData.length - 1];
    
    // 현재 시간이 마지막 캔들 시간보다 훨씬 지났으면 새 캔들 생성 로직이 필요하지만,
    // 간단한 폴링 모드에서는 마지막 캔들의 Close만 업데이트하여 움직임 표현
    const updated = {
        ...last,
        close: currentPrice,
        high: Math.max(last.high, currentPrice),
        low: Math.min(last.low, currentPrice)
    };
    
    candleData[candleData.length - 1] = updated;
    candleSeries.update(updated);
    
    // 지표 업데이트 (가벼운 연산)
    const emaLast = calcEMA(candleData, 20); 
    if(emaLast.length) emaSeries[0].update(emaLast[emaLast.length-1]);
}

/* ══════════════════════════════════════════════
   5. UI 이벤트
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
document.addEventListener('click',e=>{if(!symBtn.contains(e.target)){dd.classList.remove('show');symBtn.classList.remove('open');}});

// 실행
requestAnimationFrame(() => {
    initCharts();
    loadCoin(curCoin, curIv);
});