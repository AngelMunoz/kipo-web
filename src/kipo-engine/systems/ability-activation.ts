import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { EntityId, SkillId } from '../types/branded';
import type { GameSystem, PomoEnvironment } from './environment';
import type { GameEvent } from '../domain/events';
import type { SkillStore } from '../stores/content-store';
import type { ActiveSkill } from '../domain/skill';
import type { CombatStatus } from '../domain/core';
import type { Result } from '../types/core';
import type { WorldPosition } from '../domain/core';

// --- Validation Types ---

export type ValidationError =
  | 'NotEnoughResources'
  | 'OnCooldown'
  | 'SkillNotFound'
  | 'CannotActivatePassiveSkill'
  | 'Stunned'
  | 'Silenced';

export interface ValidationContext {
  SkillStore: SkillStore;
  Statuses: readonly CombatStatus[];
  Resources: { HP: number; MP: number } | undefined;
  Cooldowns: ReadonlyMap<SkillId, number> | undefined;
  GameTime: number;
  EntityId: EntityId;
}

// --- Pure Validation Logic (1:1 from F#) ---

function checkStatusEffects(
  statuses: readonly CombatStatus[],
  skill: ActiveSkill
): Result<void, ValidationError> {
  if (statuses.some((s) => s.kind === 'Stunned')) {
    return { ok: false, error: 'Stunned' };
  }

  const isSilenced = statuses.some((s) => s.kind === 'Silenced');
  const isMpSkill = skill.Cost?.ResourceType === 'MP';

  if (isSilenced && isMpSkill) {
    return { ok: false, error: 'Silenced' };
  }

  return { ok: true, value: undefined };
}

function checkResources(
  resources: { HP: number; MP: number } | undefined,
  skill: ActiveSkill
): Result<void, ValidationError> {
  if (!skill.Cost) return { ok: true, value: undefined };
  if (!resources) return { ok: false, error: 'NotEnoughResources' };

  const requiredAmount = skill.Cost.Amount ?? 0;

  const hasEnough =
    skill.Cost.ResourceType === 'HP'
      ? resources.HP >= requiredAmount
      : resources.MP >= requiredAmount;

  if (hasEnough) return { ok: true, value: undefined };
  return { ok: false, error: 'NotEnoughResources' };
}

function checkCooldown(
  cooldowns: ReadonlyMap<SkillId, number> | undefined,
  gameTime: number,
  skillId: SkillId
): Result<void, ValidationError> {
  if (!cooldowns) return { ok: true, value: undefined };
  const readyTime = cooldowns.get(skillId);
  if (readyTime === undefined) return { ok: true, value: undefined };
  if (gameTime >= readyTime) return { ok: true, value: undefined };
  return { ok: false, error: 'OnCooldown' };
}

export function validateAbility(
  context: ValidationContext,
  skillId: SkillId
): Result<void, ValidationError> {
  const skill = context.SkillStore.tryFind(skillId);
  if (!skill) {
    return { ok: false, error: 'SkillNotFound' };
  }

  if (skill.kind === 'Passive') {
    return { ok: false, error: 'CannotActivatePassiveSkill' };
  }

  const activeSkill = skill.active;

  const statusResult = checkStatusEffects(context.Statuses, activeSkill);
  if (!statusResult.ok) return statusResult;

  const resourceResult = checkResources(context.Resources, activeSkill);
  if (!resourceResult.ok) return resourceResult;

  const cooldownResult = checkCooldown(context.Cooldowns, context.GameTime, skillId);
  if (!cooldownResult.ok) return cooldownResult;

  return { ok: true, value: undefined };
}

// --- Notification Helper ---

function publishValidationError(
  env: PomoEnvironment,
  entityId: EntityId,
  error: ValidationError
) {
  const pos = env.core.worldView.Positions.get(entityId);
  const position: WorldPosition = pos ?? { X: 0, Y: 0, Z: 0 };

  const messages: Record<ValidationError, string> = {
    NotEnoughResources: 'Not enough resources!',
    OnCooldown: 'Ability on cooldown!',
    SkillNotFound: 'Skill not found!',
    CannotActivatePassiveSkill: 'Cannot activate passive skill!',
    Stunned: 'Stunned!',
    Silenced: 'Silenced!',
  };

  env.core.eventBus.publish({
    kind: 'Notification',
    notification: {
      kind: 'ShowMessage',
      message: {
        Message: messages[error],
        Position: position,
        Type: 'Crit',
      },
    },
  });
}

// --- Pending Cast Handling ---

const SKILL_ACTIVATION_RANGE_BUFFER = 5.0; // from Constants.Entity.SkillActivationRangeBuffer

