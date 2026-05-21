import type { ItemId, ItemInstanceId } from '../types/branded';
import type { Effect } from './skill';

export type Slot =
  | 'Head'
  | 'Chest'
  | 'Legs'
  | 'Feet'
  | 'Hands'
  | 'Weapon'
  | 'Shield'
  | 'Accessory';

export interface EquipmentProperties {
  Slot: Slot;
  Stats: import('./core').StatModifier[];
}

export interface UsabilityProperties {
  Effect: Effect;
}

export type ItemKind =
  | { kind: 'Wearable'; wearable: EquipmentProperties }
  | { kind: 'Usable'; usable: UsabilityProperties }
  | { kind: 'NonUsable' };

export interface ItemDefinition {
  Id: ItemId;
  Name: string;
  Weight: number;
  Kind: ItemKind;
}

export interface ItemInstance {
  InstanceId: ItemInstanceId;
  ItemId: ItemId;
  UsesLeft: number | undefined;
}
