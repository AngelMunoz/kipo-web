import type { GameAction } from '../../kipo-engine/domain/events';

export interface KeyBinding {
    key: string;
    action: GameAction;
}

export const DEFAULT_BINDINGS: KeyBinding[] = [
    { key: 'W', action: 'MoveUp' },
    { key: 'S', action: 'MoveDown' },
    { key: 'A', action: 'MoveLeft' },
    { key: 'D', action: 'MoveRight' },
    { key: 'ONE', action: 'UseSlot1' },
    { key: 'TWO', action: 'UseSlot2' },
    { key: 'THREE', action: 'UseSlot3' },
    { key: 'FOUR', action: 'UseSlot4' },
    { key: 'FIVE', action: 'UseSlot5' },
    { key: 'SIX', action: 'UseSlot6' },
    { key: 'SEVEN', action: 'UseSlot7' },
    { key: 'EIGHT', action: 'UseSlot8' },
    { key: 'SPACE', action: 'Interact' },
    { key: 'ESC', action: 'Cancel' },
];

export function createKeyboardBindings(): KeyBinding[] {
    return [...DEFAULT_BINDINGS];
}

export function getBindingForAction(action: GameAction): KeyBinding | undefined {
    return DEFAULT_BINDINGS.find(b => b.action === action);
}

export function getActionForKey(key: string): GameAction | undefined {
    return DEFAULT_BINDINGS.find(b => b.key === key)?.action;
}