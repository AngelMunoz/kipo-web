import type { EntityId, ItemInstanceId, SkillId, ScenarioId } from '../types/branded';
import type { MutableWorld } from '../domain/world';
import type { WorldPosition, Vector3, WorldText } from '../domain/core';
import { Vector3Zero } from '../domain/core';
import type { Resource } from '../domain/entity';
import type { MovementState, GameAction, InputActionState, RawInputState, SkillTarget } from '../domain/events';
import type { ActiveEffect, OrbitalConfig } from '../domain/skill';
import type { LiveProjectile } from '../domain/projectile';
import type { ItemInstance, Slot } from '../domain/item';
import type { AIController } from '../domain/ai';
import type { AnimationState } from '../domain/world';

// --- Commands ---

type NonAdaptiveCommand =
  | { kind: 'UpdatePosition'; entityId: EntityId; position: WorldPosition }
  | { kind: 'UpdateVelocity'; entityId: EntityId; velocity: Vector3 }
  | { kind: 'UpdateRotation'; entityId: EntityId; rotation: number };

type AdaptiveCommand =
  | { kind: 'UpdateMovementState'; entityId: EntityId; state: MovementState }
  | { kind: 'UpdateRawInputState'; entityId: EntityId; state: RawInputState }
  | { kind: 'UpdateGameActionStates'; entityId: EntityId; states: Map<GameAction, InputActionState> }
  | { kind: 'UpdateActiveActionSet'; entityId: EntityId; set: number }
  | { kind: 'UpdateResources'; entityId: EntityId; resources: Resource }
  | { kind: 'UpdateCooldowns'; entityId: EntityId; cooldowns: Map<SkillId, number> }
  | { kind: 'UpdateInCombatTimer'; entityId: EntityId }
  | { kind: 'ApplyEffect'; entityId: EntityId; effect: ActiveEffect }
  | { kind: 'ExpireEffect'; entityId: EntityId; effectId: string }
  | { kind: 'RefreshEffect'; entityId: EntityId; effectId: string }
  | { kind: 'ChangeEffectStack'; entityId: EntityId; effectId: string; stack: number }
  | { kind: 'SetPendingSkillCast'; entityId: EntityId; skillId: SkillId; target: SkillTarget }
  | { kind: 'ClearPendingSkillCast'; entityId: EntityId }
  | { kind: 'CreateItemInstance'; instance: ItemInstance }
  | { kind: 'UpdateItemInstance'; instance: ItemInstance }
  | { kind: 'AddItemToInventory'; entityId: EntityId; instanceId: ItemInstanceId }
  | { kind: 'EquipItem'; entityId: EntityId; slot: Slot; instanceId: ItemInstanceId }
  | { kind: 'UnequipItem'; entityId: EntityId; slot: Slot }
  | { kind: 'UpdateAIController'; entityId: EntityId; controller: AIController }
  | { kind: 'CreateProjectile'; entityId: EntityId; projectile: LiveProjectile; pos: WorldPosition | undefined }
  | { kind: 'ApplyEntitySpawnBundle'; bundle: import('../domain/events').EntitySpawnBundle }
  | { kind: 'UpdateActiveOrbital'; entityId: EntityId; orbital: OrbitalConfig & { startTime: number } }
  | { kind: 'RemoveActiveOrbital'; entityId: EntityId }
  | { kind: 'UpdateActiveCharge'; entityId: EntityId; charge: import('../domain/world').ActiveCharge }
  | { kind: 'RemoveActiveCharge'; entityId: EntityId }
  | { kind: 'AddNotification'; notification: WorldText }
  | { kind: 'SetNotifications'; notifications: WorldText[] }
  | { kind: 'AddEntity'; entityId: EntityId; scenarioId: ScenarioId }
  | { kind: 'RemoveEntity'; entityId: EntityId }
  | { kind: 'UpdateActiveAnimations'; entityId: EntityId; anims: AnimationState[] }
  | { kind: 'UpdatePose'; entityId: EntityId; pose: Map<string, Vector3> }
  | { kind: 'RemoveAnimationState'; entityId: EntityId }
  | { kind: 'UpdateModelConfig'; entityId: EntityId; configId: string };

// --- Buffers ---

class CommandBuffer<T> {
  private commands: T[] = new Array(1024);
  private count = 0;
  private lowUsageFrames = 0;

