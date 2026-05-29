import type { EntityId, ScenarioId } from '../types/branded';
import type { BaseStats, DerivedStats, Resource } from '../domain/entity';
import type { ActiveEffect, StatModifier } from '../domain/skill';
import type { World } from '../domain/world';
import type { Slot } from '../domain/item';
import type { ItemStore } from '../stores/content-store';
import type { Vector2 } from '../domain/core';
import { getGridCell } from '../domain/spatial';

// --- Derived Stats Calculator ---

export function calculateBase(baseStats: BaseStats): DerivedStats {
  return {
    AP: baseStats.Power * 2,
    AC: baseStats.Power + Math.floor(baseStats.Power * 1.25),
    DX: baseStats.Power,
    MP: baseStats.Magic * 5,
    MA: baseStats.Magic * 2,
    MD: baseStats.Magic + Math.floor(baseStats.Magic * 1.25),
    WT: baseStats.Sense * 5,
    DA: baseStats.Sense * 2,
    LK: baseStats.Sense + Math.floor(baseStats.Sense * 0.5),
    HP: baseStats.Charm * 10,
    DP: baseStats.Charm + Math.floor(baseStats.Charm * 1.25),
    HV: baseStats.Charm * 2,
    MS: 200,
    HPRegen: 50,
    MPRegen: 50,
    ElementAttributes: new Map(),
    ElementResistances: new Map(),
  };
}

function applyStatTransform(
  stats: DerivedStats,
  stat: import('../domain/core').Stat,
  transformI: (v: number) => number,
  transformF: (v: number) => number
): DerivedStats {
  switch (stat.kind) {
    case 'AP': return { ...stats, AP: transformI(stats.AP) };
    case 'AC': return { ...stats, AC: transformI(stats.AC) };
    case 'DX': return { ...stats, DX: transformI(stats.DX) };
    case 'MP': return { ...stats, MP: transformI(stats.MP) };
    case 'MA': return { ...stats, MA: transformI(stats.MA) };
    case 'MD': return { ...stats, MD: transformI(stats.MD) };
    case 'WT': return { ...stats, WT: transformI(stats.WT) };
    case 'DA': return { ...stats, DA: transformI(stats.DA) };
    case 'LK': return { ...stats, LK: transformI(stats.LK) };
    case 'HP': return { ...stats, HP: transformI(stats.HP) };
    case 'DP': return { ...stats, DP: transformI(stats.DP) };
    case 'HV': return { ...stats, HV: transformI(stats.HV) };
    case 'MS': return { ...stats, MS: transformI(stats.MS) };
    case 'HPRegen': return { ...stats, HPRegen: transformI(stats.HPRegen) };
    case 'MPRegen': return { ...stats, MPRegen: transformI(stats.MPRegen) };
    case 'ElementResistance': {
      const newMap = new Map(stats.ElementResistances);
      const current = newMap.get(stat.element) ?? 0;
      newMap.set(stat.element, transformF(current));
      return { ...stats, ElementResistances: newMap };
    }
    case 'ElementAttribute': {
      const newMap = new Map(stats.ElementAttributes);
      const current = newMap.get(stat.element) ?? 0;
      newMap.set(stat.element, transformF(current));
      return { ...stats, ElementAttributes: newMap };
    }
  }
}

function applySingleModifier(stats: DerivedStats, modifier: StatModifier): DerivedStats {
  switch (modifier.kind) {
    case 'Additive':
      return applyStatTransform(
        stats,
        modifier.stat,
        (v) => v + Math.floor(modifier.value),
        (v) => v + modifier.value
      );
    case 'Multiplicative':
      return applyStatTransform(
        stats,
        modifier.stat,
        (v) => Math.floor(v * modifier.value),
        (v) => v * modifier.value
      );
  }
}

export function applyModifiers(
  stats: DerivedStats,
  effects: readonly ActiveEffect[] | undefined,
  equipmentBonuses: StatModifier[]
): DerivedStats {
  let result = stats;

  for (const modifier of equipmentBonuses) {
    result = applySingleModifier(result, modifier);
  }

  if (effects) {
    for (const activeEffect of effects) {
      for (const modifier of activeEffect.SourceEffect.Modifiers) {
        if (modifier.kind === 'StaticMod') {
          result = applySingleModifier(result, modifier.modifier);
        }
        // DynamicMod, AbilityDamageMod, ResourceChange are not applied to derived stats
      }
    }
  }

  return result;
}

function collectEquipmentStats(
  equipmentStats: Map<Slot, StatModifier[]>
): StatModifier[] {
  if (equipmentStats.size === 0) return [];

  let totalCount = 0;
  for (const stats of equipmentStats.values()) {
    totalCount += stats.length;
  }

  if (totalCount === 0) return [];

  const allStats: StatModifier[] = [];
  for (const stats of equipmentStats.values()) {
    for (const stat of stats) {
      allStats.push(stat);
    }
  }
  return allStats;
}

function getEquipmentStatBonusesForId(
  world: World,
  itemStore: ItemStore,
  entityId: EntityId
): StatModifier[] {
  const equipped = world.EquippedItems.get(entityId);
  if (!equipped) return [];

  const equipmentStats = new Map<Slot, StatModifier[]>();

  for (const [slot, instanceId] of equipped.entries()) {
    const instance = world.ItemInstances.get(instanceId);
    if (!instance) continue;

    const itemDef = itemStore.tryFind(instance.ItemId);
    if (!itemDef) continue;

    if (itemDef.Kind.kind === 'Wearable') {
      equipmentStats.set(slot, itemDef.Kind.wearable.Stats);
    }
  }

  return collectEquipmentStats(equipmentStats);
}

export function calculateDerivedStatsForEntity(
  world: World,
  itemStore: ItemStore,
  entityId: EntityId
): DerivedStats | undefined {
  const baseStats = world.BaseStats.get(entityId);
  if (!baseStats) return undefined;

  const effects = world.ActiveEffects.get(entityId);
  const equipmentBonuses = getEquipmentStatBonusesForId(world, itemStore, entityId);

  const initial = calculateBase(baseStats);
  return applyModifiers(initial, effects, equipmentBonuses);
}

// --- Spatial Snapshot (Physics Cache) ---

const CELL_SIZE = 64.0;

export interface MovementSnapshot {
  Positions: Map<EntityId, import('../domain/core').WorldPosition>;
  SpatialGrid: Map<string, EntityId[]>; // key = `${x},${y}`
  Rotations: Map<EntityId, number>;
  ModelConfigIds: Map<EntityId, string>;
}

export const MovementSnapshotEmpty: MovementSnapshot = {
  Positions: new Map(),
  SpatialGrid: new Map(),
  Rotations: new Map(),
  ModelConfigIds: new Map(),
};

export function computeMovementSnapshot(
  time: number,
  positions: Map<EntityId, import('../domain/core').WorldPosition>,
  velocities: Map<EntityId, import('../domain/core').Vector3>,
  rotations: Map<EntityId, number>,
  modelConfigIds: Map<EntityId, string>,
  entityScenarios: Map<EntityId, ScenarioId>,
  scenarioId: ScenarioId
): MovementSnapshot {
  const dt = time;

  const positionsBuilder = new Map<EntityId, import('../domain/core').WorldPosition>();
  const rotationsBuilder = new Map<EntityId, number>();
  const modelConfigBuilder = new Map<EntityId, string>();
  const gridBuilder = new Map<string, EntityId[]>();

  for (const [id, startPos] of positions.entries()) {
    const entityScenario = entityScenarios.get(id);
    if (entityScenario !== scenarioId) continue;

    const v = velocities.get(id);
    const currentPos: import('../domain/core').WorldPosition = v
      ? {
          X: startPos.X + v.X * dt,
          Y: startPos.Y + v.Y * dt,
          Z: startPos.Z + v.Z * dt,
        }
      : startPos;

    positionsBuilder.set(id, currentPos);

    // Rotation derived from velocity if moving, else keep existing
    if (v && (v.X !== 0 || v.Y !== 0 || v.Z !== 0)) {
      rotationsBuilder.set(id, Math.atan2(v.X, v.Z));
    } else {
      const existing = rotations.get(id);
      if (existing !== undefined) rotationsBuilder.set(id, existing);
    }

    const model = modelConfigIds.get(id);
    if (model !== undefined) modelConfigBuilder.set(id, model);

    const cell = getGridCell(CELL_SIZE, { X: currentPos.X, Y: currentPos.Z });
    const key = `${cell.X},${cell.Y}`;
    const list = gridBuilder.get(key);
    if (list) {
      list.push(id);
    } else {
      gridBuilder.set(key, [id]);
    }
  }

  return {
    Positions: positionsBuilder,
    SpatialGrid: gridBuilder,
    Rotations: rotationsBuilder,
    ModelConfigIds: modelConfigBuilder,
  };
}

export function getNearbyEntitiesSnapshot(
  snapshot: MovementSnapshot,
  liveEntities: Set<EntityId>,
  center: Vector2,
  radius: number
): Array<{ entityId: EntityId; position: Vector2 }> {
  const cellRadius = Math.ceil(radius / CELL_SIZE);
  const centerCell = getGridCell(CELL_SIZE, center);

  const results: Array<{ entityId: EntityId; position: Vector2 }> = [];

  for (let dx = -cellRadius; dx <= cellRadius; dx++) {
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      const key = `${centerCell.X + dx},${centerCell.Y + dy}`;
      const list = snapshot.SpatialGrid.get(key);
      if (!list) continue;

      for (const id of list) {
        if (!liveEntities.has(id)) continue;
        const pos = snapshot.Positions.get(id);
        if (!pos) continue;
        const pos2d = { X: pos.X, Y: pos.Z };
        const dist = Math.sqrt(
          (pos2d.X - center.X) * (pos2d.X - center.X) +
            (pos2d.Y - center.Y) * (pos2d.Y - center.Y)
        );
        if (dist <= radius) {
          results.push({ entityId: id, position: pos2d });
        }
      }
    }
  }

  return results;
}

// --- Regeneration Context ---

export interface RegenerationContext {
  Resources: Resource;
  InCombatUntil: number;
  DerivedStats: DerivedStats;
}

export function computeRegenerationContext(
  world: World,
  itemStore: ItemStore,
  entityId: EntityId
): RegenerationContext | undefined {
  const resources = world.Resources.get(entityId);
  if (!resources || resources.Status === 'Dead') return undefined;

  const derived = calculateDerivedStatsForEntity(world, itemStore, entityId);
  if (!derived) return undefined;

  const inCombat = world.InCombatUntil.get(entityId) ?? 0;

  return {
    Resources: resources,
    InCombatUntil: inCombat,
    DerivedStats: derived,
  };
}
