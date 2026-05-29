import type { Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type { PomoEnvironment } from "./environment";
import type { GameEvent, SkillTarget } from "../domain/events";
import type { ActiveSkill } from "../domain/skill";
import type { EntityId, SkillId } from "../types/branded";

const SKILL_ACTIVATION_RANGE_BUFFER = 5.0;
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.debug("[Targeting]", ...args);
}

/**
 * Engine-side targeting system.
 * F# equivalent: TargetingService + ActionHandler
 * Receives raw TargetSelection events and handles range checks,
 * pending casts, and Ability intent publishing.
 */
export interface TargetingSystem {
  update(): void;
  dispose(): void;
  getTargetingMode(entityId: EntityId): ActiveSkill | undefined;
}

interface TargetingState {
  slot: string;
  skillId: SkillId;
  skill: ActiveSkill;
}

export function createTargetingSystem(env: PomoEnvironment): TargetingSystem {
  const { eventBus, stateWrite, worldView } = env.core;
  const skillStore = env.stores.skillStore;
  const subscriptions: Subscription[] = [];

  let activeTargeting: Map<EntityId, TargetingState> = new Map();

  // Subscribe to SlotActivated to enter targeting mode
  const slotSub = eventBus.events$
    .pipe(
      filter(
        (e): e is GameEvent =>
          e.kind === "Intent" && e.intent.kind === "SlotActivated",
      ),
    )
    .subscribe((e) => {
      if (e.kind !== "Intent" || e.intent.kind !== "SlotActivated") return;
      const { Slot, CasterId } = e.intent.slot;
      log("SlotActivated", Slot, "caster", CasterId);

      // Handle action set switching (D1-D8 in F#)
      if (Slot.startsWith("SetActionSet")) {
        const setIndex = parseInt(Slot.slice("SetActionSet".length));
        if (setIndex >= 1 && setIndex <= 8) {
          log("  switching to action set", setIndex);
          stateWrite.UpdateActiveActionSet(CasterId, setIndex);
        }
        return;
      }

      // Look up skill from action sets
      const actionSets = worldView.ActionSets.get(CasterId);
      if (!actionSets) {
        log("  no actionSets for caster");
        return;
      }
      log("  actionSets found, set indices:", Array.from(actionSets.keys()));

      // ActionSets is Map<number, Map<GameAction, SlotProcessing>>
      // Find the active action set (default to 0)
      const activeSetIndex = worldView.ActiveActionSets.get(CasterId) ?? 0;
      const actionSet = actionSets.get(activeSetIndex);
      if (!actionSet) {
        log("  no actionSet for index", activeSetIndex);
        return;
      }
      log("  actionSet keys:", Array.from(actionSet.keys()));

      const slotProcessing = actionSet.get(Slot);
      if (!slotProcessing) {
        log("  no slotProcessing for", Slot);
        return;
      }

      if (slotProcessing.kind === "Item") {
        log("  slotProcessing is Item:", slotProcessing.itemInstanceId);
        
        // Validate item has uses left (F# AbilityActivation.fs:562-568)
        const itemInstance = worldView.ItemInstances.get(slotProcessing.itemInstanceId);
        if (!itemInstance) {
          log("  item instance not found");
          return;
        }
        
        if (itemInstance.UsesLeft !== undefined && itemInstance.UsesLeft <= 0) {
          log("  item has no uses left");
          eventBus.publish({
            kind: "Notification",
            notification: {
              kind: "ShowMessage",
              message: {
                Message: "Item has no uses left!",
                Position: worldView.Positions.get(CasterId) ?? { X: 0, Y: 0, Z: 0 },
                Type: "Crit",
              },
            },
          });
          return;
        }
        
        eventBus.publish({
          kind: "ItemIntent",
          itemIntent: {
            kind: "Use",
            useItem: {
              EntityId: CasterId,
              ItemInstanceId: slotProcessing.itemInstanceId,
            },
          },
        });
        return;
      }

      if (slotProcessing.kind !== "Skill") {
        return;
      }
      log("  slotProcessing skillId:", slotProcessing.skillId);

      const skill = skillStore.getActive(slotProcessing.skillId);
      if (!skill) {
        log("  skill not found in store for id", slotProcessing.skillId);
        return;
      }
      log("  skill found:", skill.Name, "Targeting:", skill.Targeting);

      // Only enter targeting for skills that need targeting
      if (skill.Targeting === "Self") {
        // Self-targeting: fire immediately without targeting mode
        log("  Self-targeting -> publishing Ability immediately");
        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "Ability",
            ability: {
              Caster: CasterId,
              SkillId: slotProcessing.skillId,
              Target: { kind: "TargetSelf" },
            },
          },
        });
        return;
      }

      // Enter targeting mode
      log("  Entering targeting mode for", skill.Name);
      activeTargeting.set(CasterId, {
        slot: Slot,
        skillId: slotProcessing.skillId,
        skill,
      });
    });

  subscriptions.push(slotSub);

  // Subscribe to TargetSelection to execute targeting
  const targetSub = eventBus.events$
    .pipe(
      filter(
        (e): e is GameEvent =>
          e.kind === "Intent" && e.intent.kind === "TargetSelection",
      ),
    )
    .subscribe((e) => {
      if (e.kind !== "Intent" || e.intent.kind !== "TargetSelection") return;
      const { Selector, Selection } = e.intent.target;
      log("TargetSelection", Selection.kind, "selector", Selector);

      const targeting = activeTargeting.get(Selector);
      if (!targeting) {
        log("  no active targeting for selector");
        return;
      }

      activeTargeting.delete(Selector);

      const { skill, skillId } = targeting;
      const casterPos = worldView.Positions.get(Selector);
      if (!casterPos) {
        log("  no caster position");
        return;
      }
      log("  skill:", skill.Name, "Targeting:", skill.Targeting);

      // Validate selection type against skill targeting mode
      let skillTarget: SkillTarget | undefined;
      let targetPos: { X: number; Y: number } | undefined;

      if (skill.Targeting === "TargetEntity") {
        if (Selection.kind !== "SelectedEntity") {
          log("  INVALID: Expected SelectedEntity for TargetEntity skill");
          return;
        }
        const targetResources = worldView.Resources.get(Selection.entity);
        if (!targetResources || targetResources.Status !== 'Alive') {
          log("  target entity not alive");
          return;
        }
        skillTarget = { kind: "TargetEntity", entity: Selection.entity };
        const tp = worldView.Positions.get(Selection.entity);
        if (tp) targetPos = { X: tp.X, Y: tp.Z };
      } else if (skill.Targeting === "TargetDirection") {
        if (Selection.kind !== "SelectedPosition") {
          log("  INVALID: Expected SelectedPosition for TargetDirection skill");
          return;
        }
        skillTarget = { kind: "TargetDirection", position: Selection.position };
        targetPos = Selection.position;
      } else if (skill.Targeting === "TargetPosition") {
        if (Selection.kind !== "SelectedPosition") {
          log("  INVALID: Expected SelectedPosition for TargetPosition skill");
          return;
        }
        skillTarget = { kind: "TargetPosition", position: Selection.position };
        targetPos = Selection.position;
      } else {
        log("  unknown targeting mode:", skill.Targeting);
        return;
      }

      if (!skillTarget || !targetPos) {
        log("  missing skillTarget or targetPos");
        return;
      }

      // TargetDirection: fire immediately (F# handleTargetDirection, line 148-175)
      if (skill.Targeting === "TargetDirection") {
        log("  TargetDirection -> publishing Ability immediately");
        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "Ability",
            ability: {
              Caster: Selector,
              SkillId: skillId,
              Target: skillTarget,
            },
          },
        });
        return;
      }

      // Range check (TargetEntity + TargetPosition only, like F#)
      const dx = targetPos.X - casterPos.X;
      const dy = targetPos.Y - casterPos.Z;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRange = skill.Range ?? 0;
      log("  range check:", distance, "vs maxRange", maxRange);

      if (distance > maxRange) {
        // Out of range: move closer, then cast
        log("  OUT OF RANGE -> move + pending cast");
        const dirX = dx / distance;
        const dirY = dy / distance;
        const moveTarget = {
          X:
            targetPos.X -
            dirX * Math.max(0, maxRange - SKILL_ACTIVATION_RANGE_BUFFER),
          Y:
            targetPos.Y -
            dirY * Math.max(0, maxRange - SKILL_ACTIVATION_RANGE_BUFFER),
        };

        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "MovementTarget",
            movement: {
              EntityId: Selector,
              Target: moveTarget,
            },
          },
        });

        stateWrite.SetPendingSkillCast(Selector, skillId, skillTarget);
      } else {
        // In range: cast immediately
        log("  IN RANGE -> publishing Ability intent");
        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "Ability",
            ability: {
              Caster: Selector,
              SkillId: skillId,
              Target: skillTarget,
            },
          },
        });
      }
    });

  subscriptions.push(targetSub);

  // Subscribe to Cancel (SlotActivated with 'Cancel')
  const cancelSub = eventBus.events$
    .pipe(
      filter(
        (e): e is GameEvent =>
          e.kind === "Intent" && e.intent.kind === "SlotActivated",
      ),
    )
    .subscribe((e) => {
      if (e.kind !== "Intent" || e.intent.kind !== "SlotActivated") return;
      if (e.intent.slot.Slot === "Cancel") {
        log("Cancel targeting for", e.intent.slot.CasterId);
        activeTargeting.delete(e.intent.slot.CasterId);
      }
    });

  subscriptions.push(cancelSub);

  // Subscribe to RawInput for Escape/Right-click cancel (F# Targeting.fs:52-64)
  const rawInputSub = eventBus.events$
    .pipe(
      filter(
        (e): e is GameEvent =>
          e.kind === "State" && e.state.kind === "Input" && e.state.event.kind === "RawStateChanged",
      ),
    )
    .subscribe((e) => {
      if (e.kind !== "State" || e.state.kind !== "Input" || e.state.event.kind !== "RawStateChanged") return;
      
      const { entityId, state: rawInput } = e.state.event;
      
      // Only process if entity has active targeting
      if (!activeTargeting.has(entityId)) return;
      
      // Check for Escape key press (F# line 56-58)
      const isEscapePressed = rawInput.Keyboard.IsKeyDown("Escape") && 
                             rawInput.PrevKeyboard.IsKeyUp("Escape");
      
      // Check for Right-click (F# line 60-62)
      const isRightMouseClicked = rawInput.Mouse.RightButton === "Pressed" && 
                                 rawInput.PrevMouse.RightButton === "Released";
      
      if (isEscapePressed || isRightMouseClicked) {
        log("Escape/Right-click cancel targeting for", entityId);
        activeTargeting.delete(entityId);
        // Publish SlotActivated Cancel event (F# line 63)
        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "SlotActivated",
            slot: { Slot: "Cancel", CasterId: entityId },
          },
        });
      }
    });

  subscriptions.push(rawInputSub);

  return {
    update() {
      // Event-driven; all work done via subscriptions
    },
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
    getTargetingMode(entityId: EntityId) {
      return activeTargeting.get(entityId)?.skill;
    },
  };
}
