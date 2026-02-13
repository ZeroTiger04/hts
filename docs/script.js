/* ─── Coin definitions ─── */
const coins = [
    { id:'btc',  s:'btcusdt',  n:'BTC',  name:'Bitcoin',  tv:'BINANCE:BTCUSDT',  logo:'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
    { id:'eth',  s:'ethusdt',  n:'ETH',  name:'Ethereum', tv:'BINANCE:ETHUSDT',  logo:'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
    { id:'xrp',  s:'xrpusdt',  n:'XRP',  name:'Ripple',   tv:'BINANCE:XRPUSDT',  logo:'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
    { id:'sol',  s:'solusdt',  n:'SOL',  name:'Solana',   tv:'BINANCE:SOLUSDT',  logo:'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
    { id:'bnb',  s:'bnbusdt',  n:'BNB',  name:'BNB',      tv:'BINANCE:BNBUSDT',  logo:'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
    { id:'doge', s:'dogeusdt', n:'DOGE', name:'Dogecoin', tv:'BINANCE:DOGEUSDT', logo:'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
    { id:'ada',  s:'adausdt',  n:'ADA',  name:'Cardano',  tv:'BINANCE:ADAUSDT',  logo:'https://assets.coingecko.com/coins/images/975/small/cardano.png' },
    { id:'pepe', s:'pepeusdt', n:'PEPE', name:'Pepe',     tv:'BINANCE:PEPEUSDT', logo:'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg' },
];

let currentCoin      = coins[0];
let currentInterval = 'D';
let tvWidget        = null;
let lastPrices      = {};

/* ─── Smart price formatter ─── */
function fmtPrice(p) {
    if (p < 0.0001)   return p.toFixed(8);
    if (p < 0.01)     return p.toFixed(6);
    if (p < 1)        return p.toFixed(4);
    if (p < 100)      return p.toFixed(3);
    return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVol(v) {
    if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(2) + 'K';
    return v.toFixed(0);
}

/* ─── Build dropdown ─── */
const dropdownEl = document.getElementById('dropdown');
coins.forEach(c => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.onclick = (e) => { e.stopPropagation(); selectCoin(c); };
    item.innerHTML = `
      <div class="item-left">
        <div class="item-coin-icon"><img src="${c.logo}" alt="${c.n}"></div>
        <div class="item-texts">
          <div class="item-sym">${c.n} / USDT</div>
          <div class="item-name">${c.name}</div>
        </div>
      </div>
      <div class="item-right">
        <div class="item-price" id="menu-price-${c.s}">—</div>
        <div class="item-pct"   id="menu-pct-${c.s}">0.00%</div>
      </div>`;
    dropdownEl.appendChild(item);
});

/* ─── Dropdown toggle ─── */
const symbolBtn = document.getElementById('symbol-btn');
symbolBtn.addEventListener('click', () => {
    dropdownEl.classList.toggle('show');
    symbolBtn.classList.toggle('open');
});
document.addEventListener('click', (e) => {
    if (!symbolBtn.contains(e.target)) {
        dropdownEl.classList.remove('show');
        symbolBtn.classList.remove('open');
    }
});

/* ─── Select coin ─── */
function selectCoin(coin) {
    currentCoin = coin;
    document.getElementById('display-symbol').textContent = `${coin.n} / USDT`;
    const icon = document.getElementById('sym-icon');
    icon.innerHTML = `<img src="${coin.logo}" alt="${coin.n}">`;
    loadChart(coin.tv, currentInterval);
    dropdownEl.classList.remove('show');
    symbolBtn.classList.remove('open');
    ['display-price','display-change','display-high','display-low','display-vol']
      .forEach(id => document.getElementById(id).textContent = '—');
}

/* ─── Change interval ─── */
function changeInterval(interval, btn) {
    currentInterval = interval;
    document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadChart(currentCoin.tv, interval);
}

/* ─── Load TradingView chart ─── */
function loadChart(symbol, interval) {
    document.getElementById('tv_chart_container').innerHTML = '';
    tvWidget = new TradingView.widget({
        autosize:          true,
        symbol:            symbol,
        interval:          interval,
        timezone:          'Asia/Seoul',
        theme:             'dark',
        style:             '1',
        locale:            'kr',
        toolbar_bg:        '#0d1017',
        enable_publishing: false,
        hide_top_toolbar:  true,
        hide_side_toolbar: false,
        container_id:      'tv_chart_container',
        loading_screen:    { backgroundColor: '#060810', foregroundColor: '#c8a84b' },
        studies_overrides: {
            'volume.volume.color.0': '#ff3a5c55',
            'volume.volume.color.1': '#00e87a55',
            'relative strength index.plot.color':               '#c8a84b',
            'relative strength index.plot.linewidth':           1,
            'relative strength index.upper band.color':         '#1a2035',
            'relative strength index.lower band.color':         '#1a2035',
            'relative strength index.hlines background.color': '#c8a84b08',
        },
        overrides: {
            'paneProperties.background':                         '#060810',
            'paneProperties.backgroundType':                     'solid',
            'paneProperties.vertGridProperties.color':           '#0f1420',
            'paneProperties.horzGridProperties.color':           '#0f1420',
            'paneProperties.crossHairProperties.color':          '#c8a84b',
            'scalesProperties.textColor':                        '#4e5a72',
            'scalesProperties.lineColor':                        '#1a2035',
            'mainSeriesProperties.candleStyle.upColor':          '#00e87a',
            'mainSeriesProperties.candleStyle.downColor':        '#ff3a5c',
            'mainSeriesProperties.candleStyle.borderUpColor':    '#00e87a',
            'mainSeriesProperties.candleStyle.borderDownColor':  '#ff3a5c',
            'mainSeriesProperties.candleStyle.wickUpColor':      '#00e87a80',
            'mainSeriesProperties.candleStyle.wickDownColor':    '#ff3a5c80',
            'mainSeriesProperties.priceLineColor':               '#c8a84b',
        }
    });

    tvWidget.onChartReady(() => {
        const chart = tvWidget.chart();
        const emaList = [
            { len: 20,  color: '#ff8c00', width: 1 },
            { len: 60,  color: '#00e87a', width: 1 },
            { len: 120, color: '#ff3a5c', width: 1 },
            { len: 200, color: '#4d9fff', width: 2 },
        ];
        emaList.forEach(({ len, color, width }) => {
            chart.createStudy('Moving Average Exponential', false, false, [len], { 'MA.color': color, 'MA.linewidth': width });
        });
        chart.createStudy('Relative Strength Index', false, false, [14]);
    });
}

/* ─── WebSocket ─── */
const streams = coins.map(c => `${c.s}@ticker`).join('/');
const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

const badge   = document.getElementById('ws-badge');
const wsText  = document.getElementById('ws-text');

ws.onopen = () => {
    badge.classList.add('connected');
    wsText.textContent = 'LIVE';
};
ws.onclose = () => {
    badge.classList.remove('connected');
    wsText.textContent = 'DISCONNECTED';
};

ws.onmessage = (event) => {
    const d = JSON.parse(event.data);
    const s = d.s.toLowerCase();
    const p = parseFloat(d.c);
    const P = parseFloat(d.P);
    const isUp   = P >= 0;
    const dirCls = isUp ? 'up' : 'down';
    const pctStr = (isUp ? '+' : '') + P.toFixed(2) + '%';

    const mPrice = document.getElementById(`menu-price-${s}`);
    const mPct   = document.getElementById(`menu-pct-${s}`);
    if (mPrice) {
        mPrice.textContent = fmtPrice(p);
        mPrice.className   = `item-price ${dirCls}`;
        mPct.textContent   = pctStr;
        mPct.className     = `item-pct ${dirCls}`;
    }

    if (s !== currentCoin.s) return;

    const priceEl = document.getElementById('display-price');
    const prev    = lastPrices[s];
    priceEl.textContent = fmtPrice(p);
    priceEl.className   = `main-price ${dirCls}`;

    if (prev !== undefined) {
        priceEl.classList.remove('flash-up','flash-down');
        void priceEl.offsetWidth; 
        priceEl.classList.add(p >= prev ? 'flash-up' : 'flash-down');
    }
    lastPrices[s] = p;

    const changeEl = document.getElementById('display-change');
    changeEl.textContent = pctStr;
    changeEl.className   = `stat-val ${dirCls}`;

    document.getElementById('display-high').textContent = fmtPrice(parseFloat(d.h));
    document.getElementById('display-low').textContent  = fmtPrice(parseFloat(d.l));
    document.getElementById('display-vol').textContent  = fmtVol(parseFloat(d.q));
};

/* ─── Initial chart load ─── */
loadChart(currentCoin.tv, currentInterval);