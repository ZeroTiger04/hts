/* ══════════════════════════════════════════════
   FULL-SCREEN LIVE CHART ENGINE
   (Binance WebSocket + Custom Canvas)
══════════════════════════════════════════════ */

const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elLoader = document.getElementById('loader');

// 제공된 코인 리스트
const coins = [
    { s: 'btcusdt', n: 'BTC', name:'Bitcoin' },
    { s: 'ethusdt', n: 'ETH', name:'Ethereum' },
    { s: 'xrpusdt', n: 'XRP', name:'Ripple' },
    { s: 'solusdt', n: 'SOL', name:'Solana' },
    { s: 'bnbusdt', n: 'BNB', name:'BNB' },
    { s: 'dogeusdt', n: 'DOGE', name:'Dogecoin' },
    { s: 'adausdt', n: 'ADA', name:'Cardano' },
    { s: 'pepeusdt', n: 'PEPE', name:'Pepe' }
];

let currentCoin = coins[0];
let currentInterval = '1d';
let candles = [];
let width, height, minP, maxP, pRange;
let mouseX = -1, mouseY = -1;
let ws = null;

// 1. 종목 검색 및 드롭다운 로직
const dropdown = document.getElementById('dropdown');
const coinList = document.getElementById('coinList');
const searchInput = document.getElementById('coinSearch');

function renderCoinList(filter = "") {
    coinList.innerHTML = "";
    const filtered = coins.filter(c => c.n.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.onclick = (e) => { e.stopPropagation(); selectCoin(c); };
        item.innerHTML = `<div><div style="font-weight:bold">${c.n}/USDT</div><div style="font-size:10px;color:#848e9c">${c.name}</div></div><div id="price-${c.s}">-</div>`;
        coinList.appendChild(item);
    });
}

function filterCoins() { renderCoinList(searchInput.value); }
document.getElementById('symbol-btn').onclick = () => {
    dropdown.classList.toggle('show');
    if(dropdown.classList.contains('show')) searchInput.focus();
};
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

// 2. 차트 데이터 로드 및 그리기
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    // 바이낸스 과거 캔들 데이터 요청 (AllOrigins 프록시 사용)
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${currentCoin.s.toUpperCase()}&interval=${iv}&limit=150`)}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        candles = data.map(d => ({ time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
        elLoader.classList.add('hide');
        drawMain();
        connectWebSocket();
    } catch(e) { console.error("History Load Error"); }
}

// 웹소켓 실시간 연동
function connectWebSocket() {
    if(ws) ws.close();
    const streams = coins.map(c => `${c.s}@ticker`).join('/');
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const s = data.s.toLowerCase();
        
        // 메뉴 가격 실시간 업데이트
        const elMenuPrice = document.getElementById(`price-${s}`);
        if(elMenuPrice) elMenuPrice.innerText = parseFloat(data.c).toLocaleString();

        // 현재 종목 실시간 차트 업데이트
        if (s === currentCoin.s && candles.length > 0) {
            let last = candles[candles.length - 1];
            last.close = parseFloat(data.c);
            last.high = Math.max(last.high, last.close);
            last.low = Math.min(last.low, last.close);
            
            updateTopUI(data);
            drawMain();
        }
    };
}

function updateTopUI(data) {
    const p = parseFloat(data.c);
    const P = parseFloat(data.P);
    const color = P >= 0 ? 'c-up' : 'c-down';
    
    document.getElementById('display-price').innerText = p.toLocaleString(undefined, {minimumFractionDigits:2});
    document.getElementById('display-price').className = `price ${color}`;
    document.getElementById('display-change').innerText = (P>=0?"+":"") + P.toFixed(2) + "%";
    document.getElementById('display-change').className = `change ${color}`;
    document.getElementById('display-high').innerText = parseFloat(data.h).toLocaleString();
    document.getElementById('display-low').innerText = parseFloat(data.l).toLocaleString();
}

function drawMain() {
    const dpr = window.devicePixelRatio || 1;
    width = mainCanvas.parentElement.clientWidth; height = mainCanvas.parentElement.clientHeight;
    [mainCanvas, uiCanvas].forEach(c => { c.width = width * dpr; c.height = height * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); });

    ctxMain.fillStyle = "#0b0e11"; ctxMain.fillRect(0, 0, width, height);
    const candleW = (width - 100) / candles.length;
    minP = Infinity; maxP = -Infinity;
    candles.forEach(c => { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); });
    const padding = (maxP - minP) * 0.1;
    minP -= padding; maxP += padding; pRange = maxP - minP;

    // 그리드
    ctxMain.strokeStyle = "#1e2227"; ctxMain.beginPath();
    for(let i=1; i<8; i++) { let y = (height/8)*i; ctxMain.moveTo(0,y); ctxMain.lineTo(width,y); }
    ctxMain.stroke();

    // 캔들 그리기
    candles.forEach((c, i) => {
        const x = i * candleW, realW = candleW * 0.7;
        const yO = height - ((c.open - minP) / pRange) * height;
        const yC = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? "#00c076" : "#ff4a5a";
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;
        ctxMain.beginPath(); ctxMain.moveTo(x + realW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + realW/2, height - ((c.low - minP) / pRange) * height); ctxMain.stroke();
        ctxMain.fillRect(x, Math.min(yO, yC), realW, Math.max(1, Math.abs(yC - yO)));
    });

    // 가격 라벨
    const last = candles[candles.length-1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.fillStyle = last.close >= last.open ? "#00c076" : "#ff4a5a";
    ctxMain.fillRect(width - 100, yL - 10, 100, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 12px Roboto Mono';
    ctxMain.fillText(last.close.toLocaleString(), width - 90, yL + 4);
}

// 십자선 UI 레이어
uiCanvas.onmousemove = (e) => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    ctxUI.clearRect(0, 0, width, height);
    ctxUI.strokeStyle = '#555'; ctxUI.setLineDash([4, 4]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#2b3139'; ctxUI.fillRect(width - 100, mouseY - 10, 100, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.fillText(hP.toLocaleString(undefined, {maximumFractionDigits:2}), width - 90, mouseY + 4);
};

window.onresize = drawMain;
renderCoinList();
loadHistory('1d');