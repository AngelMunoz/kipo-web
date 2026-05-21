import { describe, it, expect } from 'vitest';
import { createSeededPRNG } from '../utils/rng';
import {
  calculateFinalDamage,
  calculateRawDamageSelfTarget,
  calculateEffectDamage,
} from '../systems/damage-calculator';
import type { DerivedStats } from '../domain/entity';
import type { ActiveSkill, DamageSource } from '../domain/skill';

// --- Test Helpers ---

function createDefaultStats(overrides: Partial<DerivedStats> = {}): DerivedStats {
  return {
    AP: 0,
    AC: 0,
    DX: 0,
    MP: 0,
    MA: 0,
    MD: 0,
    WT: 0,
    DA: 0,
    LK: 0,
    HP: 100,
    DP: 0,
    HV: 0,
    MS: 100,
    HPRegen: 0,
    MPRegen: 0,
    ElementAttributes: new Map(),
    ElementResistances: new Map(),
    ...overrides,
  };
}

function createSkill(
  damageSource: DamageSource,
  baseDamage: number,
  overrides: Partial<ActiveSkill> = {}
): ActiveSkill {
  return {
    Id: 1,
    Name: 'TestSkill',
    Description: '',
    Intent: 'Offensive',
    DamageSource: damageSource,
    Cost: undefined,
    Cooldown: undefined,
    CastingTime: undefined,
    ChargePhase: undefined,
    Targeting: 'TargetEntity',
    Range: 100,
    Area: { kind: 'Point' },
    Delivery: { kind: 'Instant' },
    Origin: { kind: 'Caster' },
    CastVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
    ImpactVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
    Effects: [],
    Formula: { kind: 'Const', value: baseDamage },
    ElementFormula: undefined,
    ...overrides,
  };
}

function measureRate(trials: number, action: () => boolean): number {
  let successes = 0;
  for (let i = 0; i < trials; i++) {
    if (action()) successes++;
  }
  return successes / trials;
}

// --- Hit Chance Tests ---

describe('Hit Chance', () => {
  it('equal stats give ~50 percent hit chance', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 50 });
    const defender = createDefaultStats({ HV: 50 });
    const skill = createSkill('Physical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    expect(Math.abs(hitRate - 0.5)).toBeLessThan(0.15);
  });

  it('higher AC increases hit chance', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 80 });
    const defender = createDefaultStats({ HV: 50 });
    const skill = createSkill('Physical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    // Expected: 0.5 + 30/200 = 0.65
    expect(Math.abs(hitRate - 0.65)).toBeLessThan(0.15);
  });

  it('higher HV decreases hit chance', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 50 });
    const defender = createDefaultStats({ HV: 80 });
    const skill = createSkill('Physical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    // Expected: 0.5 - 30/200 = 0.35
    expect(Math.abs(hitRate - 0.35)).toBeLessThan(0.15);
  });

  it('hit chance clamps to minimum 20 percent', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats();
    const defender = createDefaultStats({ HV: 200 });
    const skill = createSkill('Physical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    expect(Math.abs(hitRate - 0.20)).toBeLessThan(0.15);
  });

  it('hit chance clamps to maximum 80 percent', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 200 });
    const defender = createDefaultStats();
    const skill = createSkill('Physical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    expect(Math.abs(hitRate - 0.80)).toBeLessThan(0.15);
  });

  it('magical skills use LK for hit calculation', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ LK: 80 });
    const defender = createDefaultStats({ LK: 50 });
    const skill = createSkill('Magical', 100);

    const hitRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    // Expected: 0.5 + 30/200 = 0.65
    expect(Math.abs(hitRate - 0.65)).toBeLessThan(0.15);
  });
});

// --- Critical Hit Tests ---

describe('Critical Hits', () => {
  it('crit chance is ~1 percent per LK point', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100, LK: 20 });
    const defender = createDefaultStats();
    const skill = createSkill('Physical', 100);

    // Measure hit rate first (to filter out misses)
    const hitsOnly = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return !result.IsEvaded;
    });

    // Measure crits among all trials
    const critsTotal = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return result.IsCritical && !result.IsEvaded;
    });

    // Crit rate among hits = critsTotal / hitsOnly
    const critAmongHits = hitsOnly > 0 ? critsTotal / hitsOnly : 0;

    expect(Math.abs(critAmongHits - 0.2)).toBeLessThan(0.15);
  });

  it('zero LK gives zero crits', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100 });
    const defender = createDefaultStats();
    const skill = createSkill('Physical', 100);

    const critRate = measureRate(100, () => {
      const result = calculateFinalDamage(rng, attacker, defender, skill);
      return result.IsCritical;
    });

    expect(critRate).toBe(0);
  });

  it('crits deal 50 percent bonus damage', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ LK: 100, AC: 100 });
    const defender = createDefaultStats();
    const skill = createSkill('Physical', 100);

    // With LK=100, crit chance is 100%, and AC=100 guarantees hit
    const result = calculateFinalDamage(rng, attacker, defender, skill);

    expect(result.IsCritical).toBe(true);
    // Base 100 + 50% crit bonus = 150
    expect(result.Amount).toBe(150);
  });
});

