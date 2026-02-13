/* ══════════════════════════════════════════════
   ULTRA FAST PUBLIC CHART (CoinCap WebSocket)
   (Source: Binance Trades via CoinCap Relay)
   (Speed: Real-time tick-by-tick)
══════════════════════════════════════════════ */

// DOM 요소
const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elPrice = document.getElementById('displayPrice');
const elChange = document.getElementById('displayChange');
const elLoader = document.getElementById('loader');

// 설정
const CONFIG = {
    up: '#0ecb81',
    down: '#f6465d',
    bg: '#161a1e',
    grid: '#2b3139',
    text: '#848e9c',
    crosshair: '#ffffff',
    paddingRight: 60,
    volumeHeightRatio: 0.15
};

// 상태 변수
let candles = [];
let currentInterval = '1d';
let width, height;
let minPrice, maxPrice, priceRange;
let mouseX = -1, mouseY = -1;
let ws = null; // 웹소켓 변수

/* ────────────────────────────────────────────────
   1. 초기화 및 리사이징
──────────────────────────────────────────────── */
function resize() {
    const container = mainCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    
    width = container.clientWidth;
    height = container.clientHeight;

    [mainCanvas, uiCanvas].forEach(cvs => {
        cvs.width = width * dpr;
        cvs.height = height * dpr;
        const ctx = cvs.getContext('2d');
        ctx.scale(dpr, dpr);
    });

    if(candles.length > 0) drawMain();
}
window.addEventListener('resize', resize);

/* ────────────────────────────────────────────────
   2. 데이터 로드 (과거 데이터: 바이낸스 API 우회)
──────────────────────────────────────────────── */
function changeInterval(iv) {
    if(currentInterval === iv) return;
    
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    currentInterval = iv;
    loadHistory(iv);
}

async function loadHistory(interval) {
    elLoader.classList.remove('hide');
    elLoader.innerText = "LOADING HISTORY...";
    
    // 프록시를 통해 바이낸스 과거 데이터 가져오기
    const symbol = 'BTCUSDT';
    const limit = 200;
    const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(binanceUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        
        if (!Array.isArray(data)) throw new Error("데이터 형식 오류");

        // 데이터 포맷팅
        candles = data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
        
        // 초기 UI 업데이트
        const last = candles[candles.length - 1];
        const changePct = ((last.close - last.open) / last.open) * 100;
        updateTickerUI(last, changePct);
        
        elLoader.classList.add('hide');
        drawMain();

        // 과거 데이터 로드 후 실시간 소켓 연결
        connectWebSocket();

    } catch(e) {
        console.error(e);
        elLoader.innerText = "데이터 로드 실패 (재시도 중...)";
        setTimeout(() => loadHistory(interval), 2000);
    }
}

/* ────────────────────────────────────────────────
   3. 초고속 웹소켓 (CoinCap - 바이낸스 체결 데이터)
   * 1초에 수십 번 업데이트 됨
──────────────────────────────────────────────── */
function connectWebSocket() {
    if(ws) ws.close();

    // CoinCap의 바이낸스 체결 내역 스트림 (방화벽 우회율 높음)
    ws = new WebSocket('wss://ws.coincap.io/trades/binance');

    ws.onopen = () => {
        console.log("⚡ 초고속 소켓 연결됨");
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        
        // BTC/USDT 데이터만 필터링
        if(data.base === 'bitcoin' && data.quote === 'tether') {
            updateRealtimeCandle(data);
        }
    };

    ws.onerror = (err) => {
        console.warn("소켓 에러, 폴링 모드로 전환 시도");
    };
}

function updateRealtimeCandle(trade) {
    if(candles.length === 0) return;

    let last = candles[candles.length - 1];
    const price = trade.price;
    const vol = trade.volume;
    const time = trade.timestamp;

    // 현재 캔들 업데이트
    last.close = price;
    if(price > last.high) last.high = price;
    if(price < last.low) last.low = price;
    last.volume += vol; // 거래량 누적

    // UI 및 차트 갱신 (성능을 위해 requestAnimationFrame 사용 권장하지만 여기선 즉시 반영)
    const changePct = ((last.close - last.open) / last.open) * 100;
    updateTickerUI(last, changePct);
    drawMain();
}

