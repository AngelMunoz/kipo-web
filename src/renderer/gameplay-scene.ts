import Phaser from "phaser";
import type { MutableWorld } from "../kipo-engine/domain/world";
import type { PomoEnvironment } from "../kipo-engine/systems/environment";
import type { GameplayLoop } from "../kipo-engine/gameplay-loop";
import { createInputSystem, type InputSystem } from "./systems/renderer-input-system";
import { createTargetingSystem, type TargetingSystem } from "./systems/renderer-targeting-system";
import { createEntitySystem, type EntitySystem } from "./systems/renderer-entity-system";
import { createProjectileSystem, type ProjectileSystem } from "./systems/renderer-projectile-system";
import { createVFXSystem, type VFXSystem } from "./systems/renderer-vfx-system";
import { createParticleSystem, type ParticleSystem } from "./systems/renderer-particle-system";
import type { ParticleStore } from "./stores/particle-store";
import { PLAYER_ENTITY_ID, PLAYER_SCENARIO_ID } from "./renderer-constants";
import { USE_SLOT_ACTIONS, SET_ACTION_SET_ACTIONS } from "../kipo-engine/domain/events";
import { brandEntityId, brandAiArchetypeId } from "../kipo-engine/types/branded";

export class GameplayScene extends Phaser.Scene {
  private world: MutableWorld | null = null;
  private eventBus: PomoEnvironment["core"]["eventBus"] | null = null;
  private stateWrite: PomoEnvironment["core"]["stateWrite"] | null = null;
  private gameplayLoop: GameplayLoop | null = null;

  private inputSystem!: InputSystem;
  private targetingSystem!: TargetingSystem;
  private entitySystem!: EntitySystem;
  private projectileSystem!: ProjectileSystem;
  private vfxSystem!: VFXSystem;

  constructor() {
    super({ key: "GameplayScene" });
  }

  private particleStore: ParticleStore | null = null;
  private particleSystem: ParticleSystem | null = null;

  private skillStore: PomoEnvironment["stores"]["skillStore"] | null = null;

  // Track spawned effect VFX: key = `${targetEntity}-${effectName}`, value = vfxId
  private effectVfxMap = new Map<string, string>();

  init(data: {
    world: MutableWorld;
    eventBus: PomoEnvironment["core"]["eventBus"];
    stateWrite: PomoEnvironment["core"]["stateWrite"];
    gameplayLoop: GameplayLoop;
    particleStore: ParticleStore;
    skillStore: PomoEnvironment["stores"]["skillStore"];
  }) {
    this.world = data.world;
    this.eventBus = data.eventBus;
    this.stateWrite = data.stateWrite;
    this.gameplayLoop = data.gameplayLoop;
    this.particleStore = data.particleStore;
    this.skillStore = data.skillStore;
  }

