/**
 * GPU-batched particle system using Phaser's native ParticleEmitter.
 */

import Phaser from "phaser";
import type { Scene } from "phaser";
import type { ParticleStore } from "../stores/particle-store";
import type { Vector3, EmitterConfig } from "../domain/particles";
import { hexToRgba } from "../domain/particles";

// ─── Public Interface (same as our custom system) ───

export interface ParticleSystem {
  update(dt: number, getEntityPosition: (id: string) => Vector3 | undefined): void;
  render(): void;
  spawnEffect(vfxId: string, position: Vector3, ownerId?: string, rotation?: number): string | undefined;
  removeEffect(effectId: string): void;
  getActiveEffects(): readonly PhaserEffect[];
  destroy(): void;
}

interface PhaserEffect {
  id: string;
  emitters: Phaser.GameObjects.Particles.ParticleEmitter[];
  isAlive: boolean;
  ownerId: string | undefined;
  trackComplete: (() => void) | undefined;
}

// ─── Config mapping helpers ───

function emitterConfigToPhaser(
  cfg: EmitterConfig,
  textureKey: string | undefined,
  rotation?: number,
): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig {
  const pc = cfg.Particle;
  const texKey = textureKey ?? "__WHITE";

    // Parse colors for tint/alpha
    const startCol = hexToRgba(pc.ColorStart);
    const endCol = hexToRgba(pc.ColorEnd);
    const startTint = (Math.round(startCol.r * 255) << 16) | (Math.round(startCol.g * 255) << 8) | Math.round(startCol.b * 255);
    const endTint = (Math.round(endCol.r * 255) << 16) | (Math.round(endCol.g * 255) << 8) | Math.round(endCol.b * 255);

    // Calculate emission angle centered on rotation for Cone shapes
    let angleMin: number;
    let angleMax: number;
    if (cfg.Shape === "Cone") {
      const centerAngle = rotation ?? 0;
      angleMin = centerAngle - (cfg.Angle / 2);
      angleMax = centerAngle + (cfg.Angle / 2);
    } else {
      angleMin = 0;
      angleMax = 360;
    }

    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      texture: texKey,
      frame: 0,

      // Rate — halved to prevent additive over-saturation in GPU renderer
      // (our old fillCircle system couldn't do additive blending, so rates were tuned higher)
      frequency: cfg.Rate > 0 ? 1000 / (cfg.Rate / 2) : -1,
      quantity: 1,

      // Lifespan — random start value, eases to end over lifetime
      lifespan: { min: pc.Lifetime[0] * 1000, max: pc.Lifetime[1] * 1000 },

      // Speed — random from range
      speed: { min: pc.Speed[0], max: pc.Speed[1] },

      // Scale — random start size, eases to end over lifetime
      scaleX: { start: pc.SizeStart * 0.04, end: pc.SizeEnd * 0.04, random: true },
      scaleY: { start: pc.SizeStart * 0.04, end: pc.SizeEnd * 0.04, random: true },

      // Tint — random start value, eases to end over particle lifetime
      tint: { start: startTint, end: endTint, random: true },
      alpha: { start: startCol.a, end: endCol.a, random: true },

      // Angle — restricts emission direction; radial must be true for this to take effect
      angle: { min: angleMin, max: angleMax },

      // radial must be true for angle/speed to control particle velocity in Phaser 4
      radial: true,

      // Gravity
      gravityX: 0,
      gravityY: -pc.Gravity,

      // Blend mode
      blendMode: cfg.BlendMode === "Additive" ? "ADD" : "NORMAL",
    };

  return config;
}

// ─── Factory ───

