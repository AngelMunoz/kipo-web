import type { EntityId } from '../types/branded';
import type { WorldPosition, Vector2 } from './core';

export interface GridCell3D {
  X: number;
  Y: number;
  Z: number;
}

export interface Sphere {
  Center: WorldPosition;
  Radius: number;
}

export interface Cone3D {
  Origin: WorldPosition;
  Direction: import('./core').Vector3;
  AngleDegrees: number;
  Length: number;
}

export interface Cylinder {
  Base: WorldPosition;
  Height: number;
  Radius: number;
}

export function isPointInSphere(sphere: Sphere, point: WorldPosition): boolean {
  const dx = point.X - sphere.Center.X;
  const dy = point.Y - sphere.Center.Y;
  const dz = point.Z - sphere.Center.Z;
  return dx * dx + dy * dy + dz * dz <= sphere.Radius * sphere.Radius;
}

export function isPointInCone3D(cone: Cone3D, point: WorldPosition): boolean {
  const dx = point.X - cone.Origin.X;
  const dy = point.Y - cone.Origin.Y;
  const dz = point.Z - cone.Origin.Z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > cone.Length * cone.Length) return false;
  if (distSq < 0.0001) return true;

  const len = Math.sqrt(distSq);
  const toPointNorm = { X: dx / len, Y: dy / len, Z: dz / len };

  const dirLen = Math.sqrt(
    cone.Direction.X * cone.Direction.X +
      cone.Direction.Y * cone.Direction.Y +
      cone.Direction.Z * cone.Direction.Z
  );
  if (dirLen === 0) return true;

  const dirNorm = {
    X: cone.Direction.X / dirLen,
    Y: cone.Direction.Y / dirLen,
    Z: cone.Direction.Z / dirLen,
  };

  const dot =
    dirNorm.X * toPointNorm.X +
    dirNorm.Y * toPointNorm.Y +
    dirNorm.Z * toPointNorm.Z;

  const halfAngleRad = (cone.AngleDegrees / 2) * (Math.PI / 180);
  return dot >= Math.cos(halfAngleRad);
}

export function isPointInCylinder(cyl: Cylinder, point: WorldPosition): boolean {
  if (point.Y < cyl.Base.Y || point.Y > cyl.Base.Y + cyl.Height) return false;
  const dx = point.X - cyl.Base.X;
  const dz = point.Z - cyl.Base.Z;
  return dx * dx + dz * dz <= cyl.Radius * cyl.Radius;
}

export interface GridCell {
  X: number;
  Y: number;
}

export interface Cone {
  Origin: Vector2;
  Direction: Vector2;
  AngleDegrees: number;
  Length: number;
}

export interface LineSegment {
  Start: Vector2;
  End: Vector2;
  Width: number;
}

export interface Circle {
  Center: Vector2;
  Radius: number;
}

export function isPointInCircle(circle: Circle, point: Vector2): boolean {
  const dx = circle.Center.X - point.X;
  const dy = circle.Center.Y - point.Y;
  return dx * dx + dy * dy <= circle.Radius * circle.Radius;
}

export function getGridCell(cellSize: number, position: Vector2): GridCell {
  return {
    X: Math.floor(position.X / cellSize),
    Y: Math.floor(position.Y / cellSize),
  };
}

export function getCellsInRadius(
  cellSize: number,
  center: Vector2,
  radius: number
): GridCell[] {
  const minX = Math.floor((center.X - radius) / cellSize);
  const maxX = Math.floor((center.X + radius) / cellSize);
  const minY = Math.floor((center.Y - radius) / cellSize);
  const maxY = Math.floor((center.Y + radius) / cellSize);

  const cells: GridCell[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      cells.push({ X: x, Y: y });
    }
  }
  return cells;
}

export function closestPointOnSegment(p: Vector2, a: Vector2, b: Vector2): Vector2 {
  const abX = b.X - a.X;
  const abY = b.Y - a.Y;
  const lenSq = abX * abX + abY * abY;

  if (lenSq === 0) return a;

  const apX = p.X - a.X;
  const apY = p.Y - a.Y;
  const t = (apX * abX + apY * abY) / lenSq;
  const tClamped = Math.max(0, Math.min(1, t));

  return {
    X: a.X + abX * tClamped,
    Y: a.Y + abY * tClamped,
  };
}

