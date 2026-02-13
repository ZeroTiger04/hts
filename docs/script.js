/* ══════════════════════════════════════════════
   PRO TRADER ENGINE (TV WIDGET + BINANCE WS)
══════════════════════════════════════════════ */

const coins = [
    { id: 'btc', s: 'btcusdt', n: 'BTC', name:'Bitcoin', tv: 'BINANCE:BTCUSDT' },
    { id: 'eth', s: 'ethusdt', n: 'ETH', name:'Ethereum', tv: 'BINANCE:ETHUSDT' },
    { id: 'sol', s: 'solusdt', n: 'SOL', name:'Solana', tv: 'BINANCE:SOLUSDT' },
    { id: 'xrp', s: 'xrpusdt', n: 'XRP', name:'Ripple', tv: 'BINANCE:XRPUSDT' },
    { id: 'doge', s: 'dogeusdt', n: 'DOGE', name:'Dogecoin', tv: 'BINANCE:DOGEUSDT' }
];

let currentCoin = coins[0];
let currentInterval = 'D'; // 기본 일봉
let tvWidget = null;

// 1. 드롭다운 메뉴 생성
const dropdownEl = document.getElementById('dropdown');
coins.forEach(c => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.onclick = () => selectCoin(c);
    item.innerHTML = `
        <div>
            <div style="font-weight:bold">${c.n}/USDT</div>
            <div style="font-size:10px; color:#848e9c">${c.name}</div>
        </div>
        <div style="text-align:right">
            <div id="menu-price-${c.s}">-</div>
            <div id="menu-change-${c.s}" style="font-size:11px">0.00%</div>
        </div>
    `;
    dropdownEl.appendChild(item);
});

// 2. 종목 및 시간 변경 로직
const btn = document.getElementById('symbol-btn');
btn.onclick = () => dropdownEl.classList.toggle('show');
document.addEventListener('click', (e) => { if (!btn.contains(e.target)) dropdownEl.classList.remove('show'); });

function selectCoin(coin) {
    currentCoin = coin;
    document.getElementById('display-symbol').innerText = `${coin.n}/USDT`;
    loadChart();
}

function setIv(iv) {
    currentInterval = iv;
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    loadChart();
}

// 3. 트레이딩뷰 위젯 로드 (정확한 데이터)
function loadChart() {
    if (tvWidget) {
        // 기존 차트가 있으면 심볼/시간만 변경 (더 빠름)
        // 위젯 재생성이 필요한 경우 컨테이너를 비우고 다시 만듭니다.
        document.getElementById('tv_chart_container').innerHTML = "";
    }

    tvWidget = new TradingView.widget({
        "autosize": true,
        "symbol": currentCoin.tv,
        "interval": currentInterval,
        "timezone": "Asia/Seoul",
        "theme": "dark",
        "style": "1",
        "locale": "kr",
        "toolbar_bg": "#161a1e",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "container_id": "tv_chart_container",
        "save_image": false,
        "overrides": {
            "paneProperties.background": "#161a1e",
            "paneProperties.vertGridProperties.color": "#2b3139",
            "paneProperties.horzGridProperties.color": "#2b3139",
            "mainSeriesProperties.candleStyle.upColor": "#0ecb81",
            "mainSeriesProperties.candleStyle.downColor": "#f6465d",
            "mainSeriesProperties.candleStyle.wickUpColor": "#0ecb81",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f6465d",
        }
    });
}

// 4. 바이낸스 웹소켓 (상단 바 실시간 데이터)
const streams = coins.map(c => `${c.s}@ticker`).join('/');
const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const s = data.s.toLowerCase();
    const p = parseFloat(data.c);   
    const P = parseFloat(data.P);   
    const h = parseFloat(data.h);   
    const l = parseFloat(data.l);   

    const fmtPrice = p < 1 ? p.toFixed(5) : p.toLocaleString(undefined, {minimumFractionDigits:2});
    const fmtPct = (P >= 0 ? "+" : "") + P.toFixed(2) + "%";
    const colorClass = P >= 0 ? 'c-up' : 'c-down';

    // 메뉴 시세 업데이트
    const menuPrice = document.getElementById(`menu-price-${s}`);
    const menuChange = document.getElementById(`menu-change-${s}`);
    if(menuPrice) {
        menuPrice.innerText = fmtPrice;
        menuPrice.className = colorClass;
        menuChange.innerText = fmtPct;
        menuChange.className = colorClass;
    }

    // 메인 시세 업데이트 (현재 종목인 경우)
    if (s === currentCoin.s) {
        const elMainPrice = document.getElementById('display-price');
        elMainPrice.innerText = fmtPrice;
        elMainPrice.className = `price-val ${colorClass}`;

        const elMainChange = document.getElementById('display-change');
        elMainChange.innerText = fmtPct;
        elMainChange.className = `stat-val ${colorClass}`;

        document.getElementById('display-high').innerText = h < 1 ? h.toFixed(5) : h.toLocaleString();
        document.getElementById('display-low').innerText = l < 1 ? l.toFixed(5) : l.toLocaleString();
    }
};

// 초기화
loadChart();