  enqueue(cmd: T) {
    if (this.count >= this.commands.length) {
      const newBuffer = new Array(this.commands.length * 2);
      for (let i = 0; i < this.count; i++) {
        newBuffer[i] = this.commands[i];
      }
      this.commands = newBuffer;
      this.lowUsageFrames = 0;
    }
    this.commands[this.count++] = cmd;
  }

  flush(apply: (cmd: T) => void) {
    for (let i = 0; i < this.count; i++) {
      apply(this.commands[i]);
    }

    if (this.count < this.commands.length / 4 && this.commands.length > 1024) {
      this.lowUsageFrames++;
      if (this.lowUsageFrames > 60) {
        const newSize = Math.max(1024, Math.floor(this.commands.length / 2));
        const newBuffer = new Array(newSize);
        this.commands = newBuffer;
        this.lowUsageFrames = 0;
      }
    } else {
      this.lowUsageFrames = 0;
    }

    this.count = 0;
  }
}

// --- Interface ---

export interface IStateWriteService {
  UpdatePosition(entityId: EntityId, position: WorldPosition): void;
  UpdateVelocity(entityId: EntityId, velocity: Vector3): void;
  UpdateRotation(entityId: EntityId, rotation: number): void;

  UpdateMovementState(entityId: EntityId, state: MovementState): void;
  UpdateRawInputState(entityId: EntityId, state: RawInputState): void;
  UpdateGameActionStates(entityId: EntityId, states: Map<GameAction, InputActionState>): void;
  UpdateActiveActionSet(entityId: EntityId, set: number): void;
  UpdateResources(entityId: EntityId, resources: Resource): void;
  UpdateCooldowns(entityId: EntityId, cooldowns: Map<SkillId, number>): void;
  UpdateInCombatTimer(entityId: EntityId): void;

  ApplyEffect(entityId: EntityId, effect: ActiveEffect): void;
  ExpireEffect(entityId: EntityId, effectId: string): void;
  RefreshEffect(entityId: EntityId, effectId: string): void;
  ChangeEffectStack(entityId: EntityId, effectId: string, stack: number): void;

  SetPendingSkillCast(entityId: EntityId, skillId: SkillId, target: SkillTarget): void;
  ClearPendingSkillCast(entityId: EntityId): void;

  CreateItemInstance(instance: ItemInstance): void;
  UpdateItemInstance(instance: ItemInstance): void;
  AddItemToInventory(entityId: EntityId, instanceId: ItemInstanceId): void;
  EquipItem(entityId: EntityId, slot: Slot, instanceId: ItemInstanceId): void;
  UnequipItem(entityId: EntityId, slot: Slot): void;

  UpdateAIController(entityId: EntityId, controller: AIController): void;

  CreateProjectile(entityId: EntityId, projectile: LiveProjectile, pos: WorldPosition | undefined): void;
  ApplyEntitySpawnBundle(bundle: import('../domain/events').EntitySpawnBundle): void;

  UpdateActiveOrbital(entityId: EntityId, orbital: OrbitalConfig & { startTime: number }): void;
  RemoveActiveOrbital(entityId: EntityId): void;
  UpdateActiveCharge(entityId: EntityId, charge: import('../domain/world').ActiveCharge): void;
  RemoveActiveCharge(entityId: EntityId): void;

  AddNotification(notification: WorldText): void;
  SetNotifications(notifications: WorldText[]): void;

  AddEntity(entityId: EntityId, scenarioId: ScenarioId): void;
  RemoveEntity(entityId: EntityId): void;

  UpdateActiveAnimations(entityId: EntityId, anims: AnimationState[]): void;
  UpdatePose(entityId: EntityId, pose: Map<string, Vector3>): void;
  RemoveAnimationState(entityId: EntityId): void;
  UpdateModelConfig(entityId: EntityId, configId: string): void;

  FlushWrites(world: MutableWorld, time: number): void;
}

// --- Implementation ---

function syncEntityCombatStatuses(world: MutableWorld, entityId: EntityId) {
  const effects = world.ActiveEffects.get(entityId);
  const statuses: import('../domain/core').CombatStatus[] = [];
  if (effects) {
    for (const e of effects) {
      switch (e.SourceEffect.Kind) {
        case 'Stun':
          if (!statuses.some((s) => s.kind === 'Stunned')) {
            statuses.push({ kind: 'Stunned' } as import('../domain/core').CombatStatus);
          }
          break;
        case 'Silence':
          if (!statuses.some((s) => s.kind === 'Silenced')) {
            statuses.push({ kind: 'Silenced' } as import('../domain/core').CombatStatus);
          }
          break;
      }
    }
  }
  if (statuses.length === 0) {
    world.CombatStatuses.delete(entityId);
  } else {
    world.CombatStatuses.set(entityId, statuses);
  }
}

