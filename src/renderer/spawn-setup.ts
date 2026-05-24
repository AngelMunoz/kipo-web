import type { PomoEnvironment } from '../kipo-engine/systems/environment';
import type { ScenarioId, EntityId } from '../kipo-engine/types/branded';
import { brandEntityId } from '../kipo-engine/types/branded';
import type { Vector2, WorldPosition } from '../kipo-engine/domain/core';
import type { FactionSpawnInfo, SpawnZoneData, RegisterSpawnZones } from '../kipo-engine/domain/events';
import type { MapEntityGroup, MapEntityOverride } from '../kipo-engine/domain/ai';

// --- Spawn Candidate (mirrors F# BlockMapSpawning.SpawnCandidate) ---

interface SpawnCandidate {
  Name: string;
  IsPlayerSpawn: boolean;
  EntityGroup: string | undefined;
  Position: Vector2;
}

// Hardcoded from F# NewMap.json Objects section
// This will be replaced by BlockMapSpawning.extractSpawnCandidates once BlockMap is ported
const NEWMAP_SPAWN_CANDIDATES: SpawnCandidate[] = [
  { Name: 'GateA_Spawn', IsPlayerSpawn: true, EntityGroup: undefined, Position: { X: 512, Y: 512 } },
  { Name: 'Magic Casters Spawn', IsPlayerSpawn: false, EntityGroup: 'magic_casters', Position: { X: 640, Y: 512 } },
  { Name: 'Fire Mages Spawn', IsPlayerSpawn: false, EntityGroup: 'fire_mages', Position: { X: 384, Y: 384 } },
  { Name: 'Melee Fighters Spawn', IsPlayerSpawn: false, EntityGroup: 'melee_fighters', Position: { X: 448, Y: 640 } },
  { Name: 'Ranged Attackers Spawn', IsPlayerSpawn: false, EntityGroup: 'ranged_attackers', Position: { X: 704, Y: 448 } },
  { Name: 'Support Units Spawn', IsPlayerSpawn: false, EntityGroup: 'support_units', Position: { X: 512, Y: 704 } },
  { Name: 'Defense Towers Spawn', IsPlayerSpawn: false, EntityGroup: 'defense_towers', Position: { X: 320, Y: 704 } },
];

// --- Resolution helpers (mirrors F# MapSpawning) ---

function selectEntityFromGroup(random: () => number, group: MapEntityGroup): string | undefined {
  if (group.Entities.length === 0) return undefined;

  const weights = group.Weights && group.Weights.length === group.Entities.length
    ? group.Weights
    : Array.from({ length: group.Entities.length }, () => 1.0 / group.Entities.length);

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const roll = random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (roll <= cumulative) {
      return group.Entities[i];
    }
  }

  return group.Entities[0];
}

interface ResolvedEntityInfo {
  EntityKey: string;
  ArchetypeId: number;
  MapOverride: MapEntityOverride | undefined;
  Faction: import('../kipo-engine/domain/entity').Faction | undefined;
}

function tryResolveEntityFromGroup(
  random: () => number,
  groupStore: import('../kipo-engine/stores/content-store').MapEntityGroupStore,
  groupName: string,
): ResolvedEntityInfo | undefined {
  const group = groupStore.tryFind(groupName);
  if (!group) return undefined;

  const entityKey = selectEntityFromGroup(random, group);
  if (!entityKey) return undefined;

  return {
    EntityKey: entityKey,
    ArchetypeId: 0, // Will be filled from AIEntityStore
    MapOverride: group.Overrides.get(entityKey),
    Faction: group.Faction,
  };
}

interface SpawnZoneInfo {
  ZoneName: string;
  MaxSpawns: number;
  SpawnInfo: FactionSpawnInfo;
  SpawnPositions: Vector2[];
}

function buildZoneInfo(
  zoneName: string,
  zoneItems: SpawnCandidate[],
  resolved: ResolvedEntityInfo,
  aiEntityStore: import('../kipo-engine/stores/content-store').AIEntityStore,
): SpawnZoneInfo | undefined {
  const entityDef = aiEntityStore.tryFind(resolved.EntityKey);
  if (!entityDef) return undefined;

  return {
    ZoneName: zoneName,
    MaxSpawns: zoneItems.length,
    SpawnInfo: {
      ArchetypeId: entityDef.ArchetypeId,
      EntityDefinitionKey: resolved.EntityKey,
      MapOverride: resolved.MapOverride,
      Faction: resolved.Faction,
      SpawnZoneName: zoneName,
    },
    SpawnPositions: zoneItems.map((c) => c.Position),
  };
}

