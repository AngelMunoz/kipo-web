import { describe, it, expect } from "vitest";
import {
  brandEntityId,
  brandScenarioId,
  brandSkillId,
  brandAiArchetypeId,
} from "../types/branded";
import type { EntityId, ScenarioId } from "../types/branded";
import { createMutableWorld, createWorldView } from "../state/mutable-world";
import { createStateWriteService } from "../systems/state-write";
import { createEventBus } from "../events/event-bus";
import { createSeededPRNG } from "../utils/rng";
import { createMovementSystem } from "../systems/movement";
import { createNavigationSystem } from "../systems/navigation";
import { createAISystem } from "../systems/ai-system";
import { createGameplayLoop } from "../gameplay-loop";
import type { EffectApplicationSystem } from "../systems/effect-application";
import type { ProjectileSystem } from "../systems/projectile";
import type { ResourceManagerSystem } from "../systems/resource-manager";
import type { InventorySystem } from "../systems/inventory";
import type { EquipmentSystem } from "../systems/equipment";
import type { EntitySpawnerSystem } from "../systems/entity-spawner";
import type { NotificationSystem } from "../systems/notification";
import type { ActiveSkill } from "../domain/skill";
import type { AIController, AIArchetype } from "../domain/ai";
import type {
  PomoEnvironment,
  GameplayServices,
  CoreServices,
  StoreServices,
} from "../systems/environment";
import type { SkillStore, AIArchetypeStore } from "../stores/content-store";
import type { MutableWorld } from "../domain/world";
import type { BaseStats, Resource, Faction } from "../domain/entity";
import type { GameEvent } from "../domain/events";
import { createCombatSystem } from "../systems/combat";
import { createAbilityActivationSystem } from "../systems/ability-activation";

function createFakeSkillStore(skill: ActiveSkill): SkillStore {
  return {
    tryFind(id) {
      return id === skill.Id ? { kind: "Active", active: skill } : undefined;
    },
    getActive(id) {
      return id === skill.Id ? skill : undefined;
    },
    all() {
      return [{ kind: "Active", active: skill }];
    },
  };
}

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

function createFakeStores(
  skill: ActiveSkill,
  archetype: AIArchetype,
): StoreServices {
  return {
    skillStore: createFakeSkillStore(skill),
    itemStore: {
      tryFind() {
        return undefined;
      },
      all() {
        return [];
      },
    },
    aiArchetypeStore: createFakeArchetypeStore(archetype),
    aiEntityStore: {
      tryFind() {
        return undefined;
      },
      all() {
        return [];
      },
    },
    aiFamilyStore: {
      tryFind() {
        return undefined;
      },
      all() {
        return [];
      },
    },
    decisionTreeStore: {
      tryFind() {
        return undefined;
      },
      all() {
        return [];
      },
    },
  };
}

