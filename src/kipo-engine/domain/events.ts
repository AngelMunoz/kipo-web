import type { EntityId, ItemInstanceId, SkillId, AiArchetypeId, ScenarioId } from '../types/branded';
import type { WorldPosition, Vector2 } from './core';
import type { Effect } from './skill';
import type { ItemInstance } from './item';
import type { Slot } from './item';

export type MovementState =
  | { kind: 'Idle' }
  | { kind: 'MovingTo'; targetPosition: WorldPosition }
  | { kind: 'MovingAlongPath'; path: WorldPosition[] };

export type Selection =
  | { kind: 'SelectedEntity'; entity: EntityId }
  | { kind: 'SelectedPosition'; position: Vector2 };

export interface FactionSpawnInfo {
  ArchetypeId: AiArchetypeId;
  EntityDefinitionKey: string | undefined;
  MapOverride: import('./ai').MapEntityOverride | undefined;
  Faction: import('./entity').Faction | undefined;
  SpawnZoneName: string | undefined;
}

export type SpawnType =
  | { kind: 'Player'; playerIndex: number }
  | { kind: 'Faction'; info: FactionSpawnInfo };

export interface SpawnEntityIntent {
  EntityId: EntityId;
  ScenarioId: ScenarioId;
  Type: SpawnType;
  Position: WorldPosition;
  ActionSets?: Map<number, Map<GameAction, SlotProcessing>>;
}

export interface SpawnZoneData {
  ZoneName: string;
  ScenarioId: string;
  MaxSpawns: number;
  SpawnInfo: FactionSpawnInfo;
  SpawnPositions: Vector2[];
}

export interface RegisterSpawnZones {
  ScenarioId: ScenarioId;
  MaxEnemies: number;
  Zones: SpawnZoneData[];
}

export interface PortalTravel {
  EntityId: EntityId;
  TargetMap: string;
  TargetSpawn: string;
}

export interface ShowNotification {
  Message: string;
  Position: WorldPosition;
  Type: import('./core').NotificationType;
}

export interface SlotActivated {
  Slot: GameAction;
  CasterId: EntityId;
}

export type SkillTarget =
  | { kind: 'TargetSelf' }
  | { kind: 'TargetEntity'; entity: EntityId }
  | { kind: 'TargetPosition'; position: Vector2 }
  | { kind: 'TargetDirection'; position: Vector2 };

export interface AbilityIntent {
  Caster: EntityId;
  SkillId: SkillId;
  Target: SkillTarget;
}

export interface EffectApplicationIntent {
  SourceEntity: EntityId;
  TargetEntity: EntityId;
  Effect: Effect;
}

export interface EffectDamageIntent {
  SourceEntity: EntityId;
  TargetEntity: EntityId;
  Effect: Effect;
}

export interface EffectResourceIntent {
  SourceEntity: EntityId;
  TargetEntity: EntityId;
  Effect: Effect;
  ActiveEffectId: string; // EffectId
}

export interface AttackIntent {
  Attacker: EntityId;
  Target: EntityId;
}

export interface SetMovementTarget {
  EntityId: EntityId;
  Target: Vector2;
}

export interface TargetSelected {
  Selector: EntityId;
  Selection: Selection;
}

export interface DamageDealt {
  Target: EntityId;
  Amount: number;
}

export interface ResourceRestored {
  Target: EntityId;
  ResourceType: 'HP' | 'MP';
  Amount: number;
}

export interface EntityDied {
  EntityId: EntityId;
  ScenarioId: ScenarioId;
}

export interface ProjectileImpacted {
  ProjectileId: EntityId;
  CasterId: EntityId;
  ImpactPosition: Vector2;
  TargetEntity: EntityId | undefined;
  SkillId: SkillId;
  RemainingJumps: number | undefined;
}

export interface ChargeCompleted {
  CasterId: EntityId;
  SkillId: SkillId;
  Target: SkillTarget;
}

export interface PickUpItemIntent {
  Picker: EntityId;
  Item: ItemInstance;
}

export interface EquipItemIntent {
  EntityId: EntityId;
  ItemInstanceId: ItemInstanceId;
  Slot: Slot;
}

export interface UnequipItemIntent {
  EntityId: EntityId;
  Slot: Slot;
}

export interface DropItemIntent {
  EntityId: EntityId;
  ItemInstanceId: ItemInstanceId;
  Amount: number | undefined;
}

export interface UseItemIntent {
  EntityId: EntityId;
  ItemInstanceId: ItemInstanceId;
}

export type CollisionEvents =
  | { kind: 'EntityCollision'; entities: [EntityId, EntityId] };

export interface SceneTransition {
  Scene: string; // Placeholder
}

// --- State Change Events ---

export interface EntitySpawnBundle {
  Snapshot: import('./core').EntitySnapshot;
  Resources: import('./entity').Resource | undefined;
  Factions: import('./entity').Faction[] | undefined;
  BaseStats: import('./entity').BaseStats | undefined;
  ModelConfig: string | undefined;
  InputMap: InputMap | undefined;
  ActionSets: Map<number, Map<GameAction, SlotProcessing>> | undefined;
  ActiveActionSet: number | undefined;
  InventoryItems: ItemInstance[] | undefined;
  EquippedSlots: { slot: Slot; instanceId: ItemInstanceId }[] | undefined;
  AIController: import('./ai').AIController | undefined;
}

