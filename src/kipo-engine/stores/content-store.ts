import type { SkillId, AiArchetypeId, ItemId } from '../types/branded';
import { brandSkillId } from '../types/branded';
import type { Skill, ActiveSkill } from '../domain/skill';
import type { ItemDefinition } from '../domain/item';
import type { AIArchetype, AIEntityDefinition, AIFamilyConfig, DecisionTree } from '../domain/ai';

export interface SkillStore {
  tryFind(id: SkillId): Skill | undefined;
  getActive(id: SkillId): ActiveSkill | undefined;
  all(): Skill[];
}

export interface ItemStore {
  tryFind(id: ItemId): ItemDefinition | undefined;
  all(): ItemDefinition[];
}

export interface AIArchetypeStore {
  tryFind(id: AiArchetypeId): AIArchetype | undefined;
  all(): AIArchetype[];
}

export interface AIEntityStore {
  tryFind(key: string): AIEntityDefinition | undefined;
  all(): AIEntityDefinition[];
}

export interface AIFamilyStore {
  tryFind(key: string): AIFamilyConfig | undefined;
  all(): AIFamilyConfig[];
}

export interface DecisionTreeStore {
  tryFind(name: string): DecisionTree | undefined;
  all(): DecisionTree[];
}

export interface MapEntityGroupStore {
  tryFind(groupName: string): import('../domain/ai').MapEntityGroup | undefined;
  all(): import('../domain/ai').MapEntityGroup[];
}

export interface ContentStores {
  SkillStore: SkillStore;
  ItemStore: ItemStore;
  AIArchetypeStore: AIArchetypeStore;
  AIEntityStore: AIEntityStore;
  AIFamilyStore: AIFamilyStore;
  DecisionTreeStore: DecisionTreeStore;
  MapEntityGroupStore: MapEntityGroupStore;
}

export async function loadContent(basePath: string): Promise<ContentStores> {
  const [
    skillsJson,
    itemsJson,
    archetypesJson,
    entitiesJson,
    familiesJson,
    treesJson,
    mapGroupsJson,
  ] = await Promise.all([
    fetch(`${basePath}/Skills.json`).then((r) => r.json()),
    fetch(`${basePath}/Items.json`).then((r) => r.json()),
    fetch(`${basePath}/AIArchetypes.json`).then((r) => r.json()),
    fetch(`${basePath}/AIEntities.json`).then((r) => r.json()),
    fetch(`${basePath}/AIFamilies.json`).then((r) => r.json()),
    fetch(`${basePath}/DecisionTrees.json`).then((r) => r.json()),
    fetch(`${basePath}/MapEntityGroups.json`).then((r) => r.json()),
  ]);

  const {
    SkillMapSchema,
    ItemMapSchema,
    AIArchetypeArraySchema,
    AIEntityMapSchema,
    AIFamilyMapSchema,
    DecisionTreeMapSchema,
    MapEntityGroupMapSchema,
  } = await import('./serialization');

  const skillsParsed = SkillMapSchema.parse(skillsJson);
  const itemsParsed = ItemMapSchema.parse(itemsJson);
  const archetypesParsed = AIArchetypeArraySchema.parse(archetypesJson);
  const entitiesParsed = AIEntityMapSchema.parse(entitiesJson);
  const familiesParsed = AIFamilyMapSchema.parse(familiesJson);
  const treesParsed = DecisionTreeMapSchema.parse(treesJson);
  const mapGroupsParsed = MapEntityGroupMapSchema.parse(mapGroupsJson);

  // Fix up keys
  for (const [key, def] of Object.entries(entitiesParsed)) {
    def.Key = key;
  }
  for (const [name, tree] of Object.entries(treesParsed)) {
    tree.Name = name;
  }

  const skillsMap = new Map<SkillId, Skill>();
  for (const skill of Object.values(skillsParsed)) {
    skillsMap.set(skill.kind === 'Active' ? brandSkillId(skill.active.Id) : brandSkillId(skill.passive.Id), skill);
  }

  const itemsMap = new Map<ItemId, ItemDefinition>();
  for (const item of Object.values(itemsParsed)) {
    itemsMap.set(item.Id, item);
  }

  const archetypesMap = new Map<AiArchetypeId, AIArchetype>();
  for (const archetype of archetypesParsed) {
    archetypesMap.set(archetype.id, archetype);
  }

  const entitiesMap = new Map<string, AIEntityDefinition>();
  for (const [key, def] of Object.entries(entitiesParsed)) {
    entitiesMap.set(key, def);
  }

  const familiesMap = new Map<string, AIFamilyConfig>();
  for (const [key, def] of Object.entries(familiesParsed)) {
    familiesMap.set(key, def);
  }

  const treesMap = new Map<string, DecisionTree>();
  for (const [name, tree] of Object.entries(treesParsed)) {
    treesMap.set(name, tree);
  }

  const mapGroupsMap = new Map<string, import('../domain/ai').MapEntityGroup>();
  for (const [name, group] of Object.entries(mapGroupsParsed)) {
    mapGroupsMap.set(name, group);
  }

  return {
    SkillStore: {
      tryFind(id: SkillId): Skill | undefined {
        return skillsMap.get(id);
      },
      getActive(id: SkillId): ActiveSkill | undefined {
        const s = skillsMap.get(id);
        return s?.kind === 'Active' ? s.active : undefined;
      },
      all(): Skill[] {
        return Array.from(skillsMap.values());
      },
    },
    ItemStore: {
      tryFind(id: ItemId): ItemDefinition | undefined {
        return itemsMap.get(id);
      },
      all(): ItemDefinition[] {
        return Array.from(itemsMap.values());
      },
    },
    AIArchetypeStore: {
      tryFind(id: AiArchetypeId): AIArchetype | undefined {
        return archetypesMap.get(id);
      },
      all(): AIArchetype[] {
        return Array.from(archetypesMap.values());
      },
    },
    AIEntityStore: {
      tryFind(key: string): AIEntityDefinition | undefined {
        return entitiesMap.get(key);
      },
      all(): AIEntityDefinition[] {
        return Array.from(entitiesMap.values());
      },
    },
    AIFamilyStore: {
      tryFind(key: string): AIFamilyConfig | undefined {
        return familiesMap.get(key);
      },
      all(): AIFamilyConfig[] {
        return Array.from(familiesMap.values());
      },
    },
    DecisionTreeStore: {
      tryFind(name: string): DecisionTree | undefined {
        return treesMap.get(name);
      },
      all(): DecisionTree[] {
        return Array.from(treesMap.values());
      },
    },
    MapEntityGroupStore: {
      tryFind(groupName: string): import('../domain/ai').MapEntityGroup | undefined {
        return mapGroupsMap.get(groupName);
      },
      all(): import('../domain/ai').MapEntityGroup[] {
        return Array.from(mapGroupsMap.values());
      },
    },
  };
}
