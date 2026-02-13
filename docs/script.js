/* ══════════════════════════════════════════════
   BINANCE STYLE HIGH-PERFORMANCE CHART
   Technique: Double Buffering (Main Layer + UI Layer)
══════════════════════════════════════════════ */

// DOM 요소
const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elPrice = document.getElementById('displayPrice');
const elChange = document.getElementById('displayChange');
const elLoader = document.getElementById('loader');

// 설정 (바이낸스 컬러)
const CONFIG = {
    up: '#0ecb81',
    down: '#f6465d',
    bg: '#161a1e',
    grid: '#2b3139',
    text: '#848e9c',
    crosshair: '#ffffff',
    wickWidth: 1,
    candleSpacing: 2, // 캔들 사이 간격
    paddingRight: 60, // 우측 가격표 영역
    volumeHeightRatio: 0.15 // 거래량 높이 비율
};

// 상태 변수
let candles = [];
let currentInterval = '1d';
let width, height;
let minPrice, maxPrice, priceRange;
let mouseX = -1, mouseY = -1;

/* ────────────────────────────────────────────────
   1. 초기화 및 리사이징 (고해상도 대응)
──────────────────────────────────────────────── */
function resize() {
    const container = mainCanvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    
    // CSS 크기
    width = container.clientWidth;
    height = container.clientHeight;

    // 실제 픽셀 크기 (선명하게)
    [mainCanvas, uiCanvas].forEach(cvs => {
        cvs.width = width * dpr;
        cvs.height = height * dpr;
        const ctx = cvs.getContext('2d');
        ctx.scale(dpr, dpr);
    });

    // 리사이즈 시 다시 그리기
    if(candles.length > 0) drawMain();
}

window.addEventListener('resize', resize);

/* ────────────────────────────────────────────────
   2. 데이터 로드 (CryptoCompare Aggregate 사용)
──────────────────────────────────────────────── */
function changeInterval(iv) {
    if(currentInterval === iv) return;
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentInterval = iv;
    loadData(iv);
}

function getApiUrl(iv) {
    const base = 'https://min-api.cryptocompare.com/data/v2';
    const limit = 200; // 화면에 꽉 차게
    switch(iv) {
        case '1m': return `${base}/histominute?fsym=BTC&tsym=USDT&limit=${limit}`;
        case '15m': return `${base}/histominute?fsym=BTC&tsym=USDT&limit=${limit}&aggregate=15`;
        case '1h': return `${base}/histohour?fsym=BTC&tsym=USDT&limit=${limit}`;
        case '4h': return `${base}/histohour?fsym=BTC&tsym=USDT&limit=${limit}&aggregate=4`;
        case '1d': return `${base}/histoday?fsym=BTC&tsym=USDT&limit=${limit}`;
        case '1w': return `${base}/histoday?fsym=BTC&tsym=USDT&limit=${limit}&aggregate=7`;
        default: return `${base}/histoday?fsym=BTC&tsym=USDT&limit=${limit}`;
    }
}

async function loadData(iv) {
    elLoader.classList.remove('hide');
    try {
        const res = await fetch(getApiUrl(iv));
        const json = await res.json();
        const data = json.Data.Data;
        
        candles = data.map(d => ({
            time: d.time, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volumeto
        }));
        
        updateTickerUI(candles[candles.length-1]);
        elLoader.classList.add('hide');
        drawMain(); // 데이터 로드 후 메인 차트 그리기
    } catch(e) {
        console.error(e);
        elLoader.innerText = "Error Loading Data";
    }
}

// 실시간 가격 (2초 폴링)
async function fetchTicker() {
    try {
        const res = await fetch('https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC&tsyms=USDT');
        const json = await res.json();
        const raw = json.RAW.BTC.USDT;
        
        if(candles.length > 0) {
            let last = candles[candles.length-1];
            last.close = raw.PRICE;
            if(raw.PRICE > last.high) last.high = raw.PRICE;
            if(raw.PRICE < last.low) last.low = raw.PRICE;
            
            updateTickerUI(last, raw.CHANGEPCT24HOUR);
            drawMain(); // 가격 변동 시 메인 차트 갱신
        }
    } catch(e) {}
}

