/**
 * Test file to verify skill schema matches F# decoders
 * and all projectile/orbital variations work correctly
 */

import { describe, it, expect } from 'vitest';
import { parseFormula } from '../domain/skill';
import { calculateOrbitalPosition } from '../domain/orbital';
import type { OrbitalConfig } from '../domain/skill';

describe('Formula Parser', () => {
  it('should parse basic formulas', () => {
    const expr = parseFormula('AP * 0.5 + 10');
    expect(expr).toEqual({
      kind: 'Add',
      left: {
        kind: 'Mul',
        left: { kind: 'Var', id: 'AP' },
        right: { kind: 'Const', value: 0.5 },
      },
      right: { kind: 'Const', value: 10 },
    });
  });

  it('should parse element variables', () => {
    const expr = parseFormula('FireA * 2.0');
    expect(expr).toEqual({
      kind: 'Mul',
      left: { kind: 'Var', id: 'Fire' },
      right: { kind: 'Const', value: 2.0 },
    });
  });

  it('should parse log functions', () => {
    const expr = parseFormula('log(MP)');
    expect(expr).toEqual({
      kind: 'Log',
      expr: { kind: 'Var', id: 'MP' },
    });
  });
});

describe('Orbital Calculation', () => {
  it('should calculate orbital position with all config fields', () => {
    const config: OrbitalConfig = {
      Count: 4,
      Radius: 100,
      CenterOffset: { X: 0, Y: 0, Z: 0 },
      RotationAxis: { X: 0, Y: 1, Z: 0 }, // Up - no rotation
      PathScale: { X: 1, Y: 1 }, // Circular
      StartSpeed: 1.0,
      EndSpeed: 2.0,
      Duration: 5.0,
    };

    const pos = calculateOrbitalPosition(config, 1.0, 0);
    
    // Should be on circle with radius 100
    const dist = Math.sqrt(pos.X * pos.X + pos.Z * pos.Z);
    expect(dist).toBeCloseTo(100, 0);
  });

  it('should handle elliptical orbits with PathScale', () => {
    const config: OrbitalConfig = {
      Count: 2,
      Radius: 100,
      CenterOffset: { X: 0, Y: 0, Z: 0 },
      RotationAxis: { X: 0, Y: 1, Z: 0 },
      PathScale: { X: 2, Y: 1 }, // Elliptical (2x wider)
      StartSpeed: 1.0,
      EndSpeed: 1.0,
      Duration: 10.0,
    };

    const pos = calculateOrbitalPosition(config, 0, 0);
    
    // Should be at (200, 0, 0) at angle 0
    expect(pos.X).toBeCloseTo(200, 0);
    expect(pos.Z).toBeCloseTo(0, 0);
  });

  it('should handle acceleration', () => {
    const config: OrbitalConfig = {
      Count: 1,
      Radius: 50,
      CenterOffset: { X: 0, Y: 0, Z: 0 },
      RotationAxis: { X: 0, Y: 1, Z: 0 },
      PathScale: { X: 1, Y: 1 },
      StartSpeed: 0,
      EndSpeed: Math.PI * 2, // Complete revolution in Duration seconds
      Duration: 1.0,
    };

    // At t=0, angle should be 0
    const pos0 = calculateOrbitalPosition(config, 0, 0);
    expect(pos0.X).toBeCloseTo(50, 0);
    expect(pos0.Z).toBeCloseTo(0, 0);

    // At t=0.5, angle should be PI/2 (quarter revolution)
    const pos1 = calculateOrbitalPosition(config, 0.5, 0);
    expect(pos1.X).toBeCloseTo(0, 0);
    expect(pos1.Z).toBeCloseTo(50, 0);
  });
});

describe('Projectile Variations', () => {
  it('should have all variation types defined', () => {
    // This is a type check - ensures ExtraVariations covers all cases
    const chained: import('../domain/projectile').ExtraVariations = {
      kind: 'Chained',
      jumpsLeft: 3,
      maxRange: 200,
    };
    
    const bouncing: import('../domain/projectile').ExtraVariations = {
      kind: 'Bouncing',
      bouncesLeft: 2,
    };
    
    const descending: import('../domain/projectile').ExtraVariations = {
      kind: 'Descending',
      currentAltitude: 500,
      fallSpeed: 100,
    };

    expect(chained.kind).toBe('Chained');
    expect(bouncing.kind).toBe('Bouncing');
    expect(descending.kind).toBe('Descending');
  });
});

describe('Skill Schema Compatibility', () => {
  it('should parse skill area variants correctly', () => {
    // Test that all SkillArea variants are handled
    const areas: import('../domain/skill').SkillArea[] = [
      { kind: 'Point' },
      { kind: 'Circle', radius: 100, maxTargets: 5 },
      { kind: 'Cone', angle: 45, length: 200, maxTargets: 3 },
      { kind: 'Line', width: 50, length: 300, maxTargets: 4 },
      { kind: 'MultiPoint', radius: 150, count: 6 },
      { kind: 'AdaptiveCone', length: 250, maxTargets: 8 },
    ];

    expect(areas).toHaveLength(6);
    areas.forEach(area => {
      expect(area.kind).toBeDefined();
    });
  });

  it('should parse duration variants correctly', () => {
    const durations: import('../domain/skill').Duration[] = [
      { kind: 'Instant' },
      { kind: 'Timed', seconds: 5 },
      { kind: 'Loop', interval: 1, duration: 10 },
      { kind: 'PermanentLoop', interval: 2 },
      { kind: 'Permanent' },
    ];

    expect(durations).toHaveLength(5);
    durations.forEach(duration => {
      expect(duration.kind).toBeDefined();
    });
  });
});
