import type { Element, Stat, StatModifier, VisualManifest, Vector3 } from './core';
import type { EntityId } from '../types/branded';

export type VarId =
  | 'AP'
  | 'AC'
  | 'DX'
  | 'MP'
  | 'MA'
  | 'MD'
  | 'WT'
  | 'DA'
  | 'LK'
  | 'HP'
  | 'DP'
  | 'HV'
  | 'Fire'
  | 'FireRes'
  | 'Water'
  | 'WaterRes'
  | 'Earth'
  | 'EarthRes'
  | 'Air'
  | 'AirRes'
  | 'Lightning'
  | 'LightningRes'
  | 'Light'
  | 'LightRes'
  | 'Dark'
  | 'DarkRes'
  | { kind: 'Unknown'; value: string };

export type MathExpr =
  | { kind: 'Const'; value: number }
  | { kind: 'Var'; id: VarId }
  | { kind: 'Add'; left: MathExpr; right: MathExpr }
  | { kind: 'Sub'; left: MathExpr; right: MathExpr }
  | { kind: 'Mul'; left: MathExpr; right: MathExpr }
  | { kind: 'Div'; left: MathExpr; right: MathExpr }
  | { kind: 'Pow'; left: MathExpr; right: MathExpr }
  | { kind: 'Log'; expr: MathExpr }
  | { kind: 'Log10'; expr: MathExpr };

export type FormulaError =
  | { kind: 'InvalidToken'; token: string; pos: number }
  | { kind: 'UnexpectedToken'; expected: string; found: string; pos: number }
  | { kind: 'UnexpectedEndOfInput'; pos: number }
  | { kind: 'UnknownVariable'; name: string }
  | { kind: 'DivisionByZero' }
  | { kind: 'UnmatchedParentheses'; pos: number };

export class FormulaException extends Error {
  readonly error: FormulaError;

  constructor(error: FormulaError) {
    super(JSON.stringify(error));
    this.error = error;
    this.name = 'FormulaException';
  }
}

function classifyVar(token: string): VarId {
  switch (token.length) {
    case 2:
      switch (token) {
        case 'AP': return 'AP';
        case 'AC': return 'AC';
        case 'DX': return 'DX';
        case 'MP': return 'MP';
        case 'MA': return 'MA';
        case 'MD': return 'MD';
        case 'WT': return 'WT';
        case 'DA': return 'DA';
        case 'LK': return 'LK';
        case 'HP': return 'HP';
        case 'DP': return 'DP';
        case 'HV': return 'HV';
        default: return { kind: 'Unknown', value: token };
      }
    case 5:
      switch (token) {
        case 'FireA': return 'Fire';
        case 'FireR': return 'FireRes';
        case 'WaterA': return 'Water';
        case 'WaterR': return 'WaterRes';
        case 'EarthA': return 'Earth';
        case 'EarthR': return 'EarthRes';
        case 'LightA': return 'Light';
        case 'LightR': return 'LightRes';
        case 'DarkA': return 'Dark';
        case 'DarkR': return 'DarkRes';
        default: return { kind: 'Unknown', value: token };
      }
    case 4:
      switch (token) {
        case 'AirA': return 'Air';
        case 'AirR': return 'AirRes';
        default: return { kind: 'Unknown', value: token };
      }
    case 10:
      switch (token) {
        case 'LightningA': return 'Lightning';
        case 'LightningR': return 'LightningRes';
        default: return { kind: 'Unknown', value: token };
      }
    default:
      return { kind: 'Unknown', value: token };
  }
}

function isOperator(c: string): boolean {
  return c === '(' || c === ')' || c === '+' || c === '-' || c === '*' || c === '/' || c === '^';
}

function skipWhitespace(formula: string, i: { value: number }): void {
  while (i.value < formula.length && /\s/.test(formula[i.value])) {
    i.value++;
  }
}

function peek(formula: string, i: { value: number }): string {
  skipWhitespace(formula, i);
  if (i.value >= formula.length) return '';

  const c = formula[i.value];
  const startIndex = i.value;
  let endIndex = i.value + 1;

  if (isOperator(c)) {
    // Operator is a single char
  } else if (/[a-zA-Z]/.test(c)) {
    while (endIndex < formula.length && /[a-zA-Z0-9]/.test(formula[endIndex])) {
      endIndex++;
    }
  } else if (/[0-9.]/.test(c)) {
    while (endIndex < formula.length && (/[0-9.]/.test(formula[endIndex]))) {
      endIndex++;
    }
  } else {
    throw new FormulaException({ kind: 'InvalidToken', token: c, pos: i.value });
  }

  return formula.slice(startIndex, endIndex);
}

