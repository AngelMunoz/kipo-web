import Phaser from "phaser";
import type { GameplayScene } from "../gameplay-scene";
import type { GameAction } from "../../kipo-engine/domain/events";
import { PLAYER_ENTITY_ID } from "../renderer-constants";

export interface InputSystem {
  isDown(action: GameAction): boolean;
  justDown(action: GameAction): boolean;
  getPointer(): Phaser.Input.Pointer;
  getPointerWorldPosition(): { x: number; y: number };
}

export function createInputSystem(scene: GameplayScene): InputSystem {
  const keys = new Map<GameAction, Phaser.Input.Keyboard.Key>();
  const pointer = scene.input.activePointer!;

  const kb = scene.input.keyboard!;
  const cursors = kb.createCursorKeys();

  // Movement — arrow keys matching F# InputMapping.fs
  keys.set("MoveUp", cursors.up!);
  keys.set("MoveDown", cursors.down!);
  keys.set("MoveLeft", cursors.left!);
  keys.set("MoveRight", cursors.right!);

  // Skill slots — QWER/ASDF matching F# InputMapping.fs
  const skillKeys = kb.addKeys("Q,W,E,R,A,S,D,F") as Record<string, Phaser.Input.Keyboard.Key>;
  keys.set("UseSlot1", skillKeys.Q!);
  keys.set("UseSlot2", skillKeys.W!);
  keys.set("UseSlot3", skillKeys.E!);
  keys.set("UseSlot4", skillKeys.R!);
  keys.set("UseSlot5", skillKeys.A!);
  keys.set("UseSlot6", skillKeys.S!);
  keys.set("UseSlot7", skillKeys.D!);
  keys.set("UseSlot8", skillKeys.F!);

  // Action set switching — 1-8 matching F# InputMapping.fs
  const setKeys = kb.addKeys("ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT") as Record<string, Phaser.Input.Keyboard.Key>;
  keys.set("SetActionSet1", setKeys.ONE!);
  keys.set("SetActionSet2", setKeys.TWO!);
  keys.set("SetActionSet3", setKeys.THREE!);
  keys.set("SetActionSet4", setKeys.FOUR!);
  keys.set("SetActionSet5", setKeys.FIVE!);
  keys.set("SetActionSet6", setKeys.SIX!);
  keys.set("SetActionSet7", setKeys.SEVEN!);
  keys.set("SetActionSet8", setKeys.EIGHT!);

  // UI toggles — ZXCV matching F# InputMapping.fs
  const uiKeys = kb.addKeys("Z,X,C,V") as Record<string, Phaser.Input.Keyboard.Key>;
  keys.set("ToggleJournal", uiKeys.Z!);
  keys.set("ToggleInventory", uiKeys.X!);
  keys.set("ToggleAbilities", uiKeys.C!);
  keys.set("ToggleCharacterSheet", uiKeys.V!);

  // Escape — Cancel
  keys.set("Cancel", kb.addKey("ESC"));

  function onPointerDown(p: Phaser.Input.Pointer) {
    const eventBus = scene.getEventBus();
    if (!eventBus) return;

    if (p.rightButtonDown()) {
      eventBus.publish({
        kind: "Intent",
        intent: {
          kind: "SlotActivated",
          slot: {
            Slot: "Cancel" as GameAction,
            CasterId: "player-1" as any,
          },
        },
      });
      return;
    }

    if (p.leftButtonDown()) {
      const targeting = scene.getTargetingSystem();
      if (targeting.isTargeting()) {
        targeting.onClickTarget(p.worldX, p.worldY);
      } else {
        // Click-to-move when not targeting
        eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "MovementTarget",
            movement: {
              EntityId: PLAYER_ENTITY_ID,
              Target: { X: p.worldX, Y: p.worldY },
            },
          },
        });
      }
    }
  }

  scene.input.on("pointerdown", onPointerDown);

  return {
    isDown(action: GameAction): boolean {
      return keys.get(action)?.isDown ?? false;
    },

    justDown(action: GameAction): boolean {
      const key = keys.get(action);
      return key ? Phaser.Input.Keyboard.JustDown(key) : false;
    },

    getPointer(): Phaser.Input.Pointer {
      return pointer;
    },

    getPointerWorldPosition(): { x: number; y: number } {
      return { x: pointer.worldX, y: pointer.worldY };
    },
  };
}
