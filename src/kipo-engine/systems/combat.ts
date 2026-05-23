import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { brandEntityId, brandSkillId, type EntityId, type SkillId } from '../types/branded';
import type { GameSystem, PomoEnvironment } from './environment';
import type { WorldPosition, Vector2 } from '../domain/core';
import type { SkillTarget, GameEvent, EffectApplicationIntent, AbilityIntent } from '../domain/events';
import type { ActiveSkill } from '../domain/skill';
import type { SearchContext } from '../domain/spatial';
import { findTargetsInCircle, findTargetsInCone, findTargetsInLine } from '../domain/spatial';
import { toVector2, fromVector2, WorldPositionZero } from '../domain/core';
import { calculateFinalDamage, calculateRawDamageSelfTarget, calculateEffectDamage, calculateEffectRestoration } from './damage-calculator';

// --- Context Helpers ---

function getPosition(worldView: import('../domain/world').World, entityId: EntityId): Vector2 {
  const pos = worldView.Positions.get(entityId);
  if (!pos) return { X: 0, Y: 0 };
  return toVector2(pos);
}

function resolveCircle(
  worldView: import('../domain/world').World,
  casterId: EntityId,
  center: Vector2,
  radius: number,
  target: SkillTarget
): [Vector2, number] {
  if (target.kind === 'TargetDirection') {
    const casterPos = getPosition(worldView, casterId);
    const dist = Math.sqrt(
      (casterPos.X - target.position.X) * (casterPos.X - target.position.X) +
        (casterPos.Y - target.position.Y) * (casterPos.Y - target.position.Y)
    );
    const r = Math.min(dist, radius);
    return [casterPos, r];
  }
  return [center, radius];
}

function resolveCone(
  worldView: import('../domain/world').World,
  casterId: EntityId,
  center: Vector2,
  target: SkillTarget
): [Vector2, Vector2] {
  const casterPos = getPosition(worldView, casterId);

  switch (target.kind) {
    case 'TargetDirection': {
      const offset = { X: target.position.X - casterPos.X, Y: target.position.Y - casterPos.Y };
      const len = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = len > 0 ? { X: offset.X / len, Y: offset.Y / len } : { X: 1, Y: 0 };
      return [casterPos, dir];
    }
    case 'TargetPosition': {
      const offset = { X: target.position.X - casterPos.X, Y: target.position.Y - casterPos.Y };
      const len = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = len > 0 ? { X: offset.X / len, Y: offset.Y / len } : { X: 1, Y: 0 };
      return [target.position, dir];
    }
    case 'TargetEntity': {
      const targetPos = getPosition(worldView, target.entity);
      const offset = { X: targetPos.X - casterPos.X, Y: targetPos.Y - casterPos.Y };
      const len = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = len > 0 ? { X: offset.X / len, Y: offset.Y / len } : { X: 1, Y: 0 };
      return [targetPos, dir];
    }
    default:
      return [center, { X: 1, Y: 0 }];
  }
}

function resolveLine(
  worldView: import('../domain/world').World,
  casterId: EntityId,
  center: Vector2,
  length: number,
  target: SkillTarget
): [Vector2, Vector2] {
  const casterPos = getPosition(worldView, casterId);

  switch (target.kind) {
    case 'TargetDirection': {
      const offset = { X: target.position.X - casterPos.X, Y: target.position.Y - casterPos.Y };
      const len = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = len > 0 ? { X: offset.X / len, Y: offset.Y / len } : { X: 1, Y: 0 };
      return [casterPos, { X: casterPos.X + dir.X * length, Y: casterPos.Y + dir.Y * length }];
    }
    case 'TargetPosition': {
      const offset = { X: target.position.X - casterPos.X, Y: target.position.Y - casterPos.Y };
      const dist = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = dist > 0 ? { X: offset.X / dist, Y: offset.Y / dist } : { X: 1, Y: 0 };
      const actualLength = Math.min(dist, length);
      return [casterPos, { X: casterPos.X + dir.X * actualLength, Y: casterPos.Y + dir.Y * actualLength }];
    }
    case 'TargetEntity': {
      const targetPos = getPosition(worldView, target.entity);
      const offset = { X: targetPos.X - casterPos.X, Y: targetPos.Y - casterPos.Y };
      const len = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = len > 0 ? { X: offset.X / len, Y: offset.Y / len } : { X: 1, Y: 0 };
      return [targetPos, { X: targetPos.X + dir.X * length, Y: targetPos.Y + dir.Y * length }];
    }
    default:
      return [center, { X: center.X + length, Y: center.Y }];
  }
}

