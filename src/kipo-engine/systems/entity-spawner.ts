import type { Subscription } from "rxjs";
import { filter } from "rxjs/operators";
import type {
  EntityId,
  ScenarioId,
  SkillId,
  ItemInstanceId,
} from "../types/branded";
import {
  brandEntityId,
  brandSkillId,
  brandItemId,
  brandItemInstanceId,
} from "../types/branded";
import type { PomoEnvironment } from "./environment";
import type { WorldPosition } from "../domain/core";
import type {
  SpawnEntityIntent,
  FactionSpawnInfo,
  RegisterSpawnZones,
  GameAction,
  SlotProcessing,
} from "../domain/events";
import type {
  AIController,
  AIArchetype,
  AIEntityDefinition,
  AIFamilyConfig,
} from "../domain/ai";
import type { BaseStats, Resource } from "../domain/entity";
import type { ItemInstance, Slot } from "../domain/item";
import { Constants } from "../domain/constants";

// --- Internal Types ---

interface PendingSpawn {
  EntityId: EntityId;
  ScenarioId: ScenarioId;
  Type: import("../domain/events").SpawnType;
  Position: WorldPosition;
  ActionSets:
    | Map<
        number,
        Map<
          import("../domain/events").GameAction,
          import("../domain/events").SlotProcessing
        >
      >
    | undefined;
  SpawnStartTime: number;
  Duration: number;
}

interface SpawnedEntityInfo {
  EntityId: EntityId;
  ScenarioId: ScenarioId;
  SpawnInfo: FactionSpawnInfo;
  SpawnZoneName: string | undefined;
}

interface SpawnZoneConfig {
  ZoneName: string;
  MaxSpawns: number;
  SpawnInfo: FactionSpawnInfo;
  SpawnPositions: import("../domain/core").Vector2[];
}

interface ScenarioSpawnConfig {
  ScenarioId: ScenarioId;
  MaxEnemies: number;
  Zones: SpawnZoneConfig[];
}

// --- Helpers ---

function createPlayerStats(): { baseStats: BaseStats; resource: Resource } {
  const baseStats: BaseStats = {
    Power: 10,
    Magic: 50,
    Sense: 20,
    Charm: 30,
  };
  return {
    baseStats,
    resource: {
      HP: baseStats.Charm * 10,
      MP: baseStats.Magic * 5,
      Status: "Alive",
    },
  };
}

function createEnemyStats(archetype: AIArchetype): {
  baseStats: BaseStats;
  resource: Resource;
} {
  const baseStats = archetype.baseStats;
  return {
    baseStats,
    resource: {
      HP: baseStats.Charm,
      MP: baseStats.Magic,
      Status: "Alive",
    },
  };
}

function resolveStats(
  familyConfig: AIFamilyConfig | undefined,
  aiEntity: AIEntityDefinition | undefined,
  mapOverride: import("../domain/ai").MapEntityOverride | undefined,
  baseStats: BaseStats,
): BaseStats {
  let result = { ...baseStats };

  // Apply family stat scaling
  if (familyConfig) {
    for (const [stat, multiplier] of familyConfig.StatScaling) {
      switch (stat) {
        case "Power":
          result.Power = Math.floor(result.Power * multiplier);
          break;
        case "Magic":
          result.Magic = Math.floor(result.Magic * multiplier);
          break;
        case "Sense":
          result.Sense = Math.floor(result.Sense * multiplier);
          break;
        case "Charm":
          result.Charm = Math.floor(result.Charm * multiplier);
          break;
      }
    }
  }

  // Apply entity stat overrides
  if (aiEntity?.StatOverrides) {
    result = { ...result, ...aiEntity.StatOverrides };
  }

  // Apply map multiplier
  if (mapOverride?.StatMultiplier !== undefined) {
    result.Power = Math.floor(result.Power * mapOverride.StatMultiplier);
    result.Magic = Math.floor(result.Magic * mapOverride.StatMultiplier);
    result.Sense = Math.floor(result.Sense * mapOverride.StatMultiplier);
    result.Charm = Math.floor(result.Charm * mapOverride.StatMultiplier);
  }

  return result;
}

