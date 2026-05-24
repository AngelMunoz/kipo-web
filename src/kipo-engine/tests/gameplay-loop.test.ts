import { describe, it, expect } from "vitest";
import { brandEntityId, brandScenarioId, brandSkillId } from "../types/branded";
import { createMutableWorld, createWorldView } from "../state/mutable-world";
import { createStateWriteService } from "../systems/state-write";
import { createEventBus } from "../events/event-bus";
import { createSeededPRNG } from "../utils/rng";
import { createCombatSystem } from "../systems/combat";
import { createAbilityActivationSystem } from "../systems/ability-activation";
import { createEffectApplicationSystem } from "../systems/effect-application";
import { createProjectileSystem } from "../systems/projectile";
import { createMovementSystem } from "../systems/movement";
import { createAISystem } from "../systems/ai-system";
import { createResourceManagerSystem } from "../systems/resource-manager";
import { createInventorySystem } from "../systems/inventory";
import { createEquipmentSystem } from "../systems/equipment";
import { createEntitySpawnerSystem } from "../systems/entity-spawner";
import { createNotificationSystem } from "../systems/notification";
import { createGameplayLoop } from "../gameplay-loop";
import type { ActiveSkill, Effect } from "../domain/skill";
import type {
  PomoEnvironment,
  GameplayServices,
  CoreServices,
  StoreServices,
} from "../systems/environment";
import type { SkillStore } from "../stores/content-store";
import type { MutableWorld } from "../domain/world";
import type { BaseStats, Resource } from "../domain/entity";
import type { GameEvent } from "../domain/events";
import type { EntityId, ScenarioId } from "../types/branded";

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

