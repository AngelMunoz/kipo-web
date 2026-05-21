import Phaser from "phaser";
import type { Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type { GameplayScene } from "../gameplay-scene";
import type { GameEvent, GameAction } from "../../kipo-engine/domain/events";
import { PLAYER_ENTITY_ID } from "../renderer-constants";
import { brandEntityId } from "../../kipo-engine/types/branded";

export interface TargetingSystem {
  isTargeting(): boolean;
  enterTargeting(slot: GameAction): void;
  exitTargeting(): void;
  onClickTarget(worldX: number, worldY: number): void;
  update(): void;
  destroy(): void;
}

const ENTITY_CLICK_RADIUS = 150;

export function createTargetingSystem(scene: GameplayScene): TargetingSystem {
  let active = false;
  let activeSlot: GameAction | null = null;
  let targetingGfx: Phaser.GameObjects.Graphics | null = null;
  let rangeCircle: Phaser.GameObjects.Arc | null = null;
  const subscriptions: Subscription[] = [];

  setupSubscriptions();

  function setupSubscriptions() {
    const eventBus = scene.getEventBus();
    if (!eventBus) return;

    const sub = eventBus.events$
      .pipe(
        filter((e): e is GameEvent =>
          e.kind === "Intent" &&
          e.intent.kind === "SlotActivated" &&
          e.intent.slot.CasterId === PLAYER_ENTITY_ID
        )
      )
      .subscribe((e) => {
        if (e.kind !== "Intent" || e.intent.kind !== "SlotActivated") return;
        const slot = e.intent.slot.Slot;

        if (slot === "Cancel") {
          exitTargeting();
          return;
        }

        if (slot.startsWith("UseSlot")) {
          enterTargeting(slot);
        }
      });

    subscriptions.push(sub);
  }

  function isTargeting() {
    return active;
  }

  function enterTargeting(slot: GameAction) {
    active = true;
    activeSlot = slot;

    if (!targetingGfx) {
      targetingGfx = scene.add.graphics();
    }
    targetingGfx.clear();
    targetingGfx.lineStyle(2, 0xffff00, 0.8);
    targetingGfx.strokeCircle(0, 0, 16);
    targetingGfx.fillStyle(0xffff00, 0.3);
    targetingGfx.fillCircle(0, 0, 8);

    const playerSprite = scene.getEntitySystem().getPlayerSprite();
    if (playerSprite && !rangeCircle) {
      rangeCircle = scene.add.circle(playerSprite.x, playerSprite.y, 200, 0xffff00, 0.1);
      rangeCircle.setStrokeStyle(1, 0xffff00, 0.3);
    }
  }

  function exitTargeting() {
    active = false;
    activeSlot = null;
    targetingGfx?.clear();
    rangeCircle?.destroy();
    rangeCircle = null;
  }

  function findEntityAt(worldX: number, worldY: number): string | undefined {
    const world = scene.getWorld();
    if (!world) return undefined;

    let closestId: string | undefined;
    let closestDist = ENTITY_CLICK_RADIUS;

    for (const [entityId, pos] of world.Positions) {
      if (entityId === PLAYER_ENTITY_ID) continue;
      const dx = pos.X - worldX;
      const dy = pos.Z - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = entityId;
      }
    }

    return closestId;
  }

  function onClickTarget(worldX: number, worldY: number) {
    if (!active) return;
    console.debug('[RendererTargeting] Click at', worldX, worldY, 'activeSlot:', activeSlot);

    const eventBus = scene.getEventBus();
    if (!eventBus) return;

    const clickedEntity = findEntityAt(worldX, worldY);

    // Publish raw TargetSelection; engine-side TargetingSystem handles range/skill logic
    if (clickedEntity) {
      eventBus.publish({
        kind: "Intent",
        intent: {
          kind: "TargetSelection",
          target: {
            Selector: PLAYER_ENTITY_ID,
            Selection: { kind: "SelectedEntity", entity: brandEntityId(clickedEntity) },
          },
        },
      });
    } else {
      eventBus.publish({
        kind: "Intent",
        intent: {
          kind: "TargetSelection",
          target: {
            Selector: PLAYER_ENTITY_ID,
            Selection: { kind: "SelectedPosition", position: { X: worldX, Y: worldY } },
          },
        },
      });
    }

    exitTargeting();
  }

  function update() {
    if (!active || !targetingGfx) return;

    const ptr = scene.getInputSystem().getPointer();
    targetingGfx.setPosition(ptr.worldX, ptr.worldY);

    if (rangeCircle) {
      const playerSprite = scene.getEntitySystem().getPlayerSprite();
      if (playerSprite) {
        rangeCircle.setPosition(playerSprite.x, playerSprite.y);
      }
    }
  }

  function destroy() {
    exitTargeting();
    targetingGfx?.destroy();
    for (const sub of subscriptions) sub.unsubscribe();
  }

  return { isTargeting, enterTargeting, exitTargeting, onClickTarget, update, destroy };
}
