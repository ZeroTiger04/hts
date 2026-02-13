/* ══════════════════════════════════════════════
   OKX REAL-TIME CHART
   (Source: OKX API via Proxy)
   (Optimization: Double Layer Rendering)
══════════════════════════════════════════════ */

// DOM 요소
const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elPrice = document.getElementById('displayPrice');
const elChange = document.getElementById('displayChange');
const elLoader = document.getElementById('loader');

// 설정 (바이낸스 스타일 유지)
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
let currentInterval = '1D'; // OKX 기본값
let width, height;
let minPrice, maxPrice, priceRange;
let mouseX = -1, mouseY = -1;

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
   2. OKX 데이터 로드 (핵심)
   * 프록시를 통해 CORS 차단 완벽 해결
──────────────────────────────────────────────── */
function changeInterval(iv) {
    // OKX API 포맷으로 변환 (1m, 1H, 1D 등)
    let okxIv = iv;
    if(iv === '1h') okxIv = '1H';
    if(iv === '4h') okxIv = '4H';
    if(iv === '1d') okxIv = '1D';
    if(iv === '1w') okxIv = '1W';

    if(currentInterval === okxIv) return;
    
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    currentInterval = okxIv;
    loadData(okxIv);
}

async function loadData(bar) {
    elLoader.classList.remove('hide');
    
    // OKX API URL (BTC-USDT)
    const targetUrl = `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${bar}&limit=100`;
    // 프록시 서버를 경유 (보안 우회)
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const json = await res.json();
        
        if (json.code !== '0') throw new Error(json.msg);

        // OKX 데이터 포맷: [ts, o, h, l, c, vol, ...] (문자열로 옴)
        // 최신순으로 오기 때문에 reverse() 필요
        const rawData = json.data.reverse();

        candles = rawData.map(d => ({
            time: parseInt(d[0]),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
        
        // UI 업데이트
        const last = candles[candles.length - 1];
        updateTickerUI(last); // 가격 표시
        
        elLoader.classList.add('hide');
        drawMain();

    } catch(e) {
        console.error("OKX Load Error:", e);
        elLoader.innerText = "OKX 접속 실패 (잠시 후 재시도)";
        // 실패 시 재시도 로직 (3초 뒤)
        setTimeout(() => loadData(bar), 3000);
    }
}

// 실시간 가격 (Ticker)
async function fetchTicker() {
    try {
        const targetUrl = 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT';
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        
        const res = await fetch(proxyUrl);
        const json = await res.json();
        const ticker = json.data[0];
        
        const currentPrice = parseFloat(ticker.last);
        
        // 차트 마지막 캔들 업데이트
        if(candles.length > 0) {
            let last = candles[candles.length - 1];
            
            // 가격 반영
            last.close = currentPrice;
            if(currentPrice > last.high) last.high = currentPrice;
            if(currentPrice < last.low) last.low = currentPrice;
            
            // 24시간 변동률 계산 (OKX는 open24h 제공)
            const open24h = parseFloat(ticker.open24h);
            const changePct = ((currentPrice - open24h) / open24h) * 100;

            updateTickerUI(last, changePct);
            drawMain(); // 차트 갱신
        }
    } catch(e) {
        // 조용히 실패
    }
}

/* ────────────────────────────────────────────────
   3. 메인 레이어 (캔들 차트)
──────────────────────────────────────────────── */
function drawMain() {
    if(candles.length === 0) return;

    // 초기화
    ctxMain.fillStyle = CONFIG.bg;
    ctxMain.fillRect(0, 0, width, height);

    // 스케일 계산
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

    // 우측 가격표
    const isUp = last.close >= last.open;
    ctxMain.fillStyle = isUp ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yLast - 10, CONFIG.paddingRight, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Arial';
    ctxMain.fillText(last.close.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, yLast + 4);
}

/* ────────────────────────────────────────────────
   4. UI 레이어 (마우스 인터랙션)
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

/* ────────────────────────────────────────────────
   5. UI 업데이트 헬퍼
──────────────────────────────────────────────── */
function updateTickerUI(candle, pctChange) {
    if(!candle) return;
    elPrice.innerText = candle.close.toLocaleString('en-US', {style:'currency', currency:'USD'});
    
    const isUp = candle.close >= candle.open;
    elPrice.className = `current-price ${isUp ? 'text-up' : 'text-down'}`;

    if(pctChange !== undefined) {
        elChange.innerText = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
        elChange.className = `price-change ${pctChange >= 0 ? 'text-up' : 'text-down'}`;
    }
}

// 시작
resize();
loadData('1D'); // OKX 일봉으로 시작
setInterval(fetchTicker, 3000); // 3초마다 갱신