import type { EntityId, SkillId } from '../types/branded';
import type { PomoEnvironment } from './environment';
import type { Vector2 } from '../domain/core';
import { vector2Distance, vector2Normalize, vector2Dot } from '../domain/core';
import { brandAiArchetypeId } from '../types/branded';
import type { Faction } from '../domain/entity';
import type {
  AIController,
  AIArchetype,
  PerceptionCue,
  CuePriority,
  AIState,
  BehaviorType,
  MemoryEntry,
} from '../domain/ai';
import type { AbilityIntent, SetMovementTarget } from '../domain/events';
import { Constants } from '../domain/constants';

// --- Faction Relations (from GameLogic.fs) ---

function getRelation(sourceFactions: Set<Faction>, targetFactions: Set<Faction>): 'Ally' | 'Enemy' | 'Neutral' {
  if (sourceFactions.size === 0 || targetFactions.size === 0) return 'Neutral';

  // Rule 1: Same faction NEVER attacks same faction
  for (const f of sourceFactions) {
    if (targetFactions.has(f)) return 'Ally';
  }

  // Rule 2: Ally and Player don't attack each other
  const sourceIsPlayerSide = sourceFactions.has('Player') || sourceFactions.has('Ally');
  const targetIsPlayerSide = targetFactions.has('Player') || targetFactions.has('Ally');
  if (sourceIsPlayerSide && targetIsPlayerSide) return 'Ally';

  return 'Enemy';
}

function isHostileFaction(controllerFactions: Set<Faction>, targetFactions: Set<Faction>): boolean {
  return getRelation(controllerFactions, targetFactions) === 'Enemy';
}

// --- Perception ---

function isInFieldOfView(
  facingDir: Vector2,
  controllerPos: Vector2,
  targetPos: Vector2,
  fovDegrees: number
): boolean {
  if (fovDegrees >= 360) return true;
  const lenSq = facingDir.X * facingDir.X + facingDir.Y * facingDir.Y;
  if (lenSq < 0.001) return true;

  const toTarget = vector2Normalize({ X: targetPos.X - controllerPos.X, Y: targetPos.Y - controllerPos.Y });
  const facing = vector2Normalize(facingDir);
  const dot = vector2Dot(facing, toTarget);
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const angleBetween = Math.acos(clampedDot) * (180 / Math.PI);
  return angleBetween <= fovDegrees / 2;
}

function gatherVisualCues(
  _controller: AIController,
  archetype: AIArchetype,
  controllerPos: Vector2,
  controllerVelocity: Vector2,
  controllerFactions: Set<Faction>,
  positions: Map<EntityId, import('../domain/core').WorldPosition>,
  factions: Map<EntityId, Set<Faction>>
): PerceptionCue[] {
  const cues: PerceptionCue[] = [];

  for (const [entityId, worldPos] of positions) {
    const pos = { X: worldPos.X, Y: worldPos.Z }; // XZ is ground plane
    const targetFactions = factions.get(entityId);
    if (!targetFactions) continue;

    if (!isHostileFaction(controllerFactions, targetFactions)) continue;

    const dist = vector2Distance(controllerPos, pos);
    if (dist > archetype.perceptionConfig.visualRange) continue;

    if (!isInFieldOfView(controllerVelocity, controllerPos, pos, archetype.perceptionConfig.fov)) continue;

    let strength: PerceptionCue['strength'];
    if (dist < archetype.perceptionConfig.visualRange * 0.3) strength = 'Overwhelming';
    else if (dist < archetype.perceptionConfig.visualRange * 0.6) strength = 'Strong';
    else if (dist < archetype.perceptionConfig.visualRange * 0.8) strength = 'Moderate';
    else strength = 'Weak';

    cues.push({
      cueType: 'Visual',
      strength,
      sourceEntityId: entityId,
      position: pos,
      timestamp: 0, // Will be set by caller
    });
  }

  return cues;
}