function applyNonAdaptive(world: MutableWorld, cmd: NonAdaptiveCommand) {
  if (!world.EntityExists.has(cmd.entityId)) return;
  switch (cmd.kind) {
    case 'UpdatePosition':
      world.Positions.set(cmd.entityId, cmd.position);
      break;
    case 'UpdateVelocity':
      world.Velocities.set(cmd.entityId, cmd.velocity);
      break;
    case 'UpdateRotation':
      world.Rotations.set(cmd.entityId, cmd.rotation);
      break;
  }
}

function applyAdaptive(world: MutableWorld, time: number, cmd: AdaptiveCommand) {
  switch (cmd.kind) {
    case 'UpdateMovementState': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.MovementStates.set(cmd.entityId, cmd.state);
      break;
    }
    case 'UpdateRawInputState': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.RawInputStates.set(cmd.entityId, cmd.state);
      break;
    }
    case 'UpdateGameActionStates': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.GameActionStates.set(cmd.entityId, cmd.states);
      break;
    }
    case 'UpdateActiveActionSet': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.ActiveActionSets.set(cmd.entityId, cmd.set);
      break;
    }
    case 'UpdateResources': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.Resources.set(cmd.entityId, cmd.resources);
      break;
    }
    case 'UpdateCooldowns': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.AbilityCooldowns.set(cmd.entityId, cmd.cooldowns);
      break;
    }
    case 'UpdateInCombatTimer': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.InCombatUntil.set(cmd.entityId, time + 5.0);
      break;
    }
    case 'ApplyEffect': {
      if (!world.EntityExists.has(cmd.entityId)) {
        console.debug('[StateWrite] ApplyEffect SKIPPED: entity', cmd.entityId, 'not in EntityExists');
        return;
      }
      console.debug('[StateWrite] ApplyEffect:', cmd.effect.SourceEffect.Name, 'to', cmd.entityId);
      const existing = world.ActiveEffects.get(cmd.entityId);
      if (existing) {
        existing.push(cmd.effect);
        world.ActiveEffects.set(cmd.entityId, existing);
      } else {
        world.ActiveEffects.set(cmd.entityId, [cmd.effect]);
      }
      syncEntityCombatStatuses(world, cmd.entityId);
      break;
    }
    case 'ExpireEffect': {
      const existing = world.ActiveEffects.get(cmd.entityId);
      if (existing) {
        const filtered = existing.filter((e) => e.Id !== cmd.effectId);
        if (filtered.length === 0) {
          world.ActiveEffects.delete(cmd.entityId);
        } else {
          world.ActiveEffects.set(cmd.entityId, filtered);
        }
      }
      syncEntityCombatStatuses(world, cmd.entityId);
      break;
    }
    case 'RefreshEffect': {
      const existing = world.ActiveEffects.get(cmd.entityId);
      if (existing) {
        const updated = existing.map((e) =>
          e.Id === cmd.effectId ? { ...e, StartTime: time } : e
        );
        world.ActiveEffects.set(cmd.entityId, updated);
      }
      break;
    }
    case 'ChangeEffectStack': {
      const existing = world.ActiveEffects.get(cmd.entityId);
      if (existing) {
        const updated = existing.map((e) =>
          e.Id === cmd.effectId ? { ...e, StackCount: cmd.stack } : e
        );
        world.ActiveEffects.set(cmd.entityId, updated);
      }
      break;
    }
    case 'SetPendingSkillCast': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.PendingSkillCast.set(cmd.entityId, { skillId: cmd.skillId, target: cmd.target });
      break;
    }
    case 'ClearPendingSkillCast': {
      world.PendingSkillCast.delete(cmd.entityId);
      break;
    }
    case 'CreateItemInstance': {
      world.ItemInstances.set(cmd.instance.InstanceId, cmd.instance);
      break;
    }
    case 'UpdateItemInstance': {
      world.ItemInstances.set(cmd.instance.InstanceId, cmd.instance);
      break;
    }
    case 'AddItemToInventory': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      const inv = world.EntityInventories.get(cmd.entityId);
      if (inv) {
        inv.add(cmd.instanceId);
      } else {
        world.EntityInventories.set(cmd.entityId, new Set([cmd.instanceId]));
      }
      break;
    }
    case 'EquipItem': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      const equipped = world.EquippedItems.get(cmd.entityId);
      if (equipped) {
        equipped.set(cmd.slot, cmd.instanceId);
      } else {
        world.EquippedItems.set(cmd.entityId, new Map([[cmd.slot, cmd.instanceId]]));
      }
      break;
    }
    case 'UnequipItem': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      const equipped = world.EquippedItems.get(cmd.entityId);
      if (equipped) {
        equipped.delete(cmd.slot);
      }
      break;
    }
    case 'UpdateAIController': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.AIControllers.set(cmd.entityId, cmd.controller);
      break;
    }
    case 'CreateProjectile': {
      console.debug('[StateWrite] CreateProjectile', cmd.entityId, 'target:', cmd.projectile.Target.kind, 'caster:', cmd.projectile.Caster);
      // Determine starting position:
      // 1. If explicitly provided (e.g., chain projectile), use that
      // 2. For position-targeted projectiles, spawn AT the target
      // 3. Otherwise, spawn at caster position
      let startingPos = cmd.pos;
      if (startingPos === undefined) {
        switch (cmd.projectile.Target.kind) {
          case 'PositionTarget': {
            // F#: PositionTarget projectiles always spawn at target position
            startingPos = { X: cmd.projectile.Target.position.X, Y: 0, Z: cmd.projectile.Target.position.Y };
            break;
          }
          case 'EntityTarget': {
            const casterPos = world.Positions.get(cmd.projectile.Caster);
            if (casterPos) startingPos = casterPos;
            break;
          }
        }
      }

      if (startingPos === undefined) return;

      const scenarioId = world.EntityScenario.get(cmd.projectile.Caster);
      if (scenarioId === undefined) return;

      world.EntityExists.add(cmd.entityId);
      world.Positions.set(cmd.entityId, startingPos);
      world.Velocities.set(cmd.entityId, Vector3Zero);
      world.LiveProjectiles.set(cmd.entityId, cmd.projectile);
      const model = cmd.projectile.Info.Visuals.ModelId ?? 'Projectile';
      world.ModelConfigId.set(cmd.entityId, model);
      world.EntityScenario.set(cmd.entityId, scenarioId);
      break;
    }
    case 'ApplyEntitySpawnBundle': {
      const bundle = cmd.bundle;
      const entityId = bundle.Snapshot.Id;
      world.EntityExists.add(entityId);
      world.Positions.set(entityId, bundle.Snapshot.Position);
      world.Velocities.set(entityId, bundle.Snapshot.Velocity);
      world.EntityScenario.set(entityId, bundle.Snapshot.ScenarioId);
      world.SpawningEntities.delete(entityId);

      if (bundle.Resources !== undefined) {
        world.Resources.set(entityId, bundle.Resources);
      }
      if (bundle.Factions !== undefined) {
        world.Factions.set(entityId, new Set(bundle.Factions));
      }
      if (bundle.BaseStats !== undefined) {
        world.BaseStats.set(entityId, bundle.BaseStats);
      }
      if (bundle.ModelConfig !== undefined) {
        world.ModelConfigId.set(entityId, bundle.ModelConfig);
      }
      if (bundle.InputMap !== undefined) {
        world.InputMaps.set(entityId, bundle.InputMap);
      }
      if (bundle.ActionSets !== undefined) {
        world.ActionSets.set(entityId, bundle.ActionSets);
      }
      if (bundle.ActiveActionSet !== undefined) {
        world.ActiveActionSets.set(entityId, bundle.ActiveActionSet);
      }
      if (bundle.InventoryItems !== undefined) {
        const inv = new Set<ItemInstanceId>();
        for (const item of bundle.InventoryItems) {
          world.ItemInstances.set(item.InstanceId, item);
          inv.add(item.InstanceId);
        }
        world.EntityInventories.set(entityId, inv);
      }
      if (bundle.EquippedSlots !== undefined) {
        const equipped = new Map<Slot, ItemInstanceId>();
        for (const slot of bundle.EquippedSlots) {
          equipped.set(slot.slot, slot.instanceId);
        }
        world.EquippedItems.set(entityId, equipped);
      }
      if (bundle.AIController !== undefined) {
        world.AIControllers.set(entityId, bundle.AIController);
      }
      break;
    }
    case 'UpdateActiveOrbital': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.ActiveOrbitals.set(cmd.entityId, cmd.orbital);
      break;
    }
    case 'RemoveActiveOrbital': {
      world.ActiveOrbitals.delete(cmd.entityId);
      break;
    }
    case 'UpdateActiveCharge': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.ActiveCharges.set(cmd.entityId, cmd.charge);
      break;
    }
    case 'RemoveActiveCharge': {
      world.ActiveCharges.delete(cmd.entityId);
      break;
    }
    case 'AddNotification': {
      world.Notifications.push(cmd.notification);
      break;
    }
    case 'SetNotifications': {
      world.Notifications.length = 0;
      for (const n of cmd.notifications) {
        world.Notifications.push(n);
      }
      break;
    }
    case 'AddEntity': {
      world.EntityExists.add(cmd.entityId);
      world.EntityScenario.set(cmd.entityId, cmd.scenarioId);
      break;
    }
    case 'RemoveEntity': {
      world.EntityExists.delete(cmd.entityId);
      world.Positions.delete(cmd.entityId);
      world.Velocities.delete(cmd.entityId);
      world.Rotations.delete(cmd.entityId);
      world.LiveProjectiles.delete(cmd.entityId);
      world.SpawningEntities.delete(cmd.entityId);
      world.MovementStates.delete(cmd.entityId);
      world.RawInputStates.delete(cmd.entityId);
      world.InputMaps.delete(cmd.entityId);
      world.GameActionStates.delete(cmd.entityId);
      world.Resources.delete(cmd.entityId);
      world.Factions.delete(cmd.entityId);
      world.ActionSets.delete(cmd.entityId);
      world.ActiveActionSets.delete(cmd.entityId);
      world.BaseStats.delete(cmd.entityId);
      world.CombatStatuses.delete(cmd.entityId);
      world.ActiveEffects.delete(cmd.entityId);
      world.AbilityCooldowns.delete(cmd.entityId);
      world.InCombatUntil.delete(cmd.entityId);
      world.PendingSkillCast.delete(cmd.entityId);
      world.EntityInventories.delete(cmd.entityId);
      world.EquippedItems.delete(cmd.entityId);
      world.AIControllers.delete(cmd.entityId);
      world.EntityScenario.delete(cmd.entityId);
      world.ActiveAnimations.delete(cmd.entityId);
      world.Poses.delete(cmd.entityId);
      world.ModelConfigId.delete(cmd.entityId);
      world.ActiveOrbitals.delete(cmd.entityId);
      world.ActiveCharges.delete(cmd.entityId);
      break;
    }
    case 'UpdateActiveAnimations': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.ActiveAnimations.set(cmd.entityId, cmd.anims);
      break;
    }
    case 'UpdatePose': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.Poses.set(cmd.entityId, cmd.pose);
      break;
    }
    case 'RemoveAnimationState': {
      world.ActiveAnimations.delete(cmd.entityId);
      world.Poses.delete(cmd.entityId);
      break;
    }
    case 'UpdateModelConfig': {
      if (!world.EntityExists.has(cmd.entityId)) return;
      world.ModelConfigId.set(cmd.entityId, cmd.configId);
      break;
    }
  }
}

