const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;

// ==================================================================
// 1. MARKET (Top 100 CoinGecko)
// ==================================================================
app.get("/api/market", async (req, res) => {
  try {
    const r = await axios.get(
      "https://api.coingecko.com/api/v3/coins/markets",
      {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 100,
          page: 1
        }
      }
    );

    res.json(r.data);
  } catch (err) {
    console.error("Market API error:", err.message);
    res.status(500).json({ error: "Market API failed" });
  }
});

// ==================================================================
// 2. OHLC for chart (CoinGecko)
// ==================================================================
app.get("/api/ohlc/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const r = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${id}/ohlc`,
      { params: { vs_currency: "usd", days: 7 } }
    );

    res.json(r.data);
  } catch (err) {
    console.error("OHLC error:", err.message);
    res.status(500).json({ error: "OHLC API failed" });
  }
});

// ==================================================================
// 3. Fear & Greed Index
// ==================================================================
app.get("/api/feargreed", async (req, res) => {
  try {
    const r = await axios.get("https://api.alternative.me/fng/?limit=1");
    res.json(r.data);
  } catch (err) {
    console.error("FearGreed error:", err.message);
    res.status(500).json({ error: "Fear & Greed API failed" });
  }
});

// ==================================================================
// 4. Whale Binance (Large Trades > $500k)
// ==================================================================
app.get("/api/whales/binance/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const r = await axios.get(
      "https://api.binance.com/api/v3/trades",
      { params: { symbol, limit: 1000 } }
    );

    const bigTrades = r.data
      .map(t => ({
        side: t.isBuyerMaker ? "SELL" : "BUY",
        price: Number(t.price),
        qty: Number(t.qty),
        notional: Number(t.price) * Number(t.qty),
        time: t.time
      }))
      .filter(t => t.notional >= 500000)
      .sort((a, b) => b.time - a.time)
      .slice(0, 50);

    res.json(bigTrades);

  } catch (err) {
    console.error("Binance Whale error:", err.message);
    res.status(500).json({ error: "Binance whale API failed" });
  }
});

// ==================================================================
// 5. Whale On-chain (Unified Etherscan API)
// ==================================================================
async function fetchWhale(chain, address, estimatedPrice, minUSD) {
  try {
    const r = await axios.get("https://api.etherscan.io/v2/api", {
      params: {
        module: "account",
        action: "txlist",
        address,
        chain,
        page: 1,
        offset: 50,
        sort: "desc",
        apikey: ETHERSCAN_KEY
      }
    });

    const txs = r.data?.result || [];

    return txs
      .map(tx => {
        const native = Number(tx.value) / 1e18;
        const usd = native * estimatedPrice;

        return {
          chain,
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value_native: native.toFixed(5),
          value_usd: usd,
          timestamp: Number(tx.timeStamp)
        };
      })
      .filter(t => t.value_usd >= minUSD);

  } catch (err) {
    console.error(`On-chain ${chain} error:`, err.message);
    return [];
  }
}

app.get("/api/whales/onchain", async (req, res) => {
  try {
    if (!ETHERSCAN_KEY)
      return res.status(400).json({ error: "Missing ETHERSCAN_API_KEY" });

    const ethWhales = await fetchWhale(
      "eth",
      "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae",
      2000,
      300000
    );

    const bscWhales = await fetchWhale(
      "bsc",
      "0x3f16C82cfFbAe3C5905E9d3f31c52a3DA2fdd7d1",
      300,
      200000
    );

    res.json({ eth: ethWhales, bsc: bscWhales });

  } catch (err) {
    console.error("On-chain API main error:", err.message);
    res.status(500).json({ error: "On-chain API failed" });
  }
});

// ==================================================================
// 6. ROOT ROUTE (BIAR TIDAK 'Cannot GET /')
// ==================================================================
app.get("/", (req, res) => {
  res.send("Crypto Screener Backend is Running");
});

// ==================================================================
// START SERVER – FIX PORT for ALL HOSTING
// ==================================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🔥 Crypto Screener Backend running on port", PORT);
});
