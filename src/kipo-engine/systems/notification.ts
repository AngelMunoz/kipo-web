import type { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { PomoEnvironment } from './environment';
import type { WorldText } from '../domain/core';

// --- System Factory ---

export interface NotificationSystem {
  update(dt: number): void;
  dispose(): void;
}

export function createNotificationSystem(env: PomoEnvironment): NotificationSystem {
  let sub: Subscription | undefined;

  sub = env.core.eventBus.events$
    .pipe(
      filter((e): e is { kind: 'Notification'; notification: { kind: 'ShowMessage'; message: import('../domain/events').ShowNotification } } =>
        e.kind === 'Notification' && e.notification.kind === 'ShowMessage'
      )
    )
    .subscribe((e) => {
      const event = e.notification.message;
      const drift = env.core.rng.next() * 20 - 10;

      const newNotification: WorldText = {
        Text: event.Message,
        Type: event.Type,
        Position: event.Position,
        Velocity: { X: drift, Y: -20 },
        Life: 2.0,
        MaxLife: 2.0,
      };

      env.core.stateWrite.AddNotification(newNotification);
    });

  return {
    update(dt) {
      const notifications = env.core.world.Notifications;
      const updatedNotifications: WorldText[] = [];

      for (const notification of notifications) {
        const newLife = notification.Life - dt;

        if (newLife > 0) {
          // Apply 2D velocity to X/Z plane (Y is height, unchanged)
          const newPosition = {
            X: notification.Position.X + notification.Velocity.X * dt,
            Y: notification.Position.Y,
            Z: notification.Position.Z + notification.Velocity.Y * dt,
          };

          updatedNotifications.push({
            ...notification,
            Life: newLife,
            Position: newPosition,
          });
        }
      }

      env.core.stateWrite.SetNotifications(updatedNotifications);
    },
    dispose() {
      sub?.unsubscribe();
    },
  };
}