export function createParticleSystem(
  scene: Scene,
  store: ParticleStore,
): ParticleSystem {
  let effects: PhaserEffect[] = [];
  let nextId = 0;

  // Texture map populated from store
  const textureMap = new Map<string, string>();
  for (const vfxId of store.all()) {
    const configs = store.tryFind(vfxId);
    if (!configs) continue;
    for (const cfg of configs) {
      if (cfg.Texture && !textureMap.has(cfg.Texture)) {
        textureMap.set(cfg.Texture, `__particle_${cfg.Texture.replace(/[/\\]/g, "_")}`);
      }
    }
  }

  return {
    spawnEffect(vfxId: string, position: Vector3, ownerId?: string, rotation?: number): string | undefined {
      const configs = store.tryFind(vfxId);
      if (!configs || configs.length === 0) {
        console.debug('[ParticleSystem] spawnEffect: VfxId not found:', vfxId);
        return undefined;
      }

      const id = `fx-phaser-${nextId++}`;
      const emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

      for (const cfg of configs) {
        const texPath = cfg.Texture;
        const texKey = texPath ? textureMap.get(texPath) ?? "__WHITE" : "__WHITE";
        const texExists = scene.textures.exists(texKey);
        console.debug('[ParticleSystem] spawnEffect vfx:', vfxId, 'texPath:', texPath, 'texKey:', texKey, 'exists:', texExists);
        const phaserCfg = emitterConfigToPhaser(cfg, texKey, rotation);

        const emitter = scene.add.particles(position.X, position.Z, texKey, phaserCfg);
        emitter.setDepth(250);

        // Shape-based emit zone
        if (cfg.Shape === "Sphere" && cfg.Radius > 0) {
          const circle = new Phaser.Geom.Circle(0, 0, cfg.Radius);
          // SAFETY: Phaser's addEmitZone source type doesn't match getRandomPoint's signature.
          const emitZone = { type: "random", source: circle.getRandomPoint.bind(circle) } as unknown as Phaser.Types.GameObjects.Particles.ParticleEmitterEdgeZoneConfig;
          emitter.addEmitZone(emitZone);
        }

        // Fire burst particles (emitter is already at the correct world position)
        if (cfg.Burst > 0) {
          emitter.explode(cfg.Burst);
        }

        // Start continuous emission if Rate > 0
        if (cfg.Rate > 0) {
          emitter.start();
        }

        emitters.push(emitter);
      }

      // Owner following for Local simulation space
      if (ownerId) {
        // We'll follow via update() since the owner isn't a Phaser GameObject
        // Store owner reference and update position each frame
      }

      const effect: PhaserEffect = {
        id,
        emitters,
        isAlive: true,
        ownerId,
        trackComplete: undefined,
      };

      effects.push(effect);
      return id;
    },

    removeEffect(effectId: string): void {
      for (const effect of effects) {
        if (effect.id !== effectId) continue;

        effect.isAlive = false;

        // For one-shot emitters (Burst only, no Rate), wait for complete
        // SAFETY: Phaser's ParticleEmitter types don't expose frequency in this version.
        const burstOnly = effect.emitters.every((e) => (e as unknown as { frequency: number }).frequency === -1);

        if (burstOnly) {
          // Let particles live out their lifespan, then cleanup
          let remaining = effect.emitters.length;
          for (const em of effect.emitters) {
            em.once("complete", () => {
              remaining--;
              if (remaining <= 0) {
                for (const e of effect.emitters) e.destroy();
              }
            });
            em.stop();
          }
        } else {
          // Stop emission immediately, kill particles
          for (const em of effect.emitters) {
            em.stop();
          }
        }
        return;
      }
    },

    update(_dt: number, getEntityPosition: (id: string) => Vector3 | undefined): void {
      const toRemove: PhaserEffect[] = [];

      for (const effect of effects) {
        // Update position for owner-followed effects
        if (effect.ownerId) {
          const pos = getEntityPosition(effect.ownerId);
          if (pos) {
            for (const em of effect.emitters) {
              em.setPosition(pos.X, pos.Z);
            }
          } else if (effect.isAlive) {
            // Owner gone — stop emitters
            effect.isAlive = false;
            for (const em of effect.emitters) {
              em.stop();
            }
          }
        }

        // Cleanup dead effects with no alive particles
        if (!effect.isAlive) {
          const hasAlive = effect.emitters.some((e) => e.getAliveParticleCount() > 0);
          if (!hasAlive) {
            toRemove.push(effect);
          }
        }
      }

      for (const effect of toRemove) {
        for (const em of effect.emitters) em.destroy();
        effects = effects.filter((e) => e !== effect);
      }
    },

    render(): void {
      // No-op: Phaser renders particle emitters automatically via GPU batch
    },

    getActiveEffects(): readonly PhaserEffect[] {
      return effects;
    },

    destroy(): void {
      for (const effect of effects) {
        for (const em of effect.emitters) em.destroy();
      }
      effects = [];
    },
  };
}
