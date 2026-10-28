import fs from 'fs/promises';
import path from 'path';
import { scanProducts } from '../state/scanner.js';

export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

export interface DatasetRow {
  timestamp: string;
  symbol: string;
  source: 'decision' | 'rejection' | 'live';
  action: 'long' | 'short' | 'skip' | 'neutral';
  setup_quality: number;
  worth_trading: number;
  toxicity: number;
  prediction_confidence: number;
  expected_return_bps: number;
  spread_bps: number;
  signal_strength: number;
  entry_price: number;
  stop_price: number;
  take_profit_1: number;
  take_profit_2: number;
  historical_context: {
    ret_1m: number;
    ret_5m: number;
    ret_15m: number;
    realized_vol_1m: number;
    realized_vol_5m: number;
    volume_ratio_24h: number;
  };
}

function readNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function phiTargets(entry: number, volatility: number, direction: 'long' | 'short' | 'skip' | 'neutral'): { stop: number; tp1: number; tp2: number } {
  const vol = Math.max(0.0005, Math.min(volatility, 0.2));
  const directionFactor = direction === 'short' ? -1 : 1;
  const stopOffset = entry * vol * 0.618;
  const tp1Offset = entry * vol * 0.382;
  const tp2Offset = entry * vol * 1.618;

  if (direction === 'skip' || direction === 'neutral') {
    return { stop: entry, tp1: entry, tp2: entry };
  }

  return {
    stop: entry * (1 - directionFactor * (stopOffset / entry)),
    tp1: entry * (1 + directionFactor * (tp1Offset / entry)),
    tp2: entry * (1 + directionFactor * (tp2Offset / entry)),
  };
}

async function readJsonl(filePath: string): Promise<any[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

async function loadDecisionRows(logDir: string): Promise<any[]> {
  const files = await fs.readdir(logDir);
  const decisionFiles = files.filter(name => name.startsWith('decisions-') && name.endsWith('.jsonl'));
  const rows: any[] = [];
  for (const file of decisionFiles) {
    const filePath = path.join(logDir, file);
    rows.push(...(await readJsonl(filePath)));
  }
  return rows;
}

async function loadRejectionRows(logDir: string): Promise<any[]> {
  const files = await fs.readdir(logDir);
  const rejectFiles = files.filter(name => name.startsWith('rejections-') && name.endsWith('.jsonl'));
  const rows: any[] = [];
  for (const file of rejectFiles) {
    const filePath = path.join(logDir, file);
    rows.push(...(await readJsonl(filePath)));
  }
  return rows;
}

async function enrichWithLiveData(symbols: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!symbols.length) return map;

  for (const symbol of symbols) {
    try {
      const results = await scanProducts([symbol], 'short_term');
      const snap = results[0];
      if (snap) map.set(symbol, snap);
    } catch {
      // skip symbols that fail live fetches
    }
  }

  return map;
}