// --- Damage Calculation Tests ---

describe('Damage Calculation', () => {
  it('physical damage reduced by DP', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100 });
    const defender = createDefaultStats({ DP: 30 });
    const skill = createSkill('Physical', 100);

    // AC=100 guarantees hit, LK=0 guarantees no crit
    const result = calculateFinalDamage(rng, attacker, defender, skill);

    // base 100 - dp 30 = 70
    expect(result.Amount).toBe(70);
  });

  it('magical damage reduced by MD', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ LK: 100 }); // Always hit for magical
    const defender = createDefaultStats({ MD: 25 });
    const skill = createSkill('Magical', 100);

    const result = calculateFinalDamage(rng, attacker, defender, skill);

    // base 100, 100% crit = 150, - md 25 = 125
    expect(result.Amount).toBe(125);
  });

  it('damage cannot go below zero', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100 });
    const defender = createDefaultStats({ DP: 500 });
    const skill = createSkill('Physical', 50);

    const result = calculateFinalDamage(rng, attacker, defender, skill);

    expect(result.Amount).toBeGreaterThanOrEqual(0);
  });
});

// --- Elemental Damage Tests ---

describe('Elemental Damage', () => {
  it('100 percent elemental resist negates all elemental damage', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100, LK: 0 });
    const defender = createDefaultStats({
      ElementResistances: new Map([['Fire', 1.0]]),
    });

    const skill = createSkill('Physical', 100, {
      ElementFormula: {
        Element: 'Fire',
        Formula: { kind: 'Const', value: 100 },
      },
    });

    const result = calculateFinalDamage(rng, attacker, defender, skill);

    // 100 base + 100 fire * 0 = 100
    expect(result.Amount).toBe(100);
  });

  it('no formula skill deals zero damage', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100 });
    const defender = createDefaultStats();

    const skill = createSkill('Physical', 0, { Formula: undefined });

    const result = calculateFinalDamage(rng, attacker, defender, skill);

    expect(result.Amount).toBe(0);
  });

  it('mitigation cannot make damage negative', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ AC: 100 });
    const defender = createDefaultStats({ DP: 1000 });
    const skill = createSkill('Physical', 50);

    const result = calculateFinalDamage(rng, attacker, defender, skill);

    expect(result.Amount).toBe(0);
    expect(result.IsEvaded).toBe(false);
  });
});

// --- Effect Damage Tests ---

describe('Effect Damage', () => {
  it('elemental resistance reduces effect damage', () => {
    const attacker = createDefaultStats();
    const defenderNoResist = createDefaultStats();
    const defenderWithResist = createDefaultStats({
      ElementResistances: new Map([['Fire', 0.5]]),
    });

    const formula = { kind: 'Const', value: 100 } as const;

    const resultNoResist = calculateEffectDamage(
      attacker,
      defenderNoResist,
      formula,
      'Physical',
      'Fire'
    );

    const resultWithResist = calculateEffectDamage(
      attacker,
      defenderWithResist,
      formula,
      'Physical',
      'Fire'
    );

    expect(resultWithResist).toBeLessThanOrEqual(resultNoResist);
    expect(resultNoResist).toBe(100);
    expect(resultWithResist).toBe(50);
  });

  it('mitigation reduces effect damage', () => {
    const attacker = createDefaultStats();
    const defenderNoMit = createDefaultStats();
    const defenderWithMit = createDefaultStats({ DP: 30 });

    const formula = { kind: 'Const', value: 100 } as const;

    const resultNoMit = calculateEffectDamage(
      attacker,
      defenderNoMit,
      formula,
      'Physical',
      undefined
    );

    const resultWithMit = calculateEffectDamage(
      attacker,
      defenderWithMit,
      formula,
      'Physical',
      undefined
    );

    expect(resultWithMit).toBeLessThanOrEqual(resultNoMit);
    expect(resultNoMit).toBe(100);
    expect(resultWithMit).toBe(70);
  });
});

// --- Self-Target Damage Tests ---

describe('Self-Target Damage', () => {
  it('self-target ignores mitigation and hit/crit rolls', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({ DP: 1000 });
    const skill = createSkill('Physical', 50);

    const result = calculateRawDamageSelfTarget(rng, attacker, attacker, skill);

    expect(result.Amount).toBe(50);
    expect(result.IsEvaded).toBe(false);
    expect(result.IsCritical).toBe(false);
  });

  it('self-target with elemental damage applies self resistance', () => {
    const rng = createSeededPRNG(42);
    const attacker = createDefaultStats({
      ElementResistances: new Map([['Fire', 0.5]]),
    });

    const skill = createSkill('Physical', 100, {
      ElementFormula: {
        Element: 'Fire',
        Formula: { kind: 'Const', value: 100 },
      },
    });

    const result = calculateRawDamageSelfTarget(rng, attacker, attacker, skill);

    // 100 base + 100 fire * 0.5 = 150
    expect(result.Amount).toBe(150);
  });
});
