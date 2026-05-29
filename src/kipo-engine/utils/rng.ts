// Seeded PRNG using Mulberry32 algorithm
// Deterministic and fast, avoids Math.random()

export interface SeededPRNG {
  next(): number; // [0, 1)
  nextInt(min: number, max: number): number; // [min, max)
}

export function createSeededPRNG(seed: number): SeededPRNG {
  let t = seed;

  function next(): number {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    nextInt(min: number, max: number): number {
      return Math.floor(next() * (max - min)) + min;
    },
  };
}
