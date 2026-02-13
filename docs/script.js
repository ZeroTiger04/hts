/* ══════════════════════════════════════════════
   ZERO-DEPENDENCY CHART ENGINE
   (외부 라이브러리 없이 직접 캔들 그리기)
══════════════════════════════════════════════ */

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const elPrice = document.getElementById('price');
const elChange = document.getElementById('change');
const elInfo = document.getElementById('crosshairInfo');

// 상태 변수
let width, height;
let candles = [];
let candleWidth = 10;
let spacing = 4;
let offset = 0; // 스크롤용 (현재 미사용)
let lastPrice = 45000;

// 1. 초기 데이터 생성 (랜덤)
function initData() {
    let price = 45000;
    for (let i = 0; i < 200; i++) {
        let move = (Math.random() - 0.5) * 200;
        let open = price;
        let close = price + move;
        let high = Math.max(open, close) + Math.random() * 100;
        let low = Math.min(open, close) - Math.random() * 100;
        
        candles.push({ open, close, high, low, time: i });
        price = close;
    }
    lastPrice = price;
    updateUI();
}

// 2. 차트 그리기 (핵심 엔진)
function draw() {
    // 캔버스 크기 맞춤
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // 배경 클리어
    ctx.fillStyle = "#0b0e11";
    ctx.fillRect(0, 0, width, height);

    // 격자 그리기
    ctx.strokeStyle = "#252930";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let y=0; y<height; y+=50) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();

    // 표시할 캔들 범위 계산
    // 화면 오른쪽 끝에서부터 그리기
    const maxVisible = Math.ceil(width / (candleWidth + spacing));
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visibleCandles = candles.slice(startIdx);

    // Y축 스케일 계산 (보이는 캔들 중 최고가/최저가)
    let minP = Infinity, maxP = -Infinity;
    visibleCandles.forEach(c => {
        if(c.low < minP) minP = c.low;
        if(c.high > maxP) maxP = c.high;
    });
    const padding = (maxP - minP) * 0.1; // 위아래 여백 10%
    minP -= padding; maxP += padding;
    const priceRange = maxP - minP;

    // 캔들 그리기
    visibleCandles.forEach((c, i) => {
        const x = width - ((visibleCandles.length - i) * (candleWidth + spacing)) - 20; // 오른쪽 정렬
        
        // Y좌표 변환 공식
        const yOpen = height - ((c.open - minP) / priceRange) * height;
        const yClose = height - ((c.close - minP) / priceRange) * height;
        const yHigh = height - ((c.high - minP) / priceRange) * height;
        const yLow = height - ((c.low - minP) / priceRange) * height;

        const isUp = c.close >= c.open;
        ctx.fillStyle = isUp ? "#0ecb81" : "#f6465d";
        ctx.strokeStyle = isUp ? "#0ecb81" : "#f6465d";

        // 꼬리 (Line)
        ctx.beginPath();
        ctx.moveTo(x + candleWidth/2, yHigh);
        ctx.lineTo(x + candleWidth/2, yLow);
        ctx.stroke();

        // 몸통 (Rect)
        // close와 open의 차이가 0이면 최소 1픽셀 보장
        let bodyHeight = Math.abs(yClose - yOpen);
        if(bodyHeight < 1) bodyHeight = 1;
        
        ctx.fillRect(x, Math.min(yOpen, yClose), candleWidth, bodyHeight);
    });

    // 현재가 선 그리기
    const last = candles[candles.length-1];
    const yLast = height - ((last.close - minP) / priceRange) * height;
    ctx.strokeStyle = "#eaecef";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, yLast);
    ctx.lineTo(width, yLast);
    ctx.stroke();
    ctx.setLineDash([]);
}

// 3. 데이터 시뮬레이션 (실시간 움직임)
function simulate() {
    let last = candles[candles.length - 1];
    let change = (Math.random() - 0.5) * 50; // 가격 변동폭
    
    // 현재 캔들 업데이트
    last.close += change;
    if(last.close > last.high) last.high = last.close;
    if(last.close < last.low) last.low = last.close;
    
    // 1% 확률로 새 캔들 생성
    if(Math.random() < 0.05) {
        let newOpen = last.close;
        candles.push({ 
            open: newOpen, close: newOpen, 
            high: newOpen, low: newOpen, time: last.time + 1 
        });
        // 메모리 관리를 위해 너무 많으면 앞부분 삭제
        if(candles.length > 300) candles.shift();
    }
    
    updateUI();
    draw(); // 다시 그리기
}

function updateUI() {
    const last = candles[candles.length - 1];
    const prevClose = candles[0].open; // 시작점 기준 (임시)
    
    // 가격 표시
    elPrice.innerText = last.close.toLocaleString(undefined, {minimumFractionDigits: 2});
    
    // 변동률 표시
    const pct = ((last.close - 45000) / 45000) * 100;
    elChange.innerText = (pct > 0 ? "+" : "") + pct.toFixed(2) + "%";
    
    // 색상 변경
    const colorClass = pct >= 0 ? 'up-text' : 'down-text';
    elPrice.className = `value ${colorClass}`;
    elChange.className = `value ${colorClass}`;
}

// 4. 실행 및 이벤트
window.addEventListener('resize', draw);

// 시작
initData();
draw();
setInterval(simulate, 100); // 0.1초마다 움직임 (부드럽게)