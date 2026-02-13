const mainCanvas = document.getElementById('mainLayer');
const uiCanvas = document.getElementById('uiLayer');
const ctxMain = mainCanvas.getContext('2d');
const ctxUI = uiCanvas.getContext('2d');
const elLoader = document.getElementById('loader');

const coins = [
    { s: 'BTCUSDT', n: 'BTC', name: 'Bitcoin' },
    { s: 'ETHUSDT', n: 'ETH', name: 'Ethereum' },
    { s: 'SOLUSDT', n: 'SOL', name: 'Solana' },
    { s: 'XRPUSDT', n: 'XRP', name: 'Ripple' },
    { s: 'BNBUSDT', n: 'BNB', name: 'BNB' },
    { s: 'DOGEUSDT', n: 'DOGE', name: 'Dogecoin' },
    { s: 'PEPEUSDT', n: 'PEPE', name: 'Pepe' },
    { s: 'ADAUSDT', n: 'ADA', name: 'Cardano' }
];

let currentCoin = coins[0];
let currentInterval = '1d';
let candles = [];
let width, height, minP, maxP, pRange;
let mouseX = -1, mouseY = -1;

// 1. 드롭다운 및 검색 로직
const dropdown = document.getElementById('dropdown');
const coinList = document.getElementById('coinList');
const searchInput = document.getElementById('coinSearch');

function renderCoinList(filter = "") {
    coinList.innerHTML = "";
    const filtered = coins.filter(c => 
        c.n.toLowerCase().includes(filter.toLowerCase()) || 
        c.name.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.onclick = (e) => { e.stopPropagation(); selectCoin(c); };
        item.innerHTML = `<div><div class="sym">${c.n}/USDT</div><div class="name">${c.name}</div></div><div id="price-${c.s}">-</div>`;
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

// 2. 데이터 & 차트 엔진 (이전 고성능 버전 유지)
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    currentInterval = iv;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${currentCoin.s}&interval=${iv}&limit=150`)}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        candles = data.map(d => ({ time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
        elLoader.classList.add('hide');
        drawMain();
        startTicker();
    } catch(e) { setTimeout(() => loadHistory(iv), 2000); }
}

function startTicker() {
    if(window.tTimer) clearInterval(window.tTimer);
    window.tTimer = setInterval(async () => {
        const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.binance.com/api/v3/ticker/24hr?symbol=${currentCoin.s}`)}`;
        try {
            const res = await fetch(url);
            const d = await res.json();
            if(candles.length > 0) {
                let last = candles[candles.length - 1];
                last.close = parseFloat(d.lastPrice);
                last.high = Math.max(last.high, last.close);
                last.low = Math.min(last.low, last.close);
                updateUI(d);
                drawMain();
            }
        } catch(e) {}
    }, 1000);
}

function updateUI(d) {
    const price = parseFloat(d.lastPrice), pct = parseFloat(d.priceChangePercent);
    const color = pct >= 0 ? 'text-up' : 'text-down';
    document.getElementById('displayPrice').innerText = price.toLocaleString(undefined, {minimumFractionDigits:2});
    document.getElementById('displayPrice').className = `price ${color}`;
    document.getElementById('displayChange').innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    document.getElementById('displayChange').className = `change ${color}`;
    document.getElementById('displayHigh').innerText = parseFloat(d.highPrice).toLocaleString();
    document.getElementById('displayLow').innerText = parseFloat(d.lowPrice).toLocaleString();
}

function drawMain() {
    const dpr = window.devicePixelRatio || 1;
    width = mainCanvas.parentElement.clientWidth; height = mainCanvas.parentElement.clientHeight;
    [mainCanvas, uiCanvas].forEach(c => { c.width = width * dpr; c.height = height * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); });

    ctxMain.fillStyle = "#121519"; ctxMain.fillRect(0, 0, width, height);
    const candleW = (width - 90) / candles.length;
    minP = Infinity; maxP = -Infinity; let maxV = 0;
    candles.forEach(c => { minP = Math.min(minP, c.low); maxP = Math.max(maxP, c.high); maxV = Math.max(maxV, c.volume); });
    const padding = (maxP - minP) * 0.1;
    minP -= padding; maxP += padding; pRange = maxP - minP;

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

    const last = candles[candles.length-1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.fillStyle = last.close >= last.open ? "#00c076" : "#ff4a5a";
    ctxMain.fillRect(width - 90, yL - 10, 90, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 11px Roboto Mono';
    ctxMain.fillText(last.close.toLocaleString(), width - 82, yL + 4);
}

// 십자선 (UI 레이어)
uiCanvas.onmousemove = (e) => {
    const rect = uiCanvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    ctxUI.clearRect(0, 0, width, height);
    ctxUI.strokeStyle = '#555'; ctxUI.setLineDash([4, 4]);
    ctxUI.beginPath(); ctxUI.moveTo(mouseX, 0); ctxUI.lineTo(mouseX, height); ctxUI.stroke();
    ctxUI.beginPath(); ctxUI.moveTo(0, mouseY); ctxUI.lineTo(width, mouseY); ctxUI.stroke();
    const hP = minP + ((height - mouseY) / height) * pRange;
    ctxUI.fillStyle = '#2b3139'; ctxUI.fillRect(width - 90, mouseY - 10, 90, 20);
    ctxUI.fillStyle = '#fff'; ctxUI.fillText(hP.toLocaleString(undefined, {maximumFractionDigits:2}), width - 82, mouseY + 4);
};

window.onresize = drawMain;
renderCoinList();
loadHistory('1d');