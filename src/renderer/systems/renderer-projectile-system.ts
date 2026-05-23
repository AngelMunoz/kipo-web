import Phaser from "phaser";
import type { MutableWorld } from "../../kipo-engine/domain/world";
import type { EntityId } from "../../kipo-engine/types/branded";
import type { GameplayScene } from "../gameplay-scene";

export interface ProjectileSystem {
  update(world: MutableWorld): void;
}

export function createProjectileSystem(
  scene: GameplayScene,
  onProjectileCreated?: (
    entityId: EntityId,
    vfxId: string | undefined,
    x: number,
    y: number,
  ) => void,
): ProjectileSystem {
  const sprites = new Map<EntityId, Phaser.GameObjects.Sprite>();

  function update(world: MutableWorld) {
    for (const [entityId, liveProj] of world.LiveProjectiles) {
      const pos = world.Positions.get(entityId);
      if (!pos) continue;

      let sprite = sprites.get(entityId);
      if (!sprite) {
        const modelId = liveProj.Info.Visuals.ModelId;
        const textureKey = modelId && scene.textures.exists(modelId) ? modelId
          : scene.textures.exists("arrow") ? "arrow"
          : "__WHITE";
        console.debug(
          "[RendererProjectile] Creating sprite for",
          entityId,
          "at",
          pos.X,
          pos.Z,
          "texture:",
          textureKey,
          "modelId:",
          modelId,
        );
        sprite = scene.add.sprite(pos.X, pos.Z, textureKey);
        sprite.setOrigin(0.5, 0.5);
        sprite.setScale(0.8);
        sprites.set(entityId, sprite);

        if (onProjectileCreated) {
          onProjectileCreated(
            entityId,
            liveProj.Info.Visuals.VfxId,
            pos.X,
            pos.Z,
          );
        }
      }

      sprite.setPosition(pos.X, pos.Z);

      const vel = world.Velocities.get(entityId);
      if (vel && (vel.X !== 0 || vel.Z !== 0)) {
        const angle = Math.atan2(vel.Z, vel.X);
        sprite.setRotation(angle);
      }
    }

    for (const [id, sprite] of sprites) {
      if (!world.LiveProjectiles.has(id)) {
        sprite.destroy();
        sprites.delete(id);
      }
    }
  }

  return { update };
}
