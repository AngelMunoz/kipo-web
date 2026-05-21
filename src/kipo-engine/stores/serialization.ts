import { z } from 'zod';
import type { Element } from '../domain/core';
import type { Slot } from '../domain/item';
import type { Skill, Effect, EffectModifier, MathExpr, ProjectileInfo, OrbitalConfig, ChargeConfig, CastOrigin, SkillArea, Delivery, Targeting, ResourceCost, Duration, StackingRule, EffectKind, DamageSource, CollisionMode, ExtraVariations } from '../domain/skill';
import type { AIArchetype, AIEntityDefinition, AIFamilyConfig, BehaviorType, CuePriority, DecisionTree, BehaviorNode, ConditionKind, ActionKind, MovementType, PerceptionConfig } from '../domain/ai';
import type { ItemDefinition, ItemKind } from '../domain/item';
import { parseFormula } from '../domain/skill';
import { brandItemId, brandSkillId, brandAiArchetypeId } from '../types/branded';

// --- Core helpers ---

const ElementSchema = z.enum(['Fire', 'Water', 'Earth', 'Air', 'Lightning', 'Light', 'Dark', 'Neutral']);

const SlotSchema = z.enum(['Head', 'Chest', 'Legs', 'Feet', 'Hands', 'Weapon', 'Shield', 'Accessory']) as z.ZodType<Slot>;

function parseElement(s: string): Element {
  switch (s) {
    case 'Fire': return 'Fire';
    case 'Water': return 'Water';
    case 'Earth': return 'Earth';
    case 'Air': return 'Air';
    case 'Lightning': return 'Lightning';
    case 'Light': return 'Light';
    case 'Dark': return 'Dark';
    case 'Neutral': return 'Neutral';
    default: throw new Error(`Unknown element: ${s}`);
  }
}

const StatSchema = z.string().transform((s): import('../domain/core').Stat => {
  if (s === 'AP') return { kind: 'AP' };
  if (s === 'AC') return { kind: 'AC' };
  if (s === 'DX') return { kind: 'DX' };
  if (s === 'MP') return { kind: 'MP' };
  if (s === 'MA') return { kind: 'MA' };
  if (s === 'MD') return { kind: 'MD' };
  if (s === 'WT') return { kind: 'WT' };
  if (s === 'DA') return { kind: 'DA' };
  if (s === 'LK') return { kind: 'LK' };
  if (s === 'HP') return { kind: 'HP' };
  if (s === 'DP') return { kind: 'DP' };
  if (s === 'HV') return { kind: 'HV' };
  if (s === 'MS') return { kind: 'MS' };
  if (s === 'HPRegen') return { kind: 'HPRegen' };
  if (s === 'MPRegen') return { kind: 'MPRegen' };
  if (s.startsWith('ElementRes:')) {
    return { kind: 'ElementResistance', element: parseElement(s.slice('ElementRes:'.length)) };
  }
  if (s.startsWith('ElementAttr:')) {
    return { kind: 'ElementAttribute', element: parseElement(s.slice('ElementAttr:'.length)) };
  }
  throw new Error(`Unknown stat: ${s}`);
});

const StatModifierSchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('Additive'), Stat: StatSchema, Value: z.number() }),
  z.object({ Type: z.literal('Multiplicative'), Stat: StatSchema, Value: z.number() }),
]).transform((raw): import('../domain/core').StatModifier => {
  if (raw.Type === 'Additive') return { kind: 'Additive', stat: raw.Stat, value: raw.Value };
  return { kind: 'Multiplicative', stat: raw.Stat, value: raw.Value };
});

const FormulaSchema = z.string().transform((s): MathExpr => parseFormula(s));

const VisualManifestSchema = z.object({
  Model: z.string().optional(),
  Vfx: z.string().optional(),
  Animation: z.string().optional(),
  Attachment: z.string().optional(),
}).transform((raw): import('../domain/core').VisualManifest => ({
  ModelId: raw.Model,
  VfxId: raw.Vfx,
  AnimationId: raw.Animation,
  AttachmentPoint: raw.Attachment,
}));

// --- Skill Schemas ---

const EffectKindSchema = z.enum(['Buff', 'Debuff', 'DamageOverTime', 'ResourceOverTime', 'Stun', 'Silence', 'Taunt']) as z.ZodType<EffectKind>;

const StackingRuleSchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('NoStack') }),
  z.object({ Type: z.literal('RefreshDuration') }),
  z.object({ Type: z.literal('AddStack'), StackCount: z.number().int() }),
]).transform((raw): StackingRule => {
  if (raw.Type === 'NoStack') return { kind: 'NoStack' };
  if (raw.Type === 'RefreshDuration') return { kind: 'RefreshDuration' };
  return { kind: 'AddStack', maxStacks: raw.StackCount };
});

const DurationSchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('Instant') }),
  z.object({ Type: z.literal('Timed'), Seconds: z.number() }),
  z.object({ Type: z.literal('Loop'), Interval: z.number(), Duration: z.number() }),
  z.object({ Type: z.literal('PermanentLoop'), Interval: z.number() }),
  z.object({ Type: z.literal('Permanent') }),
]).transform((raw): Duration => {
  switch (raw.Type) {
    case 'Instant': return { kind: 'Instant' };
    case 'Timed': return { kind: 'Timed', seconds: raw.Seconds };
    case 'Loop': return { kind: 'Loop', interval: raw.Interval, duration: raw.Duration };
    case 'PermanentLoop': return { kind: 'PermanentLoop', interval: raw.Interval };
    case 'Permanent': return { kind: 'Permanent' };
  }
});

const DamageSourceSchema = z.enum(['Physical', 'Magical']) as z.ZodType<DamageSource>;

const ResourceTypeSchema = z.enum(['HP', 'MP']);

const EffectModifierSchema = z.discriminatedUnion('Type', [
  z.object({
    Type: z.literal('StaticMod'),
    StatModifier: StatModifierSchema,
  }),
  z.object({
    Type: z.literal('DynamicMod'),
    Expression: FormulaSchema,
    TargetStat: StatSchema,
  }),
  z.object({
    Type: z.literal('AbilityDamageMod'),
    AbilityDamageValue: FormulaSchema,
    Element: ElementSchema.optional(),
  }),
  z.object({
    Type: z.literal('ResourceChange'),
    Resource: ResourceTypeSchema,
    Amount: FormulaSchema,
  }),
]).transform((raw): EffectModifier => {
  switch (raw.Type) {
    case 'StaticMod':
      return { kind: 'StaticMod', modifier: raw.StatModifier };
    case 'DynamicMod':
      return { kind: 'DynamicMod', expression: raw.Expression, target: raw.TargetStat };
    case 'AbilityDamageMod':
      return { kind: 'AbilityDamageMod', abilityDamageValue: raw.AbilityDamageValue, element: raw.Element };
    case 'ResourceChange':
      return { kind: 'ResourceChange', resource: raw.Resource, amount: raw.Amount };
  }
});

const EffectSchema: z.ZodType<Effect> = z.object({
  Name: z.string(),
  Kind: EffectKindSchema,
  DamageSource: DamageSourceSchema.optional().default('Physical'),
  Stacking: StackingRuleSchema.optional().default({ kind: 'NoStack' }),
  Duration: DurationSchema,
  Visuals: VisualManifestSchema.optional().default({ ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined }),
  Modifiers: z.array(EffectModifierSchema),
}).transform((raw): Effect => ({
  Name: raw.Name,
  Kind: raw.Kind,
  DamageSource: raw.DamageSource,
  Stacking: raw.Stacking,
  Duration: raw.Duration,
  Visuals: raw.Visuals ?? { ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined },
  Modifiers: raw.Modifiers,
}));

const TargetingSchema = z.enum(['Self', 'TargetEntity', 'TargetPosition', 'TargetDirection']) as z.ZodType<Targeting>;

const SkillAreaSchema = z.union([
  z.string().refine((s) => s === 'Point').transform((): SkillArea => ({ kind: 'Point' })),
  z.object({
    Type: z.literal('Circle'),
    Radius: z.number(),
    MaxTargets: z.number().int().optional().default(1),
  }).transform((raw): SkillArea => ({ kind: 'Circle', radius: raw.Radius, maxTargets: raw.MaxTargets })),
  z.object({
    Type: z.literal('Cone'),
    Angle: z.number(),
    Length: z.number(),
    MaxTargets: z.number().int().optional().default(1),
  }).transform((raw): SkillArea => ({ kind: 'Cone', angle: raw.Angle, length: raw.Length, maxTargets: raw.MaxTargets })),
  z.object({
    Type: z.literal('Line'),
    Width: z.number(),
    Length: z.number(),
    MaxTargets: z.number().int().optional().default(1),
  }).transform((raw): SkillArea => ({ kind: 'Line', width: raw.Width, length: raw.Length, maxTargets: raw.MaxTargets })),
  z.object({
    Type: z.literal('MultiPoint'),
    Radius: z.number(),
    Count: z.number().int(),
  }).transform((raw): SkillArea => ({ kind: 'MultiPoint', radius: raw.Radius, count: raw.Count })),
  z.object({
    Type: z.literal('AdaptiveCone'),
    Length: z.number(),
    MaxTargets: z.number().int(),
  }).transform((raw): SkillArea => ({ kind: 'AdaptiveCone', length: raw.Length, maxTargets: raw.MaxTargets })),
]);