function handlePendingCast(
  env: PomoEnvironment,
  entityId: EntityId,
  skillId: SkillId,
  target: import('../domain/events').SkillTarget
) {
  const skill = env.stores.skillStore.getActive(skillId);
  if (!skill) return;

  const statuses = env.core.worldView.CombatStatuses.get(entityId) ?? [];
  const resources = env.core.worldView.Resources.get(entityId);
  const cooldowns = env.core.worldView.AbilityCooldowns.get(entityId);
  const gameTime = env.core.worldView.Time.TotalGameTime;

  const validationContext: ValidationContext = {
    SkillStore: env.stores.skillStore,
    Statuses: statuses,
    Resources: resources,
    Cooldowns: cooldowns,
    GameTime: gameTime,
    EntityId: entityId,
  };

  const validationResult = validateAbility(validationContext, skillId);
  if (!validationResult.ok) {
    publishValidationError(env, entityId, validationResult.error);
    env.core.stateWrite.ClearPendingSkillCast(entityId);
    return;
  }

  // Check range
  const casterPos = env.core.worldView.Positions.get(entityId);
  if (!casterPos) {
    env.core.stateWrite.ClearPendingSkillCast(entityId);
    return;
  }

  let targetPos: import('../domain/core').Vector2 | undefined;
  switch (target.kind) {
    case 'TargetEntity': {
      const tp = env.core.worldView.Positions.get(target.entity);
      if (tp) targetPos = { X: tp.X, Y: tp.Z };
      break;
    }
    case 'TargetPosition':
      targetPos = target.position;
      break;
    default:
      targetPos = { X: casterPos.X, Y: casterPos.Z };
  }

  if (!targetPos) {
    env.core.stateWrite.ClearPendingSkillCast(entityId);
    return;
  }

  // Validate target entity is still alive (F#: targeting/activation validates before combat)
  if (target.kind === 'TargetEntity') {
    const targetResources = env.core.worldView.Resources.get(target.entity);
    if (!targetResources || targetResources.Status !== 'Alive') {
      env.core.stateWrite.ClearPendingSkillCast(entityId);
      return;
    }
  }

  const dx = casterPos.X - targetPos.X;
  const dz = casterPos.Z - targetPos.Y; // Vector2 Y = WorldPosition Z
  const distance = Math.sqrt(dx * dx + dz * dz);
  const maxRange = skill.Range ?? 0;

  if (distance <= maxRange + SKILL_ACTIVATION_RANGE_BUFFER) {
    // F#: AbilityActivationSystem publishes Ability directly, not AbilityValidated
    env.core.eventBus.publish({
      kind: 'Intent',
      intent: {
        kind: 'Ability',
        ability: {
          Caster: entityId,
          SkillId: skillId,
          Target: target,
        },
      },
    });
  } else {
    env.core.eventBus.publish({
      kind: 'Notification',
      notification: {
        kind: 'ShowMessage',
        message: {
          Message: 'Target is out of range',
          Position: casterPos,
          Type: 'Miss',
        },
      },
    });
  }

  env.core.stateWrite.ClearPendingSkillCast(entityId);
}

// --- System Factory ---

export interface AbilityActivationSystem extends GameSystem {
  // update() handled via EventBus subscriptions
}

export function createAbilityActivationSystem(env: PomoEnvironment): AbilityActivationSystem {
  const subs: Subscription[] = [];

  // F# note: AbilityActivationSystem does NOT validate direct Ability intents.
  // TargetingService publishes Ability directly; CombatSystem handles it.
  // Validation only happens for pending casts (MovementStateChanged handler below).

  // Subscribe to MovementStateChanged to handle pending casts
  subs.push(
    env.core.eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent =>
            e.kind === 'State' && e.state.kind === 'Physics' && e.state.event.kind === 'MovementStateChanged'
        )
      )
      .subscribe((e) => {
        if (
          e.kind !== 'State' ||
          e.state.kind !== 'Physics' ||
          e.state.event.kind !== 'MovementStateChanged'
        )
          return;

        const { entityId, state: movementState } = e.state.event;
        if (movementState.kind !== 'Idle') return;

        const pending = env.core.worldView.PendingSkillCast.get(entityId);
        if (!pending) return;

        const { skillId: pendingSkillId, target: pendingTarget } = pending;
        handlePendingCast(env, entityId, pendingSkillId, pendingTarget);
      })
  );

  return {
    kind: 'AbilityActivation',
    update() {
      // All work is done via EventBus subscriptions
    },
    dispose() {
      for (const s of subs) s.unsubscribe();
    },
  };
}


