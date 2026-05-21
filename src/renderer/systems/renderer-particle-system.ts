import type { Scene } from "phaser";
import type { ParticleStore } from "../stores/particle-store";
import type {
  Vector3,
  Particle,
  VisualEmitter,
  VisualEffect,
  EmitterConfig,
} from "../domain/particles";
import { lerp, clamp, lerpColor, hexToRgba } from "../domain/particles";

// ─── RNG ───
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomDiskOffset(radius: number): Vector3 {
  const dist = Math.sqrt(Math.random()) * radius;
  const angle = Math.random() * Math.PI * 2;
  return {
    X: dist * Math.cos(angle),
    Y: 0,
    Z: dist * Math.sin(angle),
  };
}

function randomSphereDirection(): Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const cosPhi = Math.random() * 2 - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  return {
    X: sinPhi * Math.cos(theta),
    Y: cosPhi,
    Z: sinPhi * Math.sin(theta),
  };
}

function rotateVector2(v: Vector3, yaw: number): Vector3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    X: v.X * cos - v.Z * sin,
    Y: v.Y,
    Z: v.X * sin + v.Z * cos,
  };
}

// ─── Spawn helpers ───

function spawnParticle(
  config: EmitterConfig,
  worldPos: Vector3,
  ownerYaw: number,
): Particle {
  const pc = config.Particle;
  const lifetime = randRange(pc.Lifetime[0], pc.Lifetime[1]);
  const speed = randRange(pc.Speed[0], pc.Speed[1]);

  // Shape → spawn offset + direction
  let dir: Vector3;
  let spawnOffset: Vector3;

  switch (config.Shape) {
    case "Sphere": {
      spawnOffset = randomDiskOffset(config.Radius);
      dir = randomSphereDirection();
      break;
    }
    case "Cone": {
      const halfAngle = (config.Angle / 2) * (Math.PI / 180);
      const coneAngle = Math.sqrt(Math.random()) * halfAngle;
      const rotAround = Math.random() * Math.PI * 2;
      const dist = randRange(0, config.Radius);
      spawnOffset = {
        X: dist * Math.sin(coneAngle) * Math.cos(rotAround),
        Y: dist * Math.cos(coneAngle),
        Z: dist * Math.sin(coneAngle) * Math.sin(rotAround),
      };
      dir = { ...spawnOffset };
      const len = Math.sqrt(dir.X * dir.X + dir.Y * dir.Y + dir.Z * dir.Z);
      if (len > 0.001) {
        dir.X /= len;
        dir.Y /= len;
        dir.Z /= len;
      }
      break;
    }
    case "Line": {
      spawnOffset = {
        X: (Math.random() - 0.5) * config.Radius,
        Y: Math.random() * config.Angle,
        Z: 0,
      };
      dir = { X: 0, Y: 1, Z: 0 };
      break;
    }
    default: {
      // Point
      spawnOffset = { X: 0, Y: 0, Z: 0 };
      dir = randomSphereDirection();
    }
  }

  // Apply emission rotation + owner rotation
  const yawRad = ownerYaw + config.EmissionRotation.Y * (Math.PI / 180);
  dir = rotateVector2(dir, yawRad);
  spawnOffset = rotateVector2(spawnOffset, yawRad);
  const localOffset = rotateVector2(config.LocalOffset, ownerYaw);

  // Random velocity
  const rv = pc.RandomVelocity;
  const randomVel = {
    X: rv.X * (Math.random() * 2 - 1),
    Y: rv.Y * (Math.random() * 2 - 1),
    Z: rv.Z * (Math.random() * 2 - 1),
  };

  const velocity = {
    X: dir.X * speed + randomVel.X,
    Y: dir.Y * speed + randomVel.Y,
    Z: dir.Z * speed + randomVel.Z,
  };

  // Final position
  const finalPos =
    config.SimulationSpace === "World"
      ? {
          X: worldPos.X + localOffset.X + spawnOffset.X,
          Y: worldPos.Y + localOffset.Y + spawnOffset.Y,
          Z: worldPos.Z + localOffset.Z + spawnOffset.Z,
        }
      : {
          X: localOffset.X + spawnOffset.X,
          Y: localOffset.Y + spawnOffset.Y,
          Z: localOffset.Z + spawnOffset.Z,
        };

  return {
    Position: finalPos,
    Velocity: velocity,
    Size: pc.SizeStart,
    Color: pc.ColorStart,
    Life: lifetime,
    MaxLife: lifetime,
  };
}

