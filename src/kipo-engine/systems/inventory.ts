import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { PomoEnvironment } from './environment';

// --- Handlers ---

function handlePickUpItemIntent(
  env: PomoEnvironment,
  intent: import('../domain/events').PickUpItemIntent
) {
  env.core.stateWrite.CreateItemInstance(intent.Item);
  env.core.stateWrite.AddItemToInventory(intent.Picker, intent.Item.InstanceId);
}

function handleUseItemIntent(
  env: PomoEnvironment,
  intent: import('../domain/events').UseItemIntent
) {
  const world = env.core.worldView;
  const itemInstance = world.ItemInstances.get(intent.ItemInstanceId);
  if (!itemInstance) return;

  const itemDef = env.stores.itemStore.tryFind(itemInstance.ItemId);
  if (!itemDef) return;

  if (itemDef.Kind.kind !== 'Usable') return;

  const props = itemDef.Kind.usable;

  if (itemInstance.UsesLeft !== undefined) {
    if (itemInstance.UsesLeft <= 0) return;

    // Publish effect application
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: {
        kind: 'EffectApplication',
        effectApp: {
          SourceEntity: intent.EntityId,
          TargetEntity: intent.EntityId,
          Effect: props.Effect,
        },
      },
    });

    // Decrement uses
    env.core.stateWrite.UpdateItemInstance({
      ...itemInstance,
      UsesLeft: itemInstance.UsesLeft - 1,
    });
  } else {
    // Infinite uses
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: {
        kind: 'EffectApplication',
        effectApp: {
          SourceEntity: intent.EntityId,
          TargetEntity: intent.EntityId,
          Effect: props.Effect,
        },
      },
    });
  }
}

// --- System Factory ---

export interface InventorySystem {
  update?(): void;
  dispose(): void;
}

export function createInventorySystem(env: PomoEnvironment): InventorySystem {
  const subscriptions: Subscription[] = [];

  const pickupSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'ItemIntent'; itemIntent: { kind: 'PickUp'; pickUp: import('../domain/events').PickUpItemIntent } } =>
        e.kind === 'ItemIntent' && e.itemIntent.kind === 'PickUp'
      )
    )
    .subscribe((e) => {
      handlePickUpItemIntent(env, e.itemIntent.pickUp);
    });

  subscriptions.push(pickupSub);

  const useSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'ItemIntent'; itemIntent: { kind: 'Use'; useItem: import('../domain/events').UseItemIntent } } =>
        e.kind === 'ItemIntent' && e.itemIntent.kind === 'Use'
      )
    )
    .subscribe((e) => {
      handleUseItemIntent(env, e.itemIntent.useItem);
    });

  subscriptions.push(useSub);

  return {
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
  };
}
