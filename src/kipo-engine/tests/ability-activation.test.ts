import { describe, it, expect } from 'vitest';
import { brandEntityId, brandScenarioId, brandSkillId } from '../types/branded';
import type { EntityId, ScenarioId, SkillId } from '../types/branded';
import type { MutableWorld } from '../domain/world';
import { createMutableWorld, createWorldView } from '../state/mutable-world';
import { createEventBus } from '../events/event-bus';
import { createStateWriteService } from '../systems/state-write';
import { createSeededPRNG } from '../utils/rng';
import { createAbilityActivationSystem, validateAbility } from '../systems/ability-activation';
import { createCombatSystem } from '../systems/combat';
import type { PomoEnvironment, StoreServices, GameplayServices, CoreServices } from '../systems/environment';
import type { SkillStore } from '../stores/content-store';
import type { ActiveSkill, Skill } from '../domain/skill';
import type { GameEvent } from '../domain/events';
import type { ValidationContext } from '../systems/ability-activation';
import type { BaseStats, Resource } from '../domain/entity';
import { resultError } from '../types/core';

function createFakeSkillStore(skills: Map<number, ActiveSkill>): SkillStore {
  return {
    tryFind(id: number): Skill | undefined {
      const skill = skills.get(id);
      if (!skill) return undefined;
      return { kind: 'Active', active: skill };
    },
    getActive(id: number): ActiveSkill | undefined {
      return skills.get(id);
    },
    all(): Skill[] {
      return Array.from(skills.values()).map((s) => ({ kind: 'Active', active: s }));
    },
  };
}

function createFakeStores(skills: Map<number, ActiveSkill>): StoreServices {
  return {
    skillStore: createFakeSkillStore(skills),
    itemStore: { tryFind() { return undefined; }, all() { return []; } },
    aiArchetypeStore: { tryFind() { return undefined; }, all() { return []; } },
    aiEntityStore: { tryFind() { return undefined; }, all() { return []; } },
    aiFamilyStore: { tryFind() { return undefined; }, all() { return []; } },
    decisionTreeStore: { tryFind() { return undefined; }, all() { return []; } },
    mapEntityGroupStore: { tryFind() { return undefined; }, all() { return []; } },
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

const testSkill: ActiveSkill = {
  Id: 1,
  Name: 'Test Skill',
  Description: 'Test',
  Intent: 'Offensive',
  DamageSource: 'Physical',
  Cost: { ResourceType: 'MP', Amount: 10 },
  Cooldown: 1.5,
  Targeting: 'TargetEntity',
  Range: 50,
  Area: { kind: 'Point' },
  Delivery: { kind: 'Instant' },
  Origin: { kind: 'Caster' },
  CastingTime: undefined,
  ChargePhase: undefined,
  ElementFormula: undefined,
  CastVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
  ImpactVisuals: { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
  Effects: [],
  Formula: { kind: 'Const', value: 20 },
};

describe('AbilityActivation Validation', () => {
  it('should pass validation for a valid ability intent', () => {
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(true);
  });

  it('should fail with NotEnoughResources when MP is insufficient', () => {
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [],
      Resources: { HP: 100, MP: 5 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('NotEnoughResources');
  });

  it('should fail with OnCooldown when skill is on cooldown', () => {
    const cooldowns = new Map<SkillId, number>();
    cooldowns.set(brandSkillId(1), 10.0); // ready at t=10

    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: cooldowns,
      GameTime: 5.0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('OnCooldown');
  });

  it('should pass when cooldown has expired', () => {
    const cooldowns = new Map<SkillId, number>();
    cooldowns.set(brandSkillId(1), 5.0); // ready at t=5

    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: cooldowns,
      GameTime: 10.0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(true);
  });

  it('should fail with Stunned when entity is stunned', () => {
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [{ kind: 'Stunned' }],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('Stunned');
  });

  it('should fail with Silenced when entity is silenced and skill costs MP', () => {
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, testSkill]])),
      Statuses: [{ kind: 'Silenced' }],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('Silenced');
  });

  it('should pass Silenced check when skill has no MP cost', () => {
    const noCostSkill: ActiveSkill = { ...testSkill, Cost: undefined };
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map([[1, noCostSkill]])),
      Statuses: [{ kind: 'Silenced' }],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(1));
    expect(result.ok).toBe(true);
  });

  it('should fail with SkillNotFound when skill does not exist', () => {
    const context: ValidationContext = {
      SkillStore: createFakeSkillStore(new Map()),
      Statuses: [],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(999));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('SkillNotFound');
  });

  it('should fail with CannotActivatePassiveSkill for passive skills', () => {
    const passiveSkill: Skill = { kind: 'Passive', passive: { Id: 2, Name: 'Passive', Description: 'Test', Effects: [] } };
    const store: SkillStore = {
      tryFind(id) {
        return id === 2 ? passiveSkill : undefined;
      },
      getActive() {
        return undefined;
      },
      all() {
        return [passiveSkill];
      },
    };

    const context: ValidationContext = {
      SkillStore: store,
      Statuses: [],
      Resources: { HP: 100, MP: 100 },
      Cooldowns: undefined,
      GameTime: 0,
      EntityId: brandEntityId('test'),
    };

    const result = validateAbility(context, brandSkillId(2));
    expect(result.ok).toBe(false);
    expect(resultError(result)).toBe('CannotActivatePassiveSkill');
  });
});