const CastOriginSchema = z.union([
  z.string().refine((s) => s === 'Caster').transform((): CastOrigin => ({ kind: 'Caster' })),
  z.object({ CasterOffset: z.tuple([z.number(), z.number()]) }).transform((raw): CastOrigin => ({ kind: 'CasterOffset', x: raw.CasterOffset[0], y: raw.CasterOffset[1] })),
  z.object({ TargetOffset: z.tuple([z.number(), z.number()]) }).transform((raw): CastOrigin => ({ kind: 'TargetOffset', x: raw.TargetOffset[0], y: raw.TargetOffset[1] })),
]);

const CollisionModeSchema = z.enum(['IgnoreTerrain', 'BlockedByTerrain']) as z.ZodType<CollisionMode>;

const ExtraVariationsSchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('Chained'), JumpsLeft: z.number().int(), MaxRange: z.number() }),
  z.object({ Type: z.literal('Bouncing'), BouncesLeft: z.number().int() }),
  z.object({ Type: z.literal('Descending'), StartAltitude: z.number(), FallSpeed: z.number() }),
]).transform((raw): ExtraVariations => {
  switch (raw.Type) {
    case 'Chained': return { kind: 'Chained', jumpsLeft: raw.JumpsLeft, maxRange: raw.MaxRange };
    case 'Bouncing': return { kind: 'Bouncing', bouncesLeft: raw.BouncesLeft };
    case 'Descending': return { kind: 'Descending', currentAltitude: raw.StartAltitude, fallSpeed: raw.FallSpeed };
  }
});

const ProjectileInfoSchema = z.object({
  Speed: z.number(),
  CollisionMode: CollisionModeSchema,
  Kind: ExtraVariationsSchema.optional(),
  Visuals: VisualManifestSchema.optional().default({ ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined }),
  TerrainImpactVisuals: VisualManifestSchema.optional(),
}).transform((raw): ProjectileInfo => ({
  Speed: raw.Speed,
  Collision: raw.CollisionMode,
  Variations: raw.Kind,
  Visuals: raw.Visuals,
  TerrainImpactVisuals: raw.TerrainImpactVisuals,
}));

const OrbitalConfigSchema = z.object({
  Count: z.number().int(),
  CenterOffset: z.object({ X: z.number(), Y: z.number(), Z: z.number() }),
}).transform((raw): OrbitalConfig => ({
  Count: raw.Count,
  CenterOffset: { X: raw.CenterOffset.X, Y: raw.CenterOffset.Y, Z: raw.CenterOffset.Z },
}));

const ChargeConfigSchema = z.object({
  Duration: z.number(),
  ChargeVisuals: VisualManifestSchema.optional().default({ ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined }),
  Orbitals: OrbitalConfigSchema.optional(),
}).transform((raw): ChargeConfig => ({
  Duration: raw.Duration,
  ChargeVisuals: raw.ChargeVisuals,
  Orbitals: raw.Orbitals,
}));

const DeliverySchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('Instant') }),
  z.object({ Type: z.literal('Projectile'), Speed: z.number(), CollisionMode: CollisionModeSchema }).passthrough(),
]).transform((raw): Delivery => {
  if (raw.Type === 'Instant') return { kind: 'Instant' };
  // For Projectile, we need to parse the rest of the fields which are in ProjectileInfoSchema
  // Since the JSON has them flattened, we pass the raw object through
  const parsed = ProjectileInfoSchema.parse(raw);
  return { kind: 'Projectile', projectile: parsed };
});

const ResourceCostSchema = z.object({
  Type: ResourceTypeSchema,
  Amount: z.number().int().optional(),
}).transform((raw): ResourceCost => ({
  ResourceType: raw.Type,
  Amount: raw.Amount,
}));