/* ────────────────────────────────────────────────
   3. 메인 레이어 그리기 (캔들, 그리드) - 무거운 작업
──────────────────────────────────────────────── */
function drawMain() {
    if(candles.length === 0) return;

    // 1. 화면 클리어
    ctxMain.fillStyle = CONFIG.bg;
    ctxMain.fillRect(0, 0, width, height);

    // 2. 스케일 계산
    const chartH = height; // 전체 높이 사용
    const candleW = (width - CONFIG.paddingRight) / candles.length; // 캔들 너비 자동 계산
    const gap = 1; // 캔들 사이 틈
    const realW = Math.max(1, candleW - gap);

    // Min/Max 계산
    minPrice = Infinity; maxPrice = -Infinity;
    let maxVol = 0;
    candles.forEach(c => {
        if(c.low < minPrice) minPrice = c.low;
        if(c.high > maxPrice) maxPrice = c.high;
        if(c.volume > maxVol) maxVol = c.volume;
    });
    
    // 위아래 여백 10%
    const padding = (maxPrice - minPrice) * 0.1;
    minPrice -= padding; maxPrice += padding;
    priceRange = maxPrice - minPrice;

    // 3. 그리드 그리기
    ctxMain.strokeStyle = CONFIG.grid;
    ctxMain.lineWidth = 1;
    ctxMain.beginPath();
    // 가로선 5개
    for(let i=1; i<6; i++) {
        let y = (height / 6) * i;
        ctxMain.moveTo(0, y); ctxMain.lineTo(width, y);
    }
    // 세로선 (대략)
    for(let i=1; i<6; i++) {
        let x = ((width - CONFIG.paddingRight) / 6) * i;
        ctxMain.moveTo(x, 0); ctxMain.lineTo(x, height);
    }
    ctxMain.stroke();

    // 4. 캔들 & 거래량 그리기
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

        // 거래량 (하단에 깔기)
        const volH = (c.volume / maxVol) * (height * CONFIG.volumeHeightRatio);
        ctxMain.globalAlpha = 0.15; // 투명하게
        ctxMain.fillRect(x, height - volH, realW, volH);
        ctxMain.globalAlpha = 1.0;

        // 캔들 꼬리 (Wick)
        ctxMain.beginPath();
        ctxMain.moveTo(x + realW/2, yHigh);
        ctxMain.lineTo(x + realW/2, yLow);
        ctxMain.stroke();

        // 캔들 몸통 (Body)
        let bodyH = Math.abs(yClose - yOpen);
        if(bodyH < 1) bodyH = 1; // 최소 높이 보장
        ctxMain.fillRect(x, Math.min(yOpen, yClose), realW, bodyH);
    });

    // 5. 현재가 표시 (우측 라벨)
    const last = candles[candles.length-1];
    const yLast = height - ((last.close - minPrice) / priceRange) * height;
    
    // 점선
    ctxMain.strokeStyle = '#fff';
    ctxMain.setLineDash([2, 2]);
    ctxMain.beginPath();
    ctxMain.moveTo(0, yLast);
    ctxMain.lineTo(width, yLast);
    ctxMain.stroke();
    ctxMain.setLineDash([]);

    // 가격표 배경
    ctxMain.fillStyle = last.close >= last.open ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yLast - 10, CONFIG.paddingRight, 20);
    
    // 가격 텍스트
    ctxMain.fillStyle = '#fff';
    ctxMain.font = '11px Arial';
    ctxMain.fillText(last.close.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, yLast + 4);
}

/* ────────────────────────────────────────────────
   4. UI 레이어 그리기 (마우스 인터랙션) - 가벼운 작업
──────────────────────────────────────────────── */
function drawUI() {
    // UI 레이어 클리어 (이것만 지우고 다시 그림 -> 렉 없음!)
    ctxUI.clearRect(0, 0, width, height);

    if(mouseX < 0 || mouseX > width - CONFIG.paddingRight) return;

    // 1. 십자선
    ctxUI.strokeStyle = '#76808f';
    ctxUI.setLineDash([4, 4]);
    ctxUI.lineWidth = 1;
    
    // 세로
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    // 가로
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    ctxUI.setLineDash([]);

    // 2. 가격 라벨 (우측 Y축)
    const hoverPrice = minPrice + ((height - mouseY) / height) * priceRange;
    
    ctxUI.fillStyle = '#2b3139';
    ctxUI.fillRect(width - CONFIG.paddingRight, mouseY - 10, CONFIG.paddingRight, 20);
    
    ctxUI.fillStyle = '#fff';
    ctxUI.font = '11px Arial';
    ctxUI.fillText(hoverPrice.toLocaleString('en-US', {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, mouseY + 4);
}

// 이벤트 핸들링 (Throttle 없이도 가벼워서 괜찮음)
uiCanvas.addEventListener('mousemove', e => {
    const rect = uiCanvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    window.requestAnimationFrame(drawUI); // 부드러운 애니메이션
});

uiCanvas.addEventListener('mouseleave', () => {
    mouseX = -1; mouseY = -1;
    window.requestAnimationFrame(drawUI);
});

/* ────────────────────────────────────────────────
   5. 기타 UI 업데이트
──────────────────────────────────────────────── */
function updateTickerUI(candle, pctChange) {
    if(!candle) return;
    elPrice.innerText = candle.close.toLocaleString('en-US', {style:'currency', currency:'USD'});
    const isUp = candle.close >= candle.open;
    elPrice.className = `current-price ${isUp ? 'text-