function createFakeGameplayServices(): GameplayServices {
  return {
    projections: {
      computeMovementSnapshot() {
        return {
          Positions: new Map(),
          SpatialGrid: new Map(),
          Rotations: new Map(),
          ModelConfigIds: new Map(),
        };
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
      getAllCameras() {
        return [];
      },
    },
  };
}

function createMinimalEnv(
  world: MutableWorld,
  stores: StoreServices,
  seed = 0,
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

function spawnEntity(
  world: MutableWorld,
  id: EntityId,
  scenarioId: ScenarioId,
  baseStats: BaseStats,
  position: { X: number; Y: number; Z: number },
  resources: Resource,
  factions: Faction[],
) {
  world.EntityExists.add(id);
  world.Positions.set(id, position);
  world.Velocities.set(id, { X: 0, Y: 0, Z: 0 });
  world.BaseStats.set(id, baseStats);
  world.Resources.set(id, resources);
  world.EntityScenario.set(id, scenarioId);
  world.Factions.set(id, new Set(factions));
}

describe("AI System", () => {
  it("should chase and attack a hostile entity in visual range", () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId("test-scenario");
    const aiId = brandEntityId("ai-1");
    const playerId = brandEntityId("player-1");

    spawnEntity(
      world,
      aiId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: "Alive" },
      ["Enemy"],
    );

    spawnEntity(
      world,
      playerId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 50, Y: 0, Z: 0 }, // 50 units away, within visual range
      { HP: 100, MP: 100, Status: "Alive" },
      ["Player"],
    );

    const meleeSkill: ActiveSkill = {
      Id: 1,
      Name: "Melee Attack",
      Description: "Test melee",
      Intent: "Offensive",
      DamageSource: "Physical",
      Cost: { ResourceType: "MP", Amount: 10 },
      Cooldown: 1.5,
      CastingTime: undefined,
      Targeting: "TargetEntity",
      Range: 100,
      Area: { kind: "Point" },
      Delivery: { kind: "Instant" },
      Origin: { kind: "Caster" },
      CastVisuals: {
        ModelId: undefined,
        VfxId: undefined,
        AnimationId: undefined,
        AttachmentPoint: undefined,
      },
      ImpactVisuals: {
        ModelId: undefined,
        VfxId: undefined,
        AnimationId: undefined,
        AttachmentPoint: undefined,
      },
      Effects: [],
      Formula: { kind: "Const", value: 20 },
      ChargePhase: undefined,
      ElementFormula: undefined,
    };

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: "AggressiveMelee",
      behaviorType: "Aggressive",
      perceptionConfig: {
        visualRange: 150,
        fov: 360,
        memoryDuration: 5,
        movementType: "Free",
      },
      cuePriorities: [
        {
          cueType: "Visual",
          minStrength: "Weak",
          priority: 1,
          response: "Engage",
        },
      ],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
    };

    const aiController: AIController = {
      controlledEntityId: aiId,
      archetypeId: brandAiArchetypeId(1),
      currentState: "Idle",
      stateEnterTime: 0,
      spawnPosition: { X: 0, Y: 0 },
      absoluteWaypoints: undefined,
      waypointIndex: 0,
      lastDecisionTime: -10, // Negative so first decision happens immediately
      currentTarget: undefined,
      decisionTree: "",
      preferredIntent: "Offensive",
      skills: [brandSkillId(1)],
      memories: new Map(),
    };

    world.AIControllers.set(aiId, aiController);

    const env = createMinimalEnv(
      world,
      createFakeStores(meleeSkill, archetype),
      0,
    );
    const movement = createMovementSystem(env);
    createNavigationSystem(env);
    const ai = createAISystem(env);

    const stubEffectApp: EffectApplicationSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubProjectile: ProjectileSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubResourceManager: ResourceManagerSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubInventory: InventorySystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubEquipment: EquipmentSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubEntitySpawner: EntitySpawnerSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubNotification: NotificationSystem = {
      update: () => {},
      dispose: () => {},
    };

    const loop = createGameplayLoop(env, {
      abilityActivation: createAbilityActivationSystem(env),
      combat: createCombatSystem(env),
      effectApp: stubEffectApp,
      projectile: stubProjectile,
      movement,
      ai,
      resourceManager: stubResourceManager,
      inventory: stubInventory,
      equipment: stubEquipment,
      entitySpawner: stubEntitySpawner,
      notification: stubNotification,
    });

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) =>
      receivedEvents.push(e),
    );

    // First frame: AI detects player, publishes MovementTarget and Ability intent
    loop.update(0.016);

    // Verify movement target was set
    const movementEvents = receivedEvents.filter(
      (e) => e.kind === "Intent" && e.intent.kind === "MovementTarget",
    );
    expect(movementEvents.length).toBeGreaterThanOrEqual(1);

    // Verify ability intent was published
    const abilityEvents = receivedEvents.filter(
      (e) => e.kind === "Intent" && e.intent.kind === "Ability",
    );
    expect(abilityEvents.length).toBeGreaterThanOrEqual(1);

    // Run enough frames for AI to move towards player (50 units at 100 speed = 0.5s)
    for (let i = 0; i < 35; i++) {
      loop.update(0.016);
    }

    // AI should have moved closer to player
    const aiPos = world.Positions.get(aiId);
    expect(aiPos).toBeDefined();
    const distToPlayer = Math.sqrt((aiPos!.X - 50) ** 2 + (aiPos!.Z - 0) ** 2);
    expect(distToPlayer).toBeLessThan(50); // Should have moved closer

    sub.unsubscribe();
    loop.dispose();
  });

  it("should patrol waypoints when no hostiles are visible", () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId("test-scenario");
    const aiId = brandEntityId("ai-1");

    spawnEntity(
      world,
      aiId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: "Alive" },
      ["Enemy"],
    );

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: "Patroller",
      behaviorType: "Patrol",
      perceptionConfig: {
        visualRange: 50,
        fov: 360,
        memoryDuration: 5,
        movementType: "Free",
      },
      cuePriorities: [
        {
          cueType: "Visual",
          minStrength: "Weak",
          priority: 1,
          response: "Engage",
        },
      ],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
    };

    const aiController: AIController = {
      controlledEntityId: aiId,
      archetypeId: brandAiArchetypeId(1),
      currentState: "Idle",
      stateEnterTime: 0,
      spawnPosition: { X: 0, Y: 0 },
      absoluteWaypoints: [
        { X: 0, Y: 0 },
        { X: 100, Y: 0 },
      ],
      waypointIndex: 0,
      lastDecisionTime: -10, // Negative so first decision happens immediately
      currentTarget: undefined,
      decisionTree: "",
      preferredIntent: "Offensive",
      skills: [],
      memories: new Map(),
    };

    world.AIControllers.set(aiId, aiController);

    const emptySkill: ActiveSkill = {
      Id: 0,
      Name: "None",
      Description: "",
      Intent: "Offensive",
      DamageSource: "Physical",
      Cost: undefined,
      Cooldown: undefined,
      CastingTime: undefined,
      ChargePhase: undefined,
      Targeting: "Self",
      Range: undefined,
      Area: { kind: "Point" },
      Delivery: { kind: "Instant" },
      Origin: { kind: "Caster" },
      CastVisuals: {
        ModelId: undefined,
        VfxId: undefined,
        AnimationId: undefined,
        AttachmentPoint: undefined,
      },
      ImpactVisuals: {
        ModelId: undefined,
        VfxId: undefined,
        AnimationId: undefined,
        AttachmentPoint: undefined,
      },
      Effects: [],
      Formula: undefined,
      ElementFormula: undefined,
    };

    const env = createMinimalEnv(
      world,
      createFakeStores(emptySkill, archetype),
      0,
    );
    const movement = createMovementSystem(env);
    createNavigationSystem(env);
    const ai = createAISystem(env);

    const stubEffectApp: EffectApplicationSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubProjectile: ProjectileSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubResourceManager: ResourceManagerSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubInventory: InventorySystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubEquipment: EquipmentSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubEntitySpawner: EntitySpawnerSystem = {
      update: () => {},
      dispose: () => {},
    };
    const stubNotification: NotificationSystem = {
      update: () => {},
      dispose: () => {},
    };

    const loop = createGameplayLoop(env, {
      abilityActivation: createAbilityActivationSystem(env),
      combat: createCombatSystem(env),
      effectApp: stubEffectApp,
      projectile: stubProjectile,
      movement,
      ai,
      resourceManager: stubResourceManager,
      inventory: stubInventory,
      equipment: stubEquipment,
      entitySpawner: stubEntitySpawner,
      notification: stubNotification,
    });

    // First frame: AI decides to patrol to waypoint 0 (already there)
    loop.update(0.016);

    // Move towards waypoint 1
    for (let i = 0; i < 70; i++) {
      loop.update(0.016);
    }

    const aiPos = world.Positions.get(aiId);
    expect(aiPos).toBeDefined();
    expect(aiPos!.X).toBeGreaterThan(50); // Should have moved towards 100

    loop.dispose();
  });
});
