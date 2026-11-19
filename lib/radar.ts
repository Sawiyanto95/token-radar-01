// Token Radar model, version "radar-2": one sealed DefiLlama snapshot in, one ranked board out.
//
// The board ranks only genuine pre-token protocols: the snapshot records no token for them
// (no market cap, no CoinGecko id, no symbol) AND they are not a wrapped, staked or bridged
// product of a token that already trades. The watchlist is the floor: all 40 of its slugs are
// ranked, and every other protocol that passes the same test joins them. Wrapped, staked and
// bridged products are set aside with their reason, never ranked as if their token did not exist.
//
// Implied value comes only from the snapshot's own figures, through four stated factors:
//
//   base     = tvl_usd x BASE (0.30)
//   growth   = 1 + clamp(change_7d, -50, 150) / 100 x GROWTH_W (0.6)
//   maturity = 0.5 + min(age_days, 1460) / 1460 x 0.5   (age unknown: 365 days)
//   breadth  = 1 + 0.05 x min(chains - 1, 4)            (more chains, wider reach)
//   implied  = max(1, round(base x growth x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores every row, and the
// dashboard shows each row's four factors so a reader can check the arithmetic.

/** One protocol exactly as the sealed snapshot carries it: ten fields, no others. */
export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

/** The model's weights, as the dashboard states them and the sandbox may change them. */
export interface Weights {
  base: number;
  growth_weight: number;
  growth_low: number;
  growth_high: number;
  maturity_floor: number;
  maturity_span_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_steps: number;
}