function calculateAdaptiveAperture(direction: Vector2): number {
  const referenceForward = { X: 0, Y: 1 }; // Vector2.UnitY
  const dot = referenceForward.X * direction.X + referenceForward.Y * direction.Y;
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const angleFromForwardDeg = (Math.acos(clampedDot) * 180) / Math.PI;

  if (angleFromForwardDeg <= 90.0) {
    return 30.0 + (angleFromForwardDeg / 90.0) * 150.0;
  }
  return 180.0;
}

function resolveAdaptiveCone(
  worldView: import('../domain/world').World,
  casterId: EntityId,
  target: SkillTarget
): [Vector2, Vector2, number] {
  const casterPos = getPosition(worldView, casterId);

  switch (target.kind) {
    case 'TargetPosition':
    case 'TargetDirection': {
      const offset = { X: target.position.X - casterPos.X, Y: target.position.Y - casterPos.Y };
      const dist = Math.sqrt(offset.X * offset.X + offset.Y * offset.Y);
      const dir = dist > 0.001 ? { X: offset.X / dist, Y: offset.Y / dist } : { X: 1, Y: 0 };
      const apertureAngle = calculateAdaptiveAperture(dir);
      return [casterPos, dir, apertureAngle];
    }
    default:
      return [{ X: 0, Y: 0 }, { X: 1, Y: 0 }, 0];
  }
}

// --- Execution ---

function applySkillDamage(
  env: PomoEnvironment,
  casterId: EntityId,
  targetId: EntityId,
  skill: ActiveSkill
): import('./damage-calculator').DamageResult {
  const attackerStats = env.gameplay.projections.calculateDerivedStats?.(env.core.worldView, env.stores.itemStore, casterId);
  const defenderStats = env.gameplay.projections.calculateDerivedStats?.(env.core.worldView, env.stores.itemStore, targetId);

  if (!attackerStats || !defenderStats) {
    return { Amount: 0, IsCritical: false, IsEvaded: false };
  }

  if (casterId === targetId) {
    return calculateRawDamageSelfTarget(env.core.rng, attackerStats, defenderStats, skill);
  }

  return calculateFinalDamage(env.core.rng, attackerStats, defenderStats, skill);
}

function applyInstantaneousSkillEffects(
  env: PomoEnvironment,
  casterId: EntityId,
  targetId: EntityId,
  activeSkill: ActiveSkill
) {
  const result = applySkillDamage(env, casterId, targetId, activeSkill);

  const targetPos = env.core.worldView.Positions.get(targetId) ?? WorldPositionZero;

  if (result.IsEvaded) {
    env.core.eventBus.publish({
      kind: 'Notification',
      notification: {
        kind: 'ShowMessage',
        message: {
          Message: 'Miss',
          Position: targetPos,
          Type: 'Miss',
        },
      },
    });
    return;
  }

  env.core.eventBus.publish({
    kind: 'Notification',
    notification: {
      kind: 'DamageDealt',
      damage: { Target: targetId, Amount: result.Amount },
    },
  });

  const notificationType: import('../domain/core').NotificationType = result.IsCritical ? 'Crit' : 'Damage';
  env.core.eventBus.publish({
    kind: 'Notification',
    notification: {
      kind: 'ShowMessage',
      message: {
        Message: `${result.Amount}`,
        Position: targetPos,
        Type: notificationType,
      },
    },
  });

  for (const effect of activeSkill.Effects) {
    const intent: EffectApplicationIntent = {
      SourceEntity: casterId,
      TargetEntity: targetId,
      Effect: effect,
    };
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: { kind: 'EffectApplication', effectApp: intent },
    });
  }
}

function applyResourceCost(env: PomoEnvironment, casterId: EntityId, activeSkill: ActiveSkill) {
  if (!activeSkill.Cost) return;
  const resources = env.core.worldView.Resources.get(casterId);
  if (!resources) return;

  const requiredAmount = activeSkill.Cost.Amount ?? 0;
  let newResources = { ...resources };

  switch (activeSkill.Cost.ResourceType) {
    case 'HP':
      newResources.HP -= requiredAmount;
      break;
    case 'MP':
      newResources.MP -= requiredAmount;
      break;
  }

  env.core.stateWrite.UpdateResources(casterId, newResources);
}

