// ── Traffic dataset ────────────────────────────────────────────────────────
// Representative per-approach demand for Tamil Nadu urban junctions, used to
// drive the simulation "for now". Each junction is deliberately ASYMMETRIC
// (real intersections rarely balance) — which is exactly where adaptive signal
// control beats fixed timers.
//
// FUTURE: replace this dataset sampler with LIVE per-approach vehicle counts
// from CCTV — feed real arrivals into TrafficSim.tick() instead of sampleArrivals().

export type Dir = "N" | "E" | "S" | "W";
export const DIRS: Dir[] = ["N", "E", "S", "W"];

export interface JunctionProfile {
  id: string;
  name: string;
  nameTa: string;
  /** base demand per approach, in vehicles per minute */
  base: Record<Dir, number>;
}

export const JUNCTIONS: JunctionProfile[] = [
  { id: "gandhipuram", name: "Gandhipuram, Coimbatore", nameTa: "காந்திபுரம், கோயம்புத்தூர்", base: { N: 26, E: 15, S: 22, W: 12 } },
  { id: "kathipara", name: "Kathipara, Chennai", nameTa: "கதிப்பாரா, சென்னை", base: { N: 34, E: 27, S: 30, W: 19 } },
  { id: "periyar", name: "Periyar Stand, Madurai", nameTa: "பெரியார், மதுரை", base: { N: 17, E: 25, S: 15, W: 22 } },
];

export interface IntensityLevel { id: string; label: string; labelTa: string; mult: number; }
export const INTENSITIES: IntensityLevel[] = [
  { id: "normal", label: "Normal flow", labelTa: "சாதாரணம்", mult: 1 },
  { id: "peak", label: "Peak hour", labelTa: "உச்ச நேரம்", mult: 2.2 },
  { id: "extreme", label: "Extreme surge", labelTa: "தீவிர நெரிசல்", mult: 3.6 },
];

/** Sample integer arrivals per approach for one simulation step (Poisson-ish).
 *  Shared between the adaptive and fixed sims so the comparison is fair. */
export function sampleArrivals(base: Record<Dir, number>, mult: number, dt: number): Record<Dir, number> {
  const out: Record<Dir, number> = { N: 0, E: 0, S: 0, W: 0 };
  for (const d of DIRS) {
    const lambda = (base[d] / 60) * mult * dt; // expected vehicles this tick
    let n = Math.floor(lambda);
    if (Math.random() < lambda - n) n += 1;
    out[d] = n;
  }
  return out;
}
