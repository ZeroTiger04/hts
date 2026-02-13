new TradingView.widget({
  autosize: true,
  symbol: "BINANCE:BTCUSDT",
  interval: "D",
  timezone: "Asia/Seoul",
  theme: "dark",
  style: "1",
  locale: "kr",
  container_id: "tv_chart_container",
  hide_top_toolbar: false,

  studies: [
    {
      id: "Moving Average Exponential@tv-basicstudies",
      inputs: { length: 20 }
    },
    {
      id: "Relative Strength Index@tv-basicstudies",
      inputs: { length: 14 }
    }
  ]
});
