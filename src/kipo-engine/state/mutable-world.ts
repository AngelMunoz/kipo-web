import type { MutableWorld, World } from '../domain/world';

export function createMutableWorld(): MutableWorld {
  const world: MutableWorld = {
    Time: { Delta: 0, TotalGameTime: 0, Previous: 0 },

    EntityExists: new Set(),

    Positions: new Map(),
    Velocities: new Map(),
    Rotations: new Map(),
    MovementStates: new Map(),
    RawInputStates: new Map(),
    InputMaps: new Map(),
    GameActionStates: new Map(),
    ActionSets: new Map(),
    ActiveActionSets: new Map(),
    LiveProjectiles: new Map(),
    InCombatUntil: new Map(),
    PendingSkillCast: new Map(),
    ActiveCharges: new Map(),
    ActiveOrbitals: new Map(),
    VisualEffects: [],
    Notifications: [],
    ActiveAnimations: new Map(),
    Poses: new Map(),

    Resources: new Map(),
    Factions: new Map(),
    BaseStats: new Map(),
    CombatStatuses: new Map(),
    ActiveEffects: new Map(),
    AbilityCooldowns: new Map(),
    ItemInstances: new Map(),
    EntityInventories: new Map(),
    EquippedItems: new Map(),
    AIControllers: new Map(),
    ModelConfigId: new Map(),

    Scenarios: new Map(),
    EntityScenario: new Map(),
    SpawningEntities: new Map(),
  };

  return world;
}

export function createWorldView(mutable: MutableWorld): World {
  return {
    get Time() { return Object.freeze({ ...mutable.Time }); },
    EntityExists: mutable.EntityExists,
    Positions: mutable.Positions,
    Velocities: mutable.Velocities,
    Rotations: mutable.Rotations,
    MovementStates: mutable.MovementStates,
    RawInputStates: mutable.RawInputStates,
    InputMaps: mutable.InputMaps,
    GameActionStates: mutable.GameActionStates,
    ActionSets: mutable.ActionSets,
    ActiveActionSets: mutable.ActiveActionSets,
    Resources: mutable.Resources,
    Factions: mutable.Factions,
    BaseStats: mutable.BaseStats,
    CombatStatuses: mutable.CombatStatuses,
    ActiveEffects: mutable.ActiveEffects,
    AbilityCooldowns: mutable.AbilityCooldowns,
    LiveProjectiles: mutable.LiveProjectiles,
    InCombatUntil: mutable.InCombatUntil,
    PendingSkillCast: mutable.PendingSkillCast,
    ItemInstances: mutable.ItemInstances,
    EntityInventories: mutable.EntityInventories,
    EquippedItems: mutable.EquippedItems,
    AIControllers: mutable.AIControllers,
    SpawningEntities: mutable.SpawningEntities,
    Scenarios: mutable.Scenarios,
    EntityScenario: mutable.EntityScenario,
    ModelConfigId: mutable.ModelConfigId,
    Poses: mutable.Poses,
    ActiveAnimations: mutable.ActiveAnimations,
    ActiveOrbitals: mutable.ActiveOrbitals,
    ActiveCharges: mutable.ActiveCharges,
    VisualEffects: mutable.VisualEffects,
    Notifications: mutable.Notifications,
  };
}
