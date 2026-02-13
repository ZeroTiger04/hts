/* ══════════════════════════════════════════════
   PRO CHART ENGINE v4 (Anti-Block & Safety)
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

// 1. 코인 리스트 & 검색
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
function selectCoin(coin) { currentCoin = coin; document.getElementById('display-symbol').innerText = `${coin.n} / USDT`; dropdown.classList.remove('show'); loadHistory(currentInterval); }
function changeInterval(iv) { document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active')); event.target.classList.add('active'); currentInterval = iv; loadHistory(iv); }

// 2. 데이터 로드 (안전 모드 탑재)
async function loadHistory(iv) {
    elLoader.classList.remove('hide');
    elLoader.innerText = "데이터 연결 중...";
    
    const target = `https://api.binance.com/api/v3/klines?symbol=${currentCoin.s.toUpperCase()}&interval=${iv}&limit=150`;
    
    // 시도할 URL 목록 (직접 접속 -> 우회 접속)
    const urls = [
        target,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
        `https://corsproxy.io/?${encodeURIComponent(target)}`
    ];

    for (let url of urls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) throw new Error();
            const data = await res.json();
            candles = data.map(d => ({ time: d[0], open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]) }));
            
            elLoader.classList.add('hide');
            drawMain();
            return; // 성공하면 종료
        } catch(e) { continue; }
    }

    // 3. 최후의 수단: 데모 데이터 (네트워크 차단 시)
    elLoader.innerText = "네트워크 차단됨 - 데모 모드 실행";
    generateDemoData();
    setTimeout(() => elLoader.classList.add('hide'), 2000);
}

function generateDemoData() {
    let p = 50000;
    candles = Array.from({length: 150}, (_, i) => {
        const o = p; const c = p + (Math.random() - 0.5) * 500;
        const h = Math.max(o, c) + Math.random() * 200;
        const l = Math.min(o, c) - Math.random() * 200;
        p = c;
        return { time: Date.now() - (150 - i) * 60000, open: o, high: h, low: l, close: c };
    });
    drawMain();
}

// 4. 차트 그리기 엔진
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
        const x = i * candleW, realW = candleW * 0.7;
        const yO = height - ((c.open - minP) / pRange) * height;
        const yC = height - ((c.close - minP) / pRange) * height;
        const color = c.close >= c.open ? "#0ecb81" : "#f6465d";
        ctxMain.fillStyle = color; ctxMain.strokeStyle = color;
        ctxMain.beginPath(); ctxMain.moveTo(x + realW/2, height - ((c.high - minP) / pRange) * height);
        ctxMain.lineTo(x + realW/2, height - ((c.low - minP) / pRange) * height); ctxMain.stroke();
        ctxMain.fillRect(x, Math.min(yO, yC), realW, Math.max(1, Math.abs(yC - yO)));
    });

    // 실시간 가격 표시 (마지막 캔들)
    const last = candles[candles.length-1];
    const yL = height - ((last.close - minP) / pRange) * height;
    ctxMain.fillStyle = last.close >= last.open ? "#0ecb81" : "#f6465d";
    ctxMain.fillRect(width - 100, yL - 10, 100, 20);
    ctxMain.fillStyle = '#fff'; ctxMain.font = 'bold 12px Roboto Mono';
    ctxMain.fillText(last.close.toLocaleString(), width - 90, yL + 4);
    
    // 상단 UI 업데이트
    document.getElementById('display-price').innerText = last.close.toLocaleString();
}

// 십자선 제어
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
renderCoins();
loadHistory('1d');