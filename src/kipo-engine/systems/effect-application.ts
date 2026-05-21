import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { EntityId } from '../types/branded';
import type { PomoEnvironment } from './environment';
import type { ActiveEffect, Duration } from '../domain/skill';
import type { GameEvent, EffectApplicationIntent, EffectDamageIntent, EffectResourceIntent } from '../domain/events';

// --- Internal Types ---

type InternalEffectChange =
  | { kind: 'Applied'; entityId: EntityId; effect: ActiveEffect }
  | { kind: 'Refreshed'; entityId: EntityId; effectId: string }
  | { kind: 'StackChanged'; entityId: EntityId; effectId: string; stack: number };

type ApplyEventResult =
  | { kind: 'Persistent'; change: InternalEffectChange }
  | { kind: 'InstantDmg'; intent: EffectDamageIntent }
  | { kind: 'InstantRes'; intent: EffectResourceIntent };

// --- Helpers ---

function isInstant(duration: Duration): boolean {
  return duration.kind === 'Instant';
}

function createNewActiveEffect(
  intent: EffectApplicationIntent,
  totalGameTime: number
): ActiveEffect {
  return {
    Id: generateId(),
    SourceEffect: intent.Effect,
    SourceEntity: intent.SourceEntity,
    TargetEntity: intent.TargetEntity,
    StartTime: totalGameTime,
    StackCount: 1,
  };
}

function findExistingEffect(effects: ActiveEffect[] | undefined, effectName: string): ActiveEffect | undefined {
  if (!effects) return undefined;
  return effects.find((e) => e.SourceEffect.Name === effectName);
}

function applyEffect(
  world: import('../domain/world').World,
  intent: EffectApplicationIntent,
  totalGameTime: number
): ApplyEventResult | undefined {
  if (isInstant(intent.Effect.Duration)) {
    // Instant effects generate damage or resource intents immediately
    switch (intent.Effect.Kind) {
      case 'ResourceOverTime': {
        const intentRes: EffectResourceIntent = {
          SourceEntity: intent.SourceEntity,
          TargetEntity: intent.TargetEntity,
          Effect: intent.Effect,
          ActiveEffectId: generateId(),
        };
        return { kind: 'InstantRes', intent: intentRes };
      }
      case 'DamageOverTime': {
        const intentDmg: EffectDamageIntent = {
          SourceEntity: intent.SourceEntity,
          TargetEntity: intent.TargetEntity,
          Effect: intent.Effect,
        };
        return { kind: 'InstantDmg', intent: intentDmg };
      }
      default:
        return undefined;
    }
  }

  // Persistent effect: apply stacking rules
  const effectsOnTarget = world.ActiveEffects.get(intent.TargetEntity);

  switch (intent.Effect.Stacking.kind) {
    case 'NoStack': {
      if (findExistingEffect(effectsOnTarget, intent.Effect.Name)) {
        return undefined; // Already exists, do not stack
      }
      const newEffect = createNewActiveEffect(intent, totalGameTime);
      return { kind: 'Persistent', change: { kind: 'Applied', entityId: intent.TargetEntity, effect: newEffect } };
    }
    case 'RefreshDuration': {
      const existing = findExistingEffect(effectsOnTarget, intent.Effect.Name);
      if (existing) {
        return { kind: 'Persistent', change: { kind: 'Refreshed', entityId: intent.TargetEntity, effectId: existing.Id } };
      }
      const newEffect = createNewActiveEffect(intent, totalGameTime);
      return { kind: 'Persistent', change: { kind: 'Applied', entityId: intent.TargetEntity, effect: newEffect } };
    }
    case 'AddStack': {
      const existing = findExistingEffect(effectsOnTarget, intent.Effect.Name);
      if (existing) {
        if (existing.StackCount < intent.Effect.Stacking.maxStacks) {
          return { kind: 'Persistent', change: { kind: 'StackChanged', entityId: intent.TargetEntity, effectId: existing.Id, stack: existing.StackCount + 1 } };
        }
        return undefined; // Max stacks reached
      }
      const newEffect = createNewActiveEffect(intent, totalGameTime);
      return { kind: 'Persistent', change: { kind: 'Applied', entityId: intent.TargetEntity, effect: newEffect } };
    }
  }
}

// --- Ticking Logic ---

function generateIntervalEvents(
  totalGameTime: number,
  previousTime: number,
  effect: ActiveEffect,
  interval: number
): Array<{ kind: 'Damage' | 'Resource'; intent: EffectDamageIntent | EffectResourceIntent }> {
  if (interval <= 0) return [];

  const startTime = effect.StartTime;
  const effectivePrevTime = Math.max(previousTime, startTime);

  if (totalGameTime <= effectivePrevTime) return [];

  const ticks = Math.floor((totalGameTime - startTime) / interval);
  const prevTicks = Math.floor((effectivePrevTime - startTime) / interval);
  const tickCount = ticks - prevTicks;

  if (tickCount <= 0) return [];

  const events: Array<{ kind: 'Damage' | 'Resource'; intent: EffectDamageIntent | EffectResourceIntent }> = [];

  for (let i = 0; i < tickCount; i++) {
    switch (effect.SourceEffect.Kind) {
      case 'DamageOverTime':
        events.push({
          kind: 'Damage',
          intent: {
            SourceEntity: effect.SourceEntity,
            TargetEntity: effect.TargetEntity,
            Effect: effect.SourceEffect,
          },
        });
        break;
      case 'ResourceOverTime':
        events.push({
          kind: 'Resource',
          intent: {
            SourceEntity: effect.SourceEntity,
            TargetEntity: effect.TargetEntity,
            Effect: effect.SourceEffect,
            ActiveEffectId: effect.Id,
          },
        });
        break;
    }
  }

  return events;
}