// ─── Update helpers ───

function updateParticle(
  p: Particle,
  dt: number,
  config: EmitterConfig,
): Particle | undefined {
  const newLife = p.Life - dt;
  if (newLife <= 0) return undefined;

  let { X: vx, Y: vy, Z: vz } = p.Velocity;
  let { X: px, Y: py, Z: pz } = p.Position;

  // Gravity
  vy -= config.Particle.Gravity * dt;

  // Drag
  if (config.Particle.Drag > 0) {
    const dragFactor = clamp(1 - config.Particle.Drag * dt, 0, 1);
    vx *= dragFactor;
    vz *= dragFactor;
  }

  // Floor collision
  const floorY = config.FloorHeight;
  if (py < floorY) {
    py = floorY;
    vy = 0;
    vx *= 0.1;
    vz *= 0.1;
  }

  // Integrate
  px += vx * dt;
  py += vy * dt;
  pz += vz * dt;

  // Lerp size + color
  const t = 1 - newLife / p.MaxLife;
  const newSize = lerp(config.Particle.SizeStart, config.Particle.SizeEnd, t);
  const newColor = lerpColor(
    config.Particle.ColorStart,
    config.Particle.ColorEnd,
    t,
  );

  return {
    Position: { X: px, Y: py, Z: pz },
    Velocity: { X: vx, Y: vy, Z: vz },
    Size: newSize,
    Color: newColor,
    Life: newLife,
    MaxLife: p.MaxLife,
  };
}

function updateEmitter(
  emitter: VisualEmitter,
  dt: number,
  worldPos: Vector3,
  ownerYaw: number,
  isAlive: boolean,
): void {
  const cfg = emitter.Config;

  // ── Spawn (only while effect is alive) ──
  if (isAlive) {
    if (!emitter.BurstDone && cfg.Burst > 0) {
      for (let i = 0; i < cfg.Burst; i++) {
        emitter.Particles.push(spawnParticle(cfg, worldPos, ownerYaw));
      }
      emitter.BurstDone = true;
    }

    if (cfg.Rate > 0) {
      const rateInterval = 1 / cfg.Rate;
      emitter.Accumulator += dt;
      while (emitter.Accumulator > rateInterval) {
        emitter.Accumulator -= rateInterval;
        emitter.Particles.push(spawnParticle(cfg, worldPos, ownerYaw));
      }
    }
  }

  // ── Update existing ──
  const alive: Particle[] = [];
  for (const p of emitter.Particles) {
    const updated = updateParticle(p, dt, cfg);
    if (updated) alive.push(updated);
  }
  emitter.Particles = alive;
}

// ─── Particle System Factory ───

export interface ParticleSystem {
  update(
    dt: number,
    getEntityPosition: (id: string) => Vector3 | undefined,
  ): void;
  render(): void;
  spawnEffect(
    vfxId: string,
    position: Vector3,
    ownerId?: string,
  ): string | undefined;
  removeEffect(effectId: string): void;
  getActiveEffects(): readonly VisualEffect[];
  destroy(): void;
}

