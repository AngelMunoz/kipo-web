import type { Element } from './core';

export type Status = 'Alive' | 'Dead';

export type ResourceType = 'HP' | 'MP';

export interface Resource {
  HP: number;
  MP: number;
  Status: Status;
}

export type Faction =
  | 'Player'
  | 'NPC'
  | 'Ally'
  | 'Enemy'
  | 'AIControlled'
  | 'TeamRed'
  | 'TeamBlue'
  | 'TeamGreen'
  | 'TeamYellow'
  | 'TeamOrange'
  | 'TeamPurple'
  | 'TeamPink'
  | 'TeamCyan'
  | 'TeamWhite'
  | 'TeamBlack';

export type Family = 'Power' | 'Magic' | 'Charm' | 'Sense';

export type Stage = 'First' | 'Second' | 'Third';

export interface Profession {
  Family: Family;
  Stage: Stage;
}

export interface BaseStats {
  Power: number;
  Magic: number;
  Sense: number;
  Charm: number;
}

export interface DerivedStats {
  // Power derived stats
  AP: number;
  AC: number;
  DX: number;
  // Magic derived stats
  MP: number;
  MA: number;
  MD: number;
  // Sense derived stats
  WT: number;
  DA: number;
  LK: number;
  // Charm derived stats
  HP: number;
  DP: number;
  HV: number;
  // Movement
  MS: number;
  // Regeneration
  HPRegen: number;
  MPRegen: number;
  // Element % of attributes and resistances
  ElementAttributes: Map<Element, number>;
  ElementResistances: Map<Element, number>;
}