export function createStateWriteService(): IStateWriteService {
  const nonAdaptive = new CommandBuffer<NonAdaptiveCommand>();
  const adaptive = new CommandBuffer<AdaptiveCommand>();

  const service: IStateWriteService = {
    UpdatePosition(entityId, position) {
      nonAdaptive.enqueue({ kind: 'UpdatePosition', entityId, position });
    },
    UpdateVelocity(entityId, velocity) {
      nonAdaptive.enqueue({ kind: 'UpdateVelocity', entityId, velocity });
    },
    UpdateRotation(entityId, rotation) {
      nonAdaptive.enqueue({ kind: 'UpdateRotation', entityId, rotation });
    },

    UpdateMovementState(entityId, state) {
      adaptive.enqueue({ kind: 'UpdateMovementState', entityId, state });
    },
    UpdateRawInputState(entityId, state) {
      adaptive.enqueue({ kind: 'UpdateRawInputState', entityId, state });
    },
    UpdateGameActionStates(entityId, states) {
      adaptive.enqueue({ kind: 'UpdateGameActionStates', entityId, states });
    },
    UpdateActiveActionSet(entityId, set) {
      adaptive.enqueue({ kind: 'UpdateActiveActionSet', entityId, set });
    },
    UpdateResources(entityId, resources) {
      adaptive.enqueue({ kind: 'UpdateResources', entityId, resources });
    },
    UpdateCooldowns(entityId, cooldowns) {
      adaptive.enqueue({ kind: 'UpdateCooldowns', entityId, cooldowns });
    },
    UpdateInCombatTimer(entityId) {
      adaptive.enqueue({ kind: 'UpdateInCombatTimer', entityId });
    },

    ApplyEffect(entityId, effect) {
      adaptive.enqueue({ kind: 'ApplyEffect', entityId, effect });
    },
    ExpireEffect(entityId, effectId) {
      adaptive.enqueue({ kind: 'ExpireEffect', entityId, effectId });
    },
    RefreshEffect(entityId, effectId) {
      adaptive.enqueue({ kind: 'RefreshEffect', entityId, effectId });
    },
    ChangeEffectStack(entityId, effectId, stack) {
      adaptive.enqueue({ kind: 'ChangeEffectStack', entityId, effectId, stack });
    },

    SetPendingSkillCast(entityId, skillId, target) {
      adaptive.enqueue({ kind: 'SetPendingSkillCast', entityId, skillId, target });
    },
    ClearPendingSkillCast(entityId) {
      adaptive.enqueue({ kind: 'ClearPendingSkillCast', entityId });
    },

    CreateItemInstance(instance) {
      adaptive.enqueue({ kind: 'CreateItemInstance', instance });
    },
    UpdateItemInstance(instance) {
      adaptive.enqueue({ kind: 'UpdateItemInstance', instance });
    },
    AddItemToInventory(entityId, instanceId) {
      adaptive.enqueue({ kind: 'AddItemToInventory', entityId, instanceId });
    },
    EquipItem(entityId, slot, instanceId) {
      adaptive.enqueue({ kind: 'EquipItem', entityId, slot, instanceId });
    },
    UnequipItem(entityId, slot) {
      adaptive.enqueue({ kind: 'UnequipItem', entityId, slot });
    },

    UpdateAIController(entityId, controller) {
      adaptive.enqueue({ kind: 'UpdateAIController', entityId, controller });
    },

    CreateProjectile(entityId, projectile, pos) {
      adaptive.enqueue({ kind: 'CreateProjectile', entityId, projectile, pos });
    },
    ApplyEntitySpawnBundle(bundle) {
      adaptive.enqueue({ kind: 'ApplyEntitySpawnBundle', bundle });
    },

    UpdateActiveOrbital(entityId, orbital) {
      adaptive.enqueue({ kind: 'UpdateActiveOrbital', entityId, orbital });
    },
    RemoveActiveOrbital(entityId) {
      adaptive.enqueue({ kind: 'RemoveActiveOrbital', entityId });
    },
    UpdateActiveCharge(entityId, charge) {
      adaptive.enqueue({ kind: 'UpdateActiveCharge', entityId, charge });
    },
    RemoveActiveCharge(entityId) {
      adaptive.enqueue({ kind: 'RemoveActiveCharge', entityId });
    },

    AddNotification(notification) {
      adaptive.enqueue({ kind: 'AddNotification', notification });
    },
    SetNotifications(notifications) {
      adaptive.enqueue({ kind: 'SetNotifications', notifications });
    },

    AddEntity(entityId, scenarioId) {
      adaptive.enqueue({ kind: 'AddEntity', entityId, scenarioId });
    },
    RemoveEntity(entityId) {
      adaptive.enqueue({ kind: 'RemoveEntity', entityId });
    },

    UpdateActiveAnimations(entityId, anims) {
      adaptive.enqueue({ kind: 'UpdateActiveAnimations', entityId, anims });
    },
    UpdatePose(entityId, pose) {
      adaptive.enqueue({ kind: 'UpdatePose', entityId, pose });
    },
    RemoveAnimationState(entityId) {
      adaptive.enqueue({ kind: 'RemoveAnimationState', entityId });
    },
    UpdateModelConfig(entityId, configId) {
      adaptive.enqueue({ kind: 'UpdateModelConfig', entityId, configId });
    },

    FlushWrites(world, time) {
      nonAdaptive.flush((cmd) => applyNonAdaptive(world, cmd));
      adaptive.flush((cmd) => applyAdaptive(world, time, cmd));
    },
  };

  return service;
}
