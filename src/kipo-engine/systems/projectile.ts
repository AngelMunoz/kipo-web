import type { EntityId } from '../types/branded';
import { brandEntityId } from '../types/branded';
import type { PomoEnvironment } from './environment';
import type { WorldPosition, Vector2 } from '../domain/core';
import { toVector2, fromVector2, Vector3Zero, vector2Distance, vector2DistanceSquared } from '../domain/core';
import type { LiveProjectile, ProjectileTarget, ExtraVariations } from '../domain/projectile';
import type { ProjectileImpacted } from '../domain/events';

// --- Helpers ---

function resolveTargetPosition(
  worldView: import('../domain/world').World,
  target: ProjectileTarget
): WorldPosition | undefined {
  switch (target.kind) {
    case 'EntityTarget': {
      const pos = worldView.Positions.get(target.entity);
      return pos;
    }
    case 'PositionTarget':
      return fromVector2(target.position);
  }
}

// --- Descending Projectile Handler (ported from F# Projectile.fs:86-120) ---

function processDescendingProjectile(
  world: import('../domain/world').MutableWorld,
  projectileId: EntityId,
  projectile: LiveProjectile,
  dt: number
): ProjectileImpacted | undefined {
  const variation = projectile.Info.Variations;
  if (variation?.kind !== 'Descending') return undefined;

  const { currentAltitude, fallSpeed } = variation;
  const newAltitude = currentAltitude - (fallSpeed * dt);

  if (newAltitude <= 0) {
    // Impact! (F# line 97-98)
    const targetPos = resolveTargetPosition(world, projectile.Target);
    if (!targetPos) return undefined;

    // Get base height for impact position
    // Note: F# uses BlockCollision.getSurfaceHeight for precise ground lookup.
    // In 2D port without BlockMap, we use target Y as ground level approximation.
    let baseHeight = 0;
    if (projectile.Target.kind === 'PositionTarget') {
      baseHeight = targetPos.Y; // Use target Y as ground level
    } else {
      // For entity targets, use current Y as ground level approximation
      const currentPos = world.Positions.get(projectileId);
      if (currentPos) baseHeight = currentPos.Y - currentAltitude;
    }

    return {
      ProjectileId: projectileId,
      CasterId: projectile.Caster,
      ImpactPosition: toVector2(targetPos),
      TargetEntity: projectile.Target.kind === 'EntityTarget' ? projectile.Target.entity : undefined,
      SkillId: projectile.SkillId,
      RemainingJumps: undefined,
    };
  } else {
    // Update projectile with new altitude (F# lines 101-117)
    const currentPos = world.Positions.get(projectileId);
    if (currentPos) {
      // Calculate base height (ground level)
      let baseHeight = 0;
      if (projectile.Target.kind === 'PositionTarget') {
        const targetPos = fromVector2(projectile.Target.position);
        baseHeight = targetPos.Y;
      } else {
        baseHeight = currentPos.Y - currentAltitude;
      }

      // Update Y position to match altitude
      const newPos: WorldPosition = {
        X: currentPos.X,
        Y: baseHeight + newAltitude,
        Z: currentPos.Z,
      };

      // Remove and recreate with updated position (F# pattern)
      world.Positions.delete(projectileId);
      world.Positions.set(projectileId, newPos);

      // Update projectile variation with new altitude
      const updatedVariation: ExtraVariations = {
        kind: 'Descending',
        currentAltitude: newAltitude,
        fallSpeed,
      };

      // Update projectile info
      world.LiveProjectiles.delete(projectileId);
      world.LiveProjectiles.set(projectileId, {
        ...projectile,
        Info: {
          ...projectile.Info,
          Variations: updatedVariation,
        },
      });
    }
  }

  return undefined;
}

function findNextChainTarget(
  worldView: import('../domain/world').World,
  liveEntities: Set<EntityId>,
  casterId: EntityId,
  currentTargetId: EntityId,
  originPos: Vector2,
  maxRange: number
): EntityId | undefined {
  const maxRangeSq = maxRange * maxRange;
  let bestId: EntityId | undefined;
  let bestDist = Infinity;

  for (const id of liveEntities) {
    if (id === casterId || id === currentTargetId) continue;
    const pos = worldView.Positions.get(id);
    if (!pos) continue;
    const distSq = vector2DistanceSquared(originPos, toVector2(pos));
    if (distSq <= maxRangeSq && distSq < bestDist) {
      bestDist = distSq;
      bestId = id;
    }
  }

  return bestId;
}

function makeImpact(
  projectileId: EntityId,
  projectile: LiveProjectile,
  impactPosition: Vector2,
  remainingJumps: number | undefined
): ProjectileImpacted {
  let targetEntity: EntityId | undefined;
  if (projectile.Target.kind === 'EntityTarget') {
    targetEntity = projectile.Target.entity;
  }
  return {
    ProjectileId: projectileId,
    CasterId: projectile.Caster,
    ImpactPosition: impactPosition,
    TargetEntity: targetEntity,
    SkillId: projectile.SkillId,
    RemainingJumps: remainingJumps,
  };
}