const ActiveSkillSchema = z.object({
  Id: z.number().int(),
  Name: z.string(),
  Description: z.string(),
  Intent: z.enum(['Offensive', 'Supportive']),
  DamageSource: DamageSourceSchema,
  Cost: ResourceCostSchema.optional(),
  Cooldown: z.number().optional(),
  CastingTime: z.number().optional(),
  Targeting: TargetingSchema,
  Range: z.union([z.number(), z.tuple([z.number(), z.number()]).transform(([v, size]) => v * size)]).optional(),
  Area: SkillAreaSchema,
  Delivery: DeliverySchema,
  ChargePhase: ChargeConfigSchema.optional(),
  Formula: FormulaSchema.optional(),
  ElementFormula: z.object({ Element: ElementSchema, Formula: FormulaSchema }).optional(),
  Effects: z.array(EffectSchema),
  Origin: CastOriginSchema,
  CastVisuals: VisualManifestSchema.optional().default({ ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined }),
  ImpactVisuals: VisualManifestSchema.optional().default({ ModelId: undefined, VfxId: undefined, AnimationId: undefined, AttachmentPoint: undefined }),
});

const PassiveSkillSchema = z.object({
  Id: z.number().int(),
  Name: z.string(),
  Description: z.string(),
  Effects: z.array(EffectSchema),
});

const SkillSchema: z.ZodType<Skill> = z.discriminatedUnion('Kind', [
  z.object({ Kind: z.literal('Passive') }).merge(PassiveSkillSchema),
  z.object({ Kind: z.literal('Active') }).merge(ActiveSkillSchema),
]).transform((raw): Skill => {
  if (raw.Kind === 'Passive') {
    const { Kind, ...passive } = raw;
    return { kind: 'Passive', passive };
  }
  const { Kind, ...rest } = raw;
  const active = {
    ...rest,
    Cost: rest.Cost ?? undefined,
    Cooldown: rest.Cooldown ?? undefined,
    CastingTime: rest.CastingTime ?? undefined,
    Range: rest.Range ?? undefined,
    ChargePhase: rest.ChargePhase ?? undefined,
    Formula: rest.Formula ?? undefined,
    ElementFormula: rest.ElementFormula ?? undefined,
  };
  return { kind: 'Active', active };
});

// --- AI Schemas ---

const BehaviorTypeSchema = z.enum(['Patrol', 'Aggressive', 'Defensive', 'Supporter', 'Ambusher', 'Turret', 'Passive']) as z.ZodType<BehaviorType>;

const CueTypeSchema = z.enum(['Visual', 'Audio', 'Damage', 'Communication', 'Memory']);

const CueStrengthSchema = z.enum(['Weak', 'Moderate', 'Strong', 'Overwhelming']);

// Per the F# decoder, Tethered is parsed inside PerceptionConfig by reading
// "MovementType" as string, and if it equals "tethered", reading the sibling
// property "LeashDistance" from the same JSON object.  We handle that in the
// PerceptionConfigSchema transform below.

const PerceptionConfigSchema = z.object({
  VisualRange: z.union([z.number(), z.tuple([z.number(), z.number()]).transform(([v, size]) => v * size)]),
  Fov: z.number(),
  MemoryDuration: z.number(),
  MovementType: z.string().optional(),
  LeashDistance: z.number().optional(),
}).transform((raw): PerceptionConfig => {
  const mvt = raw.MovementType?.toLowerCase() ?? 'free';
  let movementType: MovementType;
  if (mvt === 'free') movementType = 'Free';
  else if (mvt === 'stationary') movementType = 'Stationary';
  else if (mvt === 'tethered') movementType = { kind: 'Tethered', leashDistance: raw.LeashDistance ?? 200 };
  else movementType = 'Free';

  return {
    visualRange: raw.VisualRange,
    fov: raw.Fov,
    memoryDuration: raw.MemoryDuration,
    movementType,
  };
});

const ResponseTypeSchema = z.enum(['Ignore', 'Investigate', 'Engage', 'Flee', 'Evade']);

const CuePrioritySchema = z.object({
  CueType: CueTypeSchema,
  MinStrength: CueStrengthSchema,
  Priority: z.number().int(),
  Response: ResponseTypeSchema,
}).transform((raw): CuePriority => ({
  cueType: raw.CueType,
  minStrength: raw.MinStrength,
  priority: raw.Priority,
  response: raw.Response,
}));

const BaseStatsSchema = z.object({
  Power: z.number().int(),
  Magic: z.number().int(),
  Sense: z.number().int(),
  Charm: z.number().int(),
});

