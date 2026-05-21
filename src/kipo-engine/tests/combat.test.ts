import { describe, it, expect } from 'vitest';
import type { SkillId, EntityId, ScenarioId } from '../types/branded';
import { brandSkillId, brandEntityId, brandScenarioId } from '../types/branded';
import { createMutableWorld, createWorldView } from '../state/mutable-world';
import { createStateWriteService } from '../systems/state-write';
import { createEventBus } from '../events/event-bus';
import { createSeededPRNG } from '../utils/rng';
import { createCombatSystem } from '../systems/combat';
import { createAbilityActivationSystem } from '../systems/ability-activation';
import type { PomoEnvironment, GameplayServices, CoreServices, StoreServices } from '../systems/environment';
import type { SkillStore, ItemStore } from '../stores/content-store';
import type { World, MutableWorld } from '../domain/world';
import type { BaseStats, Resource } from '../domain/entity';
import type { ActiveSkill, Skill } from '../domain/skill';
import type { GameEvent } from '../domain/events';

function createFakeSkillStore(skill: ActiveSkill): SkillStore {
  return {
    tryFind(id: SkillId): Skill | undefined {
      return id === skill.Id ? { kind: 'Active', active: skill } : undefined;
    },
    getActive(id: SkillId): ActiveSkill | undefined {
      return id === skill.Id ? skill : undefined;
    },
    all(): Skill[] {
      return [{ kind: 'Active', active: skill }];
    },
  };
}

function createFakeItemStore(): ItemStore {
  return {
    tryFind() { return undefined; },
    all() { return []; },
  };
}

function createFakeStores(skill: ActiveSkill): StoreServices {
  return {
    skillStore: createFakeSkillStore(skill),
    itemStore: createFakeItemStore(),
    aiArchetypeStore: { tryFind() { return undefined; }, all() { return []; } },
    aiEntityStore: { tryFind() { return undefined; }, all() { return []; } },
    aiFamilyStore: { tryFind() { return undefined; }, all() { return []; } },
    decisionTreeStore: { tryFind() { return undefined; }, all() { return []; } },
  };
}

function createFakeGameplayServices(): GameplayServices {
  return {
    projections: {
      computeMovementSnapshot(_scenarioId: string) {
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
      calculateDerivedStats(world: World, _itemStore: ItemStore, entityId: EntityId) {
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
  world: MutableWorld,
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

function spawnEntity(
  world: MutableWorld,
  id: EntityId,
  scenarioId: ScenarioId,
  baseStats: BaseStats,
  position: { X: number; Y: number; Z: number },
  resources: Resource
) {
  world.EntityExists.add(id);
  world.Positions.set(id, position);
  world.Velocities.set(id, { X: 0, Y: 0, Z: 0 });
  world.BaseStats.set(id, baseStats);
  world.Resources.set(id, resources);
  world.EntityScenario.set(id, scenarioId);
  world.Factions.set(id, new Set(['Player']));
}

describe('Combat System', () => {
  it('should deal damage on instant ability intent', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');
    const casterId = brandEntityId('caster-1');
    const targetId = brandEntityId('target-1');

    spawnEntity(
      world,
      casterId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: 'Alive' }
    );

    spawnEntity(
      world,
      targetId,
      scenarioId,
      { Power: 5, Magic: 5, Sense: 5, Charm: 5 },
      { X: 10, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: 'Alive' }
    );

    const meleeSkill: ActiveSkill = {
      Id: 1,
      Name: 'Melee Attack',
      Description: 'Test melee',
      Intent: 'Offensive',
      DamageSource: 'Physical',
      Cost: { ResourceType: 'MP', Amount: 10 },
      Cooldown: 1.5,
      CastingTime: undefined,
      Targeting: 'TargetEntity',
      Range: 16,
      Area: { kind: 'Point' },
      Delivery: { kind: 'Instant' },
      Origin: { kind: 'Caster' },
      CastVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
      ImpactVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
      Effects: [],
      Formula: { kind: 'Const', value: 20 },
      ChargePhase: undefined,
      ElementFormula: undefined,
    };

    const env = createMinimalEnv(world, createFakeStores(meleeSkill), 0); // seed 0 guarantees hit
    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    // Publish ability intent (F#: CombatSystem handles Ability directly)
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: {
        kind: 'Ability',
        ability: {
          Caster: casterId,
          SkillId: brandSkillId(1),
          Target: { kind: 'TargetEntity', entity: targetId },
        },
      },
    });

    // Flush event bus (this processes events recursively)
    env.core.eventBus.flush();

    // Flush state writes
    env.core.stateWrite.FlushWrites(world, 0);

    sub.unsubscribe();

    // Verify damage dealt notification events were published
    const damageEvents = receivedEvents.filter(
      (e) => e.kind === 'Notification' && e.notification.kind === 'DamageDealt'
    );

    expect(damageEvents.length).toBeGreaterThan(0);

    // BaseDamage = 20, defender DP = 11, no crit (LK=0) => 9 damage
    if (damageEvents.length > 0) {
      const damageEvent = damageEvents[0];
      if (damageEvent.kind === 'Notification' && damageEvent.notification.kind === 'DamageDealt') {
        expect(damageEvent.notification.damage.Amount).toBe(9);
      }
    }

    // Verify resource cost was applied
    const casterResources = world.Resources.get(casterId);
    expect(casterResources?.MP).toBe(90); // 100 - 10 cost

    // Cleanup
    combat.dispose?.();
    abilityActivation.dispose?.();
  });
});