function spawnChainProjectile(
  env: PomoEnvironment,
  world: import('../domain/world').MutableWorld,
  projectile: LiveProjectile,
  originPos: Vector2,
  currentTargetId: EntityId,
  jumpsLeft: number,
  maxRange: number
) {
  const liveEntities = world.EntityExists;
  const nextTargetId = findNextChainTarget(env.core.worldView, liveEntities, projectile.Caster, currentTargetId, originPos, maxRange);

  if (nextTargetId === undefined) return;

  const nextProjectileId = brandEntityId(`proj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const nextProjectile: LiveProjectile = {
    Caster: projectile.Caster,
    Target: { kind: 'EntityTarget', entity: nextTargetId },
    SkillId: projectile.SkillId,
    Info: {
      ...projectile.Info,
      Variations: { kind: 'Chained', jumpsLeft: jumpsLeft - 1, maxRange },
    },
  };

  const scenarioId = world.EntityScenario.get(projectile.Caster);
  if (scenarioId === undefined) return;

  // Start at current impact position
  const startPos = world.Positions.get(currentTargetId) ?? fromVector2(originPos);

  world.EntityExists.add(nextProjectileId);
  world.Positions.set(nextProjectileId, startPos);
  world.Velocities.set(nextProjectileId, Vector3Zero);
  world.LiveProjectiles.set(nextProjectileId, nextProjectile);
  world.EntityScenario.set(nextProjectileId, scenarioId);
  world.ModelConfigId.set(nextProjectileId, projectile.Info.Visuals.ModelId ?? 'Projectile');
}

// --- Update Loop ---

export function updateProjectiles(
  env: PomoEnvironment,
  world: import('../domain/world').MutableWorld,
  dt: number
): void {
  const projectilesToRemove: EntityId[] = [];
  const impactsToPublish: ProjectileImpacted[] = [];

  for (const [projectileId, projectile] of world.LiveProjectiles) {
    const projPos = world.Positions.get(projectileId);
    const targetPos = resolveTargetPosition(world, projectile.Target);

    if (!projPos || !targetPos) {
      projectilesToRemove.push(projectileId);
      continue;
    }

    // Handle descending projectiles differently (F# Projectile.fs:285-301)
    if (projectile.Info.Variations?.kind === 'Descending') {
      const impact = processDescendingProjectile(world, projectileId, projectile, dt);
      if (impact) {
        impactsToPublish.push(impact);
        projectilesToRemove.push(projectileId);
      }
      continue; // Skip normal horizontal movement
    }

    // Check if arrived (for horizontal/chained projectiles)
    const dist = vector2Distance(toVector2(projPos), toVector2(targetPos));
    const threshold = 16.0; // F#: Constants.Projectile.ArrivalThreshold = 16f

    if (dist < threshold) {
      // Impact!
      let remainingJumps: number | undefined;
      if (projectile.Info.Variations?.kind === 'Chained') {
        remainingJumps = projectile.Info.Variations.jumpsLeft;
      }

      impactsToPublish.push(makeImpact(projectileId, projectile, toVector2(targetPos), remainingJumps));
      projectilesToRemove.push(projectileId);

      // Handle chaining
      if (projectile.Info.Variations?.kind === 'Chained') {
        const jumpsLeft = projectile.Info.Variations.jumpsLeft;
        const maxRange = projectile.Info.Variations.maxRange;
        if (jumpsLeft > 0 && projectile.Target.kind === 'EntityTarget') {
          spawnChainProjectile(env, world, projectile, toVector2(targetPos), projectile.Target.entity, jumpsLeft, maxRange);
        }
      }
    } else {
      // Update velocity towards target (3D, matching F# handleHorizontalFlight)
      const dx = targetPos.X - projPos.X;
      const dz = targetPos.Z - projPos.Z;
      const xzDist = Math.sqrt(dx * dx + dz * dz);
      if (xzDist > 0.1) {
        const speed = projectile.Info.Speed;
        const vx = (dx / xzDist) * speed;
        const vz = (dz / xzDist) * speed;
        // Y velocity: proportional descent to arrive at target Y when reaching XZ
        // F#: yVelocity = (yDelta / xzDist) * speed
        const yDelta = targetPos.Y - projPos.Y;
        const vy = (yDelta / xzDist) * speed;
        world.Velocities.set(projectileId, { X: vx, Y: vy, Z: vz });
      }
    }
  }

  // Apply movement (position update mirrors F# MovementSystem behavior)
  for (const [projectileId] of world.LiveProjectiles) {
    if (projectilesToRemove.includes(projectileId)) continue;
    const pos = world.Positions.get(projectileId);
    const vel = world.Velocities.get(projectileId);
    if (pos && vel) {
      world.Positions.set(projectileId, {
        X: pos.X + vel.X * dt,
        Y: pos.Y + vel.Y * dt,
        Z: pos.Z + vel.Z * dt,
      });
    }
  }

  // Remove expired projectiles via stateWrite for consistent cleanup
  for (const id of projectilesToRemove) {
    env.core.stateWrite.RemoveEntity(id);
  }

  // Publish impact events
  for (const impact of impactsToPublish) {
    env.core.eventBus.publish({
      kind: 'Lifecycle',
      lifecycle: { kind: 'ProjectileImpacted', impact },
    });
  }
}

// --- System Factory ---

export interface ProjectileSystem {
  update(dt: number): void;
  dispose?(): void;
}

export function createProjectileSystem(env: PomoEnvironment): ProjectileSystem {
  return {
    update(dt) {
      updateProjectiles(env, env.core.world, dt);
    },
  };
}
