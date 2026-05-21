import type { EntityId, AiArchetypeId, SkillId } from '../types/branded';
import type { Vector2 } from './core';
import type { BaseStats, Faction } from './entity';
import type { SkillIntent } from './skill';

export type BehaviorType =
  | 'Patrol'
  | 'Aggressive'
  | 'Defensive'
  | 'Supporter'
  | 'Ambusher'
  | 'Turret'
  | 'Passive';

export type CueType = 'Visual' | 'Audio' | 'Damage' | 'Communication' | 'Memory';

export type CueStrength = 'Weak' | 'Moderate' | 'Strong' | 'Overwhelming';

export type MovementType =
  | 'Free'
  | 'Stationary'
  | { kind: 'Tethered'; leashDistance: number };

export interface PerceptionConfig {
  visualRange: number;
  fov: number; // degrees
  memoryDuration: number; // seconds
  movementType: MovementType;
}

export type ResponseType =
  | 'Ignore'
  | 'Investigate'
  | 'Engage'
  | 'Flee'
  | 'Evade';

export interface CuePriority {
  cueType: CueType;
  minStrength: CueStrength;
  priority: number;
  response: ResponseType;
}

export interface AIArchetype {
  id: AiArchetypeId;
  name: string;
  behaviorType: BehaviorType;
  perceptionConfig: PerceptionConfig;
  cuePriorities: CuePriority[];
  decisionInterval: number; // seconds
  baseStats: BaseStats;
}

export interface PerceptionCue {
  cueType: CueType;
  strength: CueStrength;
  sourceEntityId: EntityId | undefined;
  position: Vector2;
  timestamp: number; // seconds
}

export interface MemoryEntry {
  entityId: EntityId;
  lastSeenTick: number;
  lastKnownPosition: Vector2;
  confidence: number;
}

export type AIState =
  | 'Idle'
  | 'Patrolling'
  | 'Investigating'
  | 'Chasing'
  | 'Attacking'
  | 'Fleeing';

export interface AIController {
  controlledEntityId: EntityId;
  archetypeId: AiArchetypeId;
  currentState: AIState;
  stateEnterTime: number;
  spawnPosition: Vector2;
  absoluteWaypoints: Vector2[] | undefined;
  waypointIndex: number;
  lastDecisionTime: number;
  currentTarget: EntityId | undefined;
  decisionTree: string;
  preferredIntent: SkillIntent;
  skills: SkillId[];
  memories: Map<EntityId, MemoryEntry>;
}

export interface AIFamilyConfig {
  StatScaling: Map<string, number>;
  SkillPool: SkillId[];
  PreferredIntent: SkillIntent;
  DecisionTree: string;
}

export interface AIEntityDefinition {
  Key: string;
  Name: string;
  ArchetypeId: AiArchetypeId;
  Family: import('./entity').Family;
  Skills: SkillId[];
  DecisionTree: string;
  Model: string;
  StatOverrides: BaseStats | undefined;
}

export interface MapEntityOverride {
  StatMultiplier: number | undefined;
  SkillRestrictions: SkillId[] | undefined;
  ExtraSkills: SkillId[] | undefined;
}

export interface MapEntityGroup {
  Entities: string[];
  Weights: number[] | undefined;
  Overrides: Map<string, MapEntityOverride>;
  Faction: Faction | undefined;
}

export type NodeResult = 'Running' | 'Success' | 'Failure';

export type ConditionKind =
  | { kind: 'HasTarget' }
  | { kind: 'TargetInRange'; range: number | undefined }
  | { kind: 'TargetInMeleeRange' }
  | { kind: 'TargetTooClose'; minDistance: number }
  | { kind: 'SelfHealthBelow'; threshold: number }
  | { kind: 'TargetHealthBelow'; threshold: number }
  | { kind: 'BeyondLeash' }
  | { kind: 'SkillReady' }
  | { kind: 'HasCue' }
  | { kind: 'CueResponseIs'; response: ResponseType };

export type ActionKind =
  | 'ChaseTarget'
  | 'UseRangedAttack'
  | 'UseMeleeAttack'
  | 'UseHeal'
  | 'UseDebuff'
  | 'UseBuff'
  | 'Patrol'
  | 'ReturnToSpawn'
  | 'Retreat'
  | 'Idle';

export type BehaviorNode =
  | { kind: 'Sequence'; children: BehaviorNode[] }
  | { kind: 'Selector'; children: BehaviorNode[] }
  | { kind: 'Condition'; condition: ConditionKind }
  | { kind: 'Action'; action: ActionKind }
  | { kind: 'Inverter'; child: BehaviorNode };

export interface DecisionTree {
  Name: string;
  Root: BehaviorNode;
}