function applyCooldown(env: PomoEnvironment, casterId: EntityId, skillId: SkillId, activeSkill: ActiveSkill) {
  if (!activeSkill.Cooldown) return;
  const totalGameTime = env.core.worldView.Time.TotalGameTime;
  const readyTime = totalGameTime + activeSkill.Cooldown;

  const currentCooldowns = env.core.worldView.AbilityCooldowns.get(casterId) ?? new Map<SkillId, number>();
  const newCooldowns = new Map(currentCooldowns);
  newCooldowns.set(skillId, readyTime);

  env.core.stateWrite.UpdateCooldowns(casterId, newCooldowns);
}

// --- Target Resolution ---

function resolveTargetsForInstant(
  env: PomoEnvironment,
  casterId: EntityId,
  target: SkillTarget,
  activeSkill: ActiveSkill,
  searchCtx: SearchContext
): EntityId[] {
  let targetCenter: WorldPosition | undefined;

  switch (target.kind) {
    case 'TargetEntity':
      targetCenter = env.core.worldView.Positions.get(target.entity);
      break;
    case 'TargetPosition':
      targetCenter = fromVector2(target.position);
      break;
    case 'TargetDirection':
    case 'TargetSelf':
      targetCenter = env.core.worldView.Positions.get(casterId);
      break;
  }

  if (!targetCenter) return [];
  const center = toVector2(targetCenter);

  switch (activeSkill.Area.kind) {
    case 'Point': {
      switch (target.kind) {
        case 'TargetSelf': return [casterId];
        case 'TargetEntity': return [target.entity];
        default: return [];
      }
    }
    case 'Circle': {
      const [origin, effectiveRadius] = resolveCircle(env.core.worldView, casterId, center, activeSkill.Area.radius, target);
      return findTargetsInCircle(searchCtx, {
        CasterId: casterId,
        Circle: { Center: origin, Radius: effectiveRadius },
        MaxTargets: activeSkill.Area.maxTargets,
      });
    }
    case 'Cone': {
      const [origin, direction] = resolveCone(env.core.worldView, casterId, center, target);
      return findTargetsInCone(searchCtx, {
        CasterId: casterId,
        Cone: { Origin: origin, Direction: direction, AngleDegrees: activeSkill.Area.angle, Length: activeSkill.Area.length },
        MaxTargets: activeSkill.Area.maxTargets,
      });
    }
    case 'Line': {
      const [start, endPoint] = resolveLine(env.core.worldView, casterId, center, activeSkill.Area.length, target);
      return findTargetsInLine(searchCtx, {
        CasterId: casterId,
        Line: { Start: start, End: endPoint, Width: activeSkill.Area.width },
        MaxTargets: activeSkill.Area.maxTargets,
      });
    }
    case 'MultiPoint':
    case 'AdaptiveCone':
      return [];
  }
}

// --- Handlers ---

function handleEffectResourceIntent(env: PomoEnvironment, intent: import('../domain/events').EffectResourceIntent) {
  const attackerStats = env.gameplay.projections.calculateDerivedStats?.(env.core.worldView, env.stores.itemStore, intent.SourceEntity);
  if (!attackerStats) return;

  let anyProcessed = false;

  for (const modifier of intent.Effect.Modifiers) {
    if (modifier.kind === 'ResourceChange') {
      const changeAmount = calculateEffectRestoration(attackerStats, modifier.amount);
      env.core.eventBus.publish({
        kind: 'Notification',
        notification: {
          kind: 'ResourceRestored',
          restored: {
            Amount: changeAmount,
            ResourceType: modifier.resource,
            Target: intent.TargetEntity,
          },
        },
      });
      anyProcessed = true;
    }
  }

  if (anyProcessed && intent.Effect.Duration.kind === 'Instant') {
    env.core.stateWrite.ExpireEffect(intent.TargetEntity, intent.ActiveEffectId);
  }
}

