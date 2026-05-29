import { describe, it, expect } from 'vitest';
import type { MutableWorld } from '../domain/world';
import { createMutableWorld, createWorldView } from '../state/mutable-world';
import { createEventBus } from '../events/event-bus';
import { createStateWriteService } from '../systems/state-write';
import { createNotificationSystem } from '../systems/notification';
import type { PomoEnvironment } from '../systems/environment';
import { createSeededPRNG } from '../utils/rng';

function createMinimalEnv(
  world: MutableWorld,
  seed: number = 0
): PomoEnvironment {
  const rng = createSeededPRNG(seed);
  const eventBus = createEventBus();
  const stateWrite = createStateWriteService();
  const worldView = createWorldView(world);

  return {
    core: {
      eventBus,
      stateWrite,
      world,
      worldView,
      rng,
    },
    stores: {
      skillStore: {
        tryFind: () => undefined,
        getActive: () => undefined,
        all: () => [],
      },
      itemStore: { tryFind: () => undefined, all: () => [] },
      aiArchetypeStore: { tryFind: () => undefined, all: () => [] },
      aiEntityStore: { tryFind: () => undefined, all: () => [] },
      aiFamilyStore: { tryFind: () => undefined, all: () => [] },
      decisionTreeStore: { tryFind: () => undefined, all: () => [] },
      mapEntityGroupStore: { tryFind: () => undefined, all: () => [] },
    },
    gameplay: {
      projections: {
        computeMovementSnapshot: () => ({ Positions: new Map(), SpatialGrid: new Map(), Rotations: new Map(), ModelConfigIds: new Map() }),
        getNearbyEntitiesSnapshot: () => [],
        calculateDerivedStats: () => undefined,
      },
      cameraService: {
        getAllCameras: () => [],
      },
    },
  };
}

describe('NotificationSystem', () => {
  it('should update notification position and reduce life over time', () => {
    const world = createMutableWorld();
    const env = createMinimalEnv(world, 0);

    // Seed a notification directly (simulating what the system would do on ShowMessage)
    world.Notifications.push({
      Text: 'Test message',
      Type: 'Miss',
      Position: { X: 0, Y: 0, Z: 0 },
      Velocity: { X: 5, Y: -20 },
      Life: 2.0,
      MaxLife: 2.0,
    });

    const notificationSystem = createNotificationSystem(env);

    // Update for 1 second
    notificationSystem.update(1.0);
    env.core.stateWrite.FlushWrites(world, 0);

    expect(world.Notifications.length).toBe(1);
    expect(world.Notifications[0].Life).toBe(1.0);
    // Position should have drifted due to velocity
    expect(world.Notifications[0].Position.X).toBe(5); // 5 * 1.0
    expect(world.Notifications[0].Position.Z).toBe(-20); // -20 * 1.0

    notificationSystem.dispose();
  });

  it('should remove expired notifications', () => {
    const world = createMutableWorld();
    const env = createMinimalEnv(world, 0);

    // Seed a notification
    world.Notifications.push({
      Text: 'Expiring message',
      Type: 'Miss',
      Position: { X: 0, Y: 0, Z: 0 },
      Velocity: { X: 0, Y: 0 },
      Life: 2.0,
      MaxLife: 2.0,
    });

    const notificationSystem = createNotificationSystem(env);

    // Update for 3 seconds (notification life is 2.0)
    notificationSystem.update(3.0);
    env.core.stateWrite.FlushWrites(world, 0);

    // Should be removed
    expect(world.Notifications.length).toBe(0);

    notificationSystem.dispose();
  });

  it('should create notification from ShowMessage event', () => {
    const world = createMutableWorld();
    const env = createMinimalEnv(world, 0);

    const notificationSystem = createNotificationSystem(env);

    // Publish a ShowMessage notification
    env.core.eventBus.publish({
      kind: 'Notification',
      notification: {
        kind: 'ShowMessage',
        message: {
          Message: 'Event message',
          Position: { X: 10, Y: 0, Z: 10 },
          Type: 'Normal',
        },
      },
    });

    // Flush event bus so notification system creates the notification
    env.core.eventBus.flush();

    // The subscription should have processed the event and queued a state write
    env.core.stateWrite.FlushWrites(world, 0);

    expect(world.Notifications.length).toBe(1);
    expect(world.Notifications[0].Text).toBe('Event message');
    expect(world.Notifications[0].Position.X).toBe(10);
    expect(world.Notifications[0].Position.Z).toBe(10);

    notificationSystem.dispose();
  });
});
