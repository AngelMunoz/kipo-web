import Phaser from 'phaser';
import type { EntityId } from '../../kipo-engine/types/branded';
import type { WorldPosition } from '../../kipo-engine/domain/core';

export interface EntitySpriteConfig {
    entityId: EntityId;
    textureKey: string;
    initialFrame?: string;
    position?: WorldPosition;
}

export class EntitySpriteWrapper {
    public sprite: Phaser.GameObjects.Sprite;
    public entityId: EntityId;
    private animations = new Map<string, string>();

    constructor(scene: Phaser.Scene, config: EntitySpriteConfig) {
        this.entityId = config.entityId;
        this.sprite = scene.add.sprite(
            config.position?.X ?? 0,
            config.position?.Z ?? 0,
            config.textureKey,
            config.initialFrame
        );
        this.sprite.setOrigin(0.5, 1);
    }

    setPosition(pos: WorldPosition) {
        this.sprite.setPosition(pos.X, pos.Z);
    }

    playAnimation(animKey: string, forceRestart = false) {
        if (forceRestart || this.sprite.anims.currentAnim?.key !== animKey) {
            this.sprite.play(animKey);
        }
    }

    stopAnimation() {
        this.sprite.stop();
    }

    setFlipX(flip: boolean) {
        this.sprite.setFlipX(flip);
    }

    setVisible(visible: boolean) {
        this.sprite.setVisible(visible);
    }

    setAlpha(alpha: number) {
        this.sprite.setAlpha(alpha);
    }

    destroy() {
        this.sprite.destroy();
    }

    registerAnimation(name: string, animKey: string) {
        this.animations.set(name, animKey);
    }

    getAnimation(name: string): string | undefined {
        return this.animations.get(name);
    }
}

export class EntitySpriteManager {
    private sprites = new Map<EntityId, EntitySpriteWrapper>();
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    getOrCreate(entityId: EntityId, textureKey: string, initialFrame?: string): EntitySpriteWrapper {
        let wrapper = this.sprites.get(entityId);
        if (!wrapper) {
            wrapper = new EntitySpriteWrapper(this.scene, {
                entityId,
                textureKey,
                initialFrame
            });
            this.sprites.set(entityId, wrapper);
        }
        return wrapper;
    }

    get(entityId: EntityId): EntitySpriteWrapper | undefined {
        return this.sprites.get(entityId);
    }

    remove(entityId: EntityId) {
        const wrapper = this.sprites.get(entityId);
        if (wrapper) {
            wrapper.destroy();
            this.sprites.delete(entityId);
        }
    }

    updatePositions(positions: Map<EntityId, WorldPosition>) {
        for (const [entityId, pos] of positions) {
            const wrapper = this.sprites.get(entityId);
            if (wrapper) {
                wrapper.setPosition(pos);
            }
        }
    }

    destroyAll() {
        for (const wrapper of this.sprites.values()) {
            wrapper.destroy();
        }
        this.sprites.clear();
    }
}