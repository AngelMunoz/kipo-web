export const Constants = {
  BlockMap: {
    CellSize: 64,
    KayKitBlockModelScale: 0.5,
  },
  DefaultPixelsPerUnit: { X: 64, Y: 32 },
  BlockMap3DPixelsPerUnit: { X: 64, Y: 64 },
  Entity: {
    Size: { X: 16, Y: 16 },
    ModelScale: 0.5,
    CollisionRadius: 16,
    CollisionDistance: 16,
    SkillActivationRangeBuffer: 5,
  },
  Projectile: {
    Size: { X: 8, Y: 8 },
    ArrivalThreshold: 16,
  },
  UI: {
    TargetingIndicatorSize: { X: 20, Y: 20 },
  },
  Navigation: {
    EntitySize: { X: 4, Y: 4 },
    FreeMovementThreshold: 16 * 5,
  },
  Spawning: {
    DefaultDuration: 1.0, // seconds
    BorderPadding: 8,
  },
  AI: {
    WaypointReachedThreshold: 16,
    ActiveZoneMargin: 1.3,
  },
};
