import type { EntityId, ScenarioId } from '../types/branded';

export interface WorldPosition {
  X: number;
  Y: number;
  Z: number;
}

export const WorldPositionZero: WorldPosition = { X: 0, Y: 0, Z: 0 };

export function fromVector2(v: { X: number; Y: number }): WorldPosition {
  return { X: v.X, Y: 0, Z: v.Y };
}

export function toVector2(p: WorldPosition): { X: number; Y: number } {
  return { X: p.X, Y: p.Z };
}

export function distance(a: WorldPosition, b: WorldPosition): number {
  const dx = a.X - b.X;
  const dy = a.Y - b.Y;
  const dz = a.Z - b.Z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export type Element =
  | 'Fire'
  | 'Water'
  | 'Earth'
  | 'Air'
  | 'Lightning'
  | 'Light'
  | 'Dark'
  | 'Neutral';

export type CombatStatus =
  | { kind: 'Stunned' }
  | { kind: 'Silenced' }
  | { kind: 'Rooted' };

export type Stat =
  | { kind: 'AP' }
  | { kind: 'AC' }
  | { kind: 'DX' }
  | { kind: 'MP' }
  | { kind: 'MA' }
  | { kind: 'MD' }
  | { kind: 'WT' }
  | { kind: 'DA' }
  | { kind: 'LK' }
  | { kind: 'HP' }
  | { kind: 'DP' }
  | { kind: 'HV' }
  | { kind: 'MS' }
  | { kind: 'HPRegen' }
  | { kind: 'MPRegen' }
  | { kind: 'ElementResistance'; element: Element }
  | { kind: 'ElementAttribute'; element: Element };

export type StatModifier =
  | { kind: 'Additive'; stat: Stat; value: number }
  | { kind: 'Multiplicative'; stat: Stat; value: number };

export interface VisualManifest {
  ModelId: string | undefined;
  VfxId: string | undefined;
  AnimationId: string | undefined;
  AttachmentPoint: string | undefined;
}

export const VisualManifestEmpty: VisualManifest = {
  ModelId: undefined,
  VfxId: undefined,
  AnimationId: undefined,
  AttachmentPoint: undefined,
};

export interface Vector2 {
  X: number;
  Y: number;
}

export const Vector2Zero: Vector2 = { X: 0, Y: 0 };
export const Vector2UnitX: Vector2 = { X: 1, Y: 0 };
export const Vector2UnitY: Vector2 = { X: 0, Y: 1 };

export function vector2Distance(a: Vector2, b: Vector2): number {
  const dx = a.X - b.X;
  const dy = a.Y - b.Y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function vector2DistanceSquared(a: Vector2, b: Vector2): number {
  const dx = a.X - b.X;
  const dy = a.Y - b.Y;
  return dx * dx + dy * dy;
}

export function vector2Normalize(v: Vector2): Vector2 {
  const len = Math.sqrt(v.X * v.X + v.Y * v.Y);
  if (len === 0) return { X: 0, Y: 0 };
  return { X: v.X / len, Y: v.Y / len };
}

export function vector2Dot(a: Vector2, b: Vector2): number {
  return a.X * b.X + a.Y * b.Y;
}

export interface Vector3 {
  X: number;
  Y: number;
  Z: number;
}

export const Vector3Zero: Vector3 = { X: 0, Y: 0, Z: 0 };

export function vector3Normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z);
  if (len === 0) return { X: 0, Y: 0, Z: 0 };
  return { X: v.X / len, Y: v.Y / len, Z: v.Z / len };
}

export interface Time {
  Delta: number; // seconds
  TotalGameTime: number; // seconds
  Previous: number; // seconds
}

export interface WorldText {
  Text: string;
  Type: NotificationType;
  Position: WorldPosition;
  Velocity: Vector2;
  Life: number;
  MaxLife: number;
}

export type NotificationType =
  | 'Normal'
  | 'Damage'
  | 'Crit'
  | 'Heal'
  | 'Status'
  | 'Miss';

export interface EntitySnapshot {
  Id: EntityId;
  ScenarioId: ScenarioId;
  Position: WorldPosition;
  Velocity: Vector3;
}