function decayMemories(
  controller: AIController,
  archetype: AIArchetype,
  currentPos: Vector2,
  currentTick: number
): Map<EntityId, MemoryEntry> {
  const result = new Map<EntityId, MemoryEntry>();

  for (const [entityId, entry] of controller.memories) {
    const age = currentTick - entry.lastSeenTick;
    const distToSpawn = vector2Distance(currentPos, controller.spawnPosition);

    let isLeashed = true;
    const mt = archetype.perceptionConfig.movementType;
    if (typeof mt === 'object' && mt.kind === 'Tethered') {
      isLeashed = distToSpawn <= mt.leashDistance;
    }
    // Free/Stationary are always leashed

    if (age < archetype.perceptionConfig.memoryDuration && isLeashed) {
      const decayFactor = 1.0 - (age / archetype.perceptionConfig.memoryDuration);
      const newConfidence = entry.confidence * decayFactor;
      if (newConfidence > 0.1) {
        result.set(entityId, { ...entry, confidence: newConfidence });
      }
    }
  }

  return result;
}

function gatherCues(
  controller: AIController,
  archetype: AIArchetype,
  currentPos: Vector2,
  currentVelocity: Vector2,
  currentTick: number,
  controllerFactions: Set<Faction>,
  positions: Map<EntityId, import('../domain/core').WorldPosition>,
  factions: Map<EntityId, Set<Faction>>
): { cues: PerceptionCue[]; memories: Map<EntityId, MemoryEntry> } {
  const visualCues = gatherVisualCues(controller, archetype, currentPos, currentVelocity, controllerFactions, positions, factions);
  const timestampedVisualCues = visualCues.map((c) => ({ ...c, timestamp: currentTick }));

  let updatedMemories = decayMemories(controller, archetype, currentPos, currentTick);

  for (const cue of timestampedVisualCues) {
    if (cue.sourceEntityId) {
      let confidence = 0.25;
      if (cue.strength === 'Moderate') confidence = 0.5;
      if (cue.strength === 'Strong') confidence = 0.75;
      if (cue.strength === 'Overwhelming') confidence = 1.0;

      updatedMemories.set(cue.sourceEntityId, {
        entityId: cue.sourceEntityId,
        lastSeenTick: currentTick,
        lastKnownPosition: cue.position,
        confidence,
      });
    }
  }

  const memoryCues: PerceptionCue[] = [];
  for (const [entityId, entry] of updatedMemories) {
    let strength: PerceptionCue['strength'];
    if (entry.confidence >= 1.0) strength = 'Overwhelming';
    else if (entry.confidence >= 0.75) strength = 'Strong';
    else if (entry.confidence >= 0.5) strength = 'Moderate';
    else strength = 'Weak';

    memoryCues.push({
      cueType: 'Memory',
      strength,
      sourceEntityId: entityId,
      position: entry.lastKnownPosition,
      timestamp: entry.lastSeenTick,
    });
  }

  return { cues: [...timestampedVisualCues, ...memoryCues], memories: updatedMemories };
}

// --- Skill Selection ---

function isSkillReady(skillId: SkillId, cooldowns: Map<SkillId, number> | undefined, currentTime: number): boolean {
  if (!cooldowns) return true;
  const readyTime = cooldowns.get(skillId);
  if (readyTime === undefined) return true;
  return currentTime >= readyTime;
}

function getSkillRange(skill: import('../domain/skill').Skill): number | undefined {
  if (skill.kind === 'Passive') return undefined;
  switch (skill.active.Targeting) {
    case 'Self':
    case 'TargetDirection':
      return undefined;
    default:
      return skill.active.Range;
  }
}

