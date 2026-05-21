import { describe, it, expect } from 'vitest';
import { brandEntityId, brandItemId, brandItemInstanceId } from '../types/branded';
import type { EntityId, ItemId, ItemInstanceId } from '../types/branded';
import { createMutableWorld } from '../state/mutable-world';
import {
  calculateDerivedStatsForEntity,
  calculateBase,
  applyModifiers,
} from '../state/projections';
import type { BaseStats } from '../domain/entity';
import type { ActiveEffect, Effect, StatModifier } from '../domain/skill';
import type { ItemDefinition, ItemInstance, Slot } from '../domain/item';
import type { World } from '../domain/world';

// --- Fake ItemStore ---

function createFakeItemStore(items: Map<ItemId, ItemDefinition>) {
  return {
    tryFind(id: ItemId): ItemDefinition | undefined {
      return items.get(id);
    },
    all(): ItemDefinition[] {
      return Array.from(items.values());
    },
  };
}

// --- Test Helpers (ported from ProjectionsTests.fs) ---

function createBaseStats(power: number, magic: number, sense: number, charm: number): BaseStats {
  return { Power: power, Magic: magic, Sense: sense, Charm: charm };
}

function createWearableItem(id: ItemId, name: string, slot: Slot, stats: StatModifier[]): ItemDefinition {
  return {
    Id: id,
    Name: name,
    Weight: 1,
    Kind: { kind: 'Wearable', wearable: { Slot: slot, Stats: stats } },
  };
}

function createBuffEffect(name: string, modifiers: StatModifier[]): Effect {
  return {
    Name: name,
    Kind: 'Buff',
    DamageSource: 'Physical',
    Stacking: { kind: 'RefreshDuration' },
    Duration: { kind: 'Timed', seconds: 30 },
    Visuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
    Modifiers: modifiers.map((m) => ({ kind: 'StaticMod', modifier: m })),
  };
}

function createDebuffEffect(name: string, modifiers: StatModifier[]): Effect {
  return {
    Name: name,
    Kind: 'Debuff',
    DamageSource: 'Physical',
    Stacking: { kind: 'RefreshDuration' },
    Duration: { kind: 'Timed', seconds: 30 },
    Visuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
    Modifiers: modifiers.map((m) => ({ kind: 'StaticMod', modifier: m })),
  };
}

function createActiveEffect(sourceEntity: EntityId, targetEntity: EntityId, effect: Effect): ActiveEffect {
  return {
    Id: `effect-${Math.random().toString(36).slice(2)}`,
    SourceEffect: effect,
    SourceEntity: sourceEntity,
    TargetEntity: targetEntity,
    StartTime: 0,
    StackCount: 1,
  };
}

function spawnEntity(world: World, entityId: EntityId, baseStats: BaseStats) {
  world.EntityExists.add(entityId);
  world.BaseStats.set(entityId, baseStats);
}

function equipItem(world: World, entityId: EntityId, slot: Slot, itemId: ItemId, instanceId: ItemInstanceId) {
  const instance: ItemInstance = {
    InstanceId: instanceId,
    ItemId: itemId,
    UsesLeft: undefined,
  };
  world.ItemInstances.set(instanceId, instance);

  const equipped = world.EquippedItems.get(entityId);
  if (equipped) {
    equipped.set(slot, instanceId);
  } else {
    world.EquippedItems.set(entityId, new Map([[slot, instanceId]]));
  }
}

function applyEffectToEntity(world: World, entityId: EntityId, effect: ActiveEffect) {
  const existing = world.ActiveEffects.get(entityId);
  if (existing) {
    existing.push(effect);
    world.ActiveEffects.set(entityId, existing);
  } else {
    world.ActiveEffects.set(entityId, [effect]);
  }
}

// --- Test Suites (ported from F# ProjectionsTests.fs) ---