function resolveSkills(
  entitySkills: SkillId[],
  mapOverride: import("../domain/ai").MapEntityOverride | undefined,
): SkillId[] {
  let skills: SkillId[] = [...entitySkills];

  if (mapOverride?.SkillRestrictions) {
    skills = skills.filter((s) => !mapOverride.SkillRestrictions!.includes(s));
  }

  if (mapOverride?.ExtraSkills) {
    skills = [...skills, ...mapOverride.ExtraSkills];
  }

  return skills;
}

function createPlayerLoadout(): {
  Items: ItemInstance[];
  EquippedSlots: Array<{ slot: Slot; instanceId: ItemInstanceId }>;
  ActionSets: Map<number, Map<GameAction, SlotProcessing>>;
  ActiveActionSet: number;
} {
  const wizardHatId = brandItemInstanceId(
    crypto.randomUUID ? crypto.randomUUID() : `hat-${Date.now()}`,
  );
  const magicStaffId = brandItemInstanceId(
    crypto.randomUUID ? crypto.randomUUID() : `staff-${Date.now()}`,
  );
  const potionId = brandItemInstanceId(
    crypto.randomUUID ? crypto.randomUUID() : `pot-${Date.now()}`,
  );
  const trollBloodId = brandItemInstanceId(
    crypto.randomUUID ? crypto.randomUUID() : `troll-${Date.now()}`,
  );

  const wizardHat: ItemInstance = {
    InstanceId: wizardHatId,
    ItemId: brandItemId(4),
    UsesLeft: undefined,
  };
  const magicStaff: ItemInstance = {
    InstanceId: magicStaffId,
    ItemId: brandItemId(5),
    UsesLeft: undefined,
  };
  const potion: ItemInstance = {
    InstanceId: potionId,
    ItemId: brandItemId(2),
    UsesLeft: 20,
  };
  const trollBlood: ItemInstance = {
    InstanceId: trollBloodId,
    ItemId: brandItemId(6),
    UsesLeft: 20,
  };

  // Action sets matching F# createPlayerLoadout
  const actionSet1 = new Map<GameAction, SlotProcessing>([
    ["UseSlot1", { kind: "Skill", skillId: brandSkillId(7) }],
    ["UseSlot2", { kind: "Skill", skillId: brandSkillId(8) }],
    ["UseSlot3", { kind: "Skill", skillId: brandSkillId(3) }],
    ["UseSlot4", { kind: "Skill", skillId: brandSkillId(2) }],
    ["UseSlot5", { kind: "Skill", skillId: brandSkillId(4) }],
    ["UseSlot6", { kind: "Skill", skillId: brandSkillId(5) }],
  ]);

  const actionSet2 = new Map<GameAction, SlotProcessing>([
    ["UseSlot1", { kind: "Item", itemInstanceId: potionId }],
    ["UseSlot2", { kind: "Item", itemInstanceId: trollBloodId }],
  ]);

  const actionSet3 = new Map<GameAction, SlotProcessing>([
    ["UseSlot1", { kind: "Skill", skillId: brandSkillId(9) }],
    ["UseSlot2", { kind: "Skill", skillId: brandSkillId(10) }],
    ["UseSlot3", { kind: "Skill", skillId: brandSkillId(11) }],
    ["UseSlot4", { kind: "Skill", skillId: brandSkillId(12) }],
    ["UseSlot5", { kind: "Skill", skillId: brandSkillId(13) }],
    ["UseSlot6", { kind: "Skill", skillId: brandSkillId(25) }],
  ]);

  const actionSets = new Map<number, Map<GameAction, SlotProcessing>>([
    [1, actionSet1],
    [2, actionSet2],
    [3, actionSet3],
  ]);

  return {
    Items: [wizardHat, magicStaff, potion, trollBlood],
    EquippedSlots: [
      { slot: "Head", instanceId: wizardHatId },
      { slot: "Weapon", instanceId: magicStaffId },
    ],
    ActionSets: actionSets,
    ActiveActionSet: 3,
  };
}

