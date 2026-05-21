import { describe, it, expect } from 'vitest';
import { evaluateBehaviorTree } from '../systems/ai-system';
import type { AIController, AIArchetype, BehaviorNode, PerceptionCue } from '../domain/ai';
import type { Vector2 } from '../domain/core';
import type { Faction } from '../domain/entity';
import type { SkillStore } from '../stores/content-store';
import { brandEntityId, brandAiArchetypeId } from '../types/branded';
import type { SkillId } from '../types/branded';

describe('Behavior Tree Evaluator', () => {
  function createMockCtx(opts: {
    hasTarget?: boolean;
    targetDistance?: number;
    skillReady?: boolean;
    hasCue?: boolean;
    waypoints?: Vector2[];
  } = {}) {
    const controller: AIController = {
      controlledEntityId: brandEntityId('entity-1'),
      archetypeId: brandAiArchetypeId(1),
      currentState: 'Idle',
      stateEnterTime: 0,
      spawnPosition: { X: 0, Y: 0 },
      absoluteWaypoints: opts.waypoints ?? undefined,
      waypointIndex: 0,
      lastDecisionTime: 0,
      currentTarget: undefined,
      decisionTree: '',
      preferredIntent: 'Offensive',
      skills: [] as SkillId[],
      memories: new Map(),
    };

    const archetype: AIArchetype = {
      id: brandAiArchetypeId(1),
      name: 'Test',
      behaviorType: 'Aggressive',
      perceptionConfig: {
        visualRange: 150,
        fov: 360,
        memoryDuration: 5,
        movementType: 'Free',
      },
      cuePriorities: [],
      decisionInterval: 0.5,
      baseStats: { Power: 10, Magic: 10, Sense: 10, Charm: 10 },
    };

    const skillStore: SkillStore = {
      tryFind() { return undefined; },
      getActive() { return undefined; },
      all() { return []; },
    };

    const bestCue: PerceptionCue | undefined = opts.hasCue
      ? {
          cueType: 'Visual',
          strength: 'Strong',
          sourceEntityId: brandEntityId('target-1'),
          position: { X: 50, Y: 0 },
          timestamp: 0,
        }
      : undefined;

    return {
      perception: {
        controller,
        archetype,
        entity: {
          position: { X: 0, Y: 0 },
          velocity: { X: 0, Y: 0 },
          factions: new Set<Faction>(['Enemy']),
        },
        currentTick: 0,
      },
      target: {
        position: opts.hasTarget ? { X: 50, Y: 0 } : undefined,
        entityId: opts.hasTarget ? brandEntityId('target-1') : undefined,
        distance: opts.targetDistance,
      },
      ability: {
        skillStore,
        cooldowns: undefined,
        knownSkills: [],
      },
      bestCue,
      response: undefined,
    };
  }

  it('sequence succeeds when all children succeed', () => {
    const tree: BehaviorNode = {
      kind: 'Sequence',
      children: [
        { kind: 'Condition', condition: { kind: 'HasTarget' } },
        { kind: 'Action', action: 'ChaseTarget' },
      ],
    };

    const ctx = createMockCtx({ hasTarget: true });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Running'); // ChaseTarget returns Running
    expect(result.output.newState).toBe('Chasing');
    expect(result.output.command).toBeDefined();
  });

  it('sequence fails when first child fails', () => {
    const tree: BehaviorNode = {
      kind: 'Sequence',
      children: [
        { kind: 'Condition', condition: { kind: 'HasTarget' } },
        { kind: 'Action', action: 'ChaseTarget' },
      ],
    };

    const ctx = createMockCtx({ hasTarget: false });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Failure');
    expect(result.output.command).toBeUndefined();
  });

  it('selector succeeds when first child succeeds', () => {
    const tree: BehaviorNode = {
      kind: 'Selector',
      children: [
        { kind: 'Condition', condition: { kind: 'HasTarget' } },
        { kind: 'Action', action: 'Patrol' },
      ],
    };

    const ctx = createMockCtx({ hasTarget: true });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Success');
  });

  it('selector falls through to next child when first fails', () => {
    const tree: BehaviorNode = {
      kind: 'Selector',
      children: [
        { kind: 'Condition', condition: { kind: 'HasTarget' } },
        { kind: 'Action', action: 'Patrol' },
      ],
    };

    const ctx = createMockCtx({ hasTarget: false, waypoints: [{ X: 100, Y: 0 }] });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Running'); // Patrol returns Running
    expect(result.output.newState).toBe('Patrolling');
  });

  it('inverter inverts success to failure', () => {
    const tree: BehaviorNode = {
      kind: 'Inverter',
      child: { kind: 'Condition', condition: { kind: 'HasTarget' } },
    };

    const ctx = createMockCtx({ hasTarget: true });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Failure');
  });

  it('inverter inverts failure to success', () => {
    const tree: BehaviorNode = {
      kind: 'Inverter',
      child: { kind: 'Condition', condition: { kind: 'HasTarget' } },
    };

    const ctx = createMockCtx({ hasTarget: false });
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Success');
  });

  it('nested sequence inside selector works', () => {
    const tree: BehaviorNode = {
      kind: 'Selector',
      children: [
        {
          kind: 'Sequence',
          children: [
            { kind: 'Condition', condition: { kind: 'HasTarget' } },
            { kind: 'Action', action: 'UseMeleeAttack' },
          ],
        },
        { kind: 'Action', action: 'Patrol' },
      ],
    };

    const ctx = createMockCtx({ hasTarget: true, targetDistance: 10, waypoints: [{ X: 100, Y: 0 }] });
    const result = evaluateBehaviorTree(tree, ctx);

    // Sequence: HasTarget succeeds, UseMeleeAttack falls back to chase (Running)
    expect(result.result).toBe('Running');
  });

  it('empty sequence returns success', () => {
    const tree: BehaviorNode = { kind: 'Sequence', children: [] };
    const ctx = createMockCtx();
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Success');
  });

  it('empty selector returns failure', () => {
    const tree: BehaviorNode = { kind: 'Selector', children: [] };
    const ctx = createMockCtx();
    const result = evaluateBehaviorTree(tree, ctx);

    expect(result.result).toBe('Failure');
  });
});
