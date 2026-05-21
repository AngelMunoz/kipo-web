import type { PomoEnvironment } from './systems/environment';
import type { EffectApplicationSystem } from './systems/effect-application';
import type { ProjectileSystem } from './systems/projectile';
import type { MovementSystem } from './systems/movement';
import type { AISystem } from './systems/ai-system';
import type { ResourceManagerSystem } from './systems/resource-manager';
import type { InventorySystem } from './systems/inventory';
import type { EquipmentSystem } from './systems/equipment';
import type { EntitySpawnerSystem } from './systems/entity-spawner';
import type { NotificationSystem } from './systems/notification';

export interface GameplayLoop {
  update(dt: number): void;
  dispose(): void;
}

export interface SystemUpdate {
  update(dt: number): void;
}

export function createGameplayLoop(
  env: PomoEnvironment,
  systems: {
    effectApp: EffectApplicationSystem;
    projectile: ProjectileSystem;
    movement: MovementSystem;
    ai: AISystem;
    resourceManager: ResourceManagerSystem;
    inventory: InventorySystem;
    equipment: EquipmentSystem;
    entitySpawner: EntitySpawnerSystem;
    notification: NotificationSystem;
    // Future systems go here
  }
): GameplayLoop {
  return {
    update(dt) {
      const world = env.core.world;
      const time = world.Time;
      const previous = time.TotalGameTime;

      // 1. Update time
      world.Time = {
        Delta: dt,
        TotalGameTime: previous + dt,
        Previous: previous,
      };

      // 2. Run update-based systems in F# order:
      // EffectProcessing -> Projectile -> Movement -> AI -> Collision -> Spawner -> ResourceManager -> Notification
      systems.effectApp.update(world, previous + dt, previous);
      systems.projectile.update(dt);
      systems.movement.update(dt);
      systems.ai.update();
      systems.entitySpawner.update();
      systems.resourceManager.update(previous + dt, dt);
      systems.notification.update(dt);

      // 3. Flush EventBus - processes all events published during this frame
      // This triggers CombatSystem, EffectApplication, Inventory, Equipment, etc.
      env.core.eventBus.flush();

      // 4. Flush all queued state writes
      env.core.stateWrite.FlushWrites(world, previous + dt);

      // 5. Refresh world view (our worldView is a proxy, so no explicit refresh needed)
      // But if we ever cache projections, refresh them here.
    },

    dispose() {
      systems.effectApp.dispose?.();
      systems.projectile.dispose?.();
      systems.movement.dispose?.();
      systems.ai.dispose?.();
      systems.resourceManager.dispose?.();
      systems.inventory.dispose?.();
      systems.equipment.dispose?.();
      systems.entitySpawner.dispose?.();
      systems.notification.dispose?.();
      // Other systems dispose here
    },
  };
}
