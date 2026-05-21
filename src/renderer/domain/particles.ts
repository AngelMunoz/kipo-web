// ─── Domain types matching the original F# Particles module ───

export type BlendMode = 'Additive' | 'AlphaBlend';
export type SimulationSpace = 'World' | 'Local';
export type EmissionMode = 'Uniform' | 'Outward' | 'Inward' | 'EdgeOnly';

export interface Vector3 {
  X: number;
  Y: number;
  Z: number;
}

export interface ParticleConfig {
  Lifetime: [number, number];
  Speed: [number, number];
  SizeStart: number;
  SizeEnd: number;
  ColorStart: string; // #RRGGBBAA hex
  ColorEnd: string;
  Gravity: number;
  Drag: number;
  RandomVelocity: Vector3;
}

export interface EmitterConfig {
  Texture: string | undefined;
  BlendMode: BlendMode;
  SimulationSpace: SimulationSpace;
  Rate: number;
  Burst: number;
  Shape: 'Point' | 'Sphere' | 'Cone' | 'Line';
  Radius: number;
  Angle: number;
  LocalOffset: Vector3;
  EmissionRotation: Vector3;
  EmissionMode: EmissionMode;
  Particle: ParticleConfig;
  FloorHeight: number;
}

// Runtime particle (data-oriented, flat arrays would be faster but Maps are fine for now)
export interface Particle {
  Position: Vector3;
  Velocity: Vector3;
  Size: number;
  Color: string;
  Life: number;
  MaxLife: number;
}

export interface VisualEmitter {
  Config: EmitterConfig;
  Particles: Particle[];
  Accumulator: number;
  BurstDone: boolean;
}

export interface VisualEffect {
  Id: string;
  Emitters: VisualEmitter[];
  Position: Vector3;
  Rotation: number; // Yaw angle in radians (2D simplification)
  IsAlive: boolean;
  OwnerEntityId: string | undefined;
}

// ─── Color helpers ───

export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

export function lerpColor(start: string, end: string, t: number): string {
  const s = hexToRgba(start);
  const e = hexToRgba(end);
  const r = Math.round((s.r + (e.r - s.r) * t) * 255);
  const g = Math.round((s.g + (e.g - s.g) * t) * 255);
  const b = Math.round((s.b + (e.b - s.b) * t) * 255);
  const a = Math.round((s.a + (e.a - s.a) * t) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${a.toString(16).padStart(2, '0')}`;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