function processTimedEffects(
  world: import('../domain/world').World,
  totalGameTime: number
): Array<{ kind: 'Expire'; entityId: EntityId; effectId: string }> {
  const expired: Array<{ kind: 'Expire'; entityId: EntityId; effectId: string }> = [];

  for (const [entityId, effects] of world.ActiveEffects) {
    for (const effect of effects) {
      const duration = effect.SourceEffect.Duration;
      if (duration.kind === 'Timed') {
        const elapsed = totalGameTime - effect.StartTime;
        if (elapsed >= duration.seconds) {
          expired.push({ kind: 'Expire', entityId, effectId: effect.Id });
        }
      }
    }
  }

  return expired;
}

function processLoopEffects(
  world: import('../domain/world').World,
  totalGameTime: number,
  previousTime: number
): Array<
  | { kind: 'Expire'; entityId: EntityId; effectId: string }
  | { kind: 'Tick'; event: GameEvent }
> {
  const results: Array<
    | { kind: 'Expire'; entityId: EntityId; effectId: string }
    | { kind: 'Tick'; event: GameEvent }
  > = [];

  for (const [entityId, effects] of world.ActiveEffects) {
    for (const effect of effects) {
      const duration = effect.SourceEffect.Duration;
      if (duration.kind === 'Loop') {
        const elapsed = totalGameTime - effect.StartTime;
        if (elapsed >= duration.duration) {
          results.push({ kind: 'Expire', entityId, effectId: effect.Id });
        } else {
          const ticks = generateIntervalEvents(totalGameTime, previousTime, effect, duration.interval);
          for (const tick of ticks) {
            results.push({
              kind: 'Tick',
              event: {
                kind: 'Intent',
                intent:
                  tick.kind === 'Damage'
                    ? { kind: 'EffectDamage', effectDmg: tick.intent as EffectDamageIntent }
                    : { kind: 'EffectResource', effectRes: tick.intent as EffectResourceIntent },
              },
            });
          }
        }
      }
    }
  }

  return results;
}

function processPermanentLoopEffects(
  world: import('../domain/world').World,
  totalGameTime: number,
  previousTime: number
): Array<{ kind: 'Tick'; event: GameEvent }> {
  const results: Array<{ kind: 'Tick'; event: GameEvent }> = [];

  for (const [_entityId, effects] of world.ActiveEffects) {
    for (const effect of effects) {
      const duration = effect.SourceEffect.Duration;
      if (duration.kind === 'PermanentLoop') {
        const ticks = generateIntervalEvents(totalGameTime, previousTime, effect, duration.interval);
        for (const tick of ticks) {
          results.push({
            kind: 'Tick',
            event: {
              kind: 'Intent',
              intent:
                tick.kind === 'Damage'
                  ? { kind: 'EffectDamage', effectDmg: tick.intent as EffectDamageIntent }
                  : { kind: 'EffectResource', effectRes: tick.intent as EffectResourceIntent },
            },
          });
        }
      }
    }
  }

  return results;
}

// --- System Factory ---

export interface EffectApplicationSystem {
  update(world: import('../domain/world').World, totalGameTime: number, previousTime: number): void;
  dispose(): void;
}

let idCounter = 0;
function generateId(): string {
  return `effect-${++idCounter}-${Date.now()}`;
}

export function createEffectApplicationSystem(env: PomoEnvironment): EffectApplicationSystem {
  const subscriptions: Subscription[] = [];

  // Handle EffectApplicationIntent events
  const sub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'Intent'; intent: { kind: 'EffectApplication'; effectApp: EffectApplicationIntent } } =>
        e.kind === 'Intent' && e.intent.kind === 'EffectApplication'
      )
    )
    .subscribe((e) => {
      const intent = e.intent.effectApp;
      const totalGameTime = env.core.world.Time.TotalGameTime;
      const result = applyEffect(env.core.worldView, intent, totalGameTime);

      if (!result) return;

      switch (result.kind) {
        case 'Persistent': {
          const change = result.change;
          switch (change.kind) {
            case 'Applied':
              env.core.stateWrite.ApplyEffect(change.entityId, change.effect);
              break;
            case 'Refreshed':
              env.core.stateWrite.RefreshEffect(change.entityId, change.effectId);
              break;
            case 'StackChanged':
              env.core.stateWrite.ChangeEffectStack(change.entityId, change.effectId, change.stack);
              break;
          }
          break;
        }
        case 'InstantDmg':
          env.core.eventBus.publish({
            kind: 'Intent',
            intent: { kind: 'EffectDamage', effectDmg: result.intent },
          });
          break;
        case 'InstantRes':
          env.core.eventBus.publish({
            kind: 'Intent',
            intent: { kind: 'EffectResource', effectRes: result.intent },
          });
          break;
      }
    });

  subscriptions.push(sub);

  return {
    update(world, totalGameTime, previousTime) {
      // Process timed expirations
      const timedExpired = processTimedEffects(world, totalGameTime);
      for (const exp of timedExpired) {
        env.core.stateWrite.ExpireEffect(exp.entityId, exp.effectId);
      }

      // Process loop effects (expiration + ticks)
      const loopResults = processLoopEffects(world, totalGameTime, previousTime);
      for (const res of loopResults) {
        if (res.kind === 'Expire') {
          env.core.stateWrite.ExpireEffect(res.entityId, res.effectId);
        } else {
          env.core.eventBus.publish(res.event);
        }
      }

      // Process permanent loop effects (ticks only, no expiration)
      const permResults = processPermanentLoopEffects(world, totalGameTime, previousTime);
      for (const res of permResults) {
        env.core.eventBus.publish(res.event);
      }
    },
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
  };
}
