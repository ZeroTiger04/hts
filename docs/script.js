/* ══════════════════════════════════════════════
   ZERO-DEPENDENCY GLOBAL CHART
   (Source: CryptoCompare / Pair: BTC-USDT)
   (Mode: HTTP Polling / Global Colors)
══════════════════════════════════════════════ */

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const elPrice = document.getElementById('price');
const elChange = document.getElementById('change');
const elInfo = document.getElementById('crosshairInfo');

// 차트 설정 (해외 표준)
const CONFIG = {
    upColor: '#0ecb81',    // 상승: 초록 (해외 표준)
    downColor: '#f6465d',  // 하락: 빨강 (해외 표준)
    bgColor: '#0b0e11',
    gridColor: '#1e2329',
    crosshairColor: '#ffffff',
    candleWidth: 8,
    spacing: 4
};

// 데이터 변수
let candles = [];
let width, height;
let mouseX = -1, mouseY = -1;

// 헬퍼: 달러 포맷 ($ 65,000.00)
const fmtUSD = (num) => {
    return '$ ' + num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
};

/* ────────────────────────────────────────────────
   1. 해외 데이터 가져오기 (CryptoCompare)
   * 방화벽 우회 가능성이 높음 (정보 사이트로 분류)
──────────────────────────────────────────────── */
async function fetchHistory() {
    // BTC -> USDT (1시간봉 데이터)
    // histohour: 1시간봉, histominute: 1분봉
    const url = 'https://min-api.cryptocompare.com/data/v2/histohour?fsym=BTC&tsym=USDT&limit=100';
    
    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.Response === 'Error') throw new Error(json.Message);

        const rawData = json.Data.Data;

        // 데이터 변환
        candles = rawData.map(d => ({
            time: d.time, 
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volumeto
        }));

        draw(); 
        updateUI(candles[candles.length - 1]);

    } catch (e) {
        console.error("해외 데이터 로드 실패:", e);
        // 실패 시 UI에 표시
        elPrice.innerText = "OFFLINE";
    }
}

// 실시간 가격 조회 (2초마다)
async function fetchTicker() {
    try {
        const url = 'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC&tsyms=USDT';
        const res = await fetch(url);
        const json = await res.json();
        
        const raw = json.RAW.BTC.USDT;
        const currentPrice = raw.PRICE;
        
        // 차트 마지막 캔들 업데이트
        if(candles.length > 0) {
            let last = candles[candles.length - 1];
            last.close = currentPrice;
            if(currentPrice > last.high) last.high = currentPrice;
            if(currentPrice < last.low) last.low = currentPrice;
            
            draw();
            updateUI_Ticker(raw);
        }

    } catch (e) {
        console.error("티커 조회 실패");
    }
}

/* ────────────────────────────────────────────────
   2. 차트 그리기 엔진 (HTML5 Canvas)
   * 수정사항: Y축 자동 스케일링 강화
──────────────────────────────────────────────── */
function draw() {
    if(candles.length === 0) return;

    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // 배경
    ctx.fillStyle = CONFIG.bgColor;
    ctx.fillRect(0, 0, width, height);

    const chartHeight = height * 0.8;
    const volHeight = height * 0.2;

    // 캔들 계산
    const candleFullWidth = CONFIG.candleWidth + CONFIG.spacing;
    const maxVisible = Math.ceil(width / candleFullWidth);
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visibleCandles = candles.slice(startIdx);

    // 스케일 계산
    let minP = Infinity, maxP = -Infinity;
    let maxV = 0;
    visibleCandles.forEach(c => {
        if(c.low < minP) minP = c.low;
        if(c.high > maxP) maxP = c.high;
        if(c.volume > maxV) maxV = c.volume;
    });
    
    // 가격 범위 여백 15% (차트가 너무 꽉 차지 않게)
    const padding = (maxP - minP) * 0.15;
    minP -= padding; maxP += padding;
    const priceRange = maxP - minP;

    // 그리드
    ctx.strokeStyle = CONFIG.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=1; i<=4; i++) { let y = (chartHeight/4)*i; ctx.moveTo(0,y); ctx.lineTo(width,y); }
    ctx.stroke();

    // 캔들 렌더링
    visibleCandles.forEach((c, i) => {
        const x = width - ((visibleCandles.length - i) * candleFullWidth) - 60;
        
        const yOpen = chartHeight - ((c.open - minP) / priceRange) * chartHeight;
        const yClose = chartHeight - ((c.close - minP) / priceRange) * chartHeight;
        const yHigh = chartHeight - ((c.high - minP) / priceRange) * chartHeight;
        const yLow = chartHeight - ((c.low - minP) / priceRange) * chartHeight;

        const isUp = c.close >= c.open;
        const color = isUp ? CONFIG.upColor : CONFIG.downColor;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        // 거래량 바
        const vH = (c.volume / maxV) * volHeight * 0.8;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x - CONFIG.candleWidth/2, height - vH, CONFIG.candleWidth, vH);
        ctx.globalAlpha = 1.0;

        // 캔들 꼬리 & 몸통
        ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow); ctx.stroke();
        let bodyH = Math.abs(yClose - yOpen); if(bodyH < 1) bodyH = 1;
        ctx.fillRect(x - CONFIG.candleWidth/2, Math.min(yOpen, yClose), CONFIG.candleWidth, bodyH);
    });

    // 현재가 라인
    const last = candles[candles.length-1];
    const yLast = chartHeight - ((last.close - minP) / priceRange) * chartHeight;
    ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, yLast); ctx.lineTo(width, yLast); ctx.stroke(); ctx.setLineDash([]);

    // 현재가 라벨 (달러)
    ctx.fillStyle = last.close >= last.open ? CONFIG.upColor : CONFIG.downColor;
    ctx.fillRect(width - 80, yLast - 10, 80, 20);
    ctx.fillStyle = '#fff'; ctx.font = '11px Arial';
    ctx.fillText(last.close.toLocaleString('en-US', {style:'currency', currency:'USD'}), width - 75, yLast + 4);

    // 십자선 (마우스)
    if(mouseX >= 0) {
        ctx.strokeStyle = '#aaa'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(mouseX, 0); ctx.lineTo(mouseX, height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, mouseY); ctx.lineTo(width, mouseY); ctx.stroke(); ctx.setLineDash([]);

        elInfo.style.display = 'block';
        elInfo.style.left = mouseX + 15 + 'px';
        elInfo.style.top = mouseY + 15 + 'px';
        const hoverPrice = minP + ((chartHeight - mouseY) / chartHeight) * priceRange;
        elInfo.innerText = fmtUSD(hoverPrice);
    } else {
        elInfo.style.display = 'none';
    }
}

/* ────────────────────────────────────────────────
   3. UI 업데이트
──────────────────────────────────────────────── */
function updateUI(candle) {
    if(!candle) return;
    elPrice.innerText = fmtUSD(candle.close);
}

function updateUI_Ticker(raw) {
    const price = raw.PRICE;
    const change = raw.CHANGEPCT24HOUR; // 24시간 변동률
    
    elPrice.innerText = fmtUSD(price);
    elChange.innerText = (change > 0 ? "+" : "") + change.toFixed(2) + "%";
    
    // 해외 표준 색상 적용
    const colorClass = change > 0 ? 'up-text' : 'down-text';
    elPrice.className = `value ${colorClass}`;
    elChange.className = `value ${colorClass}`;
}

// 이벤트
window.addEventListener('resize', draw);
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mouseleave', () => { mouseX = -1; mouseY = -1; });

// 시작
fetchHistory();
setInterval(fetchTicker, 2000); // 2초마다 갱신 (부하 방지)