describe('AbilityActivationSystem EventBus Integration', () => {
  it('should let direct Ability intents pass through to CombatSystem (F# semantics)', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');
    const casterId = brandEntityId('caster-1');

    spawnEntity(
      world,
      casterId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: 'Alive' }
    );

    const env = createMinimalEnv(world, createFakeStores(new Map([[1, testSkill]])), 0);
    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    // F#: TargetingService publishes Ability directly; CombatSystem handles it
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: {
        kind: 'Ability',
        ability: {
          Caster: casterId,
          SkillId: brandSkillId(1),
          Target: { kind: 'TargetSelf' },
        },
      },
    });

    env.core.eventBus.flush();

    // Combat should have processed it directly (no AbilityValidated indirection in F#)
    const damageEvents = receivedEvents.filter(
      (e) => e.kind === 'Notification' && e.notification.kind === 'DamageDealt'
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    sub.unsubscribe();
    abilityActivation.dispose?.();
    combat.dispose?.();
  });

  it('should execute pending cast when movement becomes Idle', () => {
    const world = createMutableWorld();
    const scenarioId = brandScenarioId('test-scenario');
    const casterId = brandEntityId('caster-1');

    spawnEntity(
      world,
      casterId,
      scenarioId,
      { Power: 10, Magic: 10, Sense: 0, Charm: 10 },
      { X: 0, Y: 0, Z: 0 },
      { HP: 100, MP: 100, Status: 'Alive' }
    );

    // Set a pending skill cast
    world.PendingSkillCast.set(casterId, { skillId: brandSkillId(1), target: { kind: 'TargetSelf' } });

    const env = createMinimalEnv(world, createFakeStores(new Map([[1, testSkill]])), 0);
    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    // Publish MovementStateChanged to Idle
    env.core.eventBus.publish({
      kind: 'State',
      state: {
        kind: 'Physics',
        event: {
          kind: 'MovementStateChanged',
          entityId: casterId,
          state: { kind: 'Idle' },
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    // F#: AbilityActivationSystem publishes Ability directly for pending casts
    const abilityEvents = receivedEvents.filter(
      (e) => e.kind === 'Intent' && e.intent.kind === 'Ability'
    );
    expect(abilityEvents.length).toBe(1);

    const damageEvents = receivedEvents.filter(
      (e) => e.kind === 'Notification' && e.notification.kind === 'DamageDealt'
    );
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    // Pending cast should be cleared
    expect(world.PendingSkillCast.has(casterId)).toBe(false);

    sub.unsubscribe();
    abilityActivation.dispose?.();
    combat.dispose?.();
  });

  it('should reject pending cast when target is out of range', () => {
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
      { X: 1000, Y: 0, Z: 0 }, // Far away
      { HP: 100, MP: 100, Status: 'Alive' }
    );

    // Set pending cast targeting the far-away entity (range is 50)
    world.PendingSkillCast.set(casterId, {
      skillId: brandSkillId(1),
      target: { kind: 'TargetEntity', entity: targetId },
    });

    const env = createMinimalEnv(world, createFakeStores(new Map([[1, testSkill]])), 0);
    const abilityActivation = createAbilityActivationSystem(env);
    const combat = createCombatSystem(env);

    const receivedEvents: GameEvent[] = [];
    const sub = env.core.eventBus.events$.subscribe((e) => receivedEvents.push(e));

    env.core.eventBus.publish({
      kind: 'State',
      state: {
        kind: 'Physics',
        event: {
          kind: 'MovementStateChanged',
          entityId: casterId,
          state: { kind: 'Idle' },
        },
      },
    });

    env.core.eventBus.flush();
    env.core.stateWrite.FlushWrites(world, 0);

    // Should NOT have Ability (out of range)
    const abilityEvents = receivedEvents.filter(
      (e) => e.kind === 'Intent' && e.intent.kind === 'Ability'
    );
    expect(abilityEvents.length).toBe(0);

    // Should have ShowMessage "Target is out of range"
    const showMessageEvents = receivedEvents.filter(
      (e) => e.kind === 'Notification' && e.notification.kind === 'ShowMessage'
    );
    expect(showMessageEvents.length).toBe(1);
    const msg = (showMessageEvents[0] as { kind: 'Notification'; notification: { kind: 'ShowMessage'; message: { Message: string } } }).notification.message;
    expect(msg.Message).toBe('Target is out of range');

    // Pending cast should be cleared even on failure
    expect(world.PendingSkillCast.has(casterId)).toBe(false);

    sub.unsubscribe();
    abilityActivation.dispose?.();
    combat.dispose?.();
  });
});
