import { describe, it, expect } from 'vitest';
import { brandEntityId, brandItemId, brandItemInstanceId } from '../types/branded';
import type { ItemId } from '../types/branded';
import { createMutableWorld, createWorldView } from '../state/mutable-world';
import { createStateWriteService } from '../systems/state-write';
import { createEventBus } from '../events/event-bus';
import { createSeededPRNG } from '../utils/rng';
import { createInventorySystem } from '../systems/inventory';
import { createEquipmentSystem } from '../systems/equipment';
import type { PomoEnvironment, GameplayServices, CoreServices, StoreServices } from '../systems/environment';
import type { ItemStore } from '../stores/content-store';
import type { GameEvent } from '../domain/events';
import type { ItemDefinition, ItemInstance } from '../domain/item';

function createFakeItemStore(items: Map<ItemId, ItemDefinition>): ItemStore {
  return {
    tryFind(id: ItemId) {
      return items.get(id);
    },
    all() {
      return Array.from(items.values());
    },
  };
}

function createFakeStores(items: Map<ItemId, ItemDefinition>): StoreServices {
  return {
    skillStore: { tryFind() { return undefined; }, getActive() { return undefined; }, all() { return []; } },
    itemStore: createFakeItemStore(items),
    aiArchetypeStore: { tryFind() { return undefined; }, all() { return []; } },
    aiEntityStore: { tryFind() { return undefined; }, all() { return []; } },
    aiFamilyStore: { tryFind() { return undefined; }, all() { return []; } },
    decisionTreeStore: { tryFind() { return undefined; }, all() { return []; } },
    mapEntityGroupStore: { tryFind() { return undefined; }, all() { return []; } },
  };
}

function createFakeGameplayServices(): GameplayServices {
  return {
    projections: {
      computeMovementSnapshot() {
        return { Positions: new Map(), SpatialGrid: new Map(), Rotations: new Map(), ModelConfigIds: new Map() };
      },
      getNearbyEntitiesSnapshot() {
        return [];
      },
      calculateDerivedStats(world, _itemStore, entityId) {
        const base = world.BaseStats.get(entityId);
        if (!base) return undefined;
        return {
          AP: base.Power * 2,
          AC: base.Power + Math.floor(base.Power * 1.25),
          DX: base.Power,
          MP: base.Magic * 5,
          MA: base.Magic * 2,
          MD: base.Magic + Math.floor(base.Magic * 1.25),
          WT: base.Sense * 5,
          DA: base.Sense * 2,
          LK: base.Sense + Math.floor(base.Sense * 0.5),
          HP: base.Charm * 10,
          DP: base.Charm + Math.floor(base.Charm * 1.25),
          HV: base.Charm * 2,
          MS: 200,
          HPRegen: 50,
          MPRegen: 50,
          ElementAttributes: new Map(),
          ElementResistances: new Map(),
        };
      },
    },
    cameraService: {
      getAllCameras() { return []; },
    },
  };
}

function createMinimalEnv(
  world: import('../domain/world').MutableWorld,
  stores: StoreServices,
  seed = 0
): PomoEnvironment {
  const eventBus = createEventBus();
  const stateWrite = createStateWriteService();
  const rng = createSeededPRNG(seed);
  const worldView = createWorldView(world);

  const core: CoreServices = {
    eventBus,
    world,
    worldView,
    stateWrite,
    rng,
  };

  return {
    core,
    stores,
    gameplay: createFakeGameplayServices(),
  };
}

describe('Inventory System', () => {
  it('should pick up item into inventory', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('player-1');

    world.EntityExists.add(entityId);
    world.Resources.set(entityId, { HP: 100, MP: 100, Status: 'Alive' });

    const env = createMinimalEnv(world, createFakeStores(new Map()), 0);
    const inventory = createInventorySystem(env);

    const itemInstance: ItemInstance = {
      InstanceId: brandItemInstanceId('potion-1'),
      ItemId: brandItemId(1),
      UsesLeft: 5,
    };

    env.core.eventBus.publish({
      kind: 'ItemIntent',
      itemIntent: {
        kind: 'PickUp',
        pickUp: {
          Picker: entityId,
          Item: itemInstance,
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    expect(world.ItemInstances.has(brandItemInstanceId('potion-1'))).toBe(true);
    expect(world.EntityInventories.get(entityId)?.has(brandItemInstanceId('potion-1'))).toBe(true);

    inventory.dispose();
  });

  it('should use usable item and publish effect application', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('player-1');

    world.EntityExists.add(entityId);
    world.Resources.set(entityId, { HP: 100, MP: 100, Status: 'Alive' });

    const potionDef: ItemDefinition = {
      Id: brandItemId(1),
      Name: 'Health Potion',
      Weight: 1,
      Kind: {
        kind: 'Usable',
        usable: {
          Effect: {
            Name: 'Heal',
            Kind: 'Buff',
            DamageSource: 'Physical',
            Stacking: { kind: 'RefreshDuration' },
            Duration: { kind: 'Instant' },
            Visuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
            Modifiers: [
              { kind: 'ResourceChange', resource: 'HP', amount: { kind: 'Const', value: 50 } },
            ],
          },
        },
      },
    };

    const env = createMinimalEnv(world, createFakeStores(new Map([[brandItemId(1), potionDef]])), 0);
    const inventory = createInventorySystem(env);

    const itemInstance: ItemInstance = {
      InstanceId: brandItemInstanceId('potion-1'),
      ItemId: brandItemId(1),
      UsesLeft: 3,
    };

    world.ItemInstances.set(brandItemInstanceId('potion-1'), itemInstance);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    env.core.eventBus.publish({
      kind: 'ItemIntent',
      itemIntent: {
        kind: 'Use',
        useItem: {
          EntityId: entityId,
          ItemInstanceId: brandItemInstanceId('potion-1'),
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    // Verify effect application intent was published
    const effectEvents = receivedEvents.filter(
      (e) => e.kind === 'Intent' && e.intent.kind === 'EffectApplication'
    );
    expect(effectEvents.length).toBe(1);

    // Verify uses decremented
    expect(world.ItemInstances.get(brandItemInstanceId('potion-1'))?.UsesLeft).toBe(2);

    sub.unsubscribe();
    inventory.dispose();
  });
});

describe('Equipment System', () => {
  it('should equip item to slot', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('player-1');

    world.EntityExists.add(entityId);

    const env = createMinimalEnv(world, createFakeStores(new Map()), 0);
    const equipment = createEquipmentSystem(env);

    env.core.eventBus.publish({
      kind: 'ItemIntent',
      itemIntent: {
        kind: 'Equip',
        equip: {
          EntityId: entityId,
          ItemInstanceId: brandItemInstanceId('sword-1'),
          Slot: 'Weapon',
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    const equipped = world.EquippedItems.get(entityId);
    expect(equipped).toBeDefined();
    expect(equipped?.get('Weapon')).toBe(brandItemInstanceId('sword-1'));

    equipment.dispose();
  });

  it('should unequip item from slot', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('player-1');

    world.EntityExists.add(entityId);
    world.EquippedItems.set(entityId, new Map([['Weapon', brandItemInstanceId('sword-1')]]));

    const env = createMinimalEnv(world, createFakeStores(new Map()), 0);
    const equipment = createEquipmentSystem(env);

    env.core.eventBus.publish({
      kind: 'ItemIntent',
      itemIntent: {
        kind: 'Unequip',
        unequip: {
          EntityId: entityId,
          Slot: 'Weapon',
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    const equipped = world.EquippedItems.get(entityId);
    expect(equipped?.has('Weapon')).toBe(false);

    equipment.dispose();
  });
});