function createFakeStores(skill: ActiveSkill): StoreServices {
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
    aiArchetypeStore: {
      tryFind() {
        return undefined;
      },
      all() {
        return [];
      },
    },
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
    mapEntityGroupStore: {
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
) {
  world.EntityExists.add(id);
  world.Positions.set(id, position);
  world.Velocities.set(id, { X: 0, Y: 0, Z: 0 });
  world.BaseStats.set(id, baseStats);
  world.Resources.set(id, resources);
  world.EntityScenario.set(id, scenarioId);
  world.Factions.set(id, new Set(["Player"]));
}

describe("Gameplay Loop Integration", () => {
  it("should process ability intent through combat and effect application end-to-end", () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId("test-scenario");
    const casterId = brandEntityId("caster-1");
    const targetId = brandEntityId("target-1");

    spawnEntity(
      world,
      casterId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: "Alive" },
    );

    spawnEntity(
      world,
      targetId,
      scenarioId,
      { Power: 5, Magic: 5, Sense: 5, Charm: 5 },
      { X: 10, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: "Alive" },
    );

    const dotEffect: Effect = {
      Name: "Bleed",
      Kind: "DamageOverTime",
      DamageSource: "Physical",
      Stacking: { kind: "NoStack" },
      Duration: { kind: "Timed", seconds: 5 },
      Visuals: {
        ModelId: undefined,
        VfxId: undefined,
        AnimationId: undefined,
        AttachmentPoint: undefined,
      },
      Modifiers: [
        {
          kind: "AbilityDamageMod",
          abilityDamageValue: { kind: "Const", value: 5 },
          element: undefined,
        },
      ],
    };

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
      Range: 16,
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
      Effects: [dotEffect],
      Formula: { kind: "Const", value: 20 },
      ChargePhase: undefined,
      ElementFormula: undefined,
    };

    const env = createMinimalEnv(world, createFakeStores(meleeSkill), 0);

    // Set up all systems
    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);
    const effectApp = createEffectApplicationSystem(env);
    const projectile = createProjectileSystem(env);
    const movement = createMovementSystem(env);
    const ai = createAISystem(env);
    const resourceManager = createResourceManagerSystem(env);
    const inventory = createInventorySystem(env);
    const equipment = createEquipmentSystem(env);
    const entitySpawner = createEntitySpawnerSystem(env);
    const notification = createNotificationSystem(env);

    const loop = createGameplayLoop(env, {
      abilityActivation: {
        kind: "AbilityActivation",
        update: () => {},
        dispose: () => {},
      },
      combat: { kind: "Combat", update: () => {}, dispose: () => {} },
      effectApp,
      projectile,
      movement,
      ai,
      resourceManager,
      inventory,
      equipment,
      entitySpawner,
      notification,
    });

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) =>
      receivedEvents.push(e),
    );

    // Publish ability intent
    env.core.eventBus.publish({
      kind: "Intent",
      intent: {
        kind: "Ability",
        ability: {
          Caster: casterId,
          SkillId: brandSkillId(1),
          Target: { kind: "TargetEntity", entity: targetId },
        },
      },
    });

    // Run one frame (dt = 0.016s ~ 60fps)
    loop.update(0.016);

    sub.unsubscribe();

    // Verify damage dealt notification was published
    const damageEvents = receivedEvents.filter(
      (e) => e.kind === "Notification" && e.notification.kind === "DamageDealt",
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    // BaseDamage = 20, defender DP = 11, no crit => 9 damage
    if (damageEvents.length > 0) {
      const damageEvent = damageEvents[0];
      if (
        damageEvent.kind === "Notification" &&
        damageEvent.notification.kind === "DamageDealt"
      ) {
        expect(damageEvent.notification.damage.Amount).toBe(9);
      }
    }

    // Verify resource cost was applied
    const casterResources = world.Resources.get(casterId);
    expect(casterResources?.MP).toBe(90); // 100 - 10 cost

    // Verify the DoT effect was applied to target
    const targetEffects = world.ActiveEffects.get(targetId);
    expect(targetEffects).toBeDefined();
    expect(targetEffects!.length).toBe(1);
    expect(targetEffects![0].SourceEffect.Name).toBe("Bleed");

    // Cleanup
    loop.dispose();
    combat.dispose?.();
    abilityActivation.dispose?.();
  });

  it("should process projectile delivery and impact over multiple frames", () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId("test-scenario");
    const casterId = brandEntityId("caster-1");
    const targetId = brandEntityId("target-1");

    spawnEntity(
      world,
      casterId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: "Alive" },
    );

    spawnEntity(
      world,
      targetId,
      scenarioId,
      { Power: 5, Magic: 5, Sense: 5, Charm: 5 },
      { X: 100, Y: 0, Z: 0 }, // 100 units away
      { HP: 100, MP: 100, Status: "Alive" },
    );

    const projectileSkill: ActiveSkill = {
      Id: 2,
      Name: "Fireball",
      Description: "Test projectile",
      Intent: "Offensive",
      DamageSource: "Physical",
      Cost: { ResourceType: "MP", Amount: 10 },
      Cooldown: 1.5,
      CastingTime: undefined,
      Targeting: "TargetEntity",
      Range: 200,
      Area: { kind: "Point" },
      Delivery: {
        kind: "Projectile",
        projectile: {
          Speed: 50, // 50 units/sec
          Collision: "IgnoreTerrain",
          Variations: undefined,
          Visuals: {
            ModelId: undefined,
            VfxId: undefined,
            AnimationId: undefined,
            AttachmentPoint: undefined,
          },
          TerrainImpactVisuals: undefined,
        },
      },
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
      Formula: { kind: "Const", value: 30 },
      ChargePhase: undefined,
      ElementFormula: undefined,
    };

    const env = createMinimalEnv(world, createFakeStores(projectileSkill), 0);

    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);
    const effectApp = createEffectApplicationSystem(env);
    const projectile = createProjectileSystem(env);
    const movement = createMovementSystem(env);
    const ai = createAISystem(env);
    const resourceManager = createResourceManagerSystem(env);
    const inventory = createInventorySystem(env);
    const equipment = createEquipmentSystem(env);
    const entitySpawner = createEntitySpawnerSystem(env);
    const notification = createNotificationSystem(env);

    const loop = createGameplayLoop(env, {
      abilityActivation: {
        kind: "AbilityActivation",
        update: () => {},
        dispose: () => {},
      },
      combat: { kind: "Combat", update: () => {}, dispose: () => {} },
      effectApp,
      projectile,
      movement,
      ai,
      resourceManager,
      inventory,
      equipment,
      entitySpawner,
      notification,
    });

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) =>
      receivedEvents.push(e),
    );

    // Publish ability intent (should create projectile)
    env.core.eventBus.publish({
      kind: "Intent",
      intent: {
        kind: "Ability",
        ability: {
          Caster: casterId,
          SkillId: brandSkillId(2),
          Target: { kind: "TargetEntity", entity: targetId },
        },
      },
    });

    // Run first frame: combat processes intent, creates projectile
    loop.update(0.016);
    expect(world.LiveProjectiles.size).toBe(1);

    // Run enough frames for projectile to travel 100 units at 50 units/sec = 2 seconds
    // At 60fps (0.016s per frame), that's ~125 frames. Let's do it in larger steps.
    for (let i = 0; i < 125; i++) {
      loop.update(0.016);
      if (world.LiveProjectiles.size === 0) break;
    }

    // Projectile should have impacted and been removed
    expect(world.LiveProjectiles.size).toBe(0);

    // Verify impact damage notification
    const damageEvents = receivedEvents.filter(
      (e) => e.kind === "Notification" && e.notification.kind === "DamageDealt",
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    sub.unsubscribe();
    loop.dispose();
    combat.dispose?.();
    abilityActivation.dispose?.();
  });
});
