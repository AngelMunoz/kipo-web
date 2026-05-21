import Phaser from "phaser";
import type { Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type { GameEvent } from "../../kipo-engine/domain/events";
import type { GameplayScene } from "../gameplay-scene";

interface ActiveVFX {
  sprite: Phaser.GameObjects.Sprite;
  startTime: number;
  duration: number;
}

export interface VFXSystem {
  spawnImpact(x: number, y: number): void;
  spawnHealEffect(x: number, y: number): void;
  spawnFireEffect(x: number, y: number): void;
  showDamageNumber(x: number, y: number, amount: number): void;
  showFloatingText(x: number, y: number, message: string, type: string): void;
  update(delta: number): void;
  destroy(): void;
}

export function createVFXSystem(scene: GameplayScene): VFXSystem {
  let activeEffects: ActiveVFX[] = [];
  const subscriptions: Subscription[] = [];

  setupSubscriptions();

  function setupSubscriptions() {
    const eventBus = scene.getEventBus();
    if (!eventBus) return;

    const impactSub = eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent =>
            e.kind === "Lifecycle" && e.lifecycle.kind === "ProjectileImpacted"
        )
      )
      .subscribe((e) => {
        if (e.kind !== "Lifecycle" || e.lifecycle.kind !== "ProjectileImpacted") return;
        const impact = e.lifecycle.impact;
        spawnImpact(impact.ImpactPosition.X, impact.ImpactPosition.Y);
      });

    const damageSub = eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent =>
            e.kind === "Notification" && e.notification.kind === "DamageDealt"
        )
      )
      .subscribe((e) => {
        if (e.kind !== "Notification" || e.notification.kind !== "DamageDealt") return;
        const dmg = e.notification.damage;
        const world = scene.getWorld();
        if (!world) return;
        const pos = world.Positions.get(dmg.Target);
        if (pos) {
          showDamageNumber(pos.X, pos.Z, dmg.Amount);
        }
      });

    const msgSub = eventBus.events$
      .pipe(
        filter(
          (e): e is GameEvent =>
            e.kind === "Notification" && e.notification.kind === "ShowMessage"
        )
      )
      .subscribe((e) => {
        if (e.kind !== "Notification" || e.notification.kind !== "ShowMessage") return;
        const msg = e.notification.message;
        showFloatingText(msg.Position.X, msg.Position.Z, msg.Message, msg.Type);
      });

    subscriptions.push(impactSub, damageSub, msgSub);
  }

  function spawnImpact(x: number, y: number) {
    const sprite = scene.add.sprite(x, y, "spell-impact");
    sprite.setScale(1.5);
    sprite.play("fx-impact");
    sprite.once("animationcomplete", () => {
      sprite.destroy();
    });
  }

  function spawnHealEffect(x: number, y: number) {
    const sprite = scene.add.sprite(x, y, "spell-heal");
    sprite.setScale(1.5);
    sprite.play("fx-heal");
    sprite.once("animationcomplete", () => {
      sprite.destroy();
    });
  }

  function spawnFireEffect(x: number, y: number) {
    const sprite = scene.add.sprite(x, y, "spell-fire");
    sprite.setScale(1.5);
    sprite.play("fx-fire");
    sprite.once("animationcomplete", () => {
      sprite.destroy();
    });
  }

  function showDamageNumber(x: number, y: number, amount: number) {
    const text = scene.add.text(x, y - 50, `${amount}`, {
      fontSize: "20px",
      color: "#ff4444",
      stroke: "#000000",
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 0.5);

    scene.tweens.add({
      targets: text,
      y: y - 100,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy(),
    });
  }

  function showFloatingText(x: number, y: number, message: string, type: string) {
    const colors: Record<string, string> = {
      Damage: "#ff4444",
      Crit: "#ff8800",
      Heal: "#44ff44",
      Miss: "#888888",
      Normal: "#ffffff",
    };
    const color = colors[type] ?? "#ffffff";

    const text = scene.add.text(x, y - 60, message, {
      fontSize: "16px",
      color,
      stroke: "#000000",
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);

    scene.tweens.add({
      targets: text,
      y: y - 110,
      alpha: 0,
      duration: 1200,
      onComplete: () => text.destroy(),
    });
  }

  function update(_delta: number) {
    const now = scene.time.now;
    activeEffects = activeEffects.filter((fx) => {
      if (now - fx.startTime > fx.duration) {
        fx.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  function destroy() {
    for (const sub of subscriptions) sub.unsubscribe();
    for (const fx of activeEffects) fx.sprite.destroy();
    activeEffects = [];
  }

  return { spawnImpact, spawnHealEffect, spawnFireEffect, showDamageNumber, showFloatingText, update, destroy };
}