export function createParticleSystem(
  scene: Scene,
  store: ParticleStore,
): ParticleSystem {
  let effects: VisualEffect[] = [];
  let nextId = 0;

  // Populate texture cache from store
  const textureMap = new Map<string, string>();
  for (const vfxId of store.all()) {
    const configs = store.tryFind(vfxId);
    if (!configs) continue;
    for (const cfg of configs) {
      if (cfg.Texture && !textureMap.has(cfg.Texture)) {
        textureMap.set(
          cfg.Texture,
          `__particle_${cfg.Texture.replace(/[/\\]/g, "_")}`,
        );
      }
    }
  }

  // Image pool for rendering
  const activeImages = new Map<Particle, Phaser.GameObjects.Image>();
  const imagePool: Phaser.GameObjects.Image[] = [];

  function getImage(textureKey: string | undefined): Phaser.GameObjects.Image {
    const key = textureKey ?? "__particle_default";
    let img = imagePool.pop();
    if (img) {
      img.setTexture(key);
      img.setVisible(true);
      img.setActive(true);
      return img;
    }
    return scene.add.image(0, 0, key);
  }

  function releaseImage(img: Phaser.GameObjects.Image) {
    img.setVisible(false);
    img.setActive(false);
    imagePool.push(img);
  }

  return {
    spawnEffect(
      vfxId: string,
      position: Vector3,
      ownerId?: string,
    ): string | undefined {
      const configs = store.tryFind(vfxId);
      if (!configs) return undefined;

      const id = `fx-${nextId++}`;
      const emitters: VisualEmitter[] = configs.map((cfg) => ({
        Config: cfg,
        Particles: [],
        Accumulator: 0,
        BurstDone: false,
      }));

      effects.push({
        Id: id,
        Emitters: emitters,
        Position: { ...position },
        Rotation: 0,
        IsAlive: true,
        OwnerEntityId: ownerId,
      });

      return id;
    },

    removeEffect(effectId: string): void {
      for (const effect of effects) {
        if (effect.Id === effectId) {
          effect.IsAlive = false;
          return;
        }
      }
    },

    update(
      dt: number,
      getEntityPosition: (id: string) => Vector3 | undefined,
    ): void {
      const aliveEffects: VisualEffect[] = [];

      for (const effect of effects) {
        if (
          !effect.IsAlive &&
          effect.Emitters.every((e) => e.Particles.length === 0)
        ) {
          continue;
        }

        let worldPos = effect.Position;
        let ownerYaw = effect.Rotation;

        if (effect.OwnerEntityId) {
          const ownerPos = getEntityPosition(effect.OwnerEntityId);
          if (ownerPos) {
            worldPos = ownerPos;
            effect.Position = ownerPos;
          } else {
            effect.IsAlive = false;
          }
        }

        let anyParticles = false;
        for (const emitter of effect.Emitters) {
          updateEmitter(emitter, dt, worldPos, ownerYaw, effect.IsAlive);
          if (emitter.Particles.length > 0) anyParticles = true;
        }

        if (!effect.OwnerEntityId) {
          const spawningDone = effect.Emitters.every(
            (e) => e.BurstDone && e.Config.Rate === 0,
          );
          if (spawningDone && !anyParticles) continue;
        } else if (!effect.IsAlive && !anyParticles) {
          continue;
        }

        aliveEffects.push(effect);
      }

      effects = aliveEffects;
    },

    render(): void {
      // Track which particles still exist
      const currentParticles = new Set<Particle>();

      for (const effect of effects) {
        for (const emitter of effect.Emitters) {
          const isLocal = emitter.Config.SimulationSpace === "Local";
          for (const p of emitter.Particles) {
            currentParticles.add(p);

            const renderX = isLocal
              ? p.Position.X + effect.Position.X
              : p.Position.X;
            const renderZ = isLocal
              ? p.Position.Z + effect.Position.Z
              : p.Position.Z;

            let img = activeImages.get(p);
            if (!img) {
              const texturePath = emitter.Config.Texture;
              const key = texturePath
                ? (textureMap.get(texturePath) ?? "__particle_default")
                : "__particle_default";
              img = getImage(key);
              activeImages.set(p, img);
            }

            // Update image visual properties
            const col = hexToRgba(p.Color);
            img.setPosition(renderX, renderZ);
            img.setScale(p.Size * 0.04); // scale down texture-based particles
            img.setAlpha(col.a);
            img.setTint(
              (Math.round(col.r * 255) << 16) |
                (Math.round(col.g * 255) << 8) |
                Math.round(col.b * 255),
            );
            img.setDepth(100);
          }
        }
      }

      // Release images for dead particles
      for (const [particle, img] of activeImages) {
        if (!currentParticles.has(particle)) {
          releaseImage(img);
          activeImages.delete(particle);
        }
      }
    },

    getActiveEffects(): readonly VisualEffect[] {
      return effects;
    },

    destroy(): void {
      for (const img of activeImages.values()) img.destroy();
      for (const img of imagePool) img.destroy();
      activeImages.clear();
      imagePool.length = 0;
      effects = [];
    },
  };
}