function selectBestSkill(
  skillStore: import('../stores/content-store').SkillStore,
  knownSkills: SkillId[],
  cooldowns: Map<SkillId, number> | undefined,
  currentTime: number,
  casterPos: Vector2,
  targetPos: Vector2
): { skillId: SkillId; skill: import('../domain/skill').Skill } | undefined {
  for (const skillId of knownSkills) {
    if (!isSkillReady(skillId, cooldowns, currentTime)) continue;
    const skill = skillStore.tryFind(skillId);
    if (!skill || skill.kind === 'Passive') continue;
    const range = getSkillRange(skill);
    if (range === undefined) {
      return { skillId, skill };
    }
    const dist = vector2Distance(casterPos, targetPos);
    if (dist <= range) {
      return { skillId, skill };
    }
  }
  return undefined;
}

function createAbilityIntent(
  casterId: EntityId,
  skillId: SkillId,
  skill: import('../domain/skill').Skill,
  targetEntityId: EntityId | undefined,
  targetPos: Vector2
): AbilityIntent {
  let target: import('../domain/events').SkillTarget;
  if (skill.kind === 'Passive') {
    target = { kind: 'TargetSelf' };
  } else {
    switch (skill.active.Targeting) {
      case 'Self':
        target = { kind: 'TargetSelf' };
        break;
      case 'TargetEntity':
        target = targetEntityId ? { kind: 'TargetEntity', entity: targetEntityId } : { kind: 'TargetPosition', position: targetPos };
        break;
      case 'TargetPosition':
        target = { kind: 'TargetPosition', position: targetPos };
        break;
      case 'TargetDirection':
        target = { kind: 'TargetDirection', position: targetPos };
        break;
    }
  }

  return {
    Caster: casterId,
    SkillId: skillId,
    Target: target,
  };
}

// --- Decision ---

function matchCueToPriority(cue: PerceptionCue, priorities: CuePriority[]): CuePriority | undefined {
  return priorities.find((p) => p.cueType === cue.cueType && cueStrengthRank(cue.strength) >= cueStrengthRank(p.minStrength));
}

function cueStrengthRank(s: PerceptionCue['strength']): number {
  switch (s) {
    case 'Weak': return 1;
    case 'Moderate': return 2;
    case 'Strong': return 3;
    case 'Overwhelming': return 4;
  }
}

function selectBestCue(cues: PerceptionCue[], priorities: CuePriority[]): { cue: PerceptionCue; priority: CuePriority } | undefined {
  let best: { cue: PerceptionCue; priority: CuePriority } | undefined;

  for (const cue of cues) {
    const priority = matchCueToPriority(cue, priorities);
    if (!priority) continue;
    if (!best || priority.priority < best.priority.priority) {
      best = { cue, priority };
    }
  }

  return best;
}

function generateCommand(
  cue: PerceptionCue,
  priority: CuePriority,
  controller: AIController
): SetMovementTarget | undefined {
  switch (priority.response) {
    case 'Investigate':
    case 'Engage':
      return { EntityId: controller.controlledEntityId, Target: cue.position };
    case 'Evade':
      return { EntityId: controller.controlledEntityId, Target: controller.spawnPosition };
    case 'Flee':
    case 'Ignore':
      return undefined;
  }
}

function determineState(response: import('../domain/ai').ResponseType, cue: PerceptionCue): AIState {
  switch (response) {
    case 'Engage':
      return cue.sourceEntityId ? 'Chasing' : 'Investigating';
    case 'Investigate':
      return 'Investigating';
    case 'Evade':
    case 'Flee':
      return 'Fleeing';
    case 'Ignore':
      return 'Idle';
  }
}

// --- Waypoint Navigation ---