const AIArchetypeSchema: z.ZodType<AIArchetype> = z.object({
  Id: z.number().int(),
  Name: z.string(),
  BehaviorType: BehaviorTypeSchema,
  PerceptionConfig: PerceptionConfigSchema,
  CuePriorities: z.array(CuePrioritySchema),
  DecisionInterval: z.number(),
  BaseStats: BaseStatsSchema,
}).transform((raw): AIArchetype => ({
  id: brandAiArchetypeId(raw.Id),
  name: raw.Name,
  behaviorType: raw.BehaviorType,
  perceptionConfig: raw.PerceptionConfig,
  cuePriorities: raw.CuePriorities,
  decisionInterval: raw.DecisionInterval,
  baseStats: raw.BaseStats,
}));

// --- Item Schemas ---

const ItemKindSchema = z.discriminatedUnion('Type', [
  z.object({ Type: z.literal('Wearable'), Slot: SlotSchema, Stats: z.array(StatModifierSchema) }),
  z.object({ Type: z.literal('Usable'), Effect: EffectSchema }),
  z.object({ Type: z.literal('NonUsable') }),
]).transform((raw): ItemKind => {
  switch (raw.Type) {
    case 'Wearable':
      return { kind: 'Wearable', wearable: { Slot: raw.Slot, Stats: raw.Stats } };
    case 'Usable':
      return { kind: 'Usable', usable: { Effect: raw.Effect } };
    case 'NonUsable':
      return { kind: 'NonUsable' };
  }
});

const ItemDefinitionSchema: z.ZodType<ItemDefinition> = z.object({
  Id: z.number().int(),
  Name: z.string(),
  Weight: z.number().int(),
  Kind: ItemKindSchema,
}).transform((raw): ItemDefinition => ({
  Id: brandItemId(raw.Id),
  Name: raw.Name,
  Weight: raw.Weight,
  Kind: raw.Kind,
}));

// --- Decision Tree Schemas ---

const ConditionKindSchema = z.union([
  z.object({ Name: z.literal('HasTarget') }).transform((): ConditionKind => ({ kind: 'HasTarget' })),
  z.object({ Name: z.literal('TargetInRange'), Params: z.record(z.string(), z.string()).optional() }).transform((raw): ConditionKind => {
    const range = raw.Params?.['Range'] ? parseFloat(raw.Params['Range']) : undefined;
    return { kind: 'TargetInRange', range };
  }),
  z.object({ Name: z.literal('TargetInMeleeRange') }).transform((): ConditionKind => ({ kind: 'TargetInMeleeRange' })),
  z.object({ Name: z.literal('TargetTooClose'), Params: z.record(z.string(), z.string()).optional() }).transform((raw): ConditionKind => {
    const dist = raw.Params?.['MinDistance'] ? parseFloat(raw.Params['MinDistance']) : 48;
    return { kind: 'TargetTooClose', minDistance: dist };
  }),
  z.object({ Name: z.literal('SelfHealthBelow'), Params: z.record(z.string(), z.string()).optional() }).transform((raw): ConditionKind => {
    const threshold = raw.Params?.['Threshold'] ? parseFloat(raw.Params['Threshold']) : 0.3;
    return { kind: 'SelfHealthBelow', threshold };
  }),
  z.object({ Name: z.literal('TargetHealthBelow'), Params: z.record(z.string(), z.string()).optional() }).transform((raw): ConditionKind => {
    const threshold = raw.Params?.['Threshold'] ? parseFloat(raw.Params['Threshold']) : 0.3;
    return { kind: 'TargetHealthBelow', threshold };
  }),
  z.object({ Name: z.literal('BeyondLeash') }).transform((): ConditionKind => ({ kind: 'BeyondLeash' })),
  z.object({ Name: z.literal('SkillReady') }).transform((): ConditionKind => ({ kind: 'SkillReady' })),
  z.object({ Name: z.literal('HasCue') }).transform((): ConditionKind => ({ kind: 'HasCue' })),
  z.object({ Name: z.literal('CueResponseIs'), Params: z.record(z.string(), z.string()).optional() }).transform((raw): ConditionKind => {
    const responseStr = raw.Params?.['Response'];
    const validResponses = ['Ignore', 'Investigate', 'Engage', 'Flee', 'Evade'] as const;
    const response = validResponses.find((r) => r === responseStr) ?? 'Ignore';
    return { kind: 'CueResponseIs', response };
  }),
]);

