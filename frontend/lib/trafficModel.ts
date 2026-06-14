// ── Traffic-signal controllers + lightweight intersection sim ───────────────
//
// THREE controllers share one simulation engine so they can be compared on the
// SAME traffic:
//
//   • "rl"       — an actual ML model: tabular Q-learning (reinforcement
//                  learning). It observes the discretised junction state and
//                  learns, online, when to hold vs switch the green to maximise
//                  cleared vehicles while minimising waiting. No labels, no
//                  backend — it improves from its own reward signal as it runs.
//   • "adaptive" — a max-pressure heuristic (serves the busiest phase). A strong
//                  hand-coded baseline.
//   • "fixed"    — a dumb fixed-time signal (equal green regardless of demand).
//
// The simulation is dataset-driven today (see trafficData.ts). The SAME engine is
// built to ingest live per-approach vehicle counts from CCTV later — just pass
// real arrivals into tick().

import type { Dir } from "./trafficData";

const DIRS: Dir[] = ["N", "E", "S", "W"];

export type Phase = "NS" | "EW";
export type Mode = "rl" | "adaptive" | "fixed";

// id gives each car a stable identity → stable colour + smooth interpolation.
export interface CrossingCar { dir: Dir; t: number; id: number }

export interface RLStats {
  epsilon: number;   // current exploration rate (decays as it learns)
  states: number;    // distinct states discovered (Q-table size)
  updates: number;   // total Q-learning updates applied
  confidence: number; // 0-1, = 1 - epsilon (how much it now exploits its policy)
}

export interface SimSnapshot {
  queues: Record<Dir, number>;
  phase: Phase;
  amber: boolean;
  arrived: number;
  cleared: number;
  avgWaitSec: number;
  maxQueue: number;
  throughputPerMin: number;
  rl?: RLStats; // present only for the RL controller
}

export interface SimParams {
  satRate: number;    // vehicles/sec released per green approach (saturation flow)
  minGreen: number;   // sec
  maxGreen: number;   // sec
  amberTime: number;  // sec all-red clearance between phases
  fixedGreen: number; // sec green per phase for the fixed-time controller
  switchBias: number; // adaptive: switch when other pressure > current * (1 + bias)
  queueCap: number;   // max vehicles held per approach (gridlock bound; excess diverts)
}

export const DEFAULT_PARAMS: SimParams = {
  satRate: 0.9,
  minGreen: 6,
  maxGreen: 55,
  amberTime: 2,
  fixedGreen: 22,
  switchBias: 0.25,
  queueCap: 800,
};

// ── Q-learning agent ────────────────────────────────────────────────────────
// State  : `${phase}|${curBucket}|${othBucket}|${elapsedBucket}` (compact, discrete)
// Action : 0 = keep current green, 1 = switch phase
// Reward : (vehicles cleared this interval) − 0.4 × (vehicles still waiting)
// Update : Q(s,a) ← Q(s,a) + α[r + γ·maxₐ′Q(s′,a′) − Q(s,a)]   (off-policy TD)
export class QAgent {
  q = new Map<string, [number, number]>();
  alpha = 0.15;          // learning rate
  gamma = 0.92;          // discount
  epsilon = 0.4;         // exploration (decays)
  epsilonMin = 0.02;
  epsilonDecay = 0.9994;
  updates = 0;
  prevKey: string | null = null;
  prevAction = 0;

  private cell(key: string): [number, number] {
    let v = this.q.get(key);
    if (!v) { v = [0, 0]; this.q.set(key, v); }
    return v;
  }

  /** ε-greedy action choice with action masking (some actions are illegal). */
  act(key: string, allowKeep: boolean, allowSwitch: boolean): number {
    if (!allowSwitch) return 0;
    if (!allowKeep) return 1;
    if (Math.random() < this.epsilon) return Math.random() < 0.5 ? 0 : 1;
    const v = this.cell(key);
    return v[1] > v[0] ? 1 : 0;
  }

  /** TD-update the previously chosen (state, action) using observed reward. */
  learn(reward: number, nextKey: string) {
    if (this.prevKey === null) return;
    const prev = this.cell(this.prevKey);
    const next = this.cell(nextKey);
    const maxNext = Math.max(next[0], next[1]);
    prev[this.prevAction] += this.alpha * (reward + this.gamma * maxNext - prev[this.prevAction]);
    this.updates++;
    if (this.epsilon > this.epsilonMin) this.epsilon *= this.epsilonDecay;
  }

  stats(): RLStats {
    return {
      epsilon: this.epsilon,
      states: this.q.size,
      updates: this.updates,
      confidence: Math.max(0, Math.min(1, 1 - this.epsilon)),
    };
  }
}

