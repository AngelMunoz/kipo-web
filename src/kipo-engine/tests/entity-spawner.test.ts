import { describe, it, expect } from 'vitest';
import { brandEntityId, brandScenarioId, brandAiArchetypeId } from '../types/branded';
import { createMutableWorld, createWorldView } from '../state/mutable-world';
import { createStateWriteService } from '../systems/state-write';
import { createEventBus } from '../events/event-bus';
import { createSeededPRNG } from '../utils/rng';
import { createEntitySpawnerSystem } from '../systems/entity-spawner';
import type { PomoEnvironment, GameplayServices, CoreServices, StoreServices } from '../systems/environment';
import type { AIArchetypeStore } from '../stores/content-store';
import type { AIArchetype } from '../domain/ai';
import type { GameEvent } from '../domain/events';

function createFakeArchetypeStore(archetype: AIArchetype): AIArchetypeStore {
  return {
    tryFind(id) {
      return id === archetype.id ? archetype : undefined;
    },
    all() {
      return [archetype];
    },
  };
}

function createFakeStores(archetype: AIArchetype): StoreServices {
  return {
    skillStore: { tryFind() { return undefined; }, getActive() { return undefined; }, all() { return []; } },
    itemStore: { tryFind() { return undefined; }, all() { return []; } },
    aiArchetypeStore: createFakeArchetypeStore(archetype),
    aiEntityStore: { tryFind() { return undefined; }, all() { return []; } },
    aiFamilyStore: { tryFind() { return undefined; }, all() { return []; } },
    decisionTreeStore: { tryFind() { return undefined; }, all() { return []; } },
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

describe('Entity Spawner System', () => {
  it('should register spawn zones and track counts', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: 'TestEnemy',
      behaviorType: 'Aggressive',
      perceptionConfig: {
        visualRange: 100,
        fov: 360,
        memoryDuration: 5,
        movementType: 'Free',
      },
      cuePriorities: [],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 10, Charm: 10 },
    };

    const env = createMinimalEnv(world, createFakeStores(archetype), 0);
    const spawner = createEntitySpawnerSystem(env);

    env.core.eventBus.publish({
      kind: 'Spawn',
      spawning: {
        kind: 'RegisterZones',
        zones: {
          ScenarioId: scenarioId,
          MaxEnemies: 5,
          Zones: [
            {
              ZoneName: 'Zone1',
              ScenarioId: scenarioId,
              MaxSpawns: 3,
              SpawnInfo: {
                ArchetypeId: brandAiArchetypeId(1),
                EntityDefinitionKey: undefined,
                MapOverride: undefined,
                Faction: 'Enemy',
                SpawnZoneName: 'Zone1',
              },
              SpawnPositions: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }],
            },
          ],
        },
      },
    });

    env.core.eventBus.flush();

    // Registering zones doesn't create entities yet
    expect(world.EntityExists.size).toBe(0);

    spawner.dispose();
  });

  it('should spawn entity and finalize after duration', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');
    const entityId = brandEntityId('enemy-1');

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: 'TestEnemy',
      behaviorType: 'Aggressive',
      perceptionConfig: {
        visualRange: 100,
        fov: 360,
        memoryDuration: 5,
        movementType: 'Free',
      },
      cuePriorities: [],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 10, Charm: 10 },
    };

    const env = createMinimalEnv(world, createFakeStores(archetype), 0);
    const spawner = createEntitySpawnerSystem(env);

    // Register zones first
    env.core.eventBus.publish({
      kind: 'Spawn',
      spawning: {
        kind: 'RegisterZones',
        zones: {
          ScenarioId: scenarioId,
          MaxEnemies: 5,
          Zones: [
            {
              ZoneName: 'Zone1',
              ScenarioId: scenarioId,
              MaxSpawns: 3,
              SpawnInfo: {
                ArchetypeId: brandAiArchetypeId(1),
                EntityDefinitionKey: undefined,
                MapOverride: undefined,
                Faction: 'Enemy',
                SpawnZoneName: 'Zone1',
              },
              SpawnPositions: [{ X: 50, Y: 50 }],
            },
          ],
        },
      },
    });
    env.core.eventBus.flush();

    // Publish spawn intent (with 0 duration for player, 1.0 for faction)
    env.core.eventBus.publish({
      kind: 'Spawn',
      spawning: {
        kind: 'SpawnEntity',
        spawn: {
          EntityId: entityId,
          ScenarioId: scenarioId,
          Type: {
            kind: 'Faction',
            info: {
              ArchetypeId: brandAiArchetypeId(1),
              EntityDefinitionKey: undefined,
              MapOverride: undefined,
              Faction: 'Enemy',
              SpawnZoneName: 'Zone1',
            },
          },
          Position: { X: 50, Y: 0, Z: 50 },
        },
      },
    });
    env.core.eventBus.flush();

    // Entity should not exist yet (pending spawn)
    expect(world.EntityExists.has(entityId)).toBe(false);

    // Update time past spawn duration (1.0s)
    world.Time = { Delta: 1.0, TotalGameTime: 1.1, Previous: 0 };
    spawner.update();
    env.core.stateWrite.FlushWrites(world, 1.1);

    // Entity should now exist with components
    expect(world.EntityExists.has(entityId)).toBe(true);
    expect(world.Positions.has(entityId)).toBe(true);
    expect(world.BaseStats.has(entityId)).toBe(true);
    expect(world.Resources.has(entityId)).toBe(true);
    expect(world.Factions.get(entityId)?.has('Enemy')).toBe(true);
    expect(world.AIControllers.has(entityId)).toBe(true);

    spawner.dispose();
  });

  it('should respawn entity after death', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');
    const entityId = brandEntityId('enemy-1');

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: 'TestEnemy',
      behaviorType: 'Aggressive',
      perceptionConfig: {
        visualRange: 100,
        fov: 360,
        memoryDuration: 5,
        movementType: 'Free',
      },
      cuePriorities: [],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 10, Charm: 10 },
    };

    const env = createMinimalEnv(world, createFakeStores(archetype), 0);
    const spawner = createEntitySpawnerSystem(env);

    // Register zones
    env.core.eventBus.publish({
      kind: 'Spawn',
      spawning: {
        kind: 'RegisterZones',
        zones: {
          ScenarioId: scenarioId,
          MaxEnemies: 5,
          Zones: [
            {
              ZoneName: 'Zone1',
              ScenarioId: scenarioId,
              MaxSpawns: 3,
              SpawnInfo: {
                ArchetypeId: brandAiArchetypeId(1),
                EntityDefinitionKey: undefined,
                MapOverride: undefined,
                Faction: 'Enemy',
                SpawnZoneName: 'Zone1',
              },
              SpawnPositions: [{ X: 50, Y: 50 }],
            },
          ],
        },
      },
    });
    env.core.eventBus.flush();

    // Spawn entity
    env.core.eventBus.publish({
      kind: 'Spawn',
      spawning: {
        kind: 'SpawnEntity',
        spawn: {
          EntityId: entityId,
          ScenarioId: scenarioId,
          Type: {
            kind: 'Faction',
            info: {
              ArchetypeId: brandAiArchetypeId(1),
              EntityDefinitionKey: undefined,
              MapOverride: undefined,
              Faction: 'Enemy',
              SpawnZoneName: 'Zone1',
            },
          },
          Position: { X: 50, Y: 0, Z: 50 },
        },
      },
    });
    env.core.eventBus.flush();

    // Finalize spawn
    world.Time = { Delta: 1.0, TotalGameTime: 1.1, Previous: 0 };
    spawner.update();
    env.core.stateWrite.FlushWrites(world, 1.1);

    // Verify entity exists
    expect(world.EntityExists.has(entityId)).toBe(true);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    // Kill entity
    env.core.eventBus.publish({
      kind: 'Lifecycle',
      lifecycle: {
        kind: 'EntityDied',
        died: { EntityId: entityId, ScenarioId: scenarioId },
      },
    });
    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 1.1);

    // Should have published a respawn SpawnEntity intent
    const spawnEvents = receivedEvents.filter(
      (e) => e.kind === 'Spawn' && e.spawning.kind === 'SpawnEntity'
    );
    expect(spawnEvents.length).toBe(1);

    // Verify old entity was removed
    expect(world.EntityExists.has(entityId)).toBe(false);

    sub.unsubscribe();
    spawner.dispose();
  });
});