function handleEffectDamageIntent(env: PomoEnvironment, intent: import('../domain/events').EffectDamageIntent) {
  const attackerStats = env.gameplay.projections.calculateDerivedStats?.(env.core.worldView, env.stores.itemStore, intent.SourceEntity);
  const defenderStats = env.gameplay.projections.calculateDerivedStats?.(env.core.worldView, env.stores.itemStore, intent.TargetEntity);
  if (!attackerStats || !defenderStats) return;

  let totalDamage = 0;
  for (const modifier of intent.Effect.Modifiers) {
    if (modifier.kind === 'AbilityDamageMod') {
      totalDamage += calculateEffectDamage(
        attackerStats,
        defenderStats,
        modifier.abilityDamageValue,
        intent.Effect.DamageSource,
        modifier.element
      );
    }
  }

  if (totalDamage > 0) {
    env.core.eventBus.publish({
      kind: 'Notification',
      notification: {
        kind: 'DamageDealt',
        damage: { Target: intent.TargetEntity, Amount: totalDamage },
      },
    });

    const targetPos = env.core.worldView.Positions.get(intent.TargetEntity) ?? WorldPositionZero;
    env.core.eventBus.publish({
      kind: 'Notification',
      notification: {
        kind: 'ShowMessage',
        message: {
          Message: `${totalDamage}`,
          Position: targetPos,
          Type: 'Damage',
        },
      },
    });
  }
}

function handleProjectileDelivery(
  env: PomoEnvironment,
  casterId: EntityId,
  skillId: SkillId,
  target: SkillTarget,
  activeSkill: ActiveSkill,
  projectileInfo: import('../domain/skill').ProjectileInfo
) {
  // Handle Multi-Target Projectiles (Fan of Knives, etc.)
  let targets: EntityId[] = [];
  if (activeSkill.Area.kind === 'AdaptiveCone') {
    const [origin, direction, angle] = resolveAdaptiveCone(env.core.worldView, casterId, target);
    if (angle > 0) {
      // Build search context
      const scenarioId = env.core.worldView.EntityScenario.get(casterId);
      if (scenarioId) {
        const snapshot = env.gameplay.projections.computeMovementSnapshot(scenarioId);
        const liveEntities = new Set<EntityId>();
        for (const [id, res] of env.core.worldView.Resources.entries()) {
          if (res.Status === 'Alive') liveEntities.add(id);
        }
        const searchCtx: SearchContext = {
          GetNearbyEntities: (center, radius) =>
            env.gameplay.projections.getNearbyEntitiesSnapshot(snapshot, liveEntities, center, radius),
        };
        targets = findTargetsInCone(searchCtx, {
          CasterId: casterId,
          Cone: { Origin: origin, Direction: direction, AngleDegrees: angle, Length: activeSkill.Area.length },
          MaxTargets: activeSkill.Area.maxTargets,
        });
      }
    }
  }

  if (targets.length > 0) {
    for (const targetId of targets) {
      const projectileId = brandEntityId(crypto.randomUUID());
      const liveProjectile: import('../domain/projectile').LiveProjectile = {
        Caster: casterId,
        Target: { kind: 'EntityTarget', entity: targetId },
        SkillId: skillId,
        Info: projectileInfo,
      };
      env.core.stateWrite.CreateProjectile(projectileId, liveProjectile, undefined);
    }
  } else {
    // Fallback to single target logic
    console.debug('[Combat] handleProjectileDelivery fallback, target.kind:', target.kind);
    switch (target.kind) {
      case 'TargetEntity': {
        const projectileId = brandEntityId(crypto.randomUUID());
        console.debug('[Combat] Creating EntityTarget projectile', projectileId);
        const liveProjectile: import('../domain/projectile').LiveProjectile = {
          Caster: casterId,
          Target: { kind: 'EntityTarget', entity: target.entity },
          SkillId: skillId,
          Info: projectileInfo,
        };
        env.core.stateWrite.CreateProjectile(projectileId, liveProjectile, undefined);
        break;
      }
      case 'TargetPosition': {
        const projectileId = brandEntityId(crypto.randomUUID());
        console.debug('[Combat] Creating PositionTarget projectile', projectileId, 'pos:', target.position);
        const liveProjectile: import('../domain/projectile').LiveProjectile = {
          Caster: casterId,
          Target: { kind: 'PositionTarget', position: target.position },
          SkillId: skillId,
          Info: projectileInfo,
        };
        env.core.stateWrite.CreateProjectile(projectileId, liveProjectile, undefined);
        break;
      }
      default:
        break;
    }
  }
}

