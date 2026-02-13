/* ══════════════════════════════════════════════
   PRO CHART ENGINE v5 (Full Interval Support)
══════════════════════════════════════════════ */

const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elLoader = document.getElementById('loader');

const coins = [
    { s: 'btcusdt', n: 'BTC', name:'Bitcoin' },
    { s: 'ethusdt', n: 'ETH', name:'Ethereum' },
    { s: 'solusdt', n: 'SOL', name:'Solana' },
    { s: 'xrpusdt', n: 'XRP', name:'Ripple' },
    { s: 'dogeusdt', n: 'DOGE', name:'Dogecoin' }
];

let currentCoin = coins[0];
let currentInterval = '1d';
let candles = [];
let width, height, minP, maxP, pRange;
let mouseX = -1, mouseY = -1;
let proxyIdx = 0;

// 프록시 목록 (Allorigins, CorsProxy, 직접 연결 순서)
const PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => url
];

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

function changeInterval(iv) {
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentInterval = iv;
    loadHistory(iv);
}

// 데이터 로드 핵심 함수
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    elLoader.innerText = `LOADING ${currentSymbol(currentInterval)}... (Try ${proxyIdx + 1})`;
    
    // 바이낸스 캔들 API 호출
    const target = `https://api.binance.com/api/v3/klines?symbol=${currentCoin.s.toUpperCase()}&interval=${iv}&limit=180`;
    const requestUrl = PROXIES[proxyIdx](target);

    try {
        const res = await fetch(requestUrl, { signal: AbortSignal.timeout(4000) });
        if(!res.ok) throw new Error();
        const data = await res.json();

        candles = data.map(d => ({ 
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), 
            low: parseFloat(d[3]), close: parseFloat(d[4]) 
        }));
        
        elLoader.classList.add('hide');
        proxyIdx = 0; // 성공 시 프록시 인덱스 초기화
        drawMain();
        startTicker();
    } catch(e) {
        proxyIdx++;
        if(proxyIdx < PROXIES.length) {
            loadHistory(iv); // 다음 프록시로 재시도
        } else {
            // 모든 접속 실패 시 데모 데이터 가동
            proxyIdx = 0;
            generateDemoData();
            elLoader.innerText = "OFFLINE MODE (NETWORK BLOCKED)";
            setTimeout(() => elLoader.classList.add('hide'), 2000);
        }
    }
}

// 데모 데이터 생성 (비상용)
function generateDemoData() {
    let p = 50000;
    candles = Array.from({length: 150}, (_, i) => {
        const o = p; const c = p + (Math.random() - 0.5) * 600;
        p = c;
        return { time: Date.now() - (150-i)*60000, open: o, high: Math.max(o,c)+100, low: Math.min(o,c)-100, close: c };
    });
    drawMain();
}

function currentSymbol(iv) { return `${currentCoin.n} / ${iv}`; }

// 실시간 시세 폴링
function startTicker() {
    if(window.tTimer) clearInterval(window.tTimer);
    window.tTimer = setInterval(async () => {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${currentCoin.s.toUpperCase()}`;
        try {
            const res = await fetch(PROXIES[0](url));
            const d = await res.json();
            if(candles.length > 0) {
                let last = candles[candles.length - 1];
                last.close = parseFloat(d.lastPrice);
                last.high = Math.max(last.high, last.close);
                last.low = Math.min(last.low, last.close);
                updateTickerUI(d);
                drawMain();
            }
        } catch(e) {}
    }, 3000);
}

function updateTickerUI(d) {
    const price = parseFloat(d.lastPrice), pct = parseFloat(d.priceChangePercent);
    const elP = document.getElementById('display-price');
    const elC = document.getElementById('display-change');
    elP.innerText = price.toLocaleString();
    elP.className = `p-val ${pct >= 0 ? 'c-up' : 'c-down'}`;
    elC.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    elC.className = `p-chg ${pct >= 0 ? 'c-up' : 'c-down'}`;
}

// 차트 렌더링 (Canvas)
function drawMain() {
    const dpr = window.devicePixelRatio || 1;
    width = mainCanvas.parentElement.clientWidth; height = mainCanvas.parentElement.clientHeight;
    [mainCanvas, uiCanvas].forEach(c => { c.width = width * dpr; c.height = height * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); });

    ctxMain.fillStyle = "#0b0e11"; ctxMain.fillRect(0, 0, width, height);
    const candleW = (width - 100) / candles.length;
    minP = Infinity; maxP = -Infinity;
    candles.forEach(c => { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); });
    const padding = (maxP - minP) * 0.15;
    minP -= padding; maxP += padding; pRange = maxP - minP;

    candles.forEach((c, i) => {
        const x = i * candleW, rW = candleW * 0.7;
        const yO = height - ((c.open - minP) / pRange) * height;
        const yC = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? "#0ecb81" : "#f6465d";
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;
        ctxMain.beginPath(); ctxMain.moveTo(x + rW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + rW/2, height - ((c.low - minP) / pRange) * height); ctxMain.stroke();
        ctxMain.fillRect(x, Math.min(yO, yC), rW, Math.max(1, Math.abs(yC - yO)));
    });

    const last = candles[candles.length - 1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.fillStyle = last.close >= last.open ? "#0ecb81" : "#f6465d";
    ctxMain.fillRect(width - 100, yL - 10, 100, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 12px Roboto Mono';
    ctxMain.fillText(last.close.toLocaleString(), width - 90, yL + 4);
}

uiCanvas.onmousemove = (e) => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    ctxUI.clearRect(0, 0, width, height);
    ctxUI.strokeStyle = '#444'; ctxUI.setLineDash([5, 5]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#1e2329'; ctxUI.fillRect(width - 100, mouseY - 10, 100, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.fillText(hP.toLocaleString(undefined, {maximumFractionDigits:2}), width - 90, mouseY + 4);
};

window.onresize = drawMain;
loadHistory('1d');