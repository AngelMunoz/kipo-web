import Phaser from "phaser";
import type { MutableWorld } from "../kipo-engine/domain/world";
import type { EntityId } from "../kipo-engine/types/branded";
import type { PomoEnvironment } from "../kipo-engine/systems/environment";
import type { GameplayLoop } from "../kipo-engine/gameplay-loop";
import { brandEntityId, brandScenarioId, brandSkillId } from "../kipo-engine/types/branded";
import { USE_SLOT_ACTIONS, type GameAction } from "../kipo-engine/domain/events";

export const PLAYER_ENTITY_ID = brandEntityId("player-1");
export const PLAYER_SCENARIO_ID = brandScenarioId("default-scenario");

export class GameScene extends Phaser.Scene {
  private world: MutableWorld | null = null;
  private eventBus: PomoEnvironment["core"]["eventBus"] | null = null;
  private stateWrite: PomoEnvironment["core"]["stateWrite"] | null = null;
  private gameplayLoop: GameplayLoop | null = null;
  private entitySprites = new Map<EntityId, Phaser.GameObjects.Sprite>();
  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private keys: Map<GameAction, Phaser.Input.Keyboard.Key> = new Map();
  private playerId: EntityId | null = null;

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    const charPath = "/src/assets/TinyRPGCharacterAssetPackv1.03/Characters(100x100)";

