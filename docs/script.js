/* ══════════════════════════════════════════════
   TRADINGVIEW STYLE DATA FEED
   (Source: Binance API via CorsProxy)
   (Intervals: 1m, 3m, 5m, 15m, 1h, 4h, 1d, 1w, 1M)
══════════════════════════════════════════════ */

// DOM 요소
const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elPrice = document.getElementById('displayPrice');
const elChange = document.getElementById('displayChange');
const elLoader = document.getElementById('loader');

// 설정 (바이낸스 다크 테마)
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
let tickerInterval = null;

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
   2. 데이터 로드 (바이낸스 API + 프록시)
──────────────────────────────────────────────── */
function changeInterval(iv) {
    if(currentInterval === iv) return;
    
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    currentInterval = iv;
    loadData(iv);
}

async function loadData(interval) {
    elLoader.classList.remove('hide');
    
    // 바이낸스 API (트레이딩뷰 데이터와 동일)
    // corsproxy.io를 사용하여 차단 우회
    const symbol = 'BTCUSDT';
    const limit = 150;
    const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(binanceUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        
        if (!Array.isArray(data)) throw new Error("Invalid Data");

        // 데이터 포맷팅 [Time, Open, High, Low, Close, Volume, ...]
        candles = data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
        
        // UI 업데이트
        const last = candles[candles.length - 1];
        // 전일 대비 변동률 계산 (간략하게 오픈가 대비로 표시)
        const changePct = ((last.close - last.open) / last.open) * 100;
        
        updateTickerUI(last, changePct);
        elLoader.classList.add('hide');
        drawMain();

        // 실시간 갱신 시작
        if(tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(() => fetchTicker(interval), 2000);

    } catch(e) {
        console.error(e);
        elLoader.innerText = "데이터 연결 실패 (프록시 재시도 중...)";
        setTimeout(() => loadData(interval), 3000);
    }
}

// 실시간 가격 조회 (Ticker)
async function fetchTicker(interval) {
    try {
        const symbol = 'BTCUSDT';
        // 캔들 데이터 하나만 최신으로 가져와서 덮어쓰기 (효율적)
        const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(binanceUrl)}`;
        
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const d = data[0];

        const currentCandle = {
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        };

        // 마지막 캔들 업데이트
        if (candles.length > 0) {
            const last = candles[candles.length - 1];
            if (last.time === currentCandle.time) {
                candles[candles.length - 1] = currentCandle;
            } else {
                candles.push(currentCandle);
                candles.shift(); // 오래된 데이터 제거
            }
            
            const changePct = ((currentCandle.close - currentCandle.open) / currentCandle.open) * 100;
            updateTickerUI(currentCandle, changePct);
            drawMain();
        }
    } catch(e) {
        // 조용히 패스
    }
}

/* ────────────────────────────────────────────────
   3. 메인 차트 그리기
──────────────────────────────────────────────── */
function drawMain() {
    if(candles.length === 0) return;

    ctxMain.fillStyle = CONFIG.bg;
    ctxMain.fillRect(0, 0, width, height);

    const candleW = (width - CONFIG.paddingRight) / candles.length;
    const realW = Math.max(1, candleW - 1);

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

    // 그리드
    ctxMain.strokeStyle = CONFIG.grid;
    ctxMain.lineWidth = 1;
    ctxMain.beginPath();
    for(let i=1; i<6; i++) {
        let y = (height / 6) * i;
        ctxMain.moveTo(0, y); ctxMain.lineTo(width, y);
    }
    ctxMain.stroke();

    // 캔들
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

        // 거래량
        const volH = (c.volume / maxVol) * (height * CONFIG.volumeHeightRatio);
        ctxMain.globalAlpha = 0.2;
        ctxMain.fillRect(x, height - volH, realW, volH);
        ctxMain.globalAlpha = 1.0;

        // 꼬리
        ctxMain.beginPath();
        ctxMain.moveTo(x + realW/2, yHigh);
        ctxMain.lineTo(x + realW/2, yLow);
        ctxMain.stroke();

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

    // 가격 라벨
    const isUp = last.close >= last.open;
    ctxMain.fillStyle = isUp ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yLast - 10, CONFIG.paddingRight, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Arial';
    ctxMain.fillText(last.close.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, yLast + 4);
}

/* ────────────────────────────────────────────────
   4. UI 레이어 (십자선)
──────────────────────────────────────────────── */
function drawUI() {
    ctxUI.clearRect(0, 0, width, height);
    if(mouseX < 0 || mouseX > width - CONFIG.paddingRight) return;

    ctxUI.strokeStyle = '#999';
    ctxUI.setLineDash([4, 4]);
    
    // 십자선
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    ctxUI.setLineDash([]);

    // 우측 가격 라벨
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
    elPrice.innerText = candle.close.toLocaleString('en-US', {style:'currency', currency:'USD'});
    const isUp = pctChange >= 0;
    elPrice.className = `current-price ${isUp ? 'text-up' : 'text-down'}`;
    if(pctChange !== undefined) {
        elChange.innerText = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
        elChange.className = `price-change ${isUp ? 'text-up' : 'text-down'}`;
    }
}

// 시작
resize();
loadData('1d');