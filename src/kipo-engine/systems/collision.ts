/**
 * Collision detection system (2D).
 * Ported from F#: Pomo.Core.Systems.Collision
 *
 * Detects entity-entity collisions using a 2D spatial grid.
 * Note: F# uses 3D grid, but TypeScript port is 2D.
 */

import type { EntityId, ScenarioId } from '../types/branded';
import type { WorldPosition, Vector2 } from '../domain/core';
import type { GridCell } from '../domain/spatial';
import type { PomoEnvironment } from './environment';
import type { GameSystem } from './environment';
import { getGridCell } from '../domain/spatial';

const CELL_SIZE = 64.0;
const COLLISION_DISTANCE = 32.0; // From F# Constants.Entity.CollisionDistance

// Neighbor offsets for 2D grid (3x3 square)
const NEIGHBOR_OFFSETS_2D: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],  [0, 0],  [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

// --- 2D Spatial Grid ---

function getNearbyEntities2D(
  grid: Map<string, EntityId[]>,
  cell: GridCell
): EntityId[] {
  const results: EntityId[] = [];

  for (const [dx, dy] of NEIGHBOR_OFFSETS_2D) {
    const neighborCell: GridCell = {
      X: cell.X + dx,
      Y: cell.Y + dy,
    };

    const key = `${neighborCell.X},${neighborCell.Y}`;
    const entities = grid.get(key);
    if (entities) {
      results.push(...entities);
    }
  }

  return results;
}

// --- Collision Detection ---

export interface CollisionSystem extends GameSystem {
  update(): void;
}

export function createCollisionSystem(env: PomoEnvironment): CollisionSystem {
  return {
    kind: 'Collision',
    update() {
      const world = env.core.world;
      const scenarios = world.Scenarios;

      // Process each scenario (from F# CollisionSystem.Update)
      for (const [scenarioId] of scenarios) {
        // Build 2D spatial grid for this scenario
        const grid = new Map<string, EntityId[]>();
        const positions = new Map<EntityId, Vector2>();

        for (const [entityId, pos] of world.Positions) {
          // Filter by scenario
          if (world.EntityScenario.get(entityId) !== scenarioId) continue;

          // Store 2D position (X, Z -> X, Y in 2D)
          const pos2d: Vector2 = { X: pos.X, Y: pos.Z };
          positions.set(entityId, pos2d);

          // Add to spatial grid
          const cell = getGridCell(CELL_SIZE, pos2d);
          const key = `${cell.X},${cell.Y}`;
          const list = grid.get(key);
          if (list) {
            list.push(entityId);
          } else {
            grid.set(key, [entityId]);
          }
        }

        // Entity-entity collision detection
        for (const [entityId, pos] of positions) {
          const cell = getGridCell(CELL_SIZE, pos);
          const nearbyEntities = getNearbyEntities2D(grid, cell);

          for (const otherId of nearbyEntities) {
            if (entityId === otherId) continue;

            const otherPos = positions.get(otherId);
            if (!otherPos) continue;

            // Check 2D distance
            const dx = pos.X - otherPos.X;
            const dy = pos.Y - otherPos.Y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < COLLISION_DISTANCE) {
              // Publish collision event (matches F# Collision.fs:86-91)
              env.core.eventBus.publish({
                kind: 'Collision',
                collision: {
                  kind: 'EntityCollision',
                  entities: [entityId, otherId],
                },
              });
            }
          }
        }
      }
    },
    dispose() {},
  };
}