function selectNextWaypoint(
  behaviorType: BehaviorType,
  controller: AIController,
  currentPos: Vector2,
  waypoints: Vector2[]
): { target: Vector2; nextIndex: number } {
  switch (behaviorType) {
    case 'Patrol': {
      const currentIdx = controller.waypointIndex % waypoints.length;
      const targetWaypoint = waypoints[currentIdx];
      const dist = vector2Distance(currentPos, targetWaypoint);
      if (dist < Constants.AI.WaypointReachedThreshold) {
        const nextIdx = (controller.waypointIndex + 1) % waypoints.length;
        return { target: waypoints[nextIdx], nextIndex: nextIdx };
      }
      return { target: targetWaypoint, nextIndex: currentIdx };
    }
    case 'Aggressive': {
      if (waypoints.length === 0) return { target: controller.spawnPosition, nextIndex: controller.waypointIndex };
      const idx = Math.floor(Math.random() * waypoints.length);
      return { target: waypoints[idx], nextIndex: controller.waypointIndex };
    }
    case 'Defensive':
    case 'Supporter': {
      let best = waypoints[0];
      let bestDist = Infinity;
      for (const wp of waypoints) {
        const d = vector2Distance(controller.spawnPosition, wp);
        if (d < bestDist) {
          bestDist = d;
          best = wp;
        }
      }
      return { target: best, nextIndex: controller.waypointIndex };
    }
    case 'Ambusher': {
      if (controller.waypointIndex === 0) return { target: controller.spawnPosition, nextIndex: 0 };
      const idx = Math.floor(Math.random() * waypoints.length);
      return { target: waypoints[idx], nextIndex: controller.waypointIndex };
    }
    case 'Turret':
      return { target: controller.spawnPosition, nextIndex: controller.waypointIndex };
    case 'Passive': {
      const idx = Math.floor(Math.random() * waypoints.length);
      return { target: waypoints[idx], nextIndex: controller.waypointIndex };
    }
  }
}

// --- Main AI Logic ---

interface AIOutput {
  command: SetMovementTarget | undefined;
  ability: AbilityIntent | undefined;
  newState: AIState;
  waypointIndex: number | undefined;
  shouldUpdateTime: boolean;
}

function handleBestCue(
  cue: PerceptionCue,
  priority: CuePriority,
  controller: AIController,
  _archetype: AIArchetype,
  currentPos: Vector2,
  currentTime: number,
  knownSkills: SkillId[],
  skillStore: import('../stores/content-store').SkillStore,
  cooldowns: Map<SkillId, number> | undefined
): AIOutput {
  const movementCmd = generateCommand(cue, priority, controller);
  const state = determineState(priority.response, cue);

  let ability: AbilityIntent | undefined;
  if (priority.response === 'Engage' || priority.response === 'Investigate') {
    const selected = selectBestSkill(skillStore, knownSkills, cooldowns, currentTime, currentPos, cue.position);
    if (selected) {
      ability = createAbilityIntent(controller.controlledEntityId, selected.skillId, selected.skill, cue.sourceEntityId, cue.position);
    }
  }

  return {
    command: movementCmd,
    ability,
    newState: state,
    waypointIndex: controller.waypointIndex,
    shouldUpdateTime: true,
  };
}

function handleNoCue(
  controller: AIController,
  archetype: AIArchetype,
  currentPos: Vector2
): AIOutput {
  const navigateSpawn: SetMovementTarget = {
    EntityId: controller.controlledEntityId,
    Target: controller.spawnPosition,
  };

  if (controller.absoluteWaypoints && controller.absoluteWaypoints.length > 0) {
    const waypoints = controller.absoluteWaypoints;
    const { target, nextIndex } = selectNextWaypoint(archetype.behaviorType, controller, currentPos, waypoints);

    let desiredState: AIState;
    switch (archetype.behaviorType) {
      case 'Turret':
      case 'Passive':
        desiredState = 'Idle';
        break;
      default:
        desiredState = 'Patrolling';
    }

    return {
      command: { EntityId: controller.controlledEntityId, Target: target },
      ability: undefined,
      newState: desiredState,
      waypointIndex: nextIndex,
      shouldUpdateTime: true,
    };
  }

  switch (archetype.behaviorType) {
    case 'Patrol':
      return noOutput(controller.currentState, controller.waypointIndex);
    default:
      return {
        command: navigateSpawn,
        ability: undefined,
        newState: 'Idle',
        waypointIndex: controller.waypointIndex,
        shouldUpdateTime: true,
      };
  }
}

