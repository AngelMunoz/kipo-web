// Branded types for domain IDs to prevent accidental mixing
export type EntityId = string & { __brand: 'EntityId' };
export type EffectId = string & { __brand: 'EffectId' };
export type SkillId = number & { __brand: 'SkillId' };
export type ItemId = number & { __brand: 'ItemId' };
export type ItemInstanceId = string & { __brand: 'ItemInstanceId' };
export type AiArchetypeId = number & { __brand: 'AiArchetypeId' };
export type ScenarioId = string & { __brand: 'ScenarioId' };
export type BlockTypeId = number & { __brand: 'BlockTypeId' };

// Generic brand function for string-based IDs
function brandString<T>(id: string): T {
  return id as T;
}

// Generic brand function for number-based IDs
function brandNumber<T>(id: number): T {
  return id as T;
}

export const brandEntityId = (id: string): EntityId => brandString(id);
export const brandEffectId = (id: string): EffectId => brandString(id);
export const brandSkillId = (id: number): SkillId => brandNumber(id);
export const brandItemId = (id: number): ItemId => brandNumber(id);
export const brandItemInstanceId = (id: string): ItemInstanceId => brandString(id);
export const brandAiArchetypeId = (id: number): AiArchetypeId => brandNumber(id);
export const brandScenarioId = (id: string): ScenarioId => brandString(id);
export const brandBlockTypeId = (id: number): BlockTypeId => brandNumber(id);