export async function buildTradingDataset(logDir = path.join(process.cwd(), 'logs')): Promise<DatasetRow[]> {
  const decisions = await loadDecisionRows(logDir);
  const rejections = await loadRejectionRows(logDir);
  const allSymbols = new Set<string>();

  for (const entry of decisions) {
    const symbol = entry?.snapshot?.symbol;
    if (symbol) allSymbols.add(String(symbol));
  }
  for (const entry of rejections) {
    if (entry?.symbol) allSymbols.add(String(entry.symbol));
  }

  const liveMap = await enrichWithLiveData([...allSymbols]);
  const dataset: DatasetRow[] = [];

  for (const entry of decisions) {
    const snapshot = entry.snapshot ?? {};
    const symbol = String(snapshot.symbol ?? 'UNKNOWN');
    const live = liveMap.get(symbol) ?? {};
    const action = entry.policyDecision?.action === 'long' ? 'long' : entry.policyDecision?.action === 'short' ? 'short' : 'skip';
    const setupQuality = readNumber(entry.answers?.setup_quality?.noul ?? entry.answers?.setup_quality?.score ?? 0, 0);
    const worthTrading = readNumber(entry.answers?.worth_trading?.noul ?? entry.answers?.worth_trading?.score ?? 0, 0);
    const toxicity = readNumber(entry.answers?.toxicity?.noul ?? entry.answers?.toxicity?.score ?? 0, 0);
    const spreadBps = readNumber(live.spread_bps ?? snapshot.spread_bps ?? 0, 0);
    const expectedReturnBps = readNumber(live.expected_return_bps ?? snapshot.expected_return_bps ?? 0, 0);
    const predictionConfidence = readNumber(live.prediction_confidence ?? entry.answers?.confidence?.noul ?? 0, 0);
    const vol = readNumber(live.realized_vol_5m ?? snapshot.realized_vol_5m ?? snapshot.realized_vol_1m ?? 0.01, 0.01);
    const entryPrice = readNumber(live.mid ?? snapshot.mid ?? 0, 0);
    const signalStrength = clamp((expectedReturnBps / 1000) + predictionConfidence - (toxicity * 0.5), 0, 10);
    const golden = phiTargets(entryPrice, vol, action);

    dataset.push({
      timestamp: String(entry.timestamp ?? new Date().toISOString()),
      symbol,
      source: 'decision',
      action,
      setup_quality: setupQuality,
      worth_trading: worthTrading,
      toxicity,
      prediction_confidence: predictionConfidence,
      expected_return_bps: expectedReturnBps,
      spread_bps: spreadBps,
      signal_strength: signalStrength,
      entry_price: entryPrice,
      stop_price: golden.stop,
      take_profit_1: golden.tp1,
      take_profit_2: golden.tp2,
      historical_context: {
        ret_1m: readNumber(live.ret_1m ?? snapshot.ret_1m ?? 0, 0),
        ret_5m: readNumber(live.ret_5m ?? snapshot.ret_5m ?? 0, 0),
        ret_15m: readNumber(live.ret_15m ?? snapshot.ret_15m ?? 0, 0),
        realized_vol_1m: readNumber(live.realized_vol_1m ?? snapshot.realized_vol_1m ?? 0, 0),
        realized_vol_5m: readNumber(live.realized_vol_5m ?? snapshot.realized_vol_5m ?? 0, 0),
        volume_ratio_24h: readNumber(live.volume_ratio_24h ?? snapshot.volume_ratio_24h ?? 1, 1),
      },
    });
  }

  for (const entry of rejections) {
    const symbol = String(entry.symbol ?? entry.snapshot?.symbol ?? 'UNKNOWN');
    const live = liveMap.get(symbol) ?? {};
    const toxicity = readNumber(entry.toxicity ?? entry.reason?.match(/toxicity\s+([0-9.]+)/i)?.[1] ?? 0, 0);
    const setupQuality = readNumber(entry.setup_quality ?? 0, 0);
    const signalStrength = clamp((readNumber(live.expected_return_bps ?? 0, 0) / 1000) - (toxicity * 0.5), 0, 10);
    const basis = readNumber(live.mid ?? entry.mid ?? 0, 0);
    const golden = phiTargets(basis, readNumber(live.realized_vol_5m ?? 0.01, 0.01), 'neutral');

    dataset.push({
      timestamp: String(entry.timestamp ?? new Date().toISOString()),
      symbol,
      source: 'rejection',
      action: 'skip',
      setup_quality: setupQuality,
      worth_trading: 0,
      toxicity,
      prediction_confidence: 0,
      expected_return_bps: readNumber(live.expected_return_bps ?? 0, 0),
      spread_bps: readNumber(live.spread_bps ?? 0, 0),
      signal_strength: signalStrength,
      entry_price: basis,
      stop_price: golden.stop,
      take_profit_1: golden.tp1,
      take_profit_2: golden.tp2,
      historical_context: {
        ret_1m: readNumber(live.ret_1m ?? 0, 0),
        ret_5m: readNumber(live.ret_5m ?? 0, 0),
        ret_15m: readNumber(live.ret_15m ?? 0, 0),
        realized_vol_1m: readNumber(live.realized_vol_1m ?? 0, 0),
        realized_vol_5m: readNumber(live.realized_vol_5m ?? 0, 0),
        volume_ratio_24h: readNumber(live.volume_ratio_24h ?? 1, 1),
      },
    });
  }

  return dataset.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function writeDatasetToFile(outputPath = path.join(process.cwd(), 'logs', 'market-dataset.jsonl')): Promise<DatasetRow[]> {
  const dataset = await buildTradingDataset(path.join(process.cwd(), 'logs'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, dataset.map(row => JSON.stringify(row)).join('\n') + (dataset.length ? '\n' : ''));
  return dataset;
}

async function main() {
  const dataset = await writeDatasetToFile();
  console.log(`Built ${dataset.length} trading dataset rows.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