function finalizeSpawn(env: PomoEnvironment, pending: PendingSpawn) {
  const entityId = pending.EntityId;
  const pos = pending.Position;

  const snapshot: import("../domain/core").EntitySnapshot = {
    Id: entityId,
    ScenarioId: pending.ScenarioId,
    Position: pos,
    Velocity: { X: 0, Y: 0, Z: 0 },
  };

  switch (pending.Type.kind) {
    case "Player": {
      const { baseStats, resource } = createPlayerStats();
      const factions = new Set<"Player">(["Player"]);
      const loadout = createPlayerLoadout();

      // Minimal input map
      const inputMap: import("../domain/events").InputMap = {
        bindings: new Map(),
      };

      env.core.stateWrite.ApplyEntitySpawnBundle({
        Snapshot: snapshot,
        Resources: resource,
        Factions: Array.from(factions),
        BaseStats: baseStats,
        ModelConfig: "HumanoidBase",
        InputMap: inputMap,
        ActionSets: loadout.ActionSets,
        ActiveActionSet: loadout.ActiveActionSet,
        InventoryItems: loadout.Items,
        EquippedSlots: loadout.EquippedSlots,
        AIController: undefined,
      });
      break;
    }
    case "Faction": {
      const info = pending.Type.info;
      const archetype = env.stores.aiArchetypeStore.tryFind(info.ArchetypeId);
      if (!archetype) return;

      const assignedFaction = info.Faction ?? "Enemy";
      const factions = new Set([assignedFaction]);

      // Look up entity definition
      let aiEntity: AIEntityDefinition | undefined;
      if (info.EntityDefinitionKey) {
        aiEntity = env.stores.aiEntityStore.tryFind(info.EntityDefinitionKey);
      }
      if (!aiEntity) {
        // Try to get first available entity definition
        const allEntities = env.stores.aiEntityStore.all();
        aiEntity = allEntities[0] ?? undefined;
      }

      // Look up family config
      let familyConfig: AIFamilyConfig | undefined;
      if (aiEntity) {
        familyConfig = env.stores.aiFamilyStore.tryFind(aiEntity.Family);
      }

      const { baseStats, resource } = createEnemyStats(archetype);
      const resolvedStats = resolveStats(
        familyConfig,
        aiEntity,
        info.MapOverride,
        baseStats,
      );

      // Resolve skills
      let skills: SkillId[] = [];
      if (aiEntity) {
        skills = resolveSkills(aiEntity.Skills, info.MapOverride);
      }

      // Create AI controller
      const controller: AIController = {
        controlledEntityId: entityId,
        archetypeId: info.ArchetypeId,
        currentState: "Idle",
        stateEnterTime: 0,
        spawnPosition: { X: pos.X, Y: pos.Z }, // AI uses XZ as 2D
        absoluteWaypoints:
          archetype.behaviorType === "Patrol" ||
          archetype.behaviorType === "Aggressive"
            ? [
                { X: pos.X, Y: pos.Z },
                { X: pos.X + 100, Y: pos.Z },
                { X: pos.X + 100, Y: pos.Z + 100 },
                { X: pos.X, Y: pos.Z + 100 },
              ]
            : undefined,
        waypointIndex: 0,
        lastDecisionTime: 0,
        currentTarget: undefined,
        decisionTree: aiEntity?.DecisionTree ?? "MeleeAttacker",
        preferredIntent: familyConfig?.PreferredIntent ?? "Offensive",
        skills,
        memories: new Map(),
      };

      const modelConfig = aiEntity?.Model ?? "HumanoidBase";

      env.core.stateWrite.ApplyEntitySpawnBundle({
        Snapshot: snapshot,
        Resources: resource,
        Factions: Array.from(factions),
        BaseStats: resolvedStats,
        ModelConfig: modelConfig,
        InputMap: undefined,
        ActionSets: undefined,
        ActiveActionSet: undefined,
        InventoryItems: undefined,
        EquippedSlots: undefined,
        AIController: controller,
      });
      break;
    }
  }
}

// --- System Factory ---

export interface EntitySpawnerSystem {
  update(): void;
  dispose(): void;
}

