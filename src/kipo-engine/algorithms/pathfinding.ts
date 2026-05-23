import type { Vector2 } from '../domain/core';

export interface GridCell {
  X: number;
  Y: number;
}

export interface NavGrid2D {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly blocked: ReadonlySet<string>;
}

function cellKey(cell: GridCell): string {
  return `${cell.X},${cell.Y}`;
}

export function createNavGrid2D(cellSize: number, width: number, height: number): NavGrid2D {
  return { cellSize, width, height, blocked: new Set() };
}

function worldToCell(grid: NavGrid2D, pos: Vector2): GridCell {
  return {
    X: Math.floor(pos.X / grid.cellSize),
    Y: Math.floor(pos.Y / grid.cellSize),
  };
}

function cellToWorld(grid: NavGrid2D, cell: GridCell): Vector2 {
  return {
    X: (cell.X + 0.5) * grid.cellSize,
    Y: (cell.Y + 0.5) * grid.cellSize,
  };
}

function isWalkable(grid: NavGrid2D, cell: GridCell): boolean {
  return cell.X >= 0 && cell.X < grid.width
    && cell.Y >= 0 && cell.Y < grid.height
    && !grid.blocked.has(cellKey(cell));
}

const cardinalDirs: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const diagonalDirs: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function getNeighbors(grid: NavGrid2D, cell: GridCell): GridCell[] {
  const results: GridCell[] = [];

  for (const [dx, dy] of cardinalDirs) {
    const n = { X: cell.X + dx, Y: cell.Y + dy };
    if (isWalkable(grid, n)) results.push(n);
  }

  for (const [dx, dy] of diagonalDirs) {
    const n = { X: cell.X + dx, Y: cell.Y + dy };
    const adjX = { X: cell.X + dx, Y: cell.Y };
    const adjY = { X: cell.X, Y: cell.Y + dy };
    if (isWalkable(grid, adjX) && isWalkable(grid, adjY) && isWalkable(grid, n)) {
      results.push(n);
    }
  }

  return results;
}

function heuristic(a: GridCell, b: GridCell): number {
  const dx = a.X - b.X;
  const dy = a.Y - b.Y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function hasLineOfSight(grid: NavGrid2D, start: Vector2, end: Vector2): boolean {
  const dx = end.X - start.X;
  const dy = end.Y - start.Y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(dist / (grid.cellSize * 0.5));
  if (steps <= 0) return true;

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = start.X + dx * t;
    const y = start.Y + dy * t;
    const cell = worldToCell(grid, { X: x, Y: y });
    if (!isWalkable(grid, cell)) return false;
  }

  return true;
}

function smoothPath(grid: NavGrid2D, path: Vector2[]): Vector2[] {
  if (path.length <= 2) return path;

  const result: Vector2[] = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    let farthest = current + 1;
    for (let i = current + 2; i < path.length; i++) {
      if (hasLineOfSight(grid, path[current], path[i])) {
        farthest = i;
      }
    }
    result.push(path[farthest]);
    current = farthest;
  }

  return result;
}

export function findPath2D(
  grid: NavGrid2D,
  startPos: Vector2,
  endPos: Vector2,
): Vector2[] | undefined {
  const startCell = worldToCell(grid, startPos);
  const endCell = worldToCell(grid, endPos);

  if (!isWalkable(grid, startCell) || !isWalkable(grid, endCell)) return undefined;

  const openSet = new Map<string, { cell: GridCell; f: number }>();
  const cameFrom = new Map<string, GridCell>();
  const gScore = new Map<string, number>();

  const startKey = cellKey(startCell);
  gScore.set(startKey, 0);
  openSet.set(startKey, { cell: startCell, f: heuristic(startCell, endCell) });

  let found = false;
  let current = startCell;

  while (openSet.size > 0 && !found) {
    let bestKey = '';
    let bestF = Infinity;
    for (const [key, entry] of openSet) {
      if (entry.f < bestF) {
        bestF = entry.f;
        bestKey = key;
      }
    }
    const entry = openSet.get(bestKey)!;
    openSet.delete(bestKey);
    current = entry.cell;

    if (current.X === endCell.X && current.Y === endCell.Y) {
      found = true;
    } else {
      for (const neighbor of getNeighbors(grid, current)) {
        const tentativeG = (gScore.get(cellKey(current)) ?? Infinity) + heuristic(current, neighbor);
        const neighborKey = cellKey(neighbor);
        if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const fScore = tentativeG + heuristic(neighbor, endCell);
          openSet.set(neighborKey, { cell: neighbor, f: fScore });
        }
      }
    }
  }

  if (!found) return undefined;

  const path: Vector2[] = [];
  let node = endCell;
  while (cameFrom.has(cellKey(node))) {
    path.push(cellToWorld(grid, node));
    node = cameFrom.get(cellKey(node))!;
  }
  path.reverse();

  if (path.length === 0) return undefined;

  return smoothPath(grid, path);
}
