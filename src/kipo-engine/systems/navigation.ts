import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { EntityId } from '../types/branded';
import type { PomoEnvironment, GameSystem } from './environment';
import type { GameEvent } from '../domain/events';
import type { Vector2 } from '../domain/core';
import { toVector2, fromVector2 } from '../domain/core';
import { findPath2D, createNavGrid2D, hasLineOfSight, type NavGrid2D } from '../algorithms/pathfinding';

const FREE_MOVEMENT_THRESHOLD = 80; // Constants.Navigation.FreeMovementThreshold = cellSize * 5

const navGrid: NavGrid2D = createNavGrid2D(64, 128, 128);

function handleMovementTarget(env: PomoEnvironment, entityId: EntityId, target: Vector2) {
  const world = env.core.worldView;
  const pos = world.Positions.get(entityId);
  if (!pos) return;

  const currentPos = toVector2(pos);
  const targetPos = target;
  const distance = Math.sqrt(
    (targetPos.X - currentPos.X) ** 2 + (targetPos.Y - currentPos.Y) ** 2,
  );

  const useDirect = distance < FREE_MOVEMENT_THRESHOLD && hasLineOfSight(navGrid, currentPos, targetPos);

  if (useDirect) {
    env.core.stateWrite.UpdateMovementState(entityId, {
      kind: 'MovingTo',
      targetPosition: fromVector2(targetPos),
    });
    env.core.eventBus.publish({
      kind: 'State',
      state: {
        kind: 'Physics',
        event: {
          kind: 'MovementStateChanged',
          entityId,
          state: { kind: 'MovingTo', targetPosition: fromVector2(targetPos) },
        },
      },
    });
    return;
  }

  const path = findPath2D(navGrid, currentPos, targetPos);
  if (path && path.length > 0) {
    const waypoints = path.map(p => fromVector2(p));
    env.core.stateWrite.UpdateMovementState(entityId, {
      kind: 'MovingAlongPath',
      path: waypoints,
    });
    env.core.eventBus.publish({
      kind: 'State',
      state: {
        kind: 'Physics',
        event: {
          kind: 'MovementStateChanged',
          entityId,
          state: { kind: 'MovingAlongPath', path: waypoints },
        },
      },
    });
  } else {
    env.core.stateWrite.UpdateMovementState(entityId, { kind: 'Idle' });
    env.core.eventBus.publish({
      kind: 'State',
      state: {
        kind: 'Physics',
        event: {
          kind: 'MovementStateChanged',
          entityId,
          state: { kind: 'Idle' },
        },
      },
    });
  }
}

export function createNavigationSystem(env: PomoEnvironment): GameSystem {
  const subs: Subscription[] = [];

  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter((e): e is GameEvent =>
          e.kind === 'Intent' && e.intent.kind === 'MovementTarget'
        )
      )
      .subscribe((e) => {
        if (e.kind === 'Intent' && e.intent.kind === 'MovementTarget') {
          handleMovementTarget(env, e.intent.movement.EntityId, e.intent.movement.Target);
        }
      })
  );

  return {
    kind: 'Navigation',
    update() {},
    dispose() {
      for (const s of subs) s.unsubscribe();
    },
  };
}
