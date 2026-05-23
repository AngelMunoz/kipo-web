import type { EntityId } from '../types/branded';
import type { PomoEnvironment } from './environment';
import type { Vector2 } from '../domain/core';
import { toVector2, vector2Distance, vector2Normalize } from '../domain/core';

// --- Movement Target Handling ---

export interface MovementSystem {
  update(dt: number): void;
  dispose(): void;
}

function getPosition(world: import('../domain/world').MutableWorld, entityId: EntityId): Vector2 {
  const pos = world.Positions.get(entityId);
  if (!pos) return { X: 0, Y: 0 };
  return toVector2(pos);
}

function publishMovementStateChanged(env: PomoEnvironment, entityId: EntityId, state: import('../domain/events').MovementState) {
  env.core.eventBus.publish({
    kind: 'State',
    state: {
      kind: 'Physics',
      event: {
        kind: 'MovementStateChanged',
        entityId,
        state,
      },
    },
  });
}

function updateMovementTargets(env: PomoEnvironment) {
  const world = env.core.world;

  for (const [entityId, state] of world.MovementStates) {
    switch (state.kind) {
      case 'MovingTo': {
        const pos = getPosition(world, entityId);
        const target = toVector2(state.targetPosition);
        const dist = vector2Distance(pos, target);
        const threshold = 1.0; // Close enough

        if (dist < threshold) {
          // Arrived
          env.core.stateWrite.UpdateMovementState(entityId, { kind: 'Idle' });
          world.Velocities.set(entityId, { X: 0, Y: 0, Z: 0 });
          publishMovementStateChanged(env, entityId, { kind: 'Idle' });
        } else {
          // Move towards target
          const dir = vector2Normalize({ X: target.X - pos.X, Y: target.Y - pos.Y });
          // Speed from derived stats if available, else default 100
          const speed = 100; // TODO: lookup derived stats MS
          const vel = { X: dir.X * speed, Y: 0, Z: dir.Y * speed };
          world.Velocities.set(entityId, vel);
        }
        break;
      }
      case 'MovingAlongPath': {
        if (state.path.length === 0) {
          env.core.stateWrite.UpdateMovementState(entityId, { kind: 'Idle' });
          world.Velocities.set(entityId, { X: 0, Y: 0, Z: 0 });
          publishMovementStateChanged(env, entityId, { kind: 'Idle' });
          break;
        }
        const currentTarget = state.path[0];
        const pos = getPosition(world, entityId);
        const target = toVector2(currentTarget);
        const dist = vector2Distance(pos, target);
        const threshold = 1.0;

        if (dist < threshold) {
          // Reached waypoint
          const remaining = state.path.slice(1);
          if (remaining.length === 0) {
            env.core.stateWrite.UpdateMovementState(entityId, { kind: 'Idle' });
            world.Velocities.set(entityId, { X: 0, Y: 0, Z: 0 });
            publishMovementStateChanged(env, entityId, { kind: 'Idle' });
          } else {
            env.core.stateWrite.UpdateMovementState(entityId, { kind: 'MovingAlongPath', path: remaining });
          }
        } else {
          const dir = vector2Normalize({ X: target.X - pos.X, Y: target.Y - pos.Y });
          const speed = 100; // TODO: lookup derived stats MS
          world.Velocities.set(entityId, { X: dir.X * speed, Y: 0, Z: dir.Y * speed });
        }
        break;
      }
      case 'Idle': {
        // Keep velocity zeroed
        const vel = world.Velocities.get(entityId);
        if (vel && (vel.X !== 0 || vel.Z !== 0)) {
          world.Velocities.set(entityId, { X: 0, Y: 0, Z: 0 });
        }
        break;
      }
    }
  }
}

function updatePositions(world: import('../domain/world').MutableWorld, dt: number) {
  for (const [entityId, pos] of world.Positions) {
    // Skip projectiles - they handle their own movement
    if (world.LiveProjectiles.has(entityId)) continue;

    const vel = world.Velocities.get(entityId);
    if (!vel || (vel.X === 0 && vel.Y === 0 && vel.Z === 0)) continue;

    world.Positions.set(entityId, {
      X: pos.X + vel.X * dt,
      Y: pos.Y + vel.Y * dt,
      Z: pos.Z + vel.Z * dt,
    });
  }
}

export function createMovementSystem(env: PomoEnvironment): MovementSystem {
  return {
    update(dt) {
      updateMovementTargets(env);
      updatePositions(env.core.world, dt);
    },
    dispose() {},
  };
}