function buildSpawnZones(
  random: () => number,
  groupStore: import('../kipo-engine/stores/content-store').MapEntityGroupStore,
  aiEntityStore: import('../kipo-engine/stores/content-store').AIEntityStore,
  candidates: SpawnCandidate[],
): SpawnZoneInfo[] {
  const nonPlayer = candidates.filter((c) => !c.IsPlayerSpawn);
  const zones = new Map<string, SpawnCandidate[]>();

  for (const c of nonPlayer) {
    const existing = zones.get(c.Name) ?? [];
    existing.push(c);
    zones.set(c.Name, existing);
  }

  const result: SpawnZoneInfo[] = [];

  for (const [zoneName, zoneItems] of zones) {
    const groupName = zoneItems[0].EntityGroup;
    if (!groupName) continue;

    const resolved = tryResolveEntityFromGroup(random, groupStore, groupName);
    if (!resolved) continue;

    const zoneInfo = buildZoneInfo(zoneName, zoneItems, resolved, aiEntityStore);
    if (zoneInfo) {
      result.push(zoneInfo);
    }
  }

  return result;
}

function toSpawnZoneData(scenarioId: ScenarioId, zoneInfo: SpawnZoneInfo): SpawnZoneData {
  return {
    ZoneName: zoneInfo.ZoneName,
    ScenarioId: scenarioId,
    MaxSpawns: zoneInfo.MaxSpawns,
    SpawnInfo: zoneInfo.SpawnInfo,
    SpawnPositions: zoneInfo.SpawnPositions,
  };
}

// --- Public API ---

export interface SpawnSetupResult {
  playerSpawnPosition: WorldPosition;
  spawnZones: SpawnZoneInfo[];
}

export function extractSpawnSetup(
  env: PomoEnvironment,
): SpawnSetupResult {
  const playerCandidate = NEWMAP_SPAWN_CANDIDATES.find((c) => c.IsPlayerSpawn);
  const playerSpawnPosition: WorldPosition = playerCandidate
    ? { X: playerCandidate.Position.X, Y: 32, Z: playerCandidate.Position.Y }
    : { X: 512, Y: 32, Z: 512 };

  const spawnZones = buildSpawnZones(
    () => Math.random(),
    env.stores.mapEntityGroupStore,
    env.stores.aiEntityStore,
    NEWMAP_SPAWN_CANDIDATES,
  );

  return { playerSpawnPosition, spawnZones };
}

export function publishRegisterSpawnZones(
  env: PomoEnvironment,
  scenarioId: ScenarioId,
  spawnZones: SpawnZoneInfo[],
): void {
  const maxEnemies = spawnZones.reduce((sum, z) => sum + z.MaxSpawns, 0);

  const event: RegisterSpawnZones = {
    ScenarioId: scenarioId,
    MaxEnemies: maxEnemies,
    Zones: spawnZones.map((z) => toSpawnZoneData(scenarioId, z)),
  };

  env.core.eventBus.publish({
    kind: 'Spawn',
    spawning: { kind: 'RegisterZones', zones: event },
  });
}

export function spawnEnemiesForScenario(
  env: PomoEnvironment,
  scenarioId: ScenarioId,
  spawnZones: SpawnZoneInfo[],
): void {
  let totalEnemyCount = 0;
  const maxEnemies = spawnZones.reduce((sum, z) => sum + z.MaxSpawns, 0);

  for (const zone of spawnZones) {
    for (let i = 0; i < zone.MaxSpawns && totalEnemyCount < maxEnemies; i++) {
      if (i >= zone.SpawnPositions.length) break;

      const enemyId = brandEntityId(crypto.randomUUID ? crypto.randomUUID() : `enemy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const pos = zone.SpawnPositions[i];

      env.core.eventBus.publish({
        kind: 'Spawn',
        spawning: {
          kind: 'SpawnEntity',
          spawn: {
            EntityId: enemyId,
            ScenarioId: scenarioId,
            Type: {
              kind: 'Faction',
              info: zone.SpawnInfo,
            },
            Position: { X: pos.X, Y: 32, Z: pos.Y },
          },
        },
      });

      totalEnemyCount++;
    }
  }
}

export function spawnPlayer(
  env: PomoEnvironment,
  playerId: EntityId,
  scenarioId: ScenarioId,
  position: WorldPosition,
): void {
  env.core.eventBus.publish({
    kind: 'Spawn',
    spawning: {
      kind: 'SpawnEntity',
      spawn: {
        EntityId: playerId,
        ScenarioId: scenarioId,
        Type: { kind: 'Player', playerIndex: 0 },
        Position: position,
      },
    },
  });
}
