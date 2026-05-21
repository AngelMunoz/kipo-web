import type { EmitterConfig, Vector3, BlendMode, SimulationSpace, EmissionMode } from '../domain/particles';

export interface ParticleStore {
  tryFind(vfxId: string): EmitterConfig[] | undefined;
  all(): string[];
}

export async function loadParticleStore(basePath: string): Promise<ParticleStore> {
  const response = await fetch(`${basePath}/Particles.json`);
  // SAFETY: JSON is loaded from our own content files with a known schema.
  const raw: unknown = await response.json();
  const parsed = raw as Record<string, RawParticleEffect[]>;

  const map = new Map<string, EmitterConfig[]>();

  for (const [vfxId, emitters] of Object.entries(parsed)) {
    map.set(vfxId, emitters.map(parseEmitter));
  }

  return {
    tryFind(vfxId: string): EmitterConfig[] | undefined {
      return map.get(vfxId);
    },
    all(): string[] {
      return Array.from(map.keys());
    },
  };
}

// ─── Raw JSON → Typed EmitterConfig ───

interface RawParticleEffect {
  Texture?: string;
  RenderMode?: 'Mesh';
  Model?: string;
  BlendMode?: string;
  SimulationSpace?: string;
  Rate?: number;
  Burst?: number;
  Shape?: string;
  Angle?: number;
  Radius?: number;
  LocalOffset?: { X?: number; Y?: number; Z?: number };
  EmissionRotation?: { X?: number; Y?: number; Z?: number };
  EmissionMode?: string;
  FloorHeight?: number;
  Particle: RawParticleConfig;
}

interface RawParticleConfig {
  Lifetime: [number, number];
  Speed: [number, number];
  SizeStart: number;
  SizeEnd: number;
  ColorStart: string;
  ColorEnd: string;
  Gravity?: number;
  Drag?: number;
  RandomVelocity?: { X?: number; Y?: number; Z?: number };
}

function parseVec3(raw: { X?: number; Y?: number; Z?: number } | undefined): Vector3 {
  return { X: raw?.X ?? 0, Y: raw?.Y ?? 0, Z: raw?.Z ?? 0 };
}

function parseBlendMode(raw: string | undefined): BlendMode {
  return raw === 'AlphaBlend' ? 'AlphaBlend' : 'Additive';
}

function parseSimSpace(raw: string | undefined): SimulationSpace {
  return raw === 'World' ? 'World' : 'Local';
}

function parseEmissionMode(raw: string | undefined): EmissionMode {
  switch (raw) {
    case 'Outward': return 'Outward';
    case 'Inward': return 'Inward';
    case 'EdgeOnly': return 'EdgeOnly';
    default: return 'Uniform';
  }
}

function parseShape(raw: string | undefined): EmitterConfig['Shape'] {
  switch (raw) {
    case 'Cone': return 'Cone';
    case 'Sphere': return 'Sphere';
    case 'Line': return 'Line';
    default: return 'Point';
  }
}

function parseEmitter(raw: RawParticleEffect): EmitterConfig {
  return {
    Texture: raw.RenderMode === 'Mesh' ? undefined : raw.Texture,
    BlendMode: parseBlendMode(raw.BlendMode),
    SimulationSpace: parseSimSpace(raw.SimulationSpace),
    Rate: raw.Rate ?? 0,
    Burst: raw.Burst ?? 0,
    Shape: parseShape(raw.Shape),
    Radius: raw.Radius ?? 0.5,
    Angle: raw.Angle ?? 45,
    LocalOffset: parseVec3(raw.LocalOffset),
    EmissionRotation: parseVec3(raw.EmissionRotation),
    EmissionMode: parseEmissionMode(raw.EmissionMode),
    FloorHeight: raw.FloorHeight ?? 0,
    Particle: {
      Lifetime: raw.Particle.Lifetime,
      Speed: raw.Particle.Speed,
      SizeStart: raw.Particle.SizeStart,
      SizeEnd: raw.Particle.SizeEnd,
      ColorStart: raw.Particle.ColorStart,
      ColorEnd: raw.Particle.ColorEnd,
      Gravity: raw.Particle.Gravity ?? 0,
      Drag: raw.Particle.Drag ?? 0,
      RandomVelocity: parseVec3(raw.Particle.RandomVelocity),
    },
  };
}