describe('Equipment Derived Stats', () => {
  it('equipment bonus adds to derived stats', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    // Sword with +10 AP
    const sword = createWearableItem(brandItemId(1), 'Test Sword', 'Weapon', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const itemStore = createFakeItemStore(new Map([[brandItemId(1), sword]]));

    equipItem(world, entityId, 'Weapon', brandItemId(1), brandItemInstanceId('sword-instance-1'));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, equipment bonus = +10, total = 30
    expect(derived!.AP).toBe(30);
  });

  it('multiple equipment pieces stack correctly', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const baseStats = createBaseStats(10, 0, 0, 10);
    spawnEntity(world, entityId, baseStats);

    const sword = createWearableItem(brandItemId(1), 'Test Sword', 'Weapon', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const shield = createWearableItem(brandItemId(2), 'Test Shield', 'Shield', [
      { kind: 'Additive', stat: { kind: 'DP' }, value: 5 },
    ]);
    const itemStore = createFakeItemStore(new Map([
      [brandItemId(1), sword],
      [brandItemId(2), shield],
    ]));

    equipItem(world, entityId, 'Weapon', brandItemId(1), brandItemInstanceId('sword-instance-1'));
    equipItem(world, entityId, 'Shield', brandItemId(2), brandItemInstanceId('shield-instance-1'));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, sword = +10, total = 30
    expect(derived!.AP).toBe(30);
    // Base DP = 22 (Charm 10), shield = +5, total = 27
    expect(derived!.DP).toBe(27);
  });

  it('multiplicative equipment bonus multiplies stat', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const ring = createWearableItem(brandItemId(1), 'Power Ring', 'Accessory', [
      { kind: 'Multiplicative', stat: { kind: 'AP' }, value: 1.5 },
    ]);
    const itemStore = createFakeItemStore(new Map([[brandItemId(1), ring]]));

    equipItem(world, entityId, 'Accessory', brandItemId(1), brandItemInstanceId('ring-instance-1'));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, * 1.5 = 30
    expect(derived!.AP).toBe(30);
  });
});

describe('Active Effect Derived Stats', () => {
  it('buff effect adds to derived stats', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const strengthBuff = createBuffEffect('Strength', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 15 },
    ]);
    const activeEffect = createActiveEffect(sourceId, entityId, strengthBuff);
    applyEffectToEntity(world, entityId, activeEffect);

    const itemStore = createFakeItemStore(new Map());
    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, buff = +15, total = 35
    expect(derived!.AP).toBe(35);
  });

  it('debuff effect reduces derived stats', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const weaknessDebuff = createDebuffEffect('Weakness', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: -5 },
    ]);
    const activeEffect = createActiveEffect(sourceId, entityId, weaknessDebuff);
    applyEffectToEntity(world, entityId, activeEffect);

    const itemStore = createFakeItemStore(new Map());
    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, debuff = -5, total = 15
    expect(derived!.AP).toBe(15);
  });

  it('multiple effects stack correctly', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 10, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const strengthBuff = createBuffEffect('Strength', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const magicBuff = createBuffEffect('Magic Boost', [
      { kind: 'Additive', stat: { kind: 'MA' }, value: 20 },
    ]);

    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, strengthBuff));
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, magicBuff));

    const itemStore = createFakeItemStore(new Map());
    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, buff = +10, total = 30
    expect(derived!.AP).toBe(30);
    // Base MA = 20, buff = +20, total = 40
    expect(derived!.MA).toBe(40);
  });

  it('multiplicative buff effect multiplies stat', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const empowerBuff = createBuffEffect('Empower', [
      { kind: 'Multiplicative', stat: { kind: 'AP' }, value: 2.0 },
    ]);
    const activeEffect = createActiveEffect(sourceId, entityId, empowerBuff);
    applyEffectToEntity(world, entityId, activeEffect);

    const itemStore = createFakeItemStore(new Map());
    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, * 2.0 = 40
    expect(derived!.AP).toBe(40);
  });
});