function processAndGenerateCommands(
  controller: AIController,
  archetype: AIArchetype,
  currentPos: Vector2,
  currentVelocity: Vector2,
  currentTick: number,
  controllerFactions: Set<Faction>,
  positions: Map<EntityId, import('../domain/core').WorldPosition>,
  factions: Map<EntityId, Set<Faction>>,
  skillStore: import('../stores/content-store').SkillStore,
  cooldowns: Map<SkillId, number> | undefined
): { controller: AIController; command: SetMovementTarget | undefined; ability: AbilityIntent | undefined } {
  const timeSinceLastDecision = currentTick - controller.lastDecisionTime;

  if (timeSinceLastDecision < archetype.decisionInterval) {
    return { controller, command: undefined, ability: undefined };
  }

  const { cues, memories } = gatherCues(
    controller,
    archetype,
    currentPos,
    currentVelocity,
    currentTick,
    controllerFactions,
    positions,
    factions
  );

  const bestCue = selectBestCue(cues, archetype.cuePriorities);

  let result: AIOutput;
  if (bestCue) {
    result = handleBestCue(bestCue.cue, bestCue.priority, controller, archetype, currentPos, currentTick, controller.skills, skillStore, cooldowns);
  } else {
    result = handleNoCue(controller, archetype, currentPos);
  }

  const updatedController: AIController = {
    ...controller,
    memories,
    waypointIndex: result.waypointIndex ?? controller.waypointIndex,
    currentState: result.newState,
    lastDecisionTime: result.shouldUpdateTime ? currentTick : controller.lastDecisionTime,
  };

  return {
    controller: updatedController,
    command: result.command,
    ability: result.ability,
  };
}

// --- Behavior Tree Evaluator ---

import type { BehaviorNode, NodeResult, ConditionKind, ActionKind } from '../domain/ai';

interface TreeExecutionContext {
  perception: {
    controller: AIController;
    archetype: AIArchetype;
    entity: {
      position: Vector2;
      velocity: Vector2;
      factions: Set<Faction>;
    };
    currentTick: number;
  };
  target: {
    position: Vector2 | undefined;
    entityId: EntityId | undefined;
    distance: number | undefined;
  };
  ability: {
    skillStore: import('../stores/content-store').SkillStore;
    cooldowns: Map<SkillId, number> | undefined;
    knownSkills: SkillId[];
  };
  bestCue: PerceptionCue | undefined;
  response: import('../domain/ai').ResponseType | undefined;
}

type StackFrame =
  | { kind: 'Selector'; children: BehaviorNode[]; index: number }
  | { kind: 'Sequence'; children: BehaviorNode[]; index: number }
  | { kind: 'Inverter' };

function evaluateCondition(cond: ConditionKind, ctx: TreeExecutionContext): NodeResult {
  switch (cond.kind) {
    case 'HasTarget':
      return ctx.target.entityId !== undefined ? 'Success' : 'Failure';
    case 'TargetInRange': {
      if (ctx.target.distance === undefined) return 'Failure';
      const range = cond.range ?? ctx.perception.archetype.perceptionConfig.visualRange;
      return ctx.target.distance <= range ? 'Success' : 'Failure';
    }
    case 'TargetInMeleeRange': {
      if (ctx.target.distance === undefined) return 'Failure';
      return ctx.target.distance <= 48 ? 'Success' : 'Failure';
    }
    case 'TargetTooClose': {
      if (ctx.target.distance === undefined) return 'Failure';
      return ctx.target.distance < cond.minDistance ? 'Success' : 'Failure';
    }
    case 'SelfHealthBelow':
      // TODO: Need health access
      return 'Failure';
    case 'TargetHealthBelow':
      // TODO: Need health access
      return 'Failure';
    case 'BeyondLeash': {
      const dist = vector2Distance(ctx.perception.entity.position, ctx.perception.controller.spawnPosition);
      const mt = ctx.perception.archetype.perceptionConfig.movementType;
      if (typeof mt === 'object' && mt.kind === 'Tethered') {
        return dist > mt.leashDistance ? 'Success' : 'Failure';
      }
      return 'Failure';
    }
    case 'SkillReady': {
      const hasReady = ctx.ability.knownSkills.some((skillId) =>
        isSkillReady(skillId, ctx.ability.cooldowns, ctx.perception.currentTick)
      );
      return hasReady ? 'Success' : 'Failure';
    }
    case 'HasCue':
      return ctx.bestCue !== undefined ? 'Success' : 'Failure';
    case 'CueResponseIs': {
      return ctx.response === cond.response ? 'Success' : 'Failure';
    }
  }
}

