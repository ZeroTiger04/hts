/* ══════════════════════════════════════════════
   ZERO-DEPENDENCY PRO CHART v2
   (Multi-Interval Support + Fast Data Loading)
══════════════════════════════════════════════ */

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const elPrice = document.getElementById('price');
const elChange = document.getElementById('change');
const elInfo = document.getElementById('crosshairInfo');
const elLoading = document.getElementById('loading');

// 차트 설정
const CONFIG = {
    upColor: '#0ecb81',
    downColor: '#f6465d',
    bgColor: '#0b0e11',
    gridColor: '#1e2329',
    crosshairColor: '#ffffff',
    candleWidth: 8,
    spacing: 4
};

// 상태 변수
let candles = [];
let currentInterval = '1d'; // 기본값 1일
let width, height;
let mouseX = -1, mouseY = -1;
let tickerInterval = null;

// 포맷팅 헬퍼
const fmtUSD = (num) => '$ ' + num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

/* ────────────────────────────────────────────────
   1. 데이터 관리 (핵심: 시간대별 API 매핑)
──────────────────────────────────────────────── */

// 시간 버튼 클릭 시 호출
function changeInterval(iv) {
    if(currentInterval === iv) return;
    
    // 버튼 UI 업데이트
    document.querySelectorAll('.iv-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active'); // 클릭한 버튼 활성화
    
    currentInterval = iv;
    fetchHistory(iv); // 데이터 새로고침
}

// API URL 생성기 (CryptoCompare 구조에 맞춤)
function getApiUrl(iv) {
    const base = 'https://min-api.cryptocompare.com/data/v2';
    const fsym = 'BTC';
    const tsym = 'USDT';
    const limit = 120; // 불러올 캔들 개수 (속도를 위해 적당히)

    // CryptoCompare API 매핑 규칙
    // 1m, 3m, 5m, 15m -> histominute 사용 (aggregate 파라미터로 묶음)
    // 1h, 4h -> histohour 사용
    // 1d, 1w, 1M -> histoday 사용
    
    switch(iv) {
        case '1m':  return `${base}/histominute?fsym=${fsym}&tsym=${tsym}&limit=${limit}`;
        case '3m':  return `${base}/histominute?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=3`;
        case '5m':  return `${base}/histominute?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=5`;
        case '15m': return `${base}/histominute?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=15`;
        case '1h':  return `${base}/histohour?fsym=${fsym}&tsym=${tsym}&limit=${limit}`;
        case '4h':  return `${base}/histohour?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=4`;
        case '1d':  return `${base}/histoday?fsym=${fsym}&tsym=${tsym}&limit=${limit}`;
        case '1w':  return `${base}/histoday?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=7`;
        case '1M':  return `${base}/histoday?fsym=${fsym}&tsym=${tsym}&limit=${limit}&aggregate=30`;
        default:    return `${base}/histoday?fsym=${fsym}&tsym=${tsym}&limit=${limit}`;
    }
}

async function fetchHistory(iv) {
    elLoading.classList.remove('hide'); // 로딩 표시
    const url = getApiUrl(iv);
    
    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.Response === 'Error') throw new Error(json.Message);

        const rawData = json.Data.Data;
        
        // 데이터 매핑
        candles = rawData.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volumeto
        }));

        elLoading.classList.add('hide'); // 로딩 제거
        draw(); 
        updateUI(candles[candles.length - 1]);

    } catch (e) {
        console.error("데이터 로드 실패:", e);
        elLoading.innerText = "DATA ERROR";
    }
}

// 실시간 가격 조회 (2초마다)
// 주의: 차트의 마지막 캔들을 현재가로 실시간 업데이트해줌
async function fetchTicker() {
    try {
        const url = 'https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC&tsyms=USDT';
        const res = await fetch(url);
        const json = await res.json();
        
        const raw = json.RAW.BTC.USDT;
        const currentPrice = raw.PRICE;
        
        // 차트 마지막 캔들 갱신
        if(candles.length > 0) {
            let last = candles[candles.length - 1];
            
            // 현재 가격 반영
            last.close = currentPrice;
            if(currentPrice > last.high) last.high = currentPrice;
            if(currentPrice < last.low) last.low = currentPrice;
            
            draw(); // 다시 그리기 (깜빡임 없이 부드러움)
            updateUI_Ticker(raw);
        }

    } catch (e) {
        // 조용히 실패 (다음 틱에 재시도)
    }
}