export type InputEvents =
  | { kind: 'RawStateChanged'; entityId: EntityId; state: RawInputState }
  | { kind: 'GameActionStatesChanged'; entityId: EntityId; states: Map<GameAction, InputActionState> }
  | { kind: 'ActiveActionSetChanged'; entityId: EntityId; set: number };

export type PhysicsEvents =
  | { kind: 'MovementStateChanged'; entityId: EntityId; state: MovementState };

export type StateChangeEvent =
  | { kind: 'Input'; event: InputEvents }
  | { kind: 'Physics'; event: PhysicsEvents };

// --- Intent Events ---

export type IntentEvent =
  | { kind: 'Ability'; ability: AbilityIntent }
  | { kind: 'Attack'; attack: AttackIntent }
  | { kind: 'EffectApplication'; effectApp: EffectApplicationIntent }
  | { kind: 'EffectDamage'; effectDmg: EffectDamageIntent }
  | { kind: 'EffectResource'; effectRes: EffectResourceIntent }
  | { kind: 'MovementTarget'; movement: SetMovementTarget }
  | { kind: 'TargetSelection'; target: TargetSelected }
  | { kind: 'SlotActivated'; slot: SlotActivated };

// --- Item Intent Events ---

export type ItemIntentEvent =
  | { kind: 'PickUp'; pickUp: PickUpItemIntent }
  | { kind: 'Equip'; equip: EquipItemIntent }
  | { kind: 'Unequip'; unequip: UnequipItemIntent }
  | { kind: 'Drop'; drop: DropItemIntent }
  | { kind: 'Use'; useItem: UseItemIntent };

// --- Notification Events ---

export type NotificationEvent =
  | { kind: 'ShowMessage'; message: ShowNotification }
  | { kind: 'DamageDealt'; damage: DamageDealt }
  | { kind: 'ResourceRestored'; restored: ResourceRestored };

// --- Lifecycle Events ---

export type LifecycleEvent =
  | { kind: 'EntityDied'; died: EntityDied }
  | { kind: 'ProjectileImpacted'; impact: ProjectileImpacted }
  | { kind: 'ChargeCompleted'; charge: ChargeCompleted };

// --- Spawning Events ---

export type SpawningEvent =
  | { kind: 'SpawnEntity'; spawn: SpawnEntityIntent }
  | { kind: 'RegisterZones'; zones: RegisterSpawnZones };

// --- Collision Events ---

export type CollisionEvent = CollisionEvents;

// --- Scene Events ---

export type SceneEvent =
  | { kind: 'Transition'; transition: SceneTransition };

// === Top-Level GameEvent ===

export type GameEvent =
  | { kind: 'State'; state: StateChangeEvent }
  | { kind: 'Intent'; intent: IntentEvent }
  | { kind: 'ItemIntent'; itemIntent: ItemIntentEvent }
  | { kind: 'Notification'; notification: NotificationEvent }
  | { kind: 'Lifecycle'; lifecycle: LifecycleEvent }
  | { kind: 'Spawn'; spawning: SpawningEvent }
  | { kind: 'Collision'; collision: CollisionEvent }
  | { kind: 'Scene'; scene: SceneEvent };

// --- Raw Input & Action Types ---

export type RawInputState = {
  // Placeholder for raw keyboard/mouse state
  keys: Set<string>;
  mousePosition: Vector2 | undefined;
  mouseButtons: Set<number>;
};

export type GameAction =
  | 'MoveUp'
  | 'MoveDown'
  | 'MoveLeft'
  | 'MoveRight'
  | 'PrimaryAction'
  | 'SecondaryAction'
  | 'UseSlot1'
  | 'UseSlot2'
  | 'UseSlot3'
  | 'UseSlot4'
  | 'UseSlot5'
  | 'UseSlot6'
  | 'UseSlot7'
  | 'UseSlot8'
  | 'SetActionSet1'
  | 'SetActionSet2'
  | 'SetActionSet3'
  | 'SetActionSet4'
  | 'SetActionSet5'
  | 'SetActionSet6'
  | 'SetActionSet7'
  | 'SetActionSet8'
  | 'ToggleJournal'
  | 'ToggleInventory'
  | 'ToggleAbilities'
  | 'ToggleCharacterSheet'
  | 'Interact'
  | 'Cancel';

export type InputActionState = 'Pressed' | 'Held' | 'Released' | 'Idle';

export type SlotProcessing =
  | { kind: 'Skill'; skillId: SkillId }
  | { kind: 'Item'; itemInstanceId: ItemInstanceId };

export interface InputMap {
  bindings: Map<string, GameAction>; // key -> action
}

export const USE_SLOT_ACTIONS: readonly GameAction[] = [
  'UseSlot1', 'UseSlot2', 'UseSlot3', 'UseSlot4',
  'UseSlot5', 'UseSlot6', 'UseSlot7', 'UseSlot8',
];

export const SET_ACTION_SET_ACTIONS: readonly GameAction[] = [
  'SetActionSet1', 'SetActionSet2', 'SetActionSet3', 'SetActionSet4',
  'SetActionSet5', 'SetActionSet6', 'SetActionSet7', 'SetActionSet8',
];
