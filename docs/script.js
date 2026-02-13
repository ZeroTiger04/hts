/* ══════════════════════════════════════════════
   PRO LIVE ENGINE v8 (Full WebSocket Integration)
══════════════════════════════════════════════ */

const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elLoader = document.getElementById('loader');

// 종목 목록
const coins = [
    { s: 'btcusdt', n: 'BTC', name:'Bitcoin' },
    { s: 'ethusdt', n: 'ETH', name:'Ethereum' },
    { s: 'solusdt', n: 'SOL', name:'Solana' },
    { s: 'xrpusdt', n: 'XRP', name:'Ripple' },
    { s: 'dogeusdt', n: 'DOGE', name:'Dogecoin' },
    { s: 'adausdt', n: 'ADA', name:'Cardano' },
    { s: 'pepeusdt', n: 'PEPE', name:'Pepe' }
];

let currentCoin = coins[0];
let currentInterval = '1d';
let candles = [];
let width, height, minP, maxP, pRange;
let mouseX = -1, mouseY = -1;
let ws = null; // 실시간 웹소켓

// 줌 설정
let visibleCount = 80;
const MIN_C = 20;
const MAX_C = 160;

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

// 종목 선택 및 검색 로직
const dropdown = document.getElementById('dropdown');
const coinList = document.getElementById('coinList');
const searchInput = document.getElementById('coinSearch');

function renderCoins(filter = "") {
    coinList.innerHTML = "";
    const filtered = coins.filter(c => c.n.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'm-item';
        item.onclick = (e) => { e.stopPropagation(); selectCoin(c); };
        item.innerHTML = `<span>${c.n}/USDT</span><span id="price-${c.s}">-</span>`;
        coinList.appendChild(item);
    });
}

document.getElementById('symbol-btn').onclick = () => { dropdown.classList.toggle('show'); if(dropdown.classList.contains('show')) searchInput.focus(); };
document.addEventListener('click', (e) => { if(!document.getElementById('symbol-btn').contains(e.target)) dropdown.classList.remove('show'); });

function selectCoin(coin) {
    currentCoin = coin;
    document.getElementById('display-symbol').innerText = `${coin.n} / USDT`;
    dropdown.classList.remove('show');
    loadHistory(currentInterval);
}

function changeInterval(iv) {
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    currentInterval = iv;
    loadHistory(iv);
}

// 1. 과거 데이터 로드 (시작점)
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    // 우회 프록시를 사용하여 바이낸스 데이터 호출
    const target = `https://api.binance.com/api/v3/klines?symbol=${currentCoin.s.toUpperCase()}&interval=${iv}&limit=180`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;

    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        candles = data.map(d => ({ 
            time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), 
            low: parseFloat(d[3]), close: parseFloat(d[4]) 
        }));
        elLoader.classList.add('hide');
        drawMain();
        connectWebSocket(); // 역사 데이터 로드 후 웹소켓 연결
    } catch(e) { setTimeout(() => loadHistory(iv), 2000); }
}

// 2. 실시간 웹소켓 연결 (핵심: 실시간 연동)
function connectWebSocket() {
    if(ws) ws.close();
    
    // 현재 선택된 종목의 티커 정보를 실시간으로 수신
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${currentCoin.s}@ticker`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const p = parseFloat(data.c);   // 현재가
        const P = parseFloat(data.P);   // 변동률
        
        if (candles.length > 0) {
            let last = candles[candles.length - 1];
            
            // 실시간 가격을 마지막 캔들에 즉시 반영
            last.close = p;
            if(p > last.high) last.high = p;
            if(p < last.low) last.low = p;
            
            updateTopUI(p, P, data.h, data.l);
            drawMain(); // 가격이 바뀔 때마다 차트 재렌더링
        }
    };
}

function updateTopUI(p, P, h, l) {
    const elP = document.getElementById('display-price');
    const elC = document.getElementById('display-change');
    const color = P >= 0 ? 'c-up' : 'c-down';
    
    elP.innerText = p.toLocaleString(undefined, {minimumFractionDigits:2});
    elP.className = `p-val ${color}`;
    elC.innerText = (P >= 0 ? "+" : "") + P.toFixed(2) + "%";
    elC.className = `p-chg ${color}`;
    
    document.getElementById('display-high').innerText = parseFloat(h).toLocaleString();
    document.getElementById('display-low').innerText = parseFloat(l).toLocaleString();
}

// 3. 차트 렌더링 엔진
function drawMain() {
    if(candles.length === 0) return;
    ctxMain.fillStyle = "#0b0e11"; ctxMain.fillRect(0, 0, width, height);
    
    // 줌 레벨에 따른 캔들 필터링
    const visibleCandles = candles.slice(-visibleCount);
    const candleW = (width - 100) / visibleCount;
    const realW = candleW * 0.7;

    minP = Infinity; maxP = -Infinity;
    visibleCandles.forEach(c => { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); });
    const padding = (maxP - minP) * 0.15;
    minP -= padding; maxP += padding; pRange = maxP - minP;

    visibleCandles.forEach((c, i) => {
        const x = i * candleW, yO = height - ((c.open - minP) / pRange) * height, yC = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? "#0ecb81" : "#f6465d";
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;
        ctxMain.beginPath(); ctxMain.moveTo(x + realW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + realW/2, height - ((c.low - minP) / pRange) * height); ctxMain.stroke();
        ctxMain.fillRect(x, Math.min(yO, yC), realW, Math.max(1, Math.abs(yC - yO)));
    });

    const last = candles[candles.length - 1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.fillStyle = last.close >= last.open ? "#0ecb81" : "#f6465d";
    ctxMain.fillRect(width - 100, yL - 10, 100, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 12px Roboto Mono';
    ctxMain.fillText(last.close.toLocaleString(), width - 95, yL + 4);
}

// 4. 이벤트 핸들러 (줌 & 십자선)
uiCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    visibleCount += e.deltaY > 0 ? 5 : -5;
    visibleCount = Math.max(MIN_C, Math.min(MAX_C, visibleCount));
    drawMain();
}, { passive: false });

uiCanvas.onmousemove = (e) => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    ctxUI.clearRect(0, 0, width, height);
    ctxUI.strokeStyle = '#444'; ctxUI.setLineDash([5, 5]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#1e2329'; ctxUI.fillRect(width - 100, mouseY - 10, 100, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.fillText(hP.toLocaleString(undefined, {maximumFractionDigits:2}), width - 95, mouseY + 4);
};

resize();
renderCoins();
loadHistory('1d');