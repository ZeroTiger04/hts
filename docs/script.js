/* ══════════════════════════════════════════════
   PRO MULTI-CHART ENGINE v2 (Final)
   Optimization: Double-Layer Canvas + Stable Proxy
══════════════════════════════════════════════ */

const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elPrice = document.getElementById('displayPrice');
const elChange = document.getElementById('displayChange');
const elLoader = document.getElementById('loader');
const elCoin = document.getElementById('coinSelect');

const CONFIG = {
    up: '#0ecb81', down: '#f6465d', bg: '#161a1e',
    grid: '#2b3139', paddingRight: 70, volRatio: 0.15
};

let candles = [];
let currentInterval = '1d';
let currentSymbol = 'BTCUSDT';
let width, height, minP, maxP, pRange;
let mouseX = -1, mouseY = -1;
let tickerTimer = null;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    width = mainCanvas.parentElement.clientWidth;
    height = mainCanvas.parentElement.clientHeight;
    [mainCanvas, uiCanvas].forEach(cvs => {
        cvs.width = width * dpr; cvs.height = height * dpr;
        cvs.getContext('2d').scale(dpr, dpr);
    });
    if(candles.length > 0) drawMain();
}
window.addEventListener('resize', resize);

function changeCoin() {
    currentSymbol = elCoin.value;
    loadHistory(currentInterval);
}

function changeInterval(iv) {
    if(currentInterval === iv) return;
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentInterval = iv;
    loadHistory(iv);
}

// [데이터] 프록시를 사용한 바이낸스 데이터 로드
async function loadHistory(interval) {
    elLoader.classList.remove('hide');
    const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${interval}&limit=180`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(binanceUrl)}`;

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        candles = data.map(d => ({
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
        }));
        elLoader.classList.add('hide');
        drawMain();
        startTicker(); // 실시간 갱신 시작
    } catch(e) {
        elLoader.innerText = "DATA RETRYING...";
        setTimeout(() => loadHistory(interval), 3000);
    }
}

// [실시간] 3초마다 가격 갱신 (폴링)
function startTicker() {
    if(tickerTimer) clearInterval(tickerTimer);
    tickerTimer = setInterval(async () => {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${currentSymbol}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        try {
            const res = await fetch(proxyUrl);
            const d = await res.json();
            if(candles.length > 0) {
                let last = candles[candles.length - 1];
                last.close = parseFloat(d.lastPrice);
                last.high = Math.max(last.high, last.close);
                last.low = Math.min(last.low, last.close);
                updateTickerUI(last, parseFloat(d.priceChangePercent));
                drawMain();
            }
        } catch(e) {}
    }, 3000);
}

// [렌더링] 메인 레이어 (캔들, 그리드)
function drawMain() {
    ctxMain.fillStyle = CONFIG.bg; ctxMain.fillRect(0, 0, width, height);
    const candleW = (width - CONFIG.paddingRight) / candles.length;
    const realW = Math.max(1, candleW - 1);
    minP = Infinity; maxP = -Infinity; let maxV = 0;
    candles.forEach(c => {
        if(c.low < minP) minP = c.low; if(c.high > maxP) maxP = c.high;
        if(c.volume > maxV) maxV = c.volume;
    });
    const padding = (maxP - minP) * 0.15;
    minP -= padding; maxP += padding; pRange = maxP - minP;

    // 그리드
    ctxMain.strokeStyle = CONFIG.grid; ctxMain.lineWidth = 1; ctxMain.beginPath();
    for(let i=1; i<6; i++) { let y = (height/6)*i; ctxMain.moveTo(0,y); ctxMain.lineTo(width,y); }
    ctxMain.stroke();

    // 캔들 & 거래량
    candles.forEach((c, i) => {
        const x = i * candleW;
        const yOpen = height - ((c.open - minP) / pRange) * height;
        const yClose = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? CONFIG.up : CONFIG.down;
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;
        const volH = (c.volume / maxV) * (height * CONFIG.volRatio);
        ctxMain.globalAlpha = 0.2; ctxMain.fillRect(x, height - volH, realW, volH); ctxMain.globalAlpha = 1.0;
        ctxMain.beginPath(); 
        ctxMain.moveTo(x + realW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + realW/2, height - ((c.low - minP) / pRange) * height);
        ctxMain.stroke();
        let bodyH = Math.abs(yClose - yOpen); if(bodyH < 1) bodyH = 1;
        ctxMain.fillRect(x, Math.min(yOpen, yClose), realW, bodyH);
    });

    // 현재가 표시
    const last = candles[candles.length - 1];
    const yLast = height - ((last.close - minP) / pRange) * height;
    ctxMain.strokeStyle = '#fff'; ctxMain.setLineDash([2, 2]); ctxMain.beginPath();
    ctxMain.moveTo(0, yLast); ctxMain.lineTo(width, yLast); ctxMain.stroke(); ctxMain.setLineDash([]);
    ctxMain.fillStyle = last.close >= last.open ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yLast - 10, CONFIG.paddingRight, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Arial';
    ctxMain.fillText(last.close.toLocaleString(undefined, {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, yLast + 4);
}

// [렌더링] UI 레이어 (십자선)
function drawUI() {
    ctxUI.clearRect(0, 0, width, height);
    if(mouseX < 0 || mouseX > width - CONFIG.paddingRight) return;
    ctxUI.strokeStyle = '#999'; ctxUI.setLineDash([4, 4]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hoverP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#2b3139'; ctxUI.fillRect(width - CONFIG.paddingRight, mouseY - 10, CONFIG.paddingRight, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.font = '11px Arial';
    ctxUI.fillText(hoverP.toLocaleString(undefined, {minimumFractionDigits:2}), width - CONFIG.paddingRight + 4, mouseY + 4);
}

uiCanvas.addEventListener('mousemove', e => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    window.requestAnimationFrame(drawUI);
});
uiCanvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; drawUI(); });

function updateTickerUI(candle, pct) {
    elPrice.innerText = '$ ' + candle.close.toLocaleString(undefined, {minimumFractionDigits:2});
    elPrice.className = `current-price ${pct >= 0 ? 'text-up' : 'text-down'}`;
    elChange.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    elChange.className = `price-change ${pct >= 0 ? 'text-up' : 'text-down'}`;
}

resize();
loadHistory('1d');