function next(formula: string, i: { value: number }): string {
  const token = peek(formula, i);
  if (token !== '') {
    i.value += token.length;
  }
  return token;
}

function consume(formula: string, i: { value: number }): void {
  const token = peek(formula, i);
  if (token !== '') {
    i.value += token.length;
  }
}

function parseExpr(formula: string, i: { value: number }): MathExpr {
  let left = parseTerm(formula, i);

  while (true) {
    const nextToken = peek(formula, i);
    if (nextToken === '+') {
      consume(formula, i);
      const right = parseTerm(formula, i);
      left = { kind: 'Add', left, right };
    } else if (nextToken === '-') {
      consume(formula, i);
      const right = parseTerm(formula, i);
      left = { kind: 'Sub', left, right };
    } else {
      break;
    }
  }

  return left;
}

function parseTerm(formula: string, i: { value: number }): MathExpr {
  let left = parsePower(formula, i);

  while (true) {
    const nextToken = peek(formula, i);
    if (nextToken === '*') {
      consume(formula, i);
      const right = parsePower(formula, i);
      left = { kind: 'Mul', left, right };
    } else if (nextToken === '/') {
      consume(formula, i);
      const right = parsePower(formula, i);
      left = { kind: 'Div', left, right };
    } else {
      break;
    }
  }

  return left;
}

function parsePower(formula: string, i: { value: number }): MathExpr {
  const left = parseFactor(formula, i);
  const nextToken = peek(formula, i);

  if (nextToken === '^') {
    consume(formula, i);
    const right = parsePower(formula, i); // Right-associative
    return { kind: 'Pow', left, right };
  }

  return left;
}

function parseFactor(formula: string, i: { value: number }): MathExpr {
  const startPos = i.value;
  const token = next(formula, i);

  if (token === '') {
    throw new FormulaException({ kind: 'UnexpectedEndOfInput', pos: startPos });
  }

  const firstChar = token[0];

  if (/[0-9.]/.test(firstChar)) {
    const value = parseFloat(token);
    if (Number.isNaN(value)) {
      throw new FormulaException({ kind: 'InvalidToken', token, pos: startPos });
    }
    return { kind: 'Const', value };
  } else if (/[a-zA-Z]/.test(firstChar)) {
    if (token.toLowerCase() === 'log') {
      return parseFunction('log', formula, i);
    } else if (token.toLowerCase() === 'log10') {
      return parseFunction('log10', formula, i);
    } else {
      return { kind: 'Var', id: classifyVar(token) };
    }
  } else if (firstChar === '(') {
    const expr = parseExpr(formula, i);
    const closingParenPos = i.value;
    const closingToken = next(formula, i);
    if (closingToken !== ')') {
      throw new FormulaException({
        kind: 'UnexpectedToken',
        expected: ')',
        found: closingToken || 'end of input',
        pos: closingParenPos,
      });
    }
    return expr;
  } else {
    throw new FormulaException({ kind: 'InvalidToken', token, pos: startPos });
  }
}

function parseFunction(
  name: 'log' | 'log10',
  formula: string,
  i: { value: number }
): MathExpr {
  const startPos = i.value;
  const openParen = next(formula, i);

  if (openParen !== '(') {
    throw new FormulaException({
      kind: 'UnexpectedToken',
      expected: '(',
      found: openParen || 'end of input',
      pos: startPos,
    });
  }

  const expr = parseExpr(formula, i);
  const closeParen = next(formula, i);

  if (closeParen !== ')') {
    throw new FormulaException({
      kind: 'UnexpectedToken',
      expected: ')',
      found: closeParen || 'end of input',
      pos: startPos,
    });
  }

  return name === 'log'
    ? { kind: 'Log', expr }
    : { kind: 'Log10', expr };
}

export function parseFormula(formula: string): MathExpr {
  const trimmed = formula.trim();
  if (trimmed.length === 0) {
    throw new FormulaException({ kind: 'UnexpectedEndOfInput', pos: 0 });
  }

  const normalized = trimmed[0] === '-' ? '0' + trimmed : trimmed;
  const i = { value: 0 };
  const expr = parseExpr(normalized, i);
  skipWhitespace(normalized, i);

  if (i.value < normalized.length) {
    throw new FormulaException({
      kind: 'UnexpectedToken',
      expected: 'end of input',
      found: normalized.slice(i.value),
      pos: i.value,
    });
  }

  return expr;
}