  preload() {
    const charPath = "/src/assets/TinyRPGCharacterAssetPackv1.03/Characters(100x100)";

    // Player (Soldier)
    this.load.spritesheet("soldier-idle", `${charPath}/Soldier/Soldier/Soldier-Idle.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-walk", `${charPath}/Soldier/Soldier/Soldier-Walk.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-attack1", `${charPath}/Soldier/Soldier/Soldier-Attack01.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-attack2", `${charPath}/Soldier/Soldier/Soldier-Attack02.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-attack3", `${charPath}/Soldier/Soldier/Soldier-Attack03.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-death", `${charPath}/Soldier/Soldier/Soldier-Death.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-hurt", `${charPath}/Soldier/Soldier/Soldier-Hurt.png`, { frameWidth: 100, frameHeight: 100 });

    // Enemy (Orc)
    this.load.spritesheet("orc-idle", `${charPath}/Orc/Orc/Orc-Idle.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-walk", `${charPath}/Orc/Orc/Orc-Walk.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-attack1", `${charPath}/Orc/Orc/Orc-Attack01.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-attack2", `${charPath}/Orc/Orc/Orc-Attack02.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-death", `${charPath}/Orc/Orc/Orc-Death.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-hurt", `${charPath}/Orc/Orc/Orc-Hurt.png`, { frameWidth: 100, frameHeight: 100 });

    // Projectile
    this.load.image("arrow", "/src/assets/TinyRPGCharacterAssetPackv1.03/Arrow(Projectile)/Arrow01(100x100).png");

    // Effects
    const effectPath = "/src/assets/super_pixel_effects/spritesheet/Fantasy Spells";
    this.load.spritesheet("spell-heal", `${effectPath}/spell_heal_001/spell_heal_001_large_red/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet("spell-fire", `${effectPath}/spell_attack_up_001/spell_attack_up_001_large_red/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet("spell-impact", `${effectPath}/spell_absorb_001/spell_absorb_001_large_violet/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });

    // Particle textures from kipo-content
    if (this.particleStore) {
      const allTextures = new Set<string>();
      for (const vfxId of this.particleStore.all()) {
        const configs = this.particleStore.tryFind(vfxId);
        if (!configs) continue;
        for (const cfg of configs) {
          if (cfg.Texture) allTextures.add(cfg.Texture);
        }
      }
      for (const tex of allTextures) {
        const key = `__particle_${tex.replace(/[/\\]/g, '_')}`;
        this.load.image(key, `/kipo-content/${tex}.png`);
      }
    }
  }

  create() {
    // Create renderer systems
    if (this.particleStore) {
      this.particleSystem = createParticleSystem(this, this.particleStore);
    }

    this.inputSystem = createInputSystem(this);
    this.targetingSystem = createTargetingSystem(this);
    this.entitySystem = createEntitySystem(this);
    this.projectileSystem = createProjectileSystem(this, (entityId, vfxId, x, y) => {
      if (!this.particleSystem || !vfxId) return;
      this.particleSystem.spawnEffect(vfxId, { X: x, Y: 0, Z: y }, entityId);
    });
    this.vfxSystem = createVFXSystem(this);

    this.subscribeToImpacts();
    this.subscribeToEffects();

    // Background grid
    this.drawBackgroundGrid();

    // Camera zoom — F# DefaultPixelsPerUnit ~64; scale up for visibility
    this.cameras.main.setZoom(3);

    // Setup animations
    this.setupAnimations();

    // Spawn player
    this.spawnPlayerEntity();

    // Spawn some dummy targets for testing
    this.spawnTestTargets();
  }

  update(_time: number, delta: number) {
    if (!this.gameplayLoop || !this.world || !this.stateWrite || !this.eventBus) return;

    // ── 1. Camera follow player ──
    const playerPos = this.world.Positions.get(PLAYER_ENTITY_ID);
    if (playerPos) {
      this.cameras.main.centerOn(playerPos.X, playerPos.Z);
    }

    // ── 2. Poll input → skill slots / action sets ──
    const input = this.inputSystem;
    for (const action of USE_SLOT_ACTIONS) {
      if (input.justDown(action)) {
        this.eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "SlotActivated",
            slot: { Slot: action, CasterId: PLAYER_ENTITY_ID },
          },
        });
      }
    }

    // Action set switching (1-8 keys, matching F# InputMapping.fs)
    for (const action of SET_ACTION_SET_ACTIONS) {
      if (input.justDown(action)) {
        console.debug('[GameplayScene] Switching to action set', action);
        this.eventBus.publish({
          kind: "Intent",
          intent: {
            kind: "SlotActivated",
            slot: { Slot: action, CasterId: PLAYER_ENTITY_ID },
          },
        });
      }
    }

    // ── 3. Update targeting cursor ──
    this.targetingSystem.update();

    // ── 4. Step engine ──
    const dt = delta / 1000;
    this.gameplayLoop.update(dt);

    // ── 5. Sync renderers ──
    this.entitySystem.update(this.world);
    this.projectileSystem.update(this.world);
    this.vfxSystem.update(delta);

    if (this.particleSystem) {
      this.particleSystem.update(dt, (id) => {
        const pos = this.world!.Positions.get(brandEntityId(id));
        return pos ? { X: pos.X, Y: pos.Y, Z: pos.Z } : undefined;
      });
      this.particleSystem.render();
      this.cleanupEffectVfx();
    }
  }

  private setupAnimations() {
    const createAnim = (key: string, texture: string, end: number, fr: number, repeat = -1) => {
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: 0, end: end - 1 }),
        frameRate: fr,
        repeat,
      });
    };

    // Soldier
    createAnim("soldier-idle", "soldier-idle", 6, 8);
    createAnim("soldier-walk", "soldier-walk", 8, 12);
    createAnim("soldier-attack", "soldier-attack1", 6, 12, 0);
    createAnim("soldier-death", "soldier-death", 4, 8, 0);

    // Orc
    createAnim("orc-idle", "orc-idle", 6, 8);
    createAnim("orc-walk", "orc-walk", 8, 12);
    createAnim("orc-attack", "orc-attack1", 6, 12, 0);
    createAnim("orc-death", "orc-death", 4, 8, 0);

    // Effects
    createAnim("fx-heal", "spell-heal", 16, 16, 0);
    createAnim("fx-fire", "spell-fire", 16, 16, 0);
    createAnim("fx-impact", "spell-impact", 16, 16, 0);
  }

  private drawBackgroundGrid() {
    const gridSize = 64;
    const cols = 40;
    const rows = 30;
    const graphics = this.add.graphics();

    for (let x = 0; x <= cols; x++) {
      graphics.lineStyle(1, 0x333344, 0.3);
      graphics.lineBetween(x * gridSize, 0, x * gridSize, rows * gridSize);
    }
    for (let y = 0; y <= rows; y++) {
      graphics.lineStyle(1, 0x333344, 0.3);
      graphics.lineBetween(0, y * gridSize, cols * gridSize, y * gridSize);
    }

    graphics.setDepth(-1);
  }

  private spawnTestTargets() {
    if (!this.eventBus) return;

    // Spawn 3 static orcs as targets
    const positions = [
      { X: 600, Z: 200 },
      { X: 700, Z: 400 },
      { X: 200, Z: 500 },
    ];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      this.eventBus.publish({
        kind: "Spawn",
        spawning: {
          kind: "SpawnEntity",
          spawn: {
            EntityId: brandEntityId(`target-${i}`),
            ScenarioId: PLAYER_SCENARIO_ID,
            Type: {
              kind: "Faction",
              info: {
                ArchetypeId: brandAiArchetypeId(1),
                EntityDefinitionKey: undefined,
                MapOverride: undefined,
                Faction: "Enemy",
                SpawnZoneName: undefined,
              },
            },
            Position: { X: pos.X, Y: 0, Z: pos.Z },
          },
        },
      });
    }
  }

  private spawnPlayerEntity() {
    if (!this.eventBus) return;

    this.eventBus.publish({
      kind: "Spawn",
      spawning: {
        kind: "SpawnEntity",
        spawn: {
          EntityId: PLAYER_ENTITY_ID,
          ScenarioId: PLAYER_SCENARIO_ID,
          Type: { kind: "Player", playerIndex: 0 },
          Position: { X: 400, Y: 0, Z: 300 },
        },
      },
    });
  }

  getWorld() { return this.world; }
  getEventBus() { return this.eventBus; }
  getStateWrite() { return this.stateWrite; }
  getSkillStore() { return this.skillStore; }
  getInputSystem() { return this.inputSystem; }
  getTargetingSystem() { return this.targetingSystem; }
  getEntitySystem() { return this.entitySystem; }
  getProjectileSystem() { return this.projectileSystem; }
  getVFXSystem() { return this.vfxSystem; }
  getParticleSystem() { return this.particleSystem; }

  private subscribeToImpacts() {
    if (!this.eventBus || !this.particleSystem) return;

    const { events$ } = this.eventBus;

    // ProjectileImpacted → spawn impact particles
    events$.subscribe((e) => {
      if (e.kind !== "Lifecycle" || e.lifecycle.kind !== "ProjectileImpacted") return;
      const impact = e.lifecycle.impact;

      let vfxId: string | undefined;
      if (this.skillStore) {
        const skill = this.skillStore.getActive(impact.SkillId);
        vfxId = skill?.ImpactVisuals.VfxId;
      }

      if (vfxId) {
        this.particleSystem!.spawnEffect(vfxId, {
          X: impact.ImpactPosition.X,
          Y: 0,
          Z: impact.ImpactPosition.Y,
        });
      }
    });

    // InstantSkillImpact → spawn impact particles for instant-delivery skills
    events$.subscribe((e) => {
      if (e.kind !== "Lifecycle" || e.lifecycle.kind !== "InstantSkillImpact") return;
      const { VfxId, Position: pos } = e.lifecycle.impact;

      this.particleSystem!.spawnEffect(VfxId, {
        X: pos.X,
        Y: 0,
        Z: pos.Y,
      });
    });
  }

  private subscribeToEffects() {
    if (!this.eventBus || !this.particleSystem) return;

    this.eventBus.events$.subscribe((e) => {
      if (e.kind !== "Intent" || e.intent.kind !== "EffectApplication") return;
      const { effectApp } = e.intent;
      const vfxId = effectApp.Effect.Visuals?.VfxId;
      if (!vfxId) return;

      const key = `${effectApp.TargetEntity}::${effectApp.Effect.Name}`;
      if (this.effectVfxMap.has(key)) return; // Already spawned

      const world = this.world;
      if (!world) return;
      const targetPos = world.Positions.get(effectApp.TargetEntity);
      if (!targetPos) return;

      const spawnedId = this.particleSystem!.spawnEffect(vfxId, {
        X: targetPos.X,
        Y: 0,
        Z: targetPos.Z,
      }, effectApp.TargetEntity);

      if (spawnedId) {
        this.effectVfxMap.set(key, spawnedId);
      }
    });
  }

  private cleanupEffectVfx() {
    if (!this.world || !this.particleSystem) return;
    const activeEffects = this.world.ActiveEffects;

    for (const [key, vfxId] of this.effectVfxMap) {
      const [entityId, effectName] = key.split('::', 2);
      const effects = activeEffects.get(brandEntityId(entityId));
      const stillActive = effects?.some((e) => e.SourceEffect.Name === effectName);
      if (!stillActive) {
        this.particleSystem.removeEffect(vfxId);
        this.effectVfxMap.delete(key);
      }
    }
  }
}

export function createGameplayScene(
  parent: HTMLElement,
  world: MutableWorld,
  env: PomoEnvironment,
  gameplayLoop: GameplayLoop,
  particleStore: ParticleStore,
): Phaser.Game {
  const width = parent.clientWidth || window.innerWidth;
  const height = parent.clientHeight || window.innerHeight;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width,
    height,
    parent,
    backgroundColor: "#1a1a2e",
    scene: [],
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };

  const game = new Phaser.Game(config);
  game.scene.add("GameplayScene", GameplayScene, true, {
    world,
    eventBus: env.core.eventBus,
    stateWrite: env.core.stateWrite,
    gameplayLoop,
    particleStore,
    skillStore: env.stores.skillStore,
  });

  return game;
}