function handleInstantDelivery(
  env: PomoEnvironment,
  casterId: EntityId,
  target: SkillTarget,
  activeSkill: ActiveSkill,
  searchCtx: SearchContext
) {
  let targetCenter: Vector2 | undefined;

  switch (target.kind) {
    case 'TargetEntity': {
      const tp = env.core.worldView.Positions.get(target.entity);
      if (tp) targetCenter = toVector2(tp);
      break;
    }
    case 'TargetPosition':
      targetCenter = target.position;
      break;
    case 'TargetDirection':
    case 'TargetSelf': {
      const cp = env.core.worldView.Positions.get(casterId);
      if (cp) targetCenter = toVector2(cp);
      break;
    }
  }

  if (!targetCenter) return;

  // Spawn ImpactVisuals (F#: lines 606-661)
  if (activeSkill.ImpactVisuals.VfxId) {
    const casterPos = getPosition(env.core.worldView, casterId);

    let direction: Vector2;
    switch (target.kind) {
      case 'TargetDirection':
      case 'TargetPosition': {
        const dx = target.position.X - casterPos.X;
        const dy = target.position.Y - casterPos.Y;
        const len = Math.sqrt(dx * dx + dy * dy);
        direction = len > 0 ? { X: dx / len, Y: dy / len } : { X: 1, Y: 0 };
        break;
      }
      case 'TargetEntity': {
        const tp = env.core.worldView.Positions.get(target.entity);
        if (tp) {
          const dx = tp.X - casterPos.X;
          const dz = tp.Z - casterPos.Y;
          const len = Math.sqrt(dx * dx + dz * dz);
          direction = len > 0 ? { X: dx / len, Y: dz / len } : { X: 1, Y: 0 };
        } else {
          direction = { X: 1, Y: 0 };
        }
        break;
      }
      default:
        direction = { X: 0, Y: 1 };
    }

    env.core.eventBus.publish({
      kind: 'Lifecycle',
      lifecycle: {
        kind: 'InstantSkillImpact',
        impact: {
          CasterId: casterId,
          SkillId: brandSkillId(activeSkill.Id),
          VfxId: activeSkill.ImpactVisuals.VfxId,
          Position: targetCenter,
          Direction: direction,
        },
      },
    });
  }

  const targets = resolveTargetsForInstant(env, casterId, target, activeSkill, searchCtx);

  for (const targetId of targets) {
    applyInstantaneousSkillEffects(env, casterId, targetId, activeSkill);
  }
}

function handleAbilityIntent(env: PomoEnvironment, intent: AbilityIntent) {
  const skill = env.stores.skillStore.getActive(intent.SkillId);
  if (!skill) return;

  applyResourceCost(env, intent.Caster, skill);
  applyCooldown(env, intent.Caster, intent.SkillId, skill);

  if (skill.ChargePhase) {
    // Create ActiveOrbital if needed
    if (skill.ChargePhase.Orbitals) {
      env.core.stateWrite.UpdateActiveOrbital(intent.Caster, {
        ...skill.ChargePhase.Orbitals,
        startTime: env.core.worldView.Time.TotalGameTime,
      });
    }

    env.core.stateWrite.UpdateActiveCharge(intent.Caster, {
      SkillId: intent.SkillId,
      Target: intent.Target,
      Duration: skill.ChargePhase.Duration,
      startTime: env.core.worldView.Time.TotalGameTime,
    });
    env.core.stateWrite.SetPendingSkillCast(intent.Caster, intent.SkillId, intent.Target);
    return;
  }

  // No charge phase - execute delivery immediately
  const scenarioId = env.core.worldView.EntityScenario.get(intent.Caster);
  let searchCtx: SearchContext | undefined;
  if (scenarioId) {
    const snapshot = env.gameplay.projections.computeMovementSnapshot(scenarioId);
    const liveEntities = new Set<EntityId>();
    for (const [id, res] of env.core.worldView.Resources.entries()) {
      if (res.Status === 'Alive') liveEntities.add(id);
    }
    searchCtx = {
      GetNearbyEntities: (center, radius) =>
        env.gameplay.projections.getNearbyEntitiesSnapshot(snapshot, liveEntities, center, radius),
    };
  }

  switch (skill.Delivery.kind) {
    case 'Projectile':
      handleProjectileDelivery(env, intent.Caster, intent.SkillId, intent.Target, skill, skill.Delivery.projectile);
      break;
    case 'Instant':
      if (searchCtx) {
        handleInstantDelivery(env, intent.Caster, intent.Target, skill, searchCtx);
      }
      break;
  }
}