function executeAction(action: ActionKind, ctx: TreeExecutionContext): { result: NodeResult; output: AIOutput } {
  const defaultFail = failureResult(
    ctx.perception.controller.currentState,
    ctx.perception.controller.waypointIndex
  );
  const defaultSuccess = noOutput(
    ctx.perception.controller.currentState,
    ctx.perception.controller.waypointIndex
  );

  switch (action) {
    case 'ChaseTarget': {
      if (!ctx.target.position) return { result: 'Failure', output: defaultFail };
      const cmd: SetMovementTarget = {
        EntityId: ctx.perception.controller.controlledEntityId,
        Target: ctx.target.position,
      };
      return {
        result: 'Running',
        output: {
          command: cmd,
          ability: undefined,
          newState: 'Chasing',
          waypointIndex: undefined,
          shouldUpdateTime: true,
        },
      };
    }
    case 'UseRangedAttack':
    case 'UseMeleeAttack':
    case 'UseHeal':
    case 'UseDebuff':
    case 'UseBuff': {
      if (!ctx.target.position) return { result: 'Failure', output: defaultFail };
      const selected = selectBestSkill(
        ctx.ability.skillStore,
        ctx.ability.knownSkills,
        ctx.ability.cooldowns,
        ctx.perception.currentTick,
        ctx.perception.entity.position,
        ctx.target.position
      );
      if (selected) {
        const intent = createAbilityIntent(
          ctx.perception.controller.controlledEntityId,
          selected.skillId,
          selected.skill,
          ctx.target.entityId,
          ctx.target.position
        );
        return {
          result: 'Success',
          output: {
            command: undefined,
            ability: intent,
            newState: 'Attacking',
            waypointIndex: undefined,
            shouldUpdateTime: true,
          },
        };
      }
      // Fallback: move to target
      const cmd: SetMovementTarget = {
        EntityId: ctx.perception.controller.controlledEntityId,
        Target: ctx.target.position,
      };
      return {
        result: 'Running',
        output: {
          command: cmd,
          ability: undefined,
          newState: 'Chasing',
          waypointIndex: undefined,
          shouldUpdateTime: true,
        },
      };
    }
    case 'Patrol': {
      const waypoints = ctx.perception.controller.absoluteWaypoints;
      if (!waypoints || waypoints.length === 0) return { result: 'Success', output: defaultSuccess };
      const { target, nextIndex } = selectNextWaypoint(
        ctx.perception.archetype.behaviorType,
        ctx.perception.controller,
        ctx.perception.entity.position,
        waypoints
      );
      const cmd: SetMovementTarget = {
        EntityId: ctx.perception.controller.controlledEntityId,
        Target: target,
      };
      return {
        result: 'Running',
        output: {
          command: cmd,
          ability: undefined,
          newState: 'Patrolling',
          waypointIndex: nextIndex,
          shouldUpdateTime: true,
        },
      };
    }
    case 'ReturnToSpawn': {
      const cmd: SetMovementTarget = {
        EntityId: ctx.perception.controller.controlledEntityId,
        Target: ctx.perception.controller.spawnPosition,
      };
      return {
        result: 'Running',
        output: {
          command: cmd,
          ability: undefined,
          newState: 'Patrolling',
          waypointIndex: undefined,
          shouldUpdateTime: true,
        },
      };
    }
    case 'Retreat': {
      if (!ctx.target.position) return { result: 'Failure', output: defaultFail };
      const direction = {
        X: ctx.perception.entity.position.X - ctx.target.position.X,
        Y: ctx.perception.entity.position.Y - ctx.target.position.Y,
      };
      const len = Math.sqrt(direction.X * direction.X + direction.Y * direction.Y);
      const normalizedDir = len > 0 ? { X: direction.X / len, Y: direction.Y / len } : { X: 0, Y: 1 };
      const retreatPos = {
        X: ctx.perception.entity.position.X + normalizedDir.X * 100,
        Y: ctx.perception.entity.position.Y + normalizedDir.Y * 100,
      };
      const cmd: SetMovementTarget = {
        EntityId: ctx.perception.controller.controlledEntityId,
        Target: retreatPos,
      };
      return {
        result: 'Running',
        output: {
          command: cmd,
          ability: undefined,
          newState: 'Chasing',
          waypointIndex: undefined,
          shouldUpdateTime: true,
        },
      };
    }
    case 'Idle': {
      return {
        result: 'Success',
        output: {
          command: undefined,
          ability: undefined,
          newState: 'Idle',
          waypointIndex: undefined,
          shouldUpdateTime: false,
        },
      };
    }
  }
}

