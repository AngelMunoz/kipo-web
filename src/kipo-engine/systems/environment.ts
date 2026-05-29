import type { EntityId } from '../types/branded';
import type { Vector2 } from '../domain/core';
import type { MutableWorld, World } from '../domain/world';
import type { EventBus } from '../events/event-bus';
import type { IStateWriteService } from './state-write';
import type { SeededPRNG } from '../utils/rng';
import type {
  SkillStore,
  ItemStore,
  AIArchetypeStore,
  AIEntityStore,
  AIFamilyStore,
  DecisionTreeStore,
  MapEntityGroupStore,
} from '../stores/content-store';
import type { MovementSnapshot } from '../state/projections';

export interface CoreServices {
  eventBus: EventBus;
  world: MutableWorld;
  worldView: World;
  stateWrite: IStateWriteService;
  rng: SeededPRNG;
}

export interface StoreServices {
  skillStore: SkillStore;
  itemStore: ItemStore;
  aiArchetypeStore: AIArchetypeStore;
  aiEntityStore: AIEntityStore;
  aiFamilyStore: AIFamilyStore;
  decisionTreeStore: DecisionTreeStore;
  mapEntityGroupStore: MapEntityGroupStore;
}

export interface ProjectionService {
  computeMovementSnapshot(scenarioId: string): MovementSnapshot;
  getNearbyEntitiesSnapshot(
    snapshot: MovementSnapshot,
    liveEntities: Set<EntityId>,
    center: Vector2,
    radius: number
  ): Array<{ entityId: EntityId; position: Vector2 }>;
  calculateDerivedStats(
    world: World,
    itemStore: ItemStore,
    entityId: EntityId
  ): import('../domain/entity').DerivedStats | undefined;
}

export interface CameraService {
  getAllCameras(): Array<{
    position: { X: number; Y: number };
    viewport: { width: number; height: number };
    zoom: number;
  }>;
}

export interface GameplayServices {
  projections: ProjectionService;
  cameraService: CameraService;
}

export interface PomoEnvironment {
  core: CoreServices;
  stores: StoreServices;
  gameplay: GameplayServices;
}

export interface GameSystem {
  kind: string;
  update(dt: number): void;
  dispose?(): void;
}