    // Player (Soldier)
    this.load.spritesheet("soldier-idle", `${charPath}/Soldier/Soldier/Soldier-Idle.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-walk", `${charPath}/Soldier/Soldier/Soldier-Walk.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-attack1", `${charPath}/Soldier/Soldier/Soldier-Attack01.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-death", `${charPath}/Soldier/Soldier/Soldier-Death.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("soldier-hurt", `${charPath}/Soldier/Soldier/Soldier-Hurt.png`, { frameWidth: 100, frameHeight: 100 });

    // Enemy (Orc)
    this.load.spritesheet("orc-idle", `${charPath}/Orc/Orc/Orc-Idle.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-walk", `${charPath}/Orc/Orc/Orc-Walk.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-attack1", `${charPath}/Orc/Orc/Orc-Attack01.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-death", `${charPath}/Orc/Orc/Orc-Death.png`, { frameWidth: 100, frameHeight: 100 });
    this.load.spritesheet("orc-hurt", `${charPath}/Orc/Orc/Orc-Hurt.png`, { frameWidth: 100, frameHeight: 100 });

    // Projectile
    this.load.image("arrow", "/src/assets/TinyRPGCharacterAssetPackv1.03/Arrow(Projectile)/Arrow01(100x100).png");

    // Effects (super pixel effects - these are also strips, need to check)
    const effectPath = "/src/assets/super_pixel_effects/spritesheet/Fantasy Spells";
    this.load.spritesheet("spell-heal", `${effectPath}/spell_heal_001/spell_heal_001_large_red/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet("spell-fire", `${effectPath}/spell_attack_up_001/spell_attack_up_001_large_red/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet("spell-impact", `${effectPath}/spell_absorb_001/spell_absorb_001_large_violet/spritesheet.png`, { frameWidth: 128, frameHeight: 128 });
  }

  init(data: {
    world: MutableWorld;
    eventBus: PomoEnvironment["core"]["eventBus"];
    stateWrite: PomoEnvironment["core"]["stateWrite"];
    gameplayLoop: GameplayLoop;
  }) {
    this.setupEngine(data.world, data.eventBus, data.stateWrite, data.gameplayLoop);
  }

  create() {
    this.playerSprite = this.add.sprite(400, 300, "soldier-idle", 0);
    this.playerSprite.setOrigin(0.5, 1);
    this.playerSprite.setScale(1.5);

    this.setupKeyboardInput();
    this.setupAnimations();

    this.events.on("update", this.handleInput.bind(this));

    this.spawnPlayerEntity();
  }

  private setupKeyboardInput() {
    const cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.addKeys("W,A,S,D");
    const numKeys = this.input.keyboard!.addKeys(
      "ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT",
    );
    // SAFETY: Phaser's addKeys returns a loosely-typed object; we coerce it for safe property access.
    const typedNumKeys = numKeys as Record<string, Phaser.Input.Keyboard.Key>;

    this.keys.set("MoveUp", cursors.up!);
    this.keys.set("MoveDown", cursors.down!);
    this.keys.set("MoveLeft", cursors.left!);
    this.keys.set("MoveRight", cursors.right!);

    this.keys.set("UseSlot1", typedNumKeys.ONE!);
    this.keys.set("UseSlot2", typedNumKeys.TWO!);
    this.keys.set("UseSlot3", typedNumKeys.THREE!);
    this.keys.set("UseSlot4", typedNumKeys.FOUR!);
    this.keys.set("UseSlot5", typedNumKeys.FIVE!);
    this.keys.set("UseSlot6", typedNumKeys.SIX!);
    this.keys.set("UseSlot7", typedNumKeys.SEVEN!);
    this.keys.set("UseSlot8", typedNumKeys.EIGHT!);
  }

  private setupAnimations() {
    // Soldier animations (frames face right, use flipX for left)
    this.anims.create({
      key: "soldier-idle",
      frames: this.anims.generateFrameNumbers("soldier-idle", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "soldier-walk",
      frames: this.anims.generateFrameNumbers("soldier-walk", { start: 0, end: 7 }),
      frameRate: 12,
      repeat: -1,
    });
    this.anims.create({
      key: "soldier-attack",
      frames: this.anims.generateFrameNumbers("soldier-attack1", { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    });
    this.anims.create({
      key: "soldier-death",
      frames: this.anims.generateFrameNumbers("soldier-death", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: 0,
    });

    // Orc animations
    this.anims.create({
      key: "orc-idle",
      frames: this.anims.generateFrameNumbers("orc-idle", { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });
    this.anims.create({
      key: "orc-walk",
      frames: this.anims.generateFrameNumbers("orc-walk", { start: 0, end: 7 }),
      frameRate: 12,
      repeat: -1,
    });
    this.anims.create({
      key: "orc-attack",
      frames: this.anims.generateFrameNumbers("orc-attack1", { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    });

    // Effect animations
    this.anims.create({
      key: "fx-heal",
      frames: this.anims.generateFrameNumbers("spell-heal", { start: 0, end: 15 }),
      frameRate: 16,
      repeat: 0,
    });
    this.anims.create({
      key: "fx-fire",
      frames: this.anims.generateFrameNumbers("spell-fire", { start: 0, end: 15 }),
      frameRate: 16,
      repeat: 0,
    });
    this.anims.create({
      key: "fx-impact",
      frames: this.anims.generateFrameNumbers("spell-impact", { start: 0, end: 15 }),
      frameRate: 16,
      repeat: 0,
    });
  }

  private handleInput() {
    if (!this.world || !this.eventBus || !this.playerSprite || !this.stateWrite) return;

    let dx = 0;
    let dy = 0;

    const up = this.keys.get("MoveUp");
    const down = this.keys.get("MoveDown");
    const left = this.keys.get("MoveLeft");
    const right = this.keys.get("MoveRight");

    if (up?.isDown) dy -= 1;
    if (down?.isDown) dy += 1;
    if (left?.isDown) dx -= 1;
    if (right?.isDown) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const targetX = this.playerSprite.x + dx * 5;
      const targetY = this.playerSprite.y + dy * 5;

      if (this.playerId) {
        this.stateWrite.UpdateMovementState(this.playerId, {
          kind: "MovingTo",
          targetPosition: { X: targetX, Y: 0, Z: targetY },
        });
      }

      if (dx < 0) {
        this.playerSprite.setFlipX(true);
      } else if (dx > 0) {
        this.playerSprite.setFlipX(false);
      }

      this.playerSprite.play("soldier-walk", true);
    } else {
      if (this.playerId) {
        this.stateWrite.UpdateMovementState(this.playerId, { kind: "Idle" });
      }
      this.playerSprite.play("soldier-idle", true);
    }

    for (let i = 1; i <= 8; i++) {
      const action = USE_SLOT_ACTIONS[i - 1];
      const key = this.keys.get(action);
      if (key && Phaser.Input.Keyboard.JustDown(key)) {
        this.triggerSkill(i);
      }
    }
  }

  private triggerSkill(slot: number) {
    if (!this.playerId || !this.eventBus || !this.playerSprite) return;

    const skillMap: Record<number, number> = {
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
    };

    const skillIdNum = skillMap[slot];
    if (!skillIdNum) return;

    const skillId = brandSkillId(skillIdNum);

    this.playerSprite.play("soldier-attack", true);

    const slotAction = USE_SLOT_ACTIONS[slot - 1];
    this.eventBus.publish({
      kind: "Intent",
      intent: {
        kind: "SlotActivated",
        slot: {
          Slot: slotAction,
          CasterId: this.playerId,
        },
      },
    });

    this.eventBus.publish({
      kind: "Intent",
      intent: {
        kind: "Ability",
        ability: {
          Caster: this.playerId,
          SkillId: skillId,
          Target: { kind: "TargetSelf" },
        },
      },
    });
  }

  update(_time: number, delta: number) {
    if (!this.gameplayLoop) return;

    const dt = delta / 1000;
    this.gameplayLoop.update(dt);

    this.syncPositions();
  }

  private syncPositions() {
    if (!this.world || !this.playerSprite) return;

    for (const [entityId, pos] of this.world.Positions) {
      if (entityId === this.playerId) {
        this.playerSprite.setPosition(pos.X, pos.Z);
      } else {
        let sprite = this.entitySprites.get(entityId);
        if (!sprite) {
          sprite = this.add.sprite(0, 0, "orc-idle", 0);
          sprite.setOrigin(0.5, 1);
          sprite.setScale(1.5);
          this.entitySprites.set(entityId, sprite);
        }
        sprite.setPosition(pos.X, pos.Z);
      }
    }

    for (const [id, sprite] of this.entitySprites) {
      if (!this.world.EntityExists.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  setupEngine(
    world: MutableWorld,
    eventBus: PomoEnvironment["core"]["eventBus"],
    stateWrite: PomoEnvironment["core"]["stateWrite"],
    loop: GameplayLoop,
  ) {
    this.world = world;
    this.eventBus = eventBus;
    this.stateWrite = stateWrite;
    this.gameplayLoop = loop;
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

    this.playerId = PLAYER_ENTITY_ID;
  }

  spawnEffect(effectKey: string, x: number, y: number) {
    const animKeys: Record<string, string> = {
      "spell_heal": "fx-heal",
      "spell_fire": "fx-fire",
      "spell_impact": "fx-impact",
    };
    const animKey = animKeys[effectKey];
    if (!animKey) return;

    const effectSprite = this.add.sprite(x, y, effectKey);
    effectSprite.setScale(1.5);
    effectSprite.play(animKey);
    effectSprite.once("animationcomplete", () => {
      effectSprite.destroy();
    });
  }
}

export interface PhaserGameOptions {
  parent: HTMLElement;
  world: MutableWorld;
  env: PomoEnvironment;
  gameplayLoop: GameplayLoop;
}

export function createPhaserGame(options: PhaserGameOptions): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: options.parent,
    backgroundColor: "#1a1a2e",
    scene: [],
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
      },
    },
  };

  const game = new Phaser.Game(config);

  game.scene.add("GameScene", GameScene, true, {
    world: options.world,
    eventBus: options.env.core.eventBus,
    stateWrite: options.env.core.stateWrite,
    gameplayLoop: options.gameplayLoop,
  });

  return game;
}
