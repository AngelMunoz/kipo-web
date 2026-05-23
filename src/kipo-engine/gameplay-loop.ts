import type { GameSystem, PomoEnvironment } from "./systems/environment";
import type { EffectApplicationSystem } from "./systems/effect-application";
import type { ProjectileSystem } from "./systems/projectile";
import type { MovementSystem } from "./systems/movement";
import type { AISystem } from "./systems/ai-system";
import type { ResourceManagerSystem } from "./systems/resource-manager";
import type { InventorySystem } from "./systems/inventory";
import type { EquipmentSystem } from "./systems/equipment";
import type { EntitySpawnerSystem } from "./systems/entity-spawner";
import type { NotificationSystem } from "./systems/notification";
import type { AbilityActivationSystem } from "./systems/ability-activation";
import type { MutableWorld } from "./domain/world";
import type { IStateWriteService } from "./systems/state-write";

function processChargeExpiry(world: MutableWorld, totalTime: number, stateWrite: IStateWriteService, eventBus: import("./events/event-bus").EventBus) {
  for (const [casterId, charge] of world.ActiveCharges) {
    if (totalTime - charge.startTime >= charge.Duration) {
      eventBus.publish({
        kind: 'Lifecycle',
        lifecycle: {
          kind: 'ChargeCompleted',
          charge: {
            CasterId: casterId,
            SkillId: charge.SkillId,
            Target: charge.Target,
          },
        },
      });
      stateWrite.RemoveActiveCharge(casterId);
      stateWrite.RemoveActiveOrbital(casterId);
    }
  }
}

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
    abilityActivation: AbilityActivationSystem;
    combat: GameSystem;
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
  },
): GameplayLoop {
  return {
    update(dt) {
      const world = env.core.world;
      const previous = world.Time.TotalGameTime;

      // F# system update order (GameplayScene.fs lines 183-205):
      // 1. Input/Control systems
      // 2. AbilityActivationSystem
      // 3. CombatSystem
      // 4. ResourceManagerSystem
      // 5. ProjectileSystem
      // 6. MovementSystem (applies velocities)
      // 7. AI system
      // 8. EntitySpawner
      // 9. EffectProcessing
      // 10. NotificationSystem
      // (Render systems handled by Phaser separately)

      // Note: abilityActivation and combat are primarily event-driven,
      // but we call update() to maintain the F# ordering semantics.
      systems.abilityActivation.update(dt);
      systems.combat.update(dt);
      systems.resourceManager.update(previous + dt, dt);
      systems.projectile.update(dt);
      processChargeExpiry(world, previous + dt, env.core.stateWrite, env.core.eventBus);
      systems.movement.update(dt);
      systems.ai.update();
      systems.entitySpawner.update();
      systems.effectApp.update(world, previous + dt, previous);
      systems.notification.update(dt);
      systems.inventory.update?.();
      systems.equipment.update?.();

      // F#: worldUpdateComponent updates time AFTER all systems
      world.Time = {
        Delta: dt,
        TotalGameTime: previous + dt,
        Previous: previous,
      };

      // F#: worldUpdateComponent flushes EventBus after time update
      env.core.eventBus.flush();

      // F#: stateWriteFlushComponent (UpdateOrder = 1000) flushes at the very end
      env.core.stateWrite.FlushWrites(world, previous + dt);
    },

    dispose() {
      systems.abilityActivation.dispose?.();
      systems.combat.dispose?.();
      systems.effectApp.dispose?.();
      systems.projectile.dispose?.();
      systems.movement.dispose?.();
      systems.ai.dispose?.();
      systems.resourceManager.dispose?.();
      systems.inventory.dispose?.();
      systems.equipment.dispose?.();
      systems.entitySpawner.dispose?.();
      systems.notification.dispose?.();
    },
  };
}
