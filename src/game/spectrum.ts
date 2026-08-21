import { SPECTRUM_BANDS, blocksOf } from './constants';
import { rand, randInt, uid, type Rng } from './rng';
import type { Auction, AuctionBid, BandId, GameState } from './types';

// Sealed-bid auctions: one number each, highest wins, results when the lot closes.

export function bandsAvailable(done: string[]): BandId[] {
  return (Object.keys(SPECTRUM_BANDS) as BandId[]).filter((b) => {
    const req = SPECTRUM_BANDS[b].requires;
    return !req || done.includes(req);
  });
}

export function createAuction(state: GameState, rng: Rng): Auction | null {
  const bands = bandsAvailable(state.researchDone);
  if (!bands.length) return null;
  const band = bands[Math.floor(rng() * bands.length)];
  const spec = SPECTRUM_BANDS[band];
  const blocks = randInt(rng, 1, 3);
  const reserve = Math.round((spec.blockValue * blocks * rand(rng, 0.55, 0.8)) / 1000) * 1000;

  return {
    id: uid('auc'),
    band,
    blocks,
    reserve,
    closesAt: state.minutes + 1440 * randInt(rng, 3, 5),
    playerBid: null,
    result: null,
  };
}

// What a rival is willing to pay for the lot.
function rivalBid(state: GameState, auction: Auction, aggression: number, rng: Rng) {
  const spec = SPECTRUM_BANDS[auction.band];
  const base = spec.blockValue * auction.blocks;
  const hunger = 0.7 + aggression * 0.5;
  const noise = rand(rng, 0.75, 1.35);
  // Rivals get richer as the market matures.
  const scale = 0.85 + Math.min(1.4, state.minutes / (1440 * 240));
  return Math.round((base * hunger * noise * scale) / 1000) * 1000;
}

export function settleAuction(state: GameState, auction: Auction, rng: Rng): Auction {
  // A rival that cannot justify the reserve simply sits the lot out.
  const bids: AuctionBid[] = [];
  for (const c of state.competitors) {
    const willingness = rivalBid(state, auction, c.aggression, rng);
    const amount = Math.min(willingness, Math.floor(Math.max(0, c.cash) / 1000) * 1000);
    if (amount >= auction.reserve) bids.push({ bidderId: c.id, bidderName: c.name, amount });
  }

  if (auction.playerBid !== null && auction.playerBid >= auction.reserve) {
    bids.push({ bidderId: 'player', bidderName: state.companyName, amount: auction.playerBid });
  }

  bids.sort((a, b) => b.amount - a.amount);

  if (!bids.length) {
    return {
      ...auction,
      result: { winnerId: 'none', winnerName: 'Nobody', price: 0, bids: [] },
    };
  }

  const winner = bids[0];
  return {
    ...auction,
    result: { winnerId: winner.bidderId, winnerName: winner.bidderName, price: winner.amount, bids },
  };
}

export function spectrumSummary(state: GameState) {
  const held = (Object.keys(SPECTRUM_BANDS) as BandId[])
    .map((b) => ({ band: b, blocks: blocksOf(state, b) }))
    .filter((h) => h.blocks > 0);
  return held;
}