/* ────────────────────────────────────────────────
   4. 메인 차트 렌더링 (최적화)
──────────────────────────────────────────────── */
function drawMain() {
    if(candles.length === 0) return;

    // 캔버스 클리어
    ctxMain.fillStyle = CONFIG.bg;
    ctxMain.fillRect(0, 0, width, height);

    const candleW = (width - CONFIG.paddingRight) / candles.length;
    const realW = Math.max(1, candleW - 1);

    // Min/Max 계산
    minPrice = Infinity; maxPrice = -Infinity;
    let maxVol = 0;
    
    candles.forEach(c => {
        if(c.low < minPrice) minPrice = c.low;
        if(c.high > maxPrice) maxPrice = c.high;
        if(c.volume > maxVol) maxVol = c.volume;
    });
    
    const padding = (maxPrice - minPrice) * 0.15;
    minPrice -= padding; maxPrice += padding;
    priceRange = maxPrice - minPrice;

    // 그리드 그리기
    ctxMain.strokeStyle = CONFIG.grid;
    ctxMain.lineWidth = 1;
    ctxMain.beginPath();
    for(let i=1; i<6; i++) {
        let y = (height / 6) * i;
        ctxMain.moveTo(0, y); ctxMain.lineTo(width, y);
    }
    ctxMain.stroke();

    // 캔들 그리기
    candles.forEach((c, i) => {
        const x = i * candleW;
        const yOpen = height - ((c.open - minPrice) / priceRange) * height;
        const yClose = height - ((c.close - minPrice) / priceRange) * height;
        const yHigh = height - ((c.high - minPrice) / priceRange) * height;
        const yLow = height - ((c.low - minPrice) / priceRange) * height;

        const isUp = c.close >= c.open;
        const color = isUp ? CONFIG.up : CONFIG.down;

        ctxMain.fillStyle = color;
        ctxMain.strokeStyle = color;

        // 거래량 바
        const volH = (c.volume / maxVol) * (height * CONFIG.volumeHeightRatio);
        ctxMain.globalAlpha = 0.2;
        ctxMain.fillRect(x, height - volH, realW, volH);
        ctxMain.globalAlpha = 1.0;

        // 꼬리
        ctxMain.beginPath(); ctxMain.moveTo(x + realW/2, yHigh); ctxMain.lineTo(x + realW/2, yLow); ctxMain.stroke();

        // 몸통
        let bodyH = Math.abs(yClose - yOpen);
        if(bodyH < 1) bodyH = 1;
        ctxMain.fillRect(x, Math.min(yOpen, yClose), realW, bodyH);
    });

    // 현재가 라인
    const last = candles[candles.length - 1];
    const yLast = height - ((last.close - minPrice) / priceRange) * height;
    
    ctxMain.strokeStyle = '#fff';
    ctxMain.setLineDash([2, 2]);
    ctxMain.beginPath(); ctxMain.moveTo(0, yLast); ctxMain.lineTo(width, yLast); ctxMain.stroke(); ctxMain.setLineDash([]);

    // 우측 가격표
    const isUp = last.close >= last.open;
    ctxMain.fillStyle = isUp ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yLast - 10, CONFIG.paddingRight, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Arial';
    ctxMain.fillText(last.close.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, yLast + 4);
}

/* ────────────────────────────────────────────────
   5. UI 레이어 (십자선)
──────────────────────────────────────────────── */
function drawUI() {
    ctxUI.clearRect(0, 0, width, height);
    if(mouseX < 0 || mouseX > width - CONFIG.paddingRight) return;

    ctxUI.strokeStyle = '#999';
    ctxUI.setLineDash([4, 4]);
    
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    ctxUI.setLineDash([]);

    const hoverPrice = minPrice + ((height - mouseY) / height) * priceRange;
    ctxUI.fillStyle = '#2b3139';
    ctxUI.fillRect(width - CONFIG.paddingRight, mouseY - 10, CONFIG.paddingRight, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.font = '11px Arial';
    ctxUI.fillText(hoverPrice.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, mouseY + 4);
}

uiCanvas.addEventListener('mousemove', e => {
    const rect = uiCanvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    window.requestAnimationFrame(drawUI);
});
uiCanvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; window.requestAnimationFrame(drawUI); });

function updateTickerUI(candle, pctChange) {
    if(!candle) return;
    elPrice.innerText = '$ ' + candle.close.toLocaleString('en-US', {minimumFractionDigits:2});
    const isUp = pctChange >= 0;
    elPrice.className = `current-price ${isUp ? 'text-up' : 'text-down'}`;
    if(pctChange !== undefined) {
        elChange.innerText = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
        elChange.className = `price-change ${isUp ? 'text-up' : 'text-down'}`;
    }
}

// 시작
resize();
loadHistory('1d');