function invertResult(res: NodeResult): NodeResult {
  switch (res) {
    case 'Success': return 'Failure';
    case 'Failure': return 'Success';
    case 'Running': return 'Running';
  }
}

function failureResult(state: AIState, waypointIdx: number): AIOutput {
  return { command: undefined, ability: undefined, newState: state, waypointIndex: waypointIdx, shouldUpdateTime: true };
}

function noOutput(state: AIState, waypointIdx: number): AIOutput {
  return { command: undefined, ability: undefined, newState: state, waypointIndex: waypointIdx, shouldUpdateTime: false };
}

export function evaluateBehaviorTree(
  rootNode: BehaviorNode,
  ctx: TreeExecutionContext
): { result: NodeResult; output: AIOutput } {
  const stack: StackFrame[] = [];

  const failureOut = failureResult(
    ctx.perception.controller.currentState,
    ctx.perception.controller.waypointIndex
  );
  const successOut = noOutput(
    ctx.perception.controller.currentState,
    ctx.perception.controller.waypointIndex
  );

  let node: BehaviorNode = rootNode;
  let nodeRes: NodeResult = 'Failure';
  let output: AIOutput = failureOut;

  let running = true;
  let descend = true;

  while (running) {
    while (descend) {
      switch (node.kind) {
        case 'Selector': {
          if (node.children.length === 0) {
            nodeRes = 'Failure';
            output = failureOut;
            descend = false;
          } else {
            stack.push({ kind: 'Selector', children: node.children, index: 0 });
            node = node.children[0];
          }
          break;
        }
        case 'Sequence': {
          if (node.children.length === 0) {
            nodeRes = 'Success';
            output = successOut;
            descend = false;
          } else {
            stack.push({ kind: 'Sequence', children: node.children, index: 0 });
            node = node.children[0];
          }
          break;
        }
        case 'Condition': {
          const res = evaluateCondition(node.condition, ctx);
          nodeRes = res;
          output = res === 'Success' ? successOut : failureOut;
          descend = false;
          break;
        }
        case 'Action': {
          const { result, output: out } = executeAction(node.action, ctx);
          nodeRes = result;
          output = out;
          descend = false;
          break;
        }
        case 'Inverter': {
          stack.push({ kind: 'Inverter' });
          node = node.child;
          break;
        }
      }
    }

    descend = false;

    // Backtrack to next child
    let searching = true;
    while (searching && running && !descend) {
      if (stack.length === 0) {
        running = false;
        searching = false;
      } else {
        const frame = stack.pop()!;
        switch (frame.kind) {
          case 'Inverter': {
            nodeRes = invertResult(nodeRes);
            break;
          }
          case 'Selector': {
            if (nodeRes === 'Success' || nodeRes === 'Running') {
              // Selector succeeded or is running, stop
            } else {
              const nextIdx = frame.index + 1;
              if (nextIdx < frame.children.length) {
                stack.push({ kind: 'Selector', children: frame.children, index: nextIdx });
                node = frame.children[nextIdx];
                descend = true;
                searching = false;
              }
            }
            break;
          }
          case 'Sequence': {
            if (nodeRes === 'Failure' || nodeRes === 'Running') {
              // Sequence failed or is running, stop
            } else {
              const nextIdx = frame.index + 1;
              if (nextIdx < frame.children.length) {
                stack.push({ kind: 'Sequence', children: frame.children, index: nextIdx });
                node = frame.children[nextIdx];
                descend = true;
                searching = false;
              }
            }
            break;
          }
        }
      }
    }
  }

  return { result: nodeRes, output };
}