export class TrafficSim {
  mode: Mode;
  params: SimParams;
  queues: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 };
  phase: Phase = "NS";
  amber = false;
  phaseElapsed = 0;
  amberElapsed = 0;
  crossing: CrossingCar[] = [];
  arrived = 0;
  cleared = 0;
  maxQueue = 0;
  agent?: QAgent;

  private rel: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 };
  private vehSeconds = 0; // cumulative queue-seconds, for average wait
  private elapsed = 0;
  private carSeq = 0;       // stable ids for crossing cars
  private clearedAcc = 0;   // vehicles cleared since the RL agent's last decision

  constructor(mode: Mode, params: SimParams = DEFAULT_PARAMS) {
    this.mode = mode;
    this.params = params;
    if (mode === "rl") this.agent = new QAgent();
  }

  reset() {
    this.queues = { N: 0, E: 0, S: 0, W: 0 };
    this.rel = { N: 0, E: 0, S: 0, W: 0 };
    this.phase = "NS";
    this.amber = false;
    this.phaseElapsed = 0;
    this.amberElapsed = 0;
    this.crossing = [];
    this.arrived = 0;
    this.cleared = 0;
    this.maxQueue = 0;
    this.vehSeconds = 0;
    this.elapsed = 0;
    this.clearedAcc = 0;
    // Keep the learned Q-table across scenario resets (the model stays trained),
    // but forget the dangling transition so we don't learn across the gap.
    if (this.agent) this.agent.prevKey = null;
  }

  private pressure(p: Phase): number {
    return p === "NS" ? this.queues.N + this.queues.S : this.queues.E + this.queues.W;
  }
  greenDirs(): Dir[] {
    if (this.amber) return [];
    return this.phase === "NS" ? ["N", "S"] : ["E", "W"];
  }

  private bucket(n: number): number {
    return n === 0 ? 0 : n <= 3 ? 1 : n <= 8 ? 2 : n <= 16 ? 3 : 4;
  }
  private rlState(): string {
    const cur = this.pressure(this.phase);
    const oth = this.pressure(this.phase === "NS" ? "EW" : "NS");
    const e = this.phaseElapsed < this.params.minGreen ? 0
      : this.phaseElapsed < this.params.fixedGreen ? 1
        : this.phaseElapsed < this.params.maxGreen ? 2 : 3;
    return `${this.phase}|${this.bucket(cur)}|${this.bucket(oth)}|${e}`;
  }

  private decide() {
    const p = this.params;

    // ── RL controller: learn from the last decision, then choose the next ──
    if (this.mode === "rl" && this.agent) {
      const total = this.queues.N + this.queues.E + this.queues.S + this.queues.W;
      const reward = this.clearedAcc - 0.4 * total; // throughput − congestion
      this.clearedAcc = 0;
      const key = this.rlState();
      this.agent.learn(reward, key);

      const allowKeep = this.phaseElapsed < p.maxGreen;   // fairness cap
      const allowSwitch = this.phaseElapsed >= p.minGreen; // safety minimum green
      const action = this.agent.act(key, allowKeep || !allowSwitch, allowSwitch);
      this.agent.prevKey = key;
      this.agent.prevAction = action;
      if (action === 1) { this.amber = true; this.amberElapsed = 0; }
      return;
    }

    // ── Heuristic controllers (max-pressure / fixed-time) ──
    if (this.phaseElapsed < p.minGreen) return; // safety minimum green
    const cur = this.pressure(this.phase);
    const other: Phase = this.phase === "NS" ? "EW" : "NS";
    const oth = this.pressure(other);
    let wantSwitch = false;
    if (this.phaseElapsed >= p.maxGreen) wantSwitch = true;
    else if (this.mode === "fixed") wantSwitch = this.phaseElapsed >= p.fixedGreen;
    else if (cur <= 0 && oth > 0) wantSwitch = true; // current direction is empty
    else if (oth > cur * (1 + p.switchBias) && oth > 2) wantSwitch = true; // other dominates
    if (wantSwitch) { this.amber = true; this.amberElapsed = 0; }
  }

  /** Advance the simulation by dt seconds. `arrivals` = integer vehicles to add
   *  per approach this step (share the same arrivals across sims for fair compare). */
  tick(dt: number, arrivals: Record<Dir, number>) {
    this.elapsed += dt;

    for (const d of DIRS) {
      // admit arrivals up to the gridlock cap; excess "diverts" (keeps numbers bounded)
      const add = Math.min(arrivals[d], Math.max(0, this.params.queueCap - this.queues[d]));
      this.queues[d] += add;
      this.arrived += add;
    }

    if (this.amber) {
      this.amberElapsed += dt;
      if (this.amberElapsed >= this.params.amberTime) {
        this.phase = this.phase === "NS" ? "EW" : "NS";
        this.amber = false;
        this.phaseElapsed = 0;
      }
    } else {
      this.phaseElapsed += dt;
      this.decide();
    }

    for (const d of this.greenDirs()) {
      this.rel[d] += this.params.satRate * dt;
      while (this.rel[d] >= 1 && this.queues[d] > 0) {
        this.rel[d] -= 1;
        this.queues[d] -= 1;
        this.cleared += 1;
        this.clearedAcc += 1;
        this.crossing.push({ dir: d, t: 0, id: this.carSeq++ });
      }
      if (this.queues[d] === 0) this.rel[d] = 0;
    }

    for (const c of this.crossing) c.t += dt / 1.1; // ~1.1s to cross the box
    if (this.crossing.length) this.crossing = this.crossing.filter((c) => c.t < 1);

    let total = 0, mx = 0;
    for (const d of DIRS) { total += this.queues[d]; if (this.queues[d] > mx) mx = this.queues[d]; }
    this.vehSeconds += total * dt;
    if (mx > this.maxQueue) this.maxQueue = mx;
  }

  snapshot(): SimSnapshot {
    return {
      queues: { ...this.queues },
      phase: this.phase,
      amber: this.amber,
      arrived: this.arrived,
      cleared: this.cleared,
      avgWaitSec: this.cleared > 0 ? this.vehSeconds / this.cleared : 0,
      maxQueue: this.maxQueue,
      throughputPerMin: this.elapsed > 0 ? (this.cleared / this.elapsed) * 60 : 0,
      rl: this.agent ? this.agent.stats() : undefined,
    };
  }
}
