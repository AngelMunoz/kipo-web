/**
 * Orbital mechanics for charged skills.
 * Ported from F#: Pomo.Core.Domain.Orbital
 */

import type { Vector3, Vector2 } from './core';

export interface OrbitalConfig {
  Count: number;
  Radius: number;
  CenterOffset: Vector3;
  RotationAxis: Vector3;
  PathScale: { X: number; Y: number };
  StartSpeed: number;
  EndSpeed: number;
  Duration: number;
}

/**
 * Calculate the position of an orbital at a given time.
 * Ported from F#: Orbital.calculatePosition
 *
 * @param config - Orbital configuration
 * @param elapsed - Time elapsed since charge started (seconds)
 * @param index - Index of this orbital (0 to Count-1)
 * @returns Local offset from center (before applying center offset and rotation)
 */
export function calculateOrbitalPosition(
  config: OrbitalConfig,
  elapsed: number,
  index: number
): Vector3 {
  // Acceleration = (endSpeed - startSpeed) / duration (F# Orbital.fs:27)
  const accel = (config.EndSpeed - config.StartSpeed) / config.Duration;

  // Angle = startSpeed * t + 0.5 * accel * t^2 (F# Orbital.fs:28)
  const angle = config.StartSpeed * elapsed + 0.5 * accel * elapsed * elapsed;

  // Each orbital is evenly spaced around the circle (F# Orbital.fs:30)
  const indexOffset = (Math.PI * 2 / config.Count) * index;
  const totalAngle = angle + indexOffset;

  // Calculate position on ellipse (PathScale allows non-circular orbits) (F# Orbital.fs:32-33)
  const x = Math.cos(totalAngle) * config.Radius * config.PathScale.X;
  const z = Math.sin(totalAngle) * config.Radius * config.PathScale.Y;

  let localPos: Vector3 = { X: x, Y: 0, Z: z };

  // Apply rotation axis tilt (F# Orbital.fs:36-52)
  const rotation = calculateRotationFromAxis(config.RotationAxis);
  if (rotation) {
    localPos = rotateVector3(localPos, rotation);
  }

  return localPos;
}

/**
 * Calculate rotation quaternion from rotation axis.
 * Ported from F#: Orbital.calculatePosition rotation logic
 */
function calculateRotationFromAxis(axis: Vector3): Quaternion | null {
  // If axis is Up (0,1,0), no rotation needed
  if (Math.abs(axis.Y - 1) < 0.001 && Math.abs(axis.X) < 0.001 && Math.abs(axis.Z) < 0.001) {
    return null;
  }

  // Cross product of Up × axis
  const crossX = 0 * axis.Z - 1 * axis.Y; // Up × axis
  const crossY = 1 * axis.X - 0 * axis.Z;
  const crossZ = 0 * axis.Y - 0 * axis.X;

  const crossLenSq = crossX * crossX + crossY * crossY + crossZ * crossZ;

  if (crossLenSq < 0.001) {
    // Axis is parallel to Up (or anti-parallel)
    if (axis.Y < 0) {
      // Anti-parallel: rotate 180° around X
      return createQuaternionFromAxisAngle({ X: 1, Y: 0, Z: 0 }, Math.PI);
    }
    return null; // Identity
  }

  // Angle between Up and axis
  const dot = axis.Y; // Dot(Up, axis) = axis.Y
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Normalize cross product
  const crossLen = Math.sqrt(crossLenSq);
  const axisNorm: Vector3 = {
    X: crossX / crossLen,
    Y: crossY / crossLen,
    Z: crossZ / crossLen,
  };

  return createQuaternionFromAxisAngle(axisNorm, angle);
}

// Quaternion type (simple representation)
interface Quaternion {
  X: number;
  Y: number;
  Z: number;
  W: number;
}

function createQuaternionFromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return {
    X: axis.X * s,
    Y: axis.Y * s,
    Z: axis.Z * s,
    W: Math.cos(halfAngle),
  };
}

function rotateVector3(v: Vector3, q: Quaternion): Vector3 {
  // Quaternion rotation: q * v * q^-1
  // Simplified for unit quaternion
  const qx = q.X, qy = q.Y, qz = q.Z, qw = q.W;
  const vx = v.X, vy = v.Y, vz = v.Z;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v + w*t + cross(q.xyz, t)
  return {
    X: vx + qw * tx + (qy * tz - qz * ty),
    Y: vy + qw * ty + (qz * tx - qx * tz),
    Z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * Calculate world position for an orbital.
 * Combines center position, center offset, and local orbital position.
 */
export function calculateWorldPosition(
  centerPos: Vector3,
  config: OrbitalConfig,
  elapsed: number,
  index: number,
  facingRotation: number = 0 // Yaw angle in radians
): Vector3 {
  const localOffset = calculateOrbitalPosition(config, elapsed, index);

  // Create facing quaternion from yaw
  const facingQuat = createQuaternionFromAxisAngle(
    { X: 0, Y: 1, Z: 0 },
    facingRotation
  );

  // Rotate center offset by facing
  const rotatedCenterOffset = rotateVector3(config.CenterOffset, facingQuat);

  // Rotate local offset by facing
  const rotatedLocalOffset = rotateVector3(localOffset, facingQuat);

  // World position = center + rotatedCenterOffset + rotatedLocalOffset
  return {
    X: centerPos.X + rotatedCenterOffset.X + rotatedLocalOffset.X,
    Y: centerPos.Y + rotatedCenterOffset.Y + rotatedLocalOffset.Y,
    Z: centerPos.Z + rotatedCenterOffset.Z + rotatedLocalOffset.Z,
  };
}
