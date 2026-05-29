import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { PomoEnvironment } from './environment';

// --- System Factory ---

export interface EquipmentSystem {
  update?(): void;
  dispose(): void;
}

export function createEquipmentSystem(env: PomoEnvironment): EquipmentSystem {
  const subscriptions: Subscription[] = [];

  const equipSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'ItemIntent'; itemIntent: { kind: 'Equip'; equip: import('../domain/events').EquipItemIntent } } =>
        e.kind === 'ItemIntent' && e.itemIntent.kind === 'Equip'
      )
    )
    .subscribe((e) => {
      const intent = e.itemIntent.equip;
      env.core.stateWrite.EquipItem(intent.EntityId, intent.Slot, intent.ItemInstanceId);
    });

  subscriptions.push(equipSub);

  const unequipSub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'ItemIntent'; itemIntent: { kind: 'Unequip'; unequip: import('../domain/events').UnequipItemIntent } } =>
        e.kind === 'ItemIntent' && e.itemIntent.kind === 'Unequip'
      )
    )
    .subscribe((e) => {
      const intent = e.itemIntent.unequip;
      env.core.stateWrite.UnequipItem(intent.EntityId, intent.Slot);
    });

  subscriptions.push(unequipSub);

  return {
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
  };
}