/* ────────────────────────────────────────────────
   2. 차트 그리기 엔진 (최적화됨)
──────────────────────────────────────────────── */
function draw() {
    if(candles.length === 0) return;

    // 1. 캔버스 리사이징
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    // 픽셀 깨짐 방지를 위해 DPR 적용할 수 있으나 성능을 위해 기본값 사용
    canvas.width = width;
    canvas.height = height;

    // 2. 배경
    ctx.fillStyle = CONFIG.bgColor;
    ctx.fillRect(0, 0, width, height);

    const chartHeight = height * 0.85; // 차트 영역
    const volHeight = height * 0.15;   // 거래량 영역

    // 3. 보이는 캔들 계산
    const candleFullWidth = CONFIG.candleWidth + CONFIG.spacing;
    const maxVisible = Math.ceil(width / candleFullWidth);
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visibleCandles = candles.slice(startIdx);

    // 4. 스케일 계산 (가격 & 거래량)
    let minP = Infinity, maxP = -Infinity;
    let maxV = 0;
    visibleCandles.forEach(c => {
        if(c.low < minP) minP = c.low;
        if(c.high > maxP) maxP = c.high;
        if(c.volume > maxV) maxV = c.volume;
    });
    const padding = (maxP - minP) * 0.1;
    minP -= padding; maxP += padding;
    const priceRange = maxP - minP;

    // 5. 그리드
    ctx.strokeStyle = CONFIG.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // 가로선
    for(let i=1; i<=5; i++) { 
        let y = (chartHeight/5)*i; 
        ctx.moveTo(0,y); ctx.lineTo(width,y); 
    }
    // 세로선
    for(let i=1; i<=8; i++) {
        let x = (width/8)*i;
        ctx.moveTo(x,0); ctx.lineTo(x,height);
    }
    ctx.stroke();

    // 6. 캔들 렌더링
    visibleCandles.forEach((c, i) => {
        // 오른쪽 정렬 X 좌표
        const x = width - ((visibleCandles.length - i) * candleFullWidth) - 60;
        
        // Y 좌표 변환
        const yOpen = chartHeight - ((c.open - minP) / priceRange) * chartHeight;
        const yClose = chartHeight - ((c.close - minP) / priceRange) * chartHeight;
        const yHigh = chartHeight - ((c.high - minP) / priceRange) * chartHeight;
        const yLow = chartHeight - ((c.low - minP) / priceRange) * chartHeight;

        const isUp = c.close >= c.open;
        const color = isUp ? CONFIG.upColor : CONFIG.downColor;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        // 거래량 (하단)
        const vH = (c.volume / maxV) * volHeight * 0.8;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x - CONFIG.candleWidth/2, height - vH, CONFIG.candleWidth, vH);
        ctx.globalAlpha = 1.0;

        // 캔들 꼬리
        ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow); ctx.stroke();

        // 캔들 몸통 (최소 높이 1px 보장)
        let bodyH = Math.abs(yClose - yOpen);
        if(bodyH < 1) bodyH = 1;
        ctx.fillRect(x - CONFIG.candleWidth/2, Math.min(yOpen, yClose), CONFIG.candleWidth, bodyH);
    });

    // 7. 현재가 라인
    const last = candles[candles.length-1];
    const yLast = chartHeight - ((last.close - minP) / priceRange) * chartHeight;
    ctx.strokeStyle = '#fff'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yLast); ctx.lineTo(width, yLast); ctx.stroke(); ctx.setLineDash([]);

    // 현재가 라벨
    ctx.fillStyle = last.close >= last.open ? CONFIG.upColor : CONFIG.downColor;
    ctx.fillRect(width - 70, yLast - 10, 70, 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial';
    ctx.fillText(last.close.toLocaleString('en-US', {minimumFractionDigits:2}), width - 65, yLast + 4);

    // 8. 십자선
    if(mouseX >= 0 && mouseY < height) {
        ctx.strokeStyle = '#888'; ctx.setLineDash([4, 4]);
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
    const change = raw.CHANGEPCT24HOUR;
    elPrice.innerText = fmtUSD(raw.PRICE);
    elChange.innerText = (change > 0 ? "+" : "") + change.toFixed(2) + "%";
    
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

// 시작 (기본값 1일봉)
fetchHistory('1d');
tickerInterval = setInterval(fetchTicker, 2000); // 2초마다 갱신