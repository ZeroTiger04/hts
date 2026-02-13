/* ══════════════════════════════════════════════
   ZERO-DEPENDENCY PRO CHART ENGINE
   (TradingView 스타일 렌더링 + 마우스 인터랙션)
══════════════════════════════════════════════ */

const canvas = document.getElementById('chartCanvas');
const ctx = canvas.getContext('2d');
const elPrice = document.getElementById('price');
const elChange = document.getElementById('change');
const elInfo = document.getElementById('crosshairInfo');

// 차트 설정
const CONFIG = {
    upColor: '#0ecb81',
    downColor: '#f6465d',
    bgColor: '#0b0e11',
    gridColor: '#1e2329',
    crosshairColor: '#ffffff',
    textColor: '#848e9c',
    candleWidth: 8,
    spacing: 4
};

// 데이터 변수
let candles = [];
let width, height;
let mouseX = -1, mouseY = -1;
let lastPrice = 65000;

/* ────────────────────────────────────────────────
   1. 데이터 생성 (가짜 데이터지만 리얼하게)
──────────────────────────────────────────────── */
function initData() {
    let price = 65000;
    for (let i = 0; i < 150; i++) {
        let move = (Math.random() - 0.5) * 300;
        let open = price;
        let close = price + move;
        let high = Math.max(open, close) + Math.random() * 150;
        let low = Math.min(open, close) - Math.random() * 150;
        let volume = Math.random() * 1000 + 500;
        
        candles.push({ open, close, high, low, volume, time: i });
        price = close;
    }
    updateUI();
}