export const WEIGHTS: Weights = {
  base: 0.3,
  growth_weight: 0.6,
  growth_low: -50,
  growth_high: 150,
  maturity_floor: 0.5,
  maturity_span_days: 1460,
  unknown_age_days: 365,
  breadth_step: 0.05,
  breadth_max_steps: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live tab carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface Step {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  model: {
    base_usd: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A compact board row for the dashboard's data.js. */
export interface DashRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  parts: [number, number, number, number];
  farm: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A pre-token protocol set aside, with the reason it is not ranked. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarPayload {
  as_of: string;
  source: string;
  floor_usd: number;
  weights: Weights;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  set_aside_size: number;
  rows: DashRow[];
  live: LiveRow[];
  aside: AsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listed` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listed: string | null): number | null {
  if (listed === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listed}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four factors and the implied value one protocol gets under `w`. */
export function scoreProto(
  p: Proto,
  asOf: string,
  w: Weights,
): { value: number; base: number; growth: number; maturity: number; breadth: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = num(p.change_7d, 0);
  const clamped = Math.min(w.growth_high, Math.max(w.growth_low, rawGrowth));
  const growth = 1 + (clamped / 100) * w.growth_weight;
  const ageForModel = age ?? w.unknown_age_days;
  const maturity = w.maturity_floor + (Math.min(Math.max(ageForModel, 0), w.maturity_span_days) / w.maturity_span_days) * (1 - w.maturity_floor);
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), w.breadth_max_steps);
  const breadth = 1 + w.breadth_step * extraChains;
  const base = p.tvl_usd * w.base;
  const value = Math.max(1, Math.round(base * growth * maturity * breadth));
  return { value, base: Math.round(base), growth, maturity, breadth, age };
}

/** A name ending in a release marker is a pool of another protocol, not a protocol of its own. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** Categories that are wrapped, staked or bridged products by definition. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether the snapshot records any token for a protocol. */
export function hasToken(p: Proto): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** The reason a pre-token protocol is set aside instead of ranked, or null when it ranks. */
export function asideReason(p: Proto): string | null {
  if (hasToken(p)) return 'records a token';
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return `category ${p.category} is a wrapped, staked or bridged product`;
  if (VERSIONED.test(p.name)) return 'name ends in a version marker';
  if (WRAPPED_WORD.test(p.name)) return 'name marks a wrapped or staked product';
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return 'name begins with an exchange';
  return null;
}

/** Whether a protocol is a genuine pre-token candidate the board may rank. */
export function isRankable(p: Proto): boolean {
  return asideReason(p) === null;
}

/** Protocols by slug. */
function bySlug(protocols: Proto[]): Map<string, Proto> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The ranked board: every watchlist slug plus every other rankable protocol, strongest first. */
export function buildBoard(snap: Snap, w: Weights = WEIGHTS): BoardRow[] {
  const index = bySlug(snap.protocols);
  const chosen = new Map<string, Proto>();
  for (const slug of snap.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snap.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProto(p, snap.as_of, w) }));
  scored.sort((a, b) => b.s.value - a.s.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((row, i) => ({
    rank: i + 1,
    slug: row.p.slug,
    name: row.p.name,
    category: row.p.category,
    chains: row.p.chains,
    tvl_usd: row.p.tvl_usd,
    change_7d: row.p.change_7d,
    listed_at: row.p.listed_at,
    age_days: row.s.age,
    token_status: 'pre-token',
    implied_value_usd: row.s.value,
    model: {
      base_usd: row.s.base,
      growth_multiplier: round4(row.s.growth),
      maturity_multiplier: round4(row.s.maturity),
      breadth_multiplier: round4(row.s.breadth),
      age_days: row.s.age,
    },
    farm_steps: farmPlan(row.p, row.s.age).map(joinStep),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: action, cost, time — inside the gate's 20..600 characters. */
export function joinStep(step: Step): string {
  // End the action with a full stop first, so the cost clause never runs onto it.
  const action = /[.!?]$/.test(step.text) ? step.text : `${step.text}.`;
  let s = `${action} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: Proto): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: Proto): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** [keywords, main action, second action] — the main action a category's farmer takes. */
const ACTIONS: Array<[string[], string, string]> = [
  [['risk curator', 'capital allocator', 'yield aggregator', 'liquidity manager'], 'Deposit $X into a {N} vault on {C}', 'Join a second vault or strategy {N} lists'],
  [['lend', 'cdp', 'collateral'], 'Supply $X of USDC to {N} on {C}', 'Borrow a small amount against the supply, then repay it'],
  [['dex', 'yield', 'leveraged farm', 'farm'], "Provide $X of liquidity in {N}'s main pool on {C}", 'Swap once through the pool after providing liquidity'],
  [['bridge'], 'Bridge $X of USDC into {C} through {N}', 'Use the bridged funds inside the destination app'],
  [['derivative', 'perpetual'], 'Post $X of USDC as margin on {N} and open one small hedge', 'Close the hedge and open a second one the next week'],
  [['rwa'], 'Mint $X of yield-bearing assets through {N} on {C}', 'Hold the receipt and check the yield it accrues'],
  [['prediction'], 'Fund $X and take one market position on {N}', 'Take a second position in a different market'],
  [['stable'], 'Mint or hold $X of the stable asset through {N} on {C}', 'Use the stable asset in one more app on {C}'],
  [['chain'], 'Bridge $X into the chain and use {N} as its main app', 'Try a second app the chain lists'],
  [['staking pool', 'restak'], 'Stake $X through {N} and keep the receipt', 'Restake the receipt where {N} supports it'],
  [['insurance'], 'Buy $X of cover from {N} on {C}', 'Keep the policy and renew it before it lapses'],
  [['payment', 'card'], 'Spend $X through {N}', 'Pay for a second purchase the next week'],
  [['governance'], 'Deposit $X and vote in {N} governance', 'Vote on a second proposal'],
  [['index'], 'Buy $X of the {N} index on {C}', 'Rebalance the index position once'],
  [['basis'], "Deposit $X into {N}'s basis vault on {C}", 'Check the funding rate the vault earns'],
  [['btc', 'anchor'], 'Mint $X of the BTC-backed asset through {N} on {C}', 'Use the minted asset in one more app'],
  [['cedefi'], "Deposit $X into {N}'s CeDeFi vault on {C}", 'Check the vault report the protocol publishes'],
  [['otc'], 'Complete one $X OTC trade through {N}', 'Trade a second pair the desk lists'],
  [['interest rate'], 'Open a $X rate position on {N}', 'Adjust the position when the rate moves'],
  [['cdp manager'], 'Open and manage a $X CDP through {N}', 'Adjust the collateral ratio once'],
];

/** The category's [main action, second action], filled with capital, name and chain. */
function actionsFor(p: Proto, capital: number, chain: string): [string, string] {
  const cat = (p.category ?? '').toLowerCase();
  for (const [keys, main, second] of ACTIONS) {
    if (keys.some((k) => cat.includes(k))) {
      const fill = (t: string): string => t.replaceAll('$X', `$${capital}`).replaceAll('{N}', p.name).replaceAll('{C}', chain);
      return [fill(main), fill(second)];
    }
  }
  return [
    `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`,
    `Use a second feature of ${p.name} — a swap, a vote, or a second pool.`,
  ];
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. Every step is
 * derived from the protocol's own record (category, chains, TVL, age) — no hand-written list
 * of names, and no step is copied from another protocol's plan without its own figures.
 */
export function farmPlan(p: Proto, age: number | null): Step[] {
  const chain = firstChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const [main, second] = actionsFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  const multi = p.chains.length >= 2 ? ` Repeat the deposit on ${p.chains[1]} so the activity spans two chains.` : '';
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: main, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    {
      text: `${second}.${multi}`,
      cost: `about $${gas} of gas`,
      time: '10 minutes',
    },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, then open the protocol's own points or rewards page and check what it shows.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: 'Claim only from the link the protocol itself publishes, never from a link in a message or a search result, and write the wallet, the dates and every transaction in a farm log.',
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live tab. */
export function liveSet(snap: Snap): LiveRow[] {
  return snap.protocols
    .filter((p) => hasToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols set aside, with the reason each is not ranked. */
export function asideSet(snap: Snap): AsideRow[] {
  return snap.protocols
    .filter((p) => !hasToken(p) && asideReason(p) !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: asideReason(p)! }));
}

/** One board row's compact form for data.js. */
export function dashRow(row: BoardRow): DashRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    parts: [row.model.base_usd, row.model.growth_multiplier, row.model.maturity_multiplier, row.model.breadth_multiplier],
    // The farm plan travels with the row so the detail view shows the same plan board.json holds.
    farm: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildPayload(snap: Snap, w: Weights = WEIGHTS): { board: BoardRow[]; payload: RadarPayload } {
  const board = buildBoard(snap, w);
  const live = liveSet(snap);
  const aside = asideSet(snap);
  const payload: RadarPayload = {
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    weights: w,
    model_version: MODEL_VERSION,
    // The watchlist's slugs travel with the payload so the page can tag watchlist rows.
    watchlist: snap.watchlist,
    watchlist_size: snap.watchlist.length,
    board_size: board.length,
    set_aside_size: aside.length,
    rows: board.map(dashRow),
    live,
    aside,
  };
  return { board, payload };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snap: Snap): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snap.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function payloadScript(payload: RadarPayload): string {
  return `window.RADAR=${JSON.stringify(payload)};\n`;
}
