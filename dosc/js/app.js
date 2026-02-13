const chartContainer = document.getElementById("chart");
const rsiContainer = document.getElementById("rsi");

// 메인 차트
const chart = LightweightCharts.createChart(chartContainer, {
  layout: {
    background: { color: "#060810" },
    textColor: "#d1d4dc"
  },
  grid: {
    vertLines: { color: "#1f2330" },
    horzLines: { color: "#1f2330" }
  },
  timeScale: {
    borderColor: "#2a2e39"
  },
  rightPriceScale: {
    borderColor: "#2a2e39"
  }
});

const candleSeries = chart.addCandlestickSeries({
  upColor: "#00e87a",
  downColor: "#ff3a5c",
  borderUpColor: "#00e87a",
  borderDownColor: "#ff3a5c",
  wickUpColor: "#00e87a",
  wickDownColor: "#ff3a5c"
});

// RSI 차트
const rsiChart = LightweightCharts.createChart(rsiContainer, {
  layout: {
    background: { color: "#060810" },
    textColor: "#d1d4dc"
  },
  grid: {
    vertLines: { color: "#1f2330" },
    horzLines: { color: "#1f2330" }
  },
  rightPriceScale: {
    borderColor: "#2a2e39"
  }
});

const rsiSeries = rsiChart.addLineSeries({
  color: "#c8a84b",
  lineWidth: 2
});

// Binance 데이터 로드
async function loadData() {
  const res = await fetch(
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500"
  );
  const data = await res.json();

  const candles = data.map(d => ({
    time: d[0] / 1000,
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4])
  }));

  candleSeries.setData(candles);

  const rsiData = calculateRSI(candles.map(c => c.close), 14)
    .map((value, i) => ({
      time: candles[i].time,
      value
    }));

  rsiSeries.setData(rsiData);
}

// RSI 계산 함수
function calculateRSI(closes, period) {
  let gains = [];
  let losses = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let rsi = [];

  for (let i = period; i < gains.length; i++) {
    const avgGain =
      gains.slice(i - period, i).reduce((a, b) => a + b) / period;
    const avgLoss =
      losses.slice(i - period, i).reduce((a, b) => a + b) / period;

    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return new Array(period).fill(null).concat(rsi);
}

loadData();