describe('Equipment + Effects Combined', () => {
  it('equipment and buff effects combine correctly', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const sword = createWearableItem(brandItemId(1), 'Test Sword', 'Weapon', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const itemStore = createFakeItemStore(new Map([[brandItemId(1), sword]]));
    equipItem(world, entityId, 'Weapon', brandItemId(1), brandItemInstanceId('sword-instance-1'));

    const strengthBuff = createBuffEffect('Strength', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 5 },
    ]);
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, strengthBuff));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, equipment = +10, buff = +5, total = 35
    expect(derived!.AP).toBe(35);
  });

  it('equipment bonus plus debuff penalty balance out', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    const baseStats = createBaseStats(10, 0, 0, 0);
    spawnEntity(world, entityId, baseStats);

    const sword = createWearableItem(brandItemId(1), 'Test Sword', 'Weapon', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const itemStore = createFakeItemStore(new Map([[brandItemId(1), sword]]));
    equipItem(world, entityId, 'Weapon', brandItemId(1), brandItemInstanceId('sword-instance-1'));

    const weaknessDebuff = createDebuffEffect('Weakness', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: -10 },
    ]);
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, weaknessDebuff));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();
    // Base AP = 20, equipment = +10, debuff = -10, total = 20 (back to base)
    expect(derived!.AP).toBe(20);
  });

  it('full loadout scenario - multiple equipment and effects', () => {
    const world = createMutableWorld();
    const entityId = brandEntityId('entity-1');
    const sourceId = brandEntityId('source-1');
    // Warrior with 20 Power, 5 Magic, 10 Sense, 15 Charm
    const baseStats = createBaseStats(20, 5, 10, 15);
    spawnEntity(world, entityId, baseStats);

    // Equipment: Sword (+15 AP), Armor (+10 DP), Ring (1.2x LK)
    const sword = createWearableItem(brandItemId(1), 'Warrior Sword', 'Weapon', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 15 },
    ]);
    const armor = createWearableItem(brandItemId(2), 'Plate Armor', 'Chest', [
      { kind: 'Additive', stat: { kind: 'DP' }, value: 10 },
    ]);
    const ring = createWearableItem(brandItemId(3), 'Lucky Ring', 'Accessory', [
      { kind: 'Multiplicative', stat: { kind: 'LK' }, value: 1.2 },
    ]);
    const itemStore = createFakeItemStore(new Map([
      [brandItemId(1), sword],
      [brandItemId(2), armor],
      [brandItemId(3), ring],
    ]));

    equipItem(world, entityId, 'Weapon', brandItemId(1), brandItemInstanceId('sword-instance-1'));
    equipItem(world, entityId, 'Chest', brandItemId(2), brandItemInstanceId('armor-instance-1'));
    equipItem(world, entityId, 'Accessory', brandItemId(3), brandItemInstanceId('ring-instance-1'));

    // Buffs: Battle Cry (+10 AP), Bless (+5 DP)
    const battleCry = createBuffEffect('Battle Cry', [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    const bless = createBuffEffect('Bless', [
      { kind: 'Additive', stat: { kind: 'DP' }, value: 5 },
    ]);
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, battleCry));
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, bless));

    // Debuff: Poison (-3 DP)
    const poison = createDebuffEffect('Poison', [
      { kind: 'Additive', stat: { kind: 'DP' }, value: -3 },
    ]);
    applyEffectToEntity(world, entityId, createActiveEffect(sourceId, entityId, poison));

    const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
    expect(derived).toBeDefined();

    // AP: Base = 20*2 = 40, + Sword 15 + BattleCry 10 = 65
    expect(derived!.AP).toBe(65);

    // DP: Base = 15 + floor(15*1.25) = 15 + 18 = 33, + Armor 10 + Bless 5 - Poison 3 = 45
    expect(derived!.DP).toBe(45);

    // LK: Base = 10 + floor(10*0.5) = 15, * 1.2 = 18
    expect(derived!.LK).toBe(18);
  });
});

// --- Unit tests for applyModifiers (ported from internal logic) ---

describe('applyModifiers unit tests', () => {
  it('additive modifier adds to stat', () => {
    const base = calculateBase(createBaseStats(10, 0, 0, 0));
    const modified = applyModifiers(base, undefined, [
      { kind: 'Additive', stat: { kind: 'AP' }, value: 10 },
    ]);
    expect(modified.AP).toBe(30); // 20 + 10
  });

  it('multiplicative modifier multiplies stat', () => {
    const base = calculateBase(createBaseStats(10, 0, 0, 0));
    const modified = applyModifiers(base, undefined, [
      { kind: 'Multiplicative', stat: { kind: 'AP' }, value: 1.5 },
    ]);
    expect(modified.AP).toBe(30); // floor(20 * 1.5) = 30
  });

  it('active effect modifiers are applied', () => {
    const base = calculateBase(createBaseStats(10, 0, 0, 0));
    const buff: Effect = {
      Name: 'Strength',
      Kind: 'Buff',
      DamageSource: 'Physical',
      Stacking: { kind: 'RefreshDuration' },
      Duration: { kind: 'Timed', seconds: 30 },
      Visuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
      Modifiers: [{ kind: 'StaticMod', modifier: { kind: 'Additive', stat: { kind: 'AP' }, value: 15 } }],
    };
    const active: ActiveEffect = {
      Id: 'test',
      SourceEffect: buff,
      SourceEntity: brandEntityId('src'),
      TargetEntity: brandEntityId('tgt'),
      StartTime: 0,
      StackCount: 1,
    };

    const modified = applyModifiers(base, [active], []);
    expect(modified.AP).toBe(35); // 20 + 15
  });
});
