/* ══════════════════════════════════════════════
   CRYPTEX v3 — Offline Simulation Mode
   (네트워크 차단 환경 대응: 자체 데이터 생성)
══════════════════════════════════════════════ */

// 1. 코인 목록
const COINS = [
    { s:'BTC', n:'BTC', name:'Bitcoin',  logo:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png', price: 65000 },
    { s:'ETH', n:'ETH', name:'Ethereum', logo:'https://assets.coingecko.com/coins/images/279/small/ethereum.png', price: 3500 },
    { s:'XRP', n:'XRP', name:'Ripple',   logo:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png', price: 0.6 },
    { s:'SOL', n:'SOL', name:'Solana',   logo:'https://assets.coingecko.com/coins/images/4128/small/solana.png', price: 140 },
    { s:'BNB', n:'BNB', name:'BNB',      logo:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png', price: 600 },
];

const EMAS = [
    { len:20,  color:'#ff8c00', width:1 },
    { len:60,  color:'#00e87a', width:1 },
    { len:120, color:'#ff3a5c', width:1 },
    { len:200, color:'#4d9fff', width:2 },
];

// 전역 변수
let curCoin = COINS[0];
let mainChart, rsiChart;
let candleSeries, volSeries, emaSeries = [], rsiSeries;
let candleData = [];
let simulationInterval = null;

// DOM 헬퍼
const $ = id => document.getElementById(id);
const fmtP = p => p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

/* ══════════════════════════════════════════════
   2. 차트 초기화
══════════════════════════════════════════════ */
function initCharts() {
    const mainEl = $('main-chart');
    const rsiEl  = $('rsi-chart');

    const sharedOpts = {
        layout: { background:{color:'#060810'}, textColor:'#4e5a72' },
        grid:   { vertLines:{color:'#0f1420',style:1}, horzLines:{color:'#0f1420',style:1} },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        timeScale: { borderColor:'#1a2035', timeVisible:true, secondsVisible:false },
        rightPriceScale: { borderColor:'#1a2035' },
    };

    mainChart = LightweightCharts.createChart(mainEl, { ...sharedOpts, width: mainEl.clientWidth, height: mainEl.clientHeight });
    
    candleSeries = mainChart.addCandlestickSeries({
        upColor:'#00e87a', downColor:'#ff3a5c', borderUpColor:'#00e87a', borderDownColor:'#ff3a5c',
        wickUpColor:'#00e87a88', wickDownColor:'#ff3a5c88',
    });
    
    volSeries = mainChart.addHistogramSeries({
        priceFormat:{type:'volume'}, priceScaleId:'vol', lastValueVisible:false, priceLineVisible:false,
    });
    mainChart.priceScale('vol').applyOptions({ scaleMargins:{top:0.82,bottom:0} });

    EMAS.forEach(e => {
        emaSeries.push(mainChart.addLineSeries({ color:e.color, lineWidth:e.width, crosshairMarkerVisible:false }));
    });

    rsiChart = LightweightCharts.createChart(rsiEl, {
        ...sharedOpts, width: rsiEl.clientWidth, height: rsiEl.clientHeight,
        timeScale: { ...sharedOpts.timeScale, visible:false },
        rightPriceScale: { borderColor:'#1a2035', scaleMargins:{top:0.08,bottom:0.08} },
    });
    rsiSeries = rsiChart.addLineSeries({ color:'#c8a84b', lineWidth:2 });
    
    // 리사이징 옵저버
    new ResizeObserver(e => {
        for(let entry of e) {
            if(entry.target.id==='main-chart') mainChart.applyOptions({width:entry.contentRect.width, height:entry.contentRect.height});
            if(entry.target.id==='rsi-chart') rsiChart.applyOptions({width:entry.contentRect.width, height:entry.contentRect.height});
        }
    }).observe(document.querySelector('.charts-wrap'));
    
    // 차트 간 동기화
    let syncing = false;
    const sync = (s, t) => s.timeScale().subscribeVisibleLogicalRangeChange(r => { if(!syncing && r){ syncing=true; t.timeScale().setVisibleLogicalRange(r); syncing=false; } });
    sync(mainChart, rsiChart); sync(rsiChart, mainChart);
}

/* ══════════════════════════════════════════════
   3. 데이터 생성기 (핵심: 인터넷 없이 데이터 만듦)
══════════════════════════════════════════════ */
function generateInitialData(startPrice) {
    let res = [];
    let time = Math.floor(Date.now() / 1000) - (100 * 60); // 100분 전부터
    let price = startPrice;
    
    for (let i = 0; i < 100; i++) {
        let move = (Math.random() - 0.5) * (startPrice * 0.002); // 0.2% 변동
        let open = price;
        let close = price + move;
        let high = Math.max(open, close) + Math.random() * (startPrice * 0.001);
        let low = Math.min(open, close) - Math.random() * (startPrice * 0.001);
        
        res.push({
            time: time + (i * 60),
            open, high, low, close,
            volume: Math.random() * 100 + 50
        });
        price = close;
    }
    return res;
}

// 지표 계산 (단순화)
function calcEMA(data, len) {
    let res = [];
    let k = 2 / (len + 1);
    let ema = data[0].close;
    data.forEach(d => {
        ema = d.close * k + ema * (1 - k);
        res.push({ time: d.time, value: ema });
    });
    return res;
}

function updateChart() {
    candleSeries.setData(candleData);
    volSeries.setData(candleData.map(d => ({
        time: d.time, value: d.volume,
        color: d.close >= d.open ? '#00e87a30' : '#ff3a5c30'
    })));
    
    EMAS.forEach((e, i) => {
        const emaData = calcEMA(candleData, e.len);
        emaSeries[i].setData(emaData);
    });
    
    // RSI (가짜 랜덤 값)
    let rsiData = candleData.map(d => ({
        time: d.time, value: 50 + (Math.random() - 0.5) * 30
    }));
    rsiSeries.setData(rsiData);
}

/* ══════════════════════════════════════════════
   4. 시뮬레이션 실행
══════════════════════════════════════════════ */
function loadCoin(coin) {
    $('loading').classList.remove('hide');
    $('err-msg').classList.remove('show');
    
    if(simulationInterval) clearInterval(simulationInterval);
    
    // 1. 초기 데이터 생성
    candleData = generateInitialData(coin.price);
    updateChart();
    mainChart.timeScale().fitContent();
    
    $('loading').classList.add('hide');
    $('ws-badge').classList.add('on');
    $('ws-text').innerText = "SIMULATION MODE"; // 시뮬레이션 모드 표시

    // 2. 실시간 움직임 시뮬레이션 (0.5초마다)
    simulationInterval = setInterval(() => {
        let last = candleData[candleData.length - 1];
        let price = last.close + (Math.random() - 0.5) * (coin.price * 0.0005);
        
        // 현재 캔들 업데이트 (Close 값 변경)
        let updated = {
            ...last,
            close: price,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            volume: last.volume + Math.random()
        };
        
        candleData[candleData.length - 1] = updated;
        candleSeries.update(updated);
        
        // UI 숫자 업데이트
        let change = ((price - coin.price) / coin.price) * 100;
        let colorClass = change >= 0 ? 'up' : 'dn';
        
        $('disp-px').innerText = fmtP(price);
        $('disp-px').className = `px-val ${colorClass}`;
        $('disp-chg').innerText = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        $('disp-chg').className = `s-val ${colorClass}`;

    }, 500);
}

/* ══════════════════════════════════════════════
   5. UI 이벤트
══════════════════════════════════════════════ */
const dd = $('dd'); const symBtn = $('sym-btn');
COINS.forEach(c => {
    const el = document.createElement('div'); el.className = 'dd-item';
    el.innerHTML = `<div class="dd-left"><div class="dd-ico"><img src="${c.logo}" alt=""></div><div><div class="dd-sym">${c.n}/USDT</div><div class="dd-name">${c.name}</div></div></div>`;
    el.onclick = e => { e.stopPropagation(); changeCoin(c); };
    dd.appendChild(el);
});

function changeCoin(c) {
    curCoin=c; $('disp-sym').innerText=`${c.n} / USDT`; $('sym-ico').innerHTML=`<img src="${c.logo}">`;
    dd.classList.remove('show'); symBtn.classList.remove('open'); 
    loadCoin(c);
}

symBtn.addEventListener('click', ()=>{ dd.classList.toggle('show'); symBtn.classList.toggle('open'); });

// 시작
requestAnimationFrame(() => {
    initCharts();
    loadCoin(curCoin);
});