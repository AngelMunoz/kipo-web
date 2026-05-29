import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { EntityId } from '../types/branded';
import type { PomoEnvironment } from './environment';
import type { Resource } from '../domain/entity';
import type { DamageDealt, ResourceRestored } from '../domain/events';

// --- Regeneration Accumulators ---

const regenAccumulators = new Map<EntityId, { hpAcc: number; mpAcc: number }>();

// --- Handlers ---

function handleDamageDealt(
  env: PomoEnvironment,
  event: DamageDealt
) {
  const world = env.core.worldView;
  const currentResources = world.Resources.get(event.Target);
  if (!currentResources) return;

  const newHP = Math.max(0, currentResources.HP - event.Amount);
  const newStatus: Resource['Status'] = newHP <= 0 ? 'Dead' : currentResources.Status;
  const newResources: Resource = { ...currentResources, HP: newHP, Status: newStatus };

  env.core.stateWrite.UpdateResources(event.Target, newResources);
  env.core.stateWrite.UpdateInCombatTimer(event.Target);

  // Emit EntityDied if HP dropped to 0 or below
  if (newHP <= 0) {
    const scenarioId = world.EntityScenario.get(event.Target);
    if (scenarioId !== undefined) {
      env.core.eventBus.publish({
        kind: 'Lifecycle',
        lifecycle: {
          kind: 'EntityDied',
          died: { EntityId: event.Target, ScenarioId: scenarioId },
        },
      });
    }
  }
}

function handleResourceRestored(
  env: PomoEnvironment,
  event: ResourceRestored
) {
  const world = env.core.worldView;
  const currentResources = world.Resources.get(event.Target);
  if (!currentResources) return;

  const derivedStats = env.gameplay.projections.calculateDerivedStats?.(
    world,
    env.stores.itemStore,
    event.Target
  );

  let newResources: Resource = { ...currentResources };

  if (event.ResourceType === 'HP') {
    const maxHP = derivedStats?.HP ?? event.Amount;
    newResources.HP = Math.min(maxHP, currentResources.HP + event.Amount);
  } else {
    const maxMP = derivedStats?.MP ?? event.Amount;
    newResources.MP = Math.min(maxMP, currentResources.MP + event.Amount);
  }

  env.core.stateWrite.UpdateResources(event.Target, newResources);

  // Publish heal notification
  const position = world.Positions.get(event.Target);
  env.core.eventBus.publish({
    kind: 'Notification',
    notification: {
      kind: 'ShowMessage',
      message: {
        Message: `${event.Amount} ${event.ResourceType}`,
        Position: position ?? { X: 0, Y: 0, Z: 0 },
        Type: 'Heal',
      },
    },
  });
}

// --- Regeneration ---

function processAutoRegen(
  env: PomoEnvironment,
  totalGameTime: number,
  deltaTime: number
) {
  const world = env.core.worldView;

  for (const [entityId, resources] of world.Resources) {
    if (resources.Status === 'Dead') continue;

    const inCombatUntil = world.InCombatUntil.get(entityId) ?? 0;
    if (totalGameTime <= inCombatUntil) continue; // Still in combat, no regen

    const derivedStats = env.gameplay.projections.calculateDerivedStats?.(
      world,
      env.stores.itemStore,
      entityId
    );
    if (!derivedStats) continue;

    const acc = regenAccumulators.get(entityId) ?? { hpAcc: 0, mpAcc: 0 };

    const hpRegenThisFrame = derivedStats.HPRegen * deltaTime;
    const mpRegenThisFrame = derivedStats.MPRegen * deltaTime;

    const newHpAcc = acc.hpAcc + hpRegenThisFrame;
    const newMpAcc = acc.mpAcc + mpRegenThisFrame;

    const hpToHeal = Math.floor(newHpAcc);
    const mpToHeal = Math.floor(newMpAcc);

    const remainderHpAcc = newHpAcc - hpToHeal;
    const remainderMpAcc = newMpAcc - mpToHeal;

    regenAccumulators.set(entityId, { hpAcc: remainderHpAcc, mpAcc: remainderMpAcc });

    if (hpToHeal > 0 || mpToHeal > 0) {
      const newHP = Math.min(derivedStats.HP, resources.HP + hpToHeal);
      const newMP = Math.min(derivedStats.MP, resources.MP + mpToHeal);

      if (newHP !== resources.HP || newMP !== resources.MP) {
        env.core.stateWrite.UpdateResources(entityId, { ...resources, HP: newHP, MP: newMP });
      }
    }
  }
}

// --- System Factory ---

export interface ResourceManagerSystem {
  update(totalGameTime: number, deltaTime: number): void;
  dispose(): void;
}

export function createResourceManagerSystem(env: PomoEnvironment): ResourceManagerSystem {
  const subscriptions: Subscription[] = [];

  // Subscribe to DamageDealt notifications
  const damageSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'Notification'; notification: { kind: 'DamageDealt'; damage: DamageDealt } } =>
        e.kind === 'Notification' && e.notification.kind === 'DamageDealt'
      )
    )
    .subscribe((e) => {
      handleDamageDealt(env, e.notification.damage);
    });

  subscriptions.push(damageSub);

  // Subscribe to ResourceRestored notifications
  const restoreSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'Notification'; notification: { kind: 'ResourceRestored'; restored: ResourceRestored } } =>
        e.kind === 'Notification' && e.notification.kind === 'ResourceRestored'
      )
    )
    .subscribe((e) => {
      handleResourceRestored(env, e.notification.restored);
    });

  subscriptions.push(restoreSub);

  return {
    update(totalGameTime, deltaTime) {
      processAutoRegen(env, totalGameTime, deltaTime);
    },
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
  };
}
