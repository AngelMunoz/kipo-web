import { brandEntityId, brandScenarioId } from "../kipo-engine/types/branded";

export const PLAYER_ENTITY_ID = brandEntityId("player-1");
export const PLAYER_SCENARIO_ID = brandScenarioId("default-scenario");

export const SKILL_SLOT_MAP: Record<number, number> = {
  1: 1, // Melee Attack
  2: 2, // Fireball
  3: 3, // HellFire
  4: 4, // Dark Summoning
  5: 5, // Mana Cloud
  6: 6, // Shield Bash
  7: 7, // Summon Boulder
  8: 8, // Whirlwind
};


