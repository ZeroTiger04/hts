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
    grid: '#23272d', paddingRight: 80, volRatio: 0.15
};

const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

let candles = [];
let currentInterval = '1d';
let currentSymbol = 'BTCUSDT';
let width, height, minP, maxP, pRange, proxyIdx = 0;
let mouseX = -1, mouseY = -1;

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

function changeCoin() { currentSymbol = elCoin.value; loadHistory(currentInterval); }
function changeInterval(iv) {
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentInterval = iv; loadHistory(iv);
}

// 과거 데이터 로드
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    const url = `https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${iv}&limit=120`;
    
    try {
        const res = await fetch(PROXIES[proxyIdx](url));
        const data = await res.json();
        candles = data.map(d => ({
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5])
        }));
        elLoader.classList.add('hide');
        drawMain();
        startHighSpeedTicker(); // 1초 단위 갱신 시작
    } catch(e) {
        proxyIdx = (proxyIdx + 1) % PROXIES.length;
        setTimeout(() => loadHistory(iv), 2000);
    }
}

// 1초 단위 고속 폴링 (실시간 움직임 구현)
function startHighSpeedTicker() {
    if(window.tickerInterval) clearInterval(window.tickerInterval);
    
    window.tickerInterval = setInterval(async () => {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${currentSymbol}`;
        try {
            const res = await fetch(PROXIES[0](url));
            const d = await res.json();
            
            if(candles.length > 0) {
                let last = candles[candles.length - 1];
                // 실시간 가격을 마지막 캔들에 반영
                last.close = parseFloat(d.lastPrice);
                last.high = Math.max(last.high, last.close);
                last.low = Math.min(last.low, last.close);
                
                updateTickerUI(d);
                drawMain(); // 캔들을 다시 그려서 움직임 표현
            }
        } catch(e) {}
    }, 1000); // 1초마다 갱신
}

function drawMain() {
    ctxMain.fillStyle = CONFIG.bg; ctxMain.fillRect(0, 0, width, height);
    const candleW = (width - CONFIG.paddingRight) / candles.length;
    minP = Infinity; maxP = -Infinity; let maxV = 0;
    candles.forEach(c => {
        minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high);
        maxV = Math.max(maxV, c.volume);
    });
    const padding = (maxP - minP) * 0.1;
    minP -= padding; maxP += padding; pRange = maxP - minP;

    // 그리드
    ctxMain.strokeStyle = CONFIG.grid; ctxMain.beginPath();
    for(let i=1; i<6; i++) { let y = (height/6)*i; ctxMain.moveTo(0,y); ctxMain.lineTo(width,y); }
    ctxMain.stroke();

    candles.forEach((c, i) => {
        const x = i * candleW, realW = candleW - 2;
        const yO = height - ((c.open - minP) / pRange) * height;
        const yC = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? CONFIG.up : CONFIG.down;
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;

        // 거래량 바 (하단)
        const vH = (c.volume / maxV) * (height * CONFIG.volRatio);
        ctxMain.globalAlpha = 0.1; ctxMain.fillRect(x, height - vH, realW, vH); ctxMain.globalAlpha = 1.0;

        // 꼬리 & 몸통
        ctxMain.beginPath();
        ctxMain.moveTo(x + realW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + realW/2, height - ((c.low - minP) / pRange) * height);
        ctxMain.stroke();
        ctxMain.fillRect(x, Math.min(yO, yC), realW, Math.max(1, Math.abs(yC - yO)));
    });

    // 실시간 가격선
    const last = candles[candles.length-1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.strokeStyle = '#fff'; ctxMain.setLineDash([2, 2]);
    ctxMain.beginPath(); ctxMain.moveTo(0, yL); ctxMain.lineTo(width, yL); ctxMain.stroke(); ctxMain.setLineDash([]);
    
    // 우측 가격 라벨
    ctxMain.fillStyle = last.close >= last.open ? CONFIG.up : CONFIG.down;
    ctxMain.fillRect(width - CONFIG.paddingRight, yL - 10, CONFIG.paddingRight, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Arial';
    ctxMain.fillText(last.close.toLocaleString(), width - CONFIG.paddingRight + 5, yL + 4);
}

function drawUI() {
    ctxUI.clearRect(0, 0, width, height);
    if(mouseX < 0 || mouseX > width - CONFIG.paddingRight) return;
    ctxUI.strokeStyle = '#666'; ctxUI.setLineDash([4, 4]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#2b3139'; ctxUI.fillRect(width - CONFIG.paddingRight, mouseY - 10, CONFIG.paddingRight, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.fillText(hP.toLocaleString(undefined, {maximumFractionDigits:2}), width - CONFIG.paddingRight + 5, mouseY + 4);
}

uiCanvas.addEventListener('mousemove', e => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    requestAnimationFrame(drawUI);
});

function updateTickerUI(d) {
    const price = parseFloat(d.lastPrice), pct = parseFloat(d.priceChangePercent);
    elPrice.innerText = '$ ' + price.toLocaleString();
    elPrice.className = `value ${pct >= 0 ? 'text-up' : 'text-down'}`;
    elChange.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    elChange.className = `value ${pct >= 0 ? 'text-up' : 'text-down'}`;
}

resize(); loadHistory('1d');