export function createEntitySpawnerSystem(
  env: PomoEnvironment,
): EntitySpawnerSystem {
  const pendingSpawns: PendingSpawn[] = [];
  const spawnDuration = Constants.Spawning.DefaultDuration;

  // Respawn tracking
  const spawnedEntities = new Map<EntityId, SpawnedEntityInfo>();

  // Per-scenario spawn configuration
  const scenarioConfigs = new Map<ScenarioId, ScenarioSpawnConfig>();

  // Mutable count tracking
  const scenarioCurrentCounts = new Map<ScenarioId, number>();
  const zoneCurrentCounts = new Map<string, number>(); // key = `${scenarioId}:${zoneName}`

  // Pre-grouped zones by faction
  const zonesByFaction = new Map<string, SpawnZoneConfig[]>(); // key = `${scenarioId}:${faction}`

  const subscriptions: Subscription[] = [];

  function getZoneCount(scenarioId: ScenarioId, zoneName: string): number {
    return zoneCurrentCounts.get(`${scenarioId}:${zoneName}`) ?? 0;
  }

  function getScenarioCount(scenarioId: ScenarioId): number {
    return scenarioCurrentCounts.get(scenarioId) ?? 0;
  }

  function findAvailableZone(
    scenarioId: ScenarioId,
    faction: string | undefined,
  ): SpawnZoneConfig | undefined {
    const config = scenarioConfigs.get(scenarioId);
    if (!config || getScenarioCount(scenarioId) >= config.MaxEnemies)
      return undefined;

    const matchingZones = faction
      ? (zonesByFaction.get(`${scenarioId}:${faction}`) ?? [])
      : config.Zones;

    return matchingZones.find(
      (z) => getZoneCount(scenarioId, z.ZoneName) < z.MaxSpawns,
    );
  }

  function getRandomSpawnPosition(
    zone: SpawnZoneConfig,
  ): import("../domain/core").Vector2 {
    const idx = Math.floor(Math.random() * zone.SpawnPositions.length);
    return zone.SpawnPositions[idx] ?? { X: 0, Y: 0 };
  }

  // Subscribe to RegisterSpawnZones
  const registerSub = env.core.eventBus.events$
    .pipe(
      filter(
        (
          e,
        ): e is {
          kind: "Spawn";
          spawning: { kind: "RegisterZones"; zones: RegisterSpawnZones };
        } => e.kind === "Spawn" && e.spawning.kind === "RegisterZones",
      ),
    )
    .subscribe((e) => {
      const event = e.spawning.zones;
      const zones: SpawnZoneConfig[] = event.Zones.map((zoneData) => {
        zoneCurrentCounts.set(`${event.ScenarioId}:${zoneData.ZoneName}`, 0);
        return {
          ZoneName: zoneData.ZoneName,
          MaxSpawns: zoneData.MaxSpawns,
          SpawnInfo: zoneData.SpawnInfo,
          SpawnPositions: zoneData.SpawnPositions,
        };
      });

      scenarioConfigs.set(event.ScenarioId, {
        ScenarioId: event.ScenarioId,
        MaxEnemies: event.MaxEnemies,
        Zones: zones,
      });

      // Pre-group zones by faction
      for (const zone of zones) {
        if (zone.SpawnInfo.Faction) {
          const key = `${event.ScenarioId}:${zone.SpawnInfo.Faction}`;
          const existing = zonesByFaction.get(key) ?? [];
          zonesByFaction.set(key, [...existing, zone]);
        }
      }

      scenarioCurrentCounts.set(event.ScenarioId, 0);
    });

  subscriptions.push(registerSub);

  // Subscribe to SpawnEntity
  const spawnSub = env.core.eventBus.events$
    .pipe(
      filter(
        (
          e,
        ): e is {
          kind: "Spawn";
          spawning: { kind: "SpawnEntity"; spawn: SpawnEntityIntent };
        } => e.kind === "Spawn" && e.spawning.kind === "SpawnEntity",
      ),
    )
    .subscribe((e) => {
      const intent = e.spawning.spawn;
      const totalGameTime = env.core.world.Time.TotalGameTime;

      const duration = intent.Type.kind === "Player" ? 0 : spawnDuration;

      const pending: PendingSpawn = {
        EntityId: intent.EntityId,
        ScenarioId: intent.ScenarioId,
        Type: intent.Type,
        Position: intent.Position,
        ActionSets: intent.ActionSets,
        SpawnStartTime: totalGameTime,
        Duration: duration,
      };

      pendingSpawns.push(pending);

      // Track spawn info for respawning (only for Faction spawns)
      if (intent.Type.kind === "Faction") {
        const info = intent.Type.info;
        spawnedEntities.set(intent.EntityId, {
          EntityId: intent.EntityId,
          ScenarioId: intent.ScenarioId,
          SpawnInfo: info,
          SpawnZoneName: info.SpawnZoneName,
        });

        // Increment counts
        const currentScenarioCount = getScenarioCount(intent.ScenarioId);
        scenarioCurrentCounts.set(intent.ScenarioId, currentScenarioCount + 1);

        if (info.SpawnZoneName) {
          const key = `${intent.ScenarioId}:${info.SpawnZoneName}`;
          const currentZoneCount = getZoneCount(
            intent.ScenarioId,
            info.SpawnZoneName,
          );
          zoneCurrentCounts.set(key, currentZoneCount + 1);
        }
      }
    });

  subscriptions.push(spawnSub);

  // Subscribe to EntityDied for respawn handling
  const deathSub = env.core.eventBus.events$
    .pipe(
      filter(
        (
          e,
        ): e is {
          kind: "Lifecycle";
          lifecycle: {
            kind: "EntityDied";
            died: import("../domain/events").EntityDied;
          };
        } => e.kind === "Lifecycle" && e.lifecycle.kind === "EntityDied",
      ),
    )
    .subscribe((e) => {
      const event = e.lifecycle.died;

      // Remove dead entity
      env.core.stateWrite.RemoveEntity(event.EntityId);

      // Check if this entity has spawn info for respawning
      const info = spawnedEntities.get(event.EntityId);
      if (!info) return;

      // Remove from tracking
      spawnedEntities.delete(event.EntityId);

      // Decrement counts
      const currentScenarioCount = getScenarioCount(event.ScenarioId);
      scenarioCurrentCounts.set(
        event.ScenarioId,
        Math.max(0, currentScenarioCount - 1),
      );

      if (info.SpawnZoneName) {
        const key = `${event.ScenarioId}:${info.SpawnZoneName}`;
        const currentZoneCount = getZoneCount(
          event.ScenarioId,
          info.SpawnZoneName,
        );
        zoneCurrentCounts.set(key, Math.max(0, currentZoneCount - 1));
      }

      // Find an available zone for this faction and respawn
      const zone = findAvailableZone(event.ScenarioId, info.SpawnInfo.Faction);

      if (!zone) return; // No available zone, don't respawn

      const newEntityId = brandEntityId(
        `entity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const newPosition = getRandomSpawnPosition(zone);

      const respawnIntent: SpawnEntityIntent = {
        EntityId: newEntityId,
        ScenarioId: event.ScenarioId,
        Type: {
          kind: "Faction",
          info: {
            ...info.SpawnInfo,
            SpawnZoneName: zone.ZoneName,
          },
        },
        Position: { X: newPosition.X, Y: 0, Z: newPosition.Y },
      };

      env.core.eventBus.publish({
        kind: "Spawn",
        spawning: { kind: "SpawnEntity", spawn: respawnIntent },
      });
    });

  subscriptions.push(deathSub);

  return {
    update() {
      const currentTime = env.core.world.Time.TotalGameTime;
      const toRemove: PendingSpawn[] = [];

      for (const pending of pendingSpawns) {
        if (currentTime >= pending.SpawnStartTime + pending.Duration) {
          finalizeSpawn(env, pending);
          toRemove.push(pending);
        }
      }

      for (const item of toRemove) {
        const idx = pendingSpawns.indexOf(item);
        if (idx >= 0) pendingSpawns.splice(idx, 1);
      }
    },
    dispose() {
      for (const sub of subscriptions) sub.unsubscribe();
    },
  };
}