// --- System Factory ---

export interface AISystem {
  update(): void;
  dispose(): void;
}

export function createAISystem(env: PomoEnvironment): AISystem {
  const fallbackArchetype: AIArchetype = {
    id: brandAiArchetypeId(0),
    name: 'Fallback',
    behaviorType: 'Aggressive',
    perceptionConfig: {
      visualRange: 150,
      fov: 360,
      memoryDuration: 5,
      movementType: 'Free',
    },
    cuePriorities: [],
    decisionInterval: 0.5,
    baseStats: { Power: 1, Magic: 1, Sense: 1, Charm: 1 },
  };

  return {
    update() {
      const world = env.core.world;
      const currentTick = world.Time.TotalGameTime;

      for (const [entityId, controller] of world.AIControllers) {
        const archetype = env.stores.aiArchetypeStore.tryFind(controller.archetypeId) ?? fallbackArchetype;

        // Time since last decision
        const timeSinceLastDecision = currentTick - controller.lastDecisionTime;
        if (timeSinceLastDecision < archetype.decisionInterval) continue;

        const pos = world.Positions.get(controller.controlledEntityId);
        if (!pos) continue;

        const controllerPos = { X: pos.X, Y: pos.Z };
        const vel = world.Velocities.get(controller.controlledEntityId);
        const controllerVelocity = vel ? { X: vel.X, Y: vel.Z } : { X: 0, Y: 0 };

        const controllerFactions = world.Factions.get(controller.controlledEntityId);
        if (!controllerFactions) continue;

        // Gather all positions and factions (per-scenario filtering could be added)
        const positions = world.Positions;
        const factions = world.Factions;

        // Get cooldowns for this entity
        const entityCooldowns = world.AbilityCooldowns.get(controller.controlledEntityId);

        const { controller: updatedController, command, ability } = processAndGenerateCommands(
          controller,
          archetype,
          controllerPos,
          controllerVelocity,
          currentTick,
          controllerFactions,
          positions,
          factions,
          env.stores.skillStore,
          entityCooldowns
        );

        if (updatedController !== controller) {
          env.core.stateWrite.UpdateAIController(entityId, updatedController);
        }

        if (command) {
          env.core.eventBus.publish({
            kind: 'Intent',
            intent: { kind: 'MovementTarget', movement: command },
          });
        }

        if (ability) {
          env.core.eventBus.publish({
            kind: 'Intent',
            intent: { kind: 'Ability', ability },
          });
        }
      }
    },

    dispose() {
      // No subscriptions to clean up
    },
  };
}
