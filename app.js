const coins = [
    { id: 'btc', s: 'btcusdt', n: 'BTC', name:'Bitcoin', tv: 'BINANCE:BTCUSDT' },
    { id: 'eth', s: 'ethusdt', n: 'ETH', name:'Ethereum', tv: 'BINANCE:ETHUSDT' },
    { id: 'xrp', s: 'xrpusdt', n: 'XRP', name:'Ripple', tv: 'BINANCE:XRPUSDT' },
    { id: 'sol', s: 'solusdt', n: 'SOL', name:'Solana', tv: 'BINANCE:SOLUSDT' },
    { id: 'bnb', s: 'bnbusdt', n: 'BNB', name:'BNB', tv: 'BINANCE:BNBUSDT' },
    { id: 'doge', s: 'dogeusdt', n: 'DOGE', name:'Dogecoin', tv: 'BINANCE:DOGEUSDT' },
    { id: 'ada', s: 'adausdt', n: 'ADA', name:'Cardano', tv: 'BINANCE:ADAUSDT' },
    { id: 'pepe', s: 'pepeusdt', n: 'PEPE', name:'Pepe', tv: 'BINANCE:PEPEUSDT' }
];

let currentCoin = coins[0];
let tvWidget = null;

const dropdownEl = document.getElementById('dropdown');

coins.forEach(c => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.onclick = (e) => {
        e.stopPropagation();
        selectCoin(c);
    };

    item.innerHTML = `
        <div class="item-left">
            <span class="item-symbol">${c.n}/USDT</span>
            <span class="item-name">${c.name}</span>
        </div>
        <div class="item-right">
            <div class="item-price" id="menu-price-${c.s}">-</div>
            <div style="font-size:0.75rem; color:#848e9c;" id="menu-change-${c.s}">0.00%</div>
        </div>
    `;
    dropdownEl.appendChild(item);
});

const btn = document.getElementById('symbol-btn');
btn.addEventListener('click', () => {
    dropdownEl.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!btn.contains(e.target)) {
        dropdownEl.classList.remove('show');
    }
});

function selectCoin(coin) {
    currentCoin = coin;
    document.getElementById('display-symbol').innerText = `${coin.n}/USDT`;
    loadChart(coin.tv);
    dropdownEl.classList.remove('show');
    document.getElementById('display-price').style.color = '#eaecef';
}

function loadChart(symbol) {
    if(document.getElementById('tv_chart_container').innerHTML !== "") {
        document.getElementById('tv_chart_container').innerHTML = "";
    }

    tvWidget = new TradingView.widget({
        "autosize": true,
        "symbol": symbol,
        "interval": "D",
        "timezone": "Asia/Seoul",
        "theme": "dark",
        "style": "1",
        "locale": "kr",
        "toolbar_bg": "#161a1e",
        "enable_publishing": false,
        "hide_side_toolbar": false,
        "container_id": "tv_chart_container",
        "overrides": {
            "paneProperties.background": "#0b0e11",
            "paneProperties.vertGridProperties.color": "#1e2329",
            "paneProperties.horzGridProperties.color": "#1e2329",
        }
    });
}

// 웹소켓 연결 로직
// 여러 코인의 티커 스트림 URL 생성 (예: btcusdt@ticker/ethusdt@ticker)
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
    const fmtPct = (P > 0 ? "+" : "") + P.toFixed(2) + "%";
    const color = P >= 0 ? 'c-up' : 'c-down';

    // 드롭다운 메뉴 업데이트
    const menuPrice = document.getElementById(`menu-price-${s}`);
    const menuChange = document.getElementById(`menu-change-${s}`);
    if(menuPrice) {
        menuPrice.innerText = fmtPrice;
        menuPrice.className = `item-price ${color}`;
        menuChange.innerText = fmtPct;
        menuChange.className = color;
    }

    // 메인 화면 업데이트 (현재 선택된 코인인 경우)
    if (s === currentCoin.s) {
        const mainPrice = document.getElementById('display-price');
        mainPrice.innerText = fmtPrice;
        mainPrice.className = `main-price ${color}`;

        const mainChange = document.getElementById('display-change');
        mainChange.innerText = fmtPct;
        mainChange.className = `stat-val ${color}`;

        document.getElementById('display-high').innerText = h < 1 ? h.toFixed(5) : h.toLocaleString();
        document.getElementById('display-low').innerText = l < 1 ? l.toFixed(5) : l.toLocaleString();
    }
};

// 초기 차트 로드
loadChart(currentCoin.tv);