export type EffectKind =
  | 'Buff'
  | 'Debuff'
  | 'DamageOverTime'
  | 'ResourceOverTime'
  | 'Stun'
  | 'Silence'
  | 'Taunt';

export type StackingRule =
  | { kind: 'NoStack' }
  | { kind: 'RefreshDuration' }
  | { kind: 'AddStack'; maxStacks: number };

export type Duration =
  | { kind: 'Instant' }
  | { kind: 'Timed'; seconds: number }
  | { kind: 'Loop'; interval: number; duration: number }
  | { kind: 'PermanentLoop'; interval: number }
  | { kind: 'Permanent' };

export type DamageSource = 'Physical' | 'Magical';

export type ResourceType = 'HP' | 'MP';

export type EffectModifier =
  | { kind: 'StaticMod'; modifier: StatModifier }
  | { kind: 'DynamicMod'; expression: MathExpr; target: Stat }
  | { kind: 'AbilityDamageMod'; abilityDamageValue: MathExpr; element: Element | undefined }
  | { kind: 'ResourceChange'; resource: ResourceType; amount: MathExpr };

export interface Effect {
  Name: string;
  Kind: EffectKind;
  DamageSource: DamageSource;
  Stacking: StackingRule;
  Duration: Duration;
  Visuals: VisualManifest;
  Modifiers: EffectModifier[];
}

export interface ActiveEffect {
  Id: string; // EffectId
  SourceEffect: Effect;
  SourceEntity: EntityId; // EntityId
  TargetEntity: EntityId; // EntityId
  StartTime: number; // seconds
  StackCount: number;
}

export type { Element, StatModifier } from './core';

export type SkillIntent = 'Offensive' | 'Supportive';

export interface ResourceCost {
  ResourceType: ResourceType;
  Amount: number | undefined;
}

export type GroundAreaKind =
  | { kind: 'Circle'; radius: number }
  | { kind: 'Square'; sideLength: number }
  | { kind: 'Cone'; angle: number; length: number }
  | { kind: 'Rectangle'; width: number; length: number };

export type Targeting =
  | 'Self'
  | 'TargetEntity'
  | 'TargetPosition'
  | 'TargetDirection';

export type SkillArea =
  | { kind: 'Point' }
  | { kind: 'Circle'; radius: number; maxTargets: number }
  | { kind: 'Cone'; angle: number; length: number; maxTargets: number }
  | { kind: 'Line'; width: number; length: number; maxTargets: number }
  | { kind: 'MultiPoint'; radius: number; count: number }
  | { kind: 'AdaptiveCone'; length: number; maxTargets: number };

export type CastOrigin =
  | { kind: 'Caster' }
  | { kind: 'CasterOffset'; x: number; y: number }
  | { kind: 'TargetOffset'; x: number; y: number };

export interface ChargeConfig {
  Duration: number;
  ChargeVisuals: VisualManifest;
  Orbitals: OrbitalConfig | undefined;
}

export interface OrbitalConfig {
  Count: number;
  Radius: number;
  CenterOffset: Vector3;
  RotationAxis: Vector3;
  PathScale: { X: number; Y: number };
  StartSpeed: number;
  EndSpeed: number;
  Duration: number;
  Visual: VisualManifest;
}

export type Delivery =
  | { kind: 'Instant' }
  | { kind: 'Projectile'; projectile: ProjectileInfo };

export interface ElementFormula {
  Element: Element;
  Formula: MathExpr;
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

export interface PassiveSkill {
  Id: number; // SkillId
  Name: string;
  Description: string;
  Effects: Effect[];
}

export interface ActiveSkill {
  Id: number; // SkillId
  Name: string;
  Description: string;
  Intent: SkillIntent;
  DamageSource: DamageSource;
  Cost: ResourceCost | undefined;
  Cooldown: number | undefined; // seconds
  CastingTime: number | undefined; // seconds
  Targeting: Targeting;
  Range: number | undefined;
  Delivery: Delivery;
  Area: SkillArea;
  ChargePhase: ChargeConfig | undefined;
  Formula: MathExpr | undefined;
  ElementFormula: ElementFormula | undefined;
  Effects: Effect[];
  Origin: CastOrigin;
  CastVisuals: VisualManifest;
  ImpactVisuals: VisualManifest;
}

export type Skill =
  | { kind: 'Passive'; passive: PassiveSkill }
  | { kind: 'Active'; active: ActiveSkill };
