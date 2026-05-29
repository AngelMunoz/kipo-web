import type { DerivedStats } from '../domain/entity';
import type { ActiveSkill, DamageSource, Element } from '../domain/skill';
import type { SeededPRNG } from '../utils/rng';
import { evaluate } from '../algorithms/formula-evaluator';

export interface DamageResult {
  Amount: number;
  IsCritical: boolean;
  IsEvaded: boolean;
}

function calculateHitChance(
  source: DamageSource,
  attackerStats: DerivedStats,
  defenderStats: DerivedStats
): number {
  const attackerValue =
    source === 'Physical' ? attackerStats.AC : attackerStats.LK;
  const defenderValue =
    source === 'Physical' ? defenderStats.HV : defenderStats.LK;

  if (attackerValue === 0 && defenderValue === 0) return 1.0;

  const effectiveAttacker = Math.max(0, attackerValue);
  const effectiveDefender = Math.max(0, defenderValue);
  const statAdvantage = effectiveAttacker - effectiveDefender;
  const chance = 0.5 + statAdvantage / 200;
  return Math.max(0.2, Math.min(0.8, chance));
}

export function calculateEffectDamage(
  attackerStats: DerivedStats,
  defenderStats: DerivedStats,
  formula: import('../domain/skill').MathExpr,
  damageType: DamageSource,
  element: Element | undefined
): number {
  const baseDamage = evaluate(attackerStats, formula);

  const elementalResistance =
    element !== undefined
      ? (defenderStats.ElementResistances.get(element) ?? 0)
      : 0;

  const damageAfterResistance = baseDamage * (1.0 - elementalResistance);

  const mitigation =
    damageType === 'Physical' ? defenderStats.DP : defenderStats.MD;

  const damageAfterMitigation = damageAfterResistance - mitigation;
  return Math.max(0, Math.floor(damageAfterMitigation));
}

export function calculateEffectRestoration(
  attackerStats: DerivedStats,
  formula: import('../domain/skill').MathExpr
): number {
  const baseRestoration = evaluate(attackerStats, formula);
  return Math.max(0, Math.floor(baseRestoration));
}

export function calculateFinalDamage(
  rng: SeededPRNG,
  attackerStats: DerivedStats,
  defenderStats: DerivedStats,
  skill: ActiveSkill
): DamageResult {
  // 1. Hit/Evasion
  const hitRoll = rng.next();
  const hitChance = calculateHitChance(skill.DamageSource, attackerStats, defenderStats);

  if (hitRoll > hitChance) {
    return { Amount: 0, IsCritical: false, IsEvaded: true };
  }

  // 2. Base Damage
  let baseDamage = 0;
  if (skill.Formula !== undefined) {
    baseDamage = evaluate(attackerStats, skill.Formula);
  }

  // 3. Elemental Damage
  let elementalDamage = 0;
  let elementalResistance = 0;
  if (skill.ElementFormula !== undefined) {
    elementalDamage = evaluate(attackerStats, skill.ElementFormula.Formula);
    elementalResistance = defenderStats.ElementResistances.get(skill.ElementFormula.Element) ?? 0;
  }

  // 4. Critical Hit
  const critRoll = rng.next();
  const isCritical = critRoll < attackerStats.LK * 0.01;
  const critBonus = isCritical ? (baseDamage + elementalDamage) * 0.5 : 0;

  // 5. Elemental Resistance
  const elementalDamageAfterResistance = elementalDamage * (1.0 - elementalResistance);

  // 6. Combine
  const totalDamage = baseDamage + elementalDamageAfterResistance + critBonus;

  // 7. Mitigation
  const mitigation = skill.DamageSource === 'Physical' ? defenderStats.DP : defenderStats.MD;
  const finalDamage = Math.max(0, Math.floor(totalDamage - mitigation));

  return { Amount: finalDamage, IsCritical: isCritical, IsEvaded: false };
}

export function calculateRawDamageSelfTarget(
  _rng: SeededPRNG,
  attackerStats: DerivedStats,
  _defenderStats: DerivedStats,
  skill: ActiveSkill
): DamageResult {
  let baseDamage = 0;
  if (skill.Formula !== undefined) {
    baseDamage = evaluate(attackerStats, skill.Formula);
  }

  let elementalDamageAfterResistance = 0;
  if (skill.ElementFormula !== undefined) {
    const elementalDamage = evaluate(attackerStats, skill.ElementFormula.Formula);
    const elementalResistance = attackerStats.ElementResistances.get(skill.ElementFormula.Element) ?? 0;
    elementalDamageAfterResistance = elementalDamage * (1.0 - elementalResistance);
  }

  const finalDamage = baseDamage + elementalDamageAfterResistance;
  return { Amount: Math.max(0, Math.floor(finalDamage)), IsCritical: false, IsEvaded: false };
}