const ActionKindSchema = z.union([
  z.string().refine((s) => s === 'ChaseTarget').transform((): ActionKind => 'ChaseTarget'),
  z.string().refine((s) => s === 'UseRangedAttack').transform((): ActionKind => 'UseRangedAttack'),
  z.string().refine((s) => s === 'UseMeleeAttack').transform((): ActionKind => 'UseMeleeAttack'),
  z.string().refine((s) => s === 'UseHeal').transform((): ActionKind => 'UseHeal'),
  z.string().refine((s) => s === 'UseDebuff').transform((): ActionKind => 'UseDebuff'),
  z.string().refine((s) => s === 'UseBuff').transform((): ActionKind => 'UseBuff'),
  z.string().refine((s) => s === 'Patrol').transform((): ActionKind => 'Patrol'),
  z.string().refine((s) => s === 'ReturnToSpawn').transform((): ActionKind => 'ReturnToSpawn'),
  z.string().refine((s) => s === 'Retreat').transform((): ActionKind => 'Retreat'),
  z.string().refine((s) => s === 'Idle').transform((): ActionKind => 'Idle'),
]);

const BehaviorNodeSchema: z.ZodType<BehaviorNode> = z.lazy(() =>
  z.discriminatedUnion('Type', [
    z.object({
      Type: z.literal('Selector'),
      Children: z.array(BehaviorNodeSchema),
    }).transform((raw): BehaviorNode => ({ kind: 'Selector', children: raw.Children })),
    z.object({
      Type: z.literal('Sequence'),
      Children: z.array(BehaviorNodeSchema),
    }).transform((raw): BehaviorNode => ({ kind: 'Sequence', children: raw.Children })),
    z.object({
      Type: z.literal('Condition'),
      Name: z.string(),
      Params: z.record(z.string(), z.string()).optional(),
    }).transform((raw): BehaviorNode => {
      const { Type, ...rest } = raw;
      const condition = ConditionKindSchema.parse(rest);
      return { kind: 'Condition', condition };
    }),
    z.object({
      Type: z.literal('Action'),
      Name: z.string(),
    }).transform((raw): BehaviorNode => {
      const action = ActionKindSchema.parse(raw.Name);
      return { kind: 'Action', action };
    }),
    z.object({
      Type: z.literal('Inverter'),
      Child: BehaviorNodeSchema,
    }).transform((raw): BehaviorNode => ({ kind: 'Inverter', child: raw.Child })),
  ])
);

const DecisionTreeSchema: z.ZodType<DecisionTree> = z.object({
  Root: BehaviorNodeSchema,
}).transform((raw): DecisionTree => ({
  Name: '', // Will be set by loader
  Root: raw.Root,
}));

const AIFamilyConfigSchema: z.ZodType<AIFamilyConfig> = z.object({
  StatScaling: z.record(z.string(), z.number()).optional().default({}),
  SkillPool: z.array(z.number().int()),
  PreferredIntent: z.enum(['Offensive', 'Supportive']),
  DecisionTree: z.string(),
}).transform((raw): AIFamilyConfig => ({
  StatScaling: new Map(Object.entries(raw.StatScaling)),
  SkillPool: raw.SkillPool.map(brandSkillId),
  PreferredIntent: raw.PreferredIntent,
  DecisionTree: raw.DecisionTree,
}));

const AIEntityDefinitionSchema: z.ZodType<AIEntityDefinition> = z.object({
  Name: z.string(),
  ArchetypeId: z.number().int(),
  Family: z.enum(['Power', 'Magic', 'Charm', 'Sense']),
  Skills: z.array(z.number().int()),
  DecisionTree: z.string(),
  Model: z.string(),
  StatOverrides: BaseStatsSchema.optional(),
}).transform((raw): AIEntityDefinition => ({
  Key: '', // Set by loader
  Name: raw.Name,
  ArchetypeId: brandAiArchetypeId(raw.ArchetypeId),
  Family: raw.Family,
  Skills: raw.Skills.map(brandSkillId),
  DecisionTree: raw.DecisionTree,
  Model: raw.Model,
  StatOverrides: raw.StatOverrides,
}));

// --- Export schemas ---

export const SkillMapSchema = z.record(z.string(), SkillSchema);
export const ItemMapSchema = z.record(z.string(), ItemDefinitionSchema);
export const AIArchetypeArraySchema = z.array(AIArchetypeSchema);
export const AIEntityMapSchema = z.record(z.string(), AIEntityDefinitionSchema);
export const AIFamilyMapSchema = z.record(z.string(), AIFamilyConfigSchema);
export const DecisionTreeMapSchema = z.record(z.string(), DecisionTreeSchema);
