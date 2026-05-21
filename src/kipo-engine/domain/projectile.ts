import type { EntityId, SkillId } from '../types/branded';
import type { Vector2, VisualManifest } from './core';

export type ProjectileTarget =
  | { kind: 'EntityTarget'; entity: EntityId }
  | { kind: 'PositionTarget'; position: Vector2 };

export interface LiveProjectile {
  Caster: EntityId;
  Target: ProjectileTarget;
  SkillId: SkillId;
  Info: ProjectileInfo;
}

export interface ProjectileInfo {
  Speed: number;
  Collision: CollisionMode;
  Variations: ExtraVariations | undefined;
  Visuals: VisualManifest;
  TerrainImpactVisuals: VisualManifest | undefined;
}

export type CollisionMode = 'IgnoreTerrain' | 'BlockedByTerrain';

export type ExtraVariations =
  | { kind: 'Chained'; jumpsLeft: number; maxRange: number }
  | { kind: 'Bouncing'; bouncesLeft: number }
  | { kind: 'Descending'; currentAltitude: number; fallSpeed: number };