export function distanceToSegment(p: Vector2, a: Vector2, b: Vector2): number {
  const closest = closestPointOnSegment(p, a, b);
  const dx = p.X - closest.X;
  const dy = p.Y - closest.Y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isPointInLine(line: LineSegment, point: Vector2): boolean {
  const lineVecX = line.End.X - line.Start.X;
  const lineVecY = line.End.Y - line.Start.Y;
  const lineLenSq = lineVecX * lineVecX + lineVecY * lineVecY;

  if (lineLenSq === 0) {
    const dx = line.Start.X - point.X;
    const dy = line.Start.Y - point.Y;
    const halfWidth = line.Width / 2;
    return dx * dx + dy * dy <= halfWidth * halfWidth;
  }

  const apX = point.X - line.Start.X;
  const apY = point.Y - line.Start.Y;
  const t = (apX * lineVecX + apY * lineVecY) / lineLenSq;
  const tClamped = Math.max(0, Math.min(1, t));

  const projX = line.Start.X + lineVecX * tClamped;
  const projY = line.Start.Y + lineVecY * tClamped;

  const dx = point.X - projX;
  const dy = point.Y - projY;
  const halfWidth = line.Width / 2;
  return dx * dx + dy * dy <= halfWidth * halfWidth;
}

export function isPointInCone(cone: Cone, point: Vector2): boolean {
  const distanceSquared =
    (cone.Origin.X - point.X) * (cone.Origin.X - point.X) +
    (cone.Origin.Y - point.Y) * (cone.Origin.Y - point.Y);

  if (distanceSquared > cone.Length * cone.Length) return false;

  const offsetX = point.X - cone.Origin.X;
  const offsetY = point.Y - cone.Origin.Y;

  if (offsetX === 0 && offsetY === 0) return true;

  const offsetLen = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
  const toPointX = offsetX / offsetLen;
  const toPointY = offsetY / offsetLen;

  const dirLen = Math.sqrt(cone.Direction.X * cone.Direction.X + cone.Direction.Y * cone.Direction.Y);
  if (dirLen === 0) return true;

  const dirX = cone.Direction.X / dirLen;
  const dirY = cone.Direction.Y / dirLen;

  const dot = dirX * toPointX + dirY * toPointY;
  const angleRadians = (cone.AngleDegrees / 2) * (Math.PI / 180);
  return dot >= Math.cos(angleRadians);
}

export interface SearchContext {
  GetNearbyEntities: (
    center: Vector2,
    radius: number
  ) => Array<{ entityId: EntityId; position: Vector2 }>;
}

export interface CircleSearchRequest {
  CasterId: EntityId;
  Circle: Circle;
  MaxTargets: number;
}

export interface ConeSearchRequest {
  CasterId: EntityId;
  Cone: Cone;
  MaxTargets: number;
}

export interface LineSearchRequest {
  CasterId: EntityId;
  Line: LineSegment;
  MaxTargets: number;
}

export function findTargetsInCircle(
  ctx: SearchContext,
  request: CircleSearchRequest
): EntityId[] {
  const nearby = ctx.GetNearbyEntities(request.Circle.Center, request.Circle.Radius);

  const targets = nearby
    .filter(
      (n) =>
        n.entityId !== request.CasterId && isPointInCircle(request.Circle, n.position)
    )
    .sort((a, b) => {
      const da =
        (a.position.X - request.Circle.Center.X) * (a.position.X - request.Circle.Center.X) +
        (a.position.Y - request.Circle.Center.Y) * (a.position.Y - request.Circle.Center.Y);
      const db =
        (b.position.X - request.Circle.Center.X) * (b.position.X - request.Circle.Center.X) +
        (b.position.Y - request.Circle.Center.Y) * (b.position.Y - request.Circle.Center.Y);
      return da - db;
    })
    .map((n) => n.entityId);

  if (request.MaxTargets >= targets.length) return targets;
  return targets.slice(0, request.MaxTargets);
}

export function findTargetsInCone(
  ctx: SearchContext,
  request: ConeSearchRequest
): EntityId[] {
  const nearby = ctx.GetNearbyEntities(request.Cone.Origin, request.Cone.Length);

  const targets = nearby
    .filter(
      (n) =>
        n.entityId !== request.CasterId && isPointInCone(request.Cone, n.position)
    )
    .sort((a, b) => {
      const da =
        (a.position.X - request.Cone.Origin.X) * (a.position.X - request.Cone.Origin.X) +
        (a.position.Y - request.Cone.Origin.Y) * (a.position.Y - request.Cone.Origin.Y);
      const db =
        (b.position.X - request.Cone.Origin.X) * (b.position.X - request.Cone.Origin.X) +
        (b.position.Y - request.Cone.Origin.Y) * (b.position.Y - request.Cone.Origin.Y);
      return da - db;
    })
    .map((n) => n.entityId);

  if (request.MaxTargets >= targets.length) return targets;
  return targets.slice(0, request.MaxTargets);
}

export function findTargetsInLine(
  ctx: SearchContext,
  request: LineSearchRequest
): EntityId[] {
  const length = Math.sqrt(
    (request.Line.End.X - request.Line.Start.X) * (request.Line.End.X - request.Line.Start.X) +
      (request.Line.End.Y - request.Line.Start.Y) * (request.Line.End.Y - request.Line.Start.Y)
  );

  const nearby = ctx.GetNearbyEntities(request.Line.Start, length + request.Line.Width);

  const targets = nearby
    .filter(
      (n) =>
        n.entityId !== request.CasterId && isPointInLine(request.Line, n.position)
    )
    .sort((a, b) => {
      const da =
        (a.position.X - request.Line.Start.X) * (a.position.X - request.Line.Start.X) +
        (a.position.Y - request.Line.Start.Y) * (a.position.Y - request.Line.Start.Y);
      const db =
        (b.position.X - request.Line.Start.X) * (b.position.X - request.Line.Start.X) +
        (b.position.Y - request.Line.Start.Y) * (b.position.Y - request.Line.Start.Y);
      return da - db;
    })
    .map((n) => n.entityId);

  if (request.MaxTargets >= targets.length) return targets;
  return targets.slice(0, request.MaxTargets);
}