function handleProjectileImpact(env: PomoEnvironment, impact: import('../domain/events').ProjectileImpacted) {
  const skill = env.stores.skillStore.getActive(impact.SkillId);
  if (!skill) return;

  const center = impact.ImpactPosition;
  const scenarioId = env.core.worldView.EntityScenario.get(impact.CasterId);
  let searchCtx: SearchContext | undefined;
  if (scenarioId) {
    const snapshot = env.gameplay.projections.computeMovementSnapshot(scenarioId);
    const liveEntities = new Set<EntityId>();
    for (const [id, res] of env.core.worldView.Resources.entries()) {
      if (res.Status === 'Alive') liveEntities.add(id);
    }
    searchCtx = {
      GetNearbyEntities: (c, radius) =>
        env.gameplay.projections.getNearbyEntitiesSnapshot(snapshot, liveEntities, c, radius),
    };
  }
  if (!searchCtx) return;

  let targets: EntityId[] = [];
  switch (skill.Area.kind) {
    case 'Point': {
      if (impact.TargetEntity) {
        targets = [impact.TargetEntity];
      }
      break;
    }
    case 'Circle': {
      targets = findTargetsInCircle(searchCtx, {
        CasterId: impact.CasterId,
        Circle: { Center: center, Radius: skill.Area.radius },
        MaxTargets: skill.Area.maxTargets,
      });
      break;
    }
    case 'Cone': {
      const casterPos = getPosition(env.core.worldView, impact.CasterId);
      const direction = { X: center.X - casterPos.X, Y: center.Y - casterPos.Y };
      const len = Math.sqrt(direction.X * direction.X + direction.Y * direction.Y);
      const dir = len > 0 ? { X: direction.X / len, Y: direction.Y / len } : { X: 1, Y: 0 };
      targets = findTargetsInCone(searchCtx, {
        CasterId: impact.CasterId,
        Cone: { Origin: center, Direction: dir, AngleDegrees: skill.Area.angle, Length: skill.Area.length },
        MaxTargets: skill.Area.maxTargets,
      });
      break;
    }
    case 'Line': {
      const casterPos = getPosition(env.core.worldView, impact.CasterId);
      const direction = { X: center.X - casterPos.X, Y: center.Y - casterPos.Y };
      const len = Math.sqrt(direction.X * direction.X + direction.Y * direction.Y);
      const dir = len > 0 ? { X: direction.X / len, Y: direction.Y / len } : { X: 1, Y: 0 };
      const endPoint = { X: center.X + dir.X * skill.Area.length, Y: center.Y + dir.Y * skill.Area.length };
      targets = findTargetsInLine(searchCtx, {
        CasterId: impact.CasterId,
        Line: { Start: center, End: endPoint, Width: skill.Area.width },
        MaxTargets: skill.Area.maxTargets,
      });
      break;
    }
    case 'MultiPoint':
      if (impact.TargetEntity) {
        targets = [impact.TargetEntity];
      }
      break;
    case 'AdaptiveCone':
      if (impact.TargetEntity) {
        targets = [impact.TargetEntity];
      }
      break;
  }

  for (const targetId of targets) {
    const result = applySkillDamage(env, impact.CasterId, targetId, skill);
    const targetPos = env.core.worldView.Positions.get(targetId) ?? WorldPositionZero;

    if (result.IsEvaded) {
      env.core.eventBus.publish({
        kind: 'Notification',
        notification: {
          kind: 'ShowMessage',
          message: { Message: 'Miss', Position: targetPos, Type: 'Miss' },
        },
      });
    } else {
      env.core.eventBus.publish({
        kind: 'Notification',
        notification: {
          kind: 'DamageDealt',
          damage: { Target: targetId, Amount: result.Amount },
        },
      });

      const msg = `-${result.Amount}`;
      const type: import('../domain/core').NotificationType = result.IsCritical ? 'Crit' : 'Damage';
      env.core.eventBus.publish({
        kind: 'Notification',
        notification: {
          kind: 'ShowMessage',
          message: { Message: msg, Position: targetPos, Type: type },
        },
      });

      for (const effect of skill.Effects) {
        console.debug('[Combat] Publishing EffectApplication for', effect.Name, 'on target', targetId);
        env.core.eventBus.publish({
          kind: 'Intent',
          intent: {
            kind: 'EffectApplication',
            effectApp: { SourceEntity: impact.CasterId, TargetEntity: targetId, Effect: effect },
          },
        });
      }
    }
  }
}