/* ────────────────────────────────────────────────
   2. 차트 그리기 엔진 (매 프레임 호출)
──────────────────────────────────────────────── */
function draw() {
    // 1. 캔버스 크기 맞춤 (레티나 디스플레이 대응 생략하고 단순화)
    width = canvas.parentElement.clientWidth;
    height = canvas.parentElement.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // 2. 배경 초기화
    ctx.fillStyle = CONFIG.bgColor;
    ctx.fillRect(0, 0, width, height);

    // 3. 차트 영역 계산 (가격 영역: 상단 80%, 거래량: 하단 20%)
    const chartHeight = height * 0.8;
    const volHeight = height * 0.2;
    const volY = chartHeight;

    // 4. 보이는 캔들 계산
    const candleFullWidth = CONFIG.candleWidth + CONFIG.spacing;
    const maxVisible = Math.ceil(width / candleFullWidth);
    const startIdx = Math.max(0, candles.length - maxVisible);
    const visibleCandles = candles.slice(startIdx);

    // 5. Min/Max 계산 (스케일링용)
    let minP = Infinity, maxP = -Infinity;
    let maxV = 0;
    visibleCandles.forEach(c => {
        if(c.low < minP) minP = c.low;
        if(c.high > maxP) maxP = c.high;
        if(c.volume > maxV) maxV = c.volume;
    });
    // 여백 추가
    const padding = (maxP - minP) * 0.1;
    minP -= padding; maxP += padding;
    const priceRange = maxP - minP;

    // 6. 그리드 그리기
    ctx.strokeStyle = CONFIG.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // 가로선 4개
    for(let i=1; i<=4; i++) {
        let y = (chartHeight / 4) * i;
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    // 세로선 (대략적)
    for(let i=1; i<=6; i++) {
        let x = (width / 6) * i;
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    ctx.stroke();

    // 7. 캔들 & 거래량 그리기
    visibleCandles.forEach((c, i) => {
        // X 좌표 (오른쪽 정렬)
        const x = width - ((visibleCandles.length - i) * candleFullWidth) - 50; 
        
        // Y 좌표 변환 (가격)
        const yOpen = chartHeight - ((c.open - minP) / priceRange) * chartHeight;
        const yClose = chartHeight - ((c.close - minP) / priceRange) * chartHeight;
        const yHigh = chartHeight - ((c.high - minP) / priceRange) * chartHeight;
        const yLow = chartHeight - ((c.low - minP) / priceRange) * chartHeight;

        // 색상 결정
        const isUp = c.close >= c.open;
        const color = isUp ? CONFIG.upColor : CONFIG.downColor;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        // [거래량 바]
        const vH = (c.volume / maxV) * volHeight * 0.8;
        ctx.globalAlpha = 0.3; // 투명도
        ctx.fillRect(x - CONFIG.candleWidth/2, height - vH, CONFIG.candleWidth, vH);
        ctx.globalAlpha = 1.0;

        // [캔들 꼬리]
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // [캔들 몸통]
        let bodyH = Math.abs(yClose - yOpen);
        if(bodyH < 1) bodyH = 1;
        ctx.fillRect(x - CONFIG.candleWidth/2, Math.min(yOpen, yClose), CONFIG.candleWidth, bodyH);
    });

    // 8. 현재가 라인 (점선)
    const last = candles[candles.length-1];
    const yLast = chartHeight - ((last.close - minP) / priceRange) * chartHeight;
    
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yLast);
    ctx.lineTo(width, yLast);
    ctx.stroke();
    ctx.setLineDash([]);

    // 현재가 라벨 (오른쪽 끝)
    ctx.fillStyle = last.close >= last.open ? CONFIG.upColor : CONFIG.downColor;
    ctx.fillRect(width - 60, yLast - 10, 60, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.fillText(last.close.toFixed(2), width - 55, yLast + 4);

    // 9. 십자선 (마우스 오버 시)
    if(mouseX >= 0 && mouseY >= 0) {
        ctx.strokeStyle = '#999';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;

        // 세로선
        ctx.beginPath();
        ctx.moveTo(mouseX, 0); ctx.lineTo(mouseX, height);
        ctx.stroke();
        // 가로선
        ctx.beginPath();
        ctx.moveTo(0, mouseY); ctx.lineTo(width, mouseY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 정보창 (Crosshair Info) 업데이트
        // 마우스 X 위치에 해당하는 캔들 찾기
        // (정확한 매핑은 복잡하므로 여기선 시각적 효과만)
        elInfo.style.display = 'block';
        elInfo.style.left = mouseX + 15 + 'px';
        elInfo.style.top = mouseY + 15 + 'px';
        
        // 가격 역산
        const hoverPrice = minP + ((chartHeight - mouseY) / chartHeight) * priceRange;
        elInfo.innerText = `Price: ${hoverPrice.toFixed(2)}`;
    } else {
        elInfo.style.display = 'none';
    }
}

/* ────────────────────────────────────────────────
   3. 시뮬레이션 및 UI
──────────────────────────────────────────────── */
function updateUI() {
    const last = candles[candles.length - 1];
    const startPrice = 65000;
    const pct = ((last.close - startPrice) / startPrice) * 100;
    
    elPrice.innerText = last.close.toLocaleString(undefined, {minimumFractionDigits: 2});
    elChange.innerText = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
    
    const colorClass = pct >= 0 ? 'up-text' : 'down-text';
    elPrice.className = `value ${colorClass}`;
    elChange.className = `value ${colorClass}`;
}

function simulate() {
    let last = candles[candles.length - 1];
    let change = (Math.random() - 0.5) * 100; // 변동폭
    
    // 현재 캔들 갱신
    last.close += change;
    if(last.close > last.high) last.high = last.close;
    if(last.close < last.low) last.low = last.close;
    last.volume += Math.random() * 10;

    // 새 캔들 생성 (5% 확률)
    if(Math.random() < 0.05) {
        let open = last.close;
        candles.push({ open, close: open, high: open, low: open, volume: 0, time: last.time + 1 });
        if(candles.length > 200) candles.shift();
    }
    
    updateUI();
    draw();
}

// 이벤트 리스너
window.addEventListener('resize', draw);
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});
canvas.addEventListener('mouseleave', () => {
    mouseX = -1; mouseY = -1;
});

// 실행
initData();
draw();
setInterval(simulate, 100); // 0.1초마다 움직임