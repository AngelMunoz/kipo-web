import type { Time, WorldText } from './core';
import type { EntityId, ScenarioId, SkillId, ItemInstanceId } from '../types/branded';
import type { SkillTarget } from './events';

export interface ActiveCharge {
  SkillId: SkillId;
  Target: SkillTarget;
  startTime: number;
  Duration: number;
}

export interface Scenario {
  Id: ScenarioId;
  BlockMap: import('./spatial').GridCell[][] | undefined; // placeholder
}

export interface MutableWorld {
  Time: Time;

  // Entity existence
  EntityExists: Set<EntityId>;

  // Unstable (highly changing) - plain mutable
  Positions: Map<EntityId, import('./core').WorldPosition>;
  Velocities: Map<EntityId, import('./core').Vector3>;
  Rotations: Map<EntityId, number>;
  MovementStates: Map<EntityId, import('./events').MovementState>;
  RawInputStates: Map<EntityId, import('./events').RawInputState>;
  InputMaps: Map<EntityId, import('./events').InputMap>;
  GameActionStates: Map<EntityId, Map<import('./events').GameAction, import('./events').InputActionState>>;
  ActionSets: Map<EntityId, Map<number, Map<import('./events').GameAction, import('./events').SlotProcessing>>>;
  ActiveActionSets: Map<EntityId, number>;
  LiveProjectiles: Map<EntityId, import('./projectile').LiveProjectile>;
  InCombatUntil: Map<EntityId, number>; // seconds
  PendingSkillCast: Map<EntityId, { skillId: SkillId; target: import('./events').SkillTarget }>;
  ActiveCharges: Map<EntityId, ActiveCharge>;
  ActiveOrbitals: Map<EntityId, import('./skill').OrbitalConfig & { startTime: number }>;
  VisualEffects: import('./core').WorldText[]; // Actually VisualEffect placeholder
  Notifications: WorldText[];
  ActiveAnimations: Map<EntityId, AnimationState[]>;
  Poses: Map<EntityId, Map<string, import('./core').Vector3>>; // Simplified from Matrix

  // Stable / Moderate - reactive bases
  Resources: Map<EntityId, import('./entity').Resource>;
  Factions: Map<EntityId, Set<import('./entity').Faction>>;
  BaseStats: Map<EntityId, import('./entity').BaseStats>;
  CombatStatuses: Map<EntityId, import('./core').CombatStatus[]>;
  ActiveEffects: Map<EntityId, import('./skill').ActiveEffect[]>;
  AbilityCooldowns: Map<EntityId, Map<SkillId, number>>; // SkillId -> readyTime seconds
  ItemInstances: Map<ItemInstanceId, import('./item').ItemInstance>; // ItemInstanceId -> instance
  EntityInventories: Map<EntityId, Set<ItemInstanceId>>; // ItemInstanceId set
  EquippedItems: Map<EntityId, Map<import('./item').Slot, ItemInstanceId>>; // Slot -> ItemInstanceId
  AIControllers: Map<EntityId, import('./ai').AIController>;
  ModelConfigId: Map<EntityId, string>;

  // Scenario State
  Scenarios: Map<ScenarioId, Scenario>;
  EntityScenario: Map<EntityId, ScenarioId>;
  SpawningEntities: Map<EntityId, { spawnType: import('./events').SpawnType; position: import('./core').WorldPosition; time: number }>;
}

// Read-only view of the mutable world. Mirrors F# World interface.
// All collections are exposed as read-only interfaces to enforce the
// constraint that state mutations must go through IStateWriteService.
export interface World {
  Time: Time;
  EntityExists: ReadonlySet<EntityId>;
  Positions: ReadonlyMap<EntityId, import('./core').WorldPosition>;
  Velocities: ReadonlyMap<EntityId, import('./core').Vector3>;
  Rotations: ReadonlyMap<EntityId, number>;
  MovementStates: ReadonlyMap<EntityId, import('./events').MovementState>;
  RawInputStates: ReadonlyMap<EntityId, import('./events').RawInputState>;
  InputMaps: ReadonlyMap<EntityId, import('./events').InputMap>;
  GameActionStates: ReadonlyMap<EntityId, ReadonlyMap<import('./events').GameAction, import('./events').InputActionState>>;
  ActionSets: ReadonlyMap<EntityId, ReadonlyMap<number, ReadonlyMap<import('./events').GameAction, import('./events').SlotProcessing>>>;
  ActiveActionSets: ReadonlyMap<EntityId, number>;
  Resources: ReadonlyMap<EntityId, import('./entity').Resource>;
  Factions: ReadonlyMap<EntityId, ReadonlySet<import('./entity').Faction>>;
  BaseStats: ReadonlyMap<EntityId, import('./entity').BaseStats>;
  CombatStatuses: ReadonlyMap<EntityId, readonly import('./core').CombatStatus[]>;
  ActiveEffects: ReadonlyMap<EntityId, readonly import('./skill').ActiveEffect[]>;
  AbilityCooldowns: ReadonlyMap<EntityId, ReadonlyMap<SkillId, number>>;
  LiveProjectiles: ReadonlyMap<EntityId, import('./projectile').LiveProjectile>;
  InCombatUntil: ReadonlyMap<EntityId, number>;
  PendingSkillCast: ReadonlyMap<EntityId, { skillId: SkillId; target: import('./events').SkillTarget }>;
  ItemInstances: ReadonlyMap<ItemInstanceId, import('./item').ItemInstance>;
  EntityInventories: ReadonlyMap<EntityId, ReadonlySet<ItemInstanceId>>;
  EquippedItems: ReadonlyMap<EntityId, ReadonlyMap<import('./item').Slot, ItemInstanceId>>;
  AIControllers: ReadonlyMap<EntityId, import('./ai').AIController>;
  SpawningEntities: ReadonlyMap<EntityId, { spawnType: import('./events').SpawnType; position: import('./core').WorldPosition; time: number }>;
  Scenarios: ReadonlyMap<ScenarioId, Scenario>;
  EntityScenario: ReadonlyMap<EntityId, ScenarioId>;
  ModelConfigId: ReadonlyMap<EntityId, string>;
  Poses: ReadonlyMap<EntityId, ReadonlyMap<string, import('./core').Vector3>>;
  ActiveAnimations: ReadonlyMap<EntityId, readonly AnimationState[]>;
  ActiveOrbitals: ReadonlyMap<EntityId, import('./skill').OrbitalConfig & { startTime: number }>;
  ActiveCharges: ReadonlyMap<EntityId, ActiveCharge>;
  VisualEffects: readonly WorldText[];
  Notifications: readonly WorldText[];
}

export interface AnimationState {
  ClipId: string;
  Time: number;
  Speed: number;
}