function handleChargeCompleted(env: PomoEnvironment, completed: import('../domain/events').ChargeCompleted) {
  const skill = env.stores.skillStore.getActive(completed.SkillId);
  if (!skill || !skill.ChargePhase) return;

  if (skill.Delivery.kind !== 'Projectile') {
    // Charged instant skill - execute instant delivery
    const scenarioId = env.core.worldView.EntityScenario.get(completed.CasterId);
    let searchCtx: SearchContext | undefined;
    if (scenarioId) {
      const snapshot = env.gameplay.projections.computeMovementSnapshot(scenarioId);
    const liveEntities = new Set<EntityId>();
      for (const [id, res] of env.core.worldView.Resources.entries()) {
        if (res.Status === 'Alive') liveEntities.add(id);
      }
      searchCtx = {
        GetNearbyEntities: (center, radius) =>
          env.gameplay.projections.getNearbyEntitiesSnapshot(snapshot, liveEntities, center, radius),
      };
    }
    if (searchCtx) {
      handleInstantDelivery(env, completed.CasterId, completed.Target, skill, searchCtx);
    }
    return;
  }

  // Charged projectile delivery
  // ... (simplified for now; full orbital logic omitted for brevity but can be added)
  // Fallback to single projectile
  const projectileId = brandEntityId(crypto.randomUUID());
  const baseTarget: import('../domain/projectile').ProjectileTarget =
    completed.Target.kind === 'TargetEntity'
      ? { kind: 'EntityTarget', entity: completed.Target.entity }
      : completed.Target.kind === 'TargetPosition'
        ? { kind: 'PositionTarget', position: completed.Target.position }
        : completed.Target.kind === 'TargetDirection'
          ? { kind: 'PositionTarget', position: completed.Target.position }
          : { kind: 'EntityTarget', entity: completed.CasterId };

  const liveProjectile: import('../domain/projectile').LiveProjectile = {
    Caster: completed.CasterId,
    Target: baseTarget,
    SkillId: completed.SkillId,
    Info: skill.Delivery.projectile,
  };
  env.core.stateWrite.CreateProjectile(projectileId, liveProjectile, undefined);
}

// --- System Factory ---

export function createCombatSystem(env: PomoEnvironment): GameSystem {
  const subs: Subscription[] = [];

  // Subscribe to Ability intents (F#: CombatSystem handles Ability directly)
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter((e): e is GameEvent => e.kind === 'Intent' && e.intent.kind === 'Ability')
      )
      .subscribe((e) => {
        if (e.kind === 'Intent' && e.intent.kind === 'Ability') {
          console.debug('[Combat] Ability intent received:', e.intent.ability.SkillId, 'caster:', e.intent.ability.Caster, 'target:', e.intent.ability.Target);
          handleAbilityIntent(env, e.intent.ability);
        }
      })
  );

  // Subscribe to ProjectileImpacted
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent => e.kind === 'Lifecycle' && e.lifecycle.kind === 'ProjectileImpacted'
        )
      )
      .subscribe((e) => {
        if (e.kind === 'Lifecycle' && e.lifecycle.kind === 'ProjectileImpacted') {
          handleProjectileImpact(env, e.lifecycle.impact);
        }
      })
  );

  // Subscribe to ChargeCompleted
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent => e.kind === 'Lifecycle' && e.lifecycle.kind === 'ChargeCompleted'
        )
      )
      .subscribe((e) => {
        if (e.kind === 'Lifecycle' && e.lifecycle.kind === 'ChargeCompleted') {
          handleChargeCompleted(env, e.lifecycle.charge);
        }
      })
  );

  // Subscribe to EffectDamage
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent => e.kind === 'Intent' && e.intent.kind === 'EffectDamage'
        )
      )
      .subscribe((e) => {
        if (e.kind === 'Intent' && e.intent.kind === 'EffectDamage') {
          handleEffectDamageIntent(env, e.intent.effectDmg);
        }
      })
  );

  // Subscribe to EffectResource
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent => e.kind === 'Intent' && e.intent.kind === 'EffectResource'
        )
      )
      .subscribe((e) => {
        if (e.kind === 'Intent' && e.intent.kind === 'EffectResource') {
          handleEffectResourceIntent(env, e.intent.effectRes);
        }
      })
  );

  return {
    kind: 'Combat',
    update() {
      // Combat processing happens during event flush via subscriptions
    },
    dispose() {
      for (const s of subs) s.unsubscribe();
    },
  };
}
