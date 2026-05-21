import Phaser from "phaser";
import type { MutableWorld } from "../../kipo-engine/domain/world";
import type { EntityId } from "../../kipo-engine/types/branded";
import type { GameplayScene } from "../gameplay-scene";
import { PLAYER_ENTITY_ID } from "../renderer-constants";

export interface EntitySystem {
  getPlayerSprite(): Phaser.GameObjects.Sprite | null;
  update(world: MutableWorld): void;
}

export function createEntitySystem(scene: GameplayScene): EntitySystem {
  const sprites = new Map<EntityId, Phaser.GameObjects.Sprite>();
  let playerSprite: Phaser.GameObjects.Sprite | null = null;

  function getPlayerSprite() {
    return playerSprite;
  }

  function update(world: MutableWorld) {
    for (const [entityId, pos] of world.Positions) {
      // Skip projectile entities — they are rendered by the projectile system
      if (world.LiveProjectiles.has(entityId)) continue;

      const isPlayer = entityId === PLAYER_ENTITY_ID;
      let sprite = sprites.get(entityId);

      if (!sprite) {
        sprite = createEntitySprite(entityId, isPlayer, pos.X, pos.Z);
        sprites.set(entityId, sprite);
        if (isPlayer) playerSprite = sprite;
      }

      sprite.setPosition(pos.X, pos.Z);

      const vel = world.Velocities.get(entityId);
      const isMoving = vel && (vel.X !== 0 || vel.Z !== 0);
      const currentAnim = sprite.anims.currentAnim?.key;

      if (isMoving) {
        if (currentAnim !== (isPlayer ? "soldier-walk" : "orc-walk")) {
          sprite.play(isPlayer ? "soldier-walk" : "orc-walk", true);
        }
        if (vel!.X < 0) sprite.setFlipX(true);
        else if (vel!.X > 0) sprite.setFlipX(false);
      } else {
        if (currentAnim !== (isPlayer ? "soldier-idle" : "orc-idle")) {
          sprite.play(isPlayer ? "soldier-idle" : "orc-idle", true);
        }
      }
    }

    for (const [id, sprite] of sprites) {
      if (!world.EntityExists.has(id)) {
        sprite.destroy();
        sprites.delete(id);
        if (id === PLAYER_ENTITY_ID) playerSprite = null;
      }
    }
  }

  function createEntitySprite(
    _entityId: EntityId,
    isPlayer: boolean,
    x: number,
    y: number
  ): Phaser.GameObjects.Sprite {
    const texture = isPlayer ? "soldier-idle" : "orc-idle";
    const sprite = scene.add.sprite(x, y, texture, 0);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(1.5);
    sprite.setDepth(200); // Above particles (F#: Entities=200, Projectiles=250, VFX=300)
    return sprite;
  }

  return { getPlayerSprite, update };
}
