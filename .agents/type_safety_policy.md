# Type Safety Policy

This document defines the hard rules for type safety in this codebase. It is a direct translation of the F# philosophy of making illegal states unrepresentable, adapted for TypeScript.

## Absolute Prohibitions

### 1. `any` is Banned

**Rule:** The use of `any` is forbidden under any circumstance in engine code and strongly discouraged everywhere else.

**Why:** `any` bypasses the entire type system. It is contagious: once a value is `any`, every value that touches it becomes implicitly `any`. This directly undermines the goal of making illegal states unrepresentable.

**What to do instead:**

- Use `unknown` for values whose type you genuinely do not know (e.g., external JSON, user input).
- Immediately narrow `unknown` using type guards, Zod schemas, or explicit validation functions.
- Use proper types for everything else.

**Allowed exception:**

- Inside the **branded type helper functions only** (e.g., `brandString`, `brandNumber`), where the cast is localized, documented, and the only place the brand is applied.
- In test files, for constructing minimal mock objects where the type is otherwise fully specified and the mock is local to the test.

### 2. In-Place `as T` Casting is Banned

**Rule:** Casting a value to a type using `as T` (or `as unknown as T`) is forbidden unless it falls under one of the explicit exceptions below.

**Why:** `as T` is a lie to the compiler. It tells TypeScript "trust me, this is a T" without any runtime validation. This is the TypeScript equivalent of unsafe casting in C — it can crash at runtime, produce silent data corruption, and make refactoring impossible.

**Explicit exceptions where `as T` is allowed:**

1. **Branded type helper functions** — the single, localized function that applies the brand (e.g., `brandEntityId`, `brandSkillId`). The cast is constrained to the helper and never appears at call sites.
2. **Zod schema `as z.ZodType<T>`** — when defining a schema that must conform to an existing interface. This is a declaration-site contract, not a runtime cast.
3. **JSON.parse results validated by Zod** — after parsing, the data is validated by a Zod schema. No `as` should be needed if Zod is used correctly.
4. **External untyped API coercion** — when interfacing with a library that has incomplete or missing types (e.g., Phaser internals). Must include a `// SAFETY:` comment explaining why the cast is unavoidable and what invariants guarantee safety.

**What to do instead:**

- Use the branded type helpers (`brandEntityId`, `brandSkillId`, etc.) instead of `"id" as EntityId`.
- Use `satisfies` for literal type constraints: `const action = "Cancel" satisfies GameAction`.
- Use const assertions for frozen data: `{ kind: 'Const', value: 100 } as const`.
- Use `unknown` + narrowing for boundary data.
- Define proper types and interfaces so casts are unnecessary.

### 3. `as any` is Doubly Banned

**Rule:** `as any` is never acceptable. It combines the worst of both worlds.

**No exceptions.**

## Branded Types

Branded types are our primary tool for making illegal states unrepresentable. They prevent mixing up different kinds of IDs (e.g., using a `SkillId` where an `EntityId` is expected).

### How to Create Branded Values

**Always use the helper functions. Never cast inline.**

```typescript
// CORRECT
import { brandEntityId, brandSkillId } from '../types/branded';

const entityId = brandEntityId('player-1');
const skillId = brandSkillId('fireball');
```

```typescript
// WRONG — NEVER do this
const entityId = 'player-1' as EntityId;
const entityId = 'player-1' as any as EntityId;
```

### Why This Matters

The `renderer-constants.ts` file previously used `as any` to create branded IDs. This completely defeats the purpose of the brand — any string could be passed, and the compiler would accept it. Using `brandEntityId()` ensures the value flows through the type system's safety gate.

## Discriminated Unions

Discriminated unions (tagged unions) are the TypeScript equivalent of F# discriminated unions. They are the preferred way to model domain states and choices.

### Rules

- Always use a literal `kind` or `type` tag.
- Always handle all cases exhaustively in `switch` statements.
- Never use a catch-all `default` branch unless the remaining cases are logically unreachable.

```typescript
// CORRECT
type GameAction =
  | { kind: 'UseSlot'; slot: number }
  | { kind: 'Cancel' }
  | { kind: 'Move'; direction: Direction };

function handleAction(action: GameAction): void {
  switch (action.kind) {
    case 'UseSlot': return handleUseSlot(action.slot);
    case 'Cancel': return handleCancel();
    case 'Move': return handleMove(action.direction);
  }
}
```

## Result<T, E> Pattern

For expected errors (validation, parsing, business rules), use the existing `Result<T, E>` type instead of throwing exceptions.

```typescript
import type { Result } from '../types/core';
import { ok, err } from '../types/core';

function parseConfig(raw: unknown): Result<Config, ParseError> {
  const result = configSchema.safeParse(raw);
  if (!result.success) return err({ kind: 'ParseError', issues: result.error.issues });
  return ok(result.data);
}
```

## Boundary Rules

When data crosses a boundary (JSON, network, Phaser, DOM), it is `unknown`. You must validate or narrow it before it enters the engine's typed world.

| Boundary | Rule |
|----------|------|
| `fetch` + JSON | Parse with Zod schema; never use `as T` |
| Phaser APIs | Wrap in thin adapter functions; `as T` only inside adapter with `// SAFETY:` comment |
| DOM / Events | Use explicit event types or `unknown` + guards |
| URL params / query strings | Parse and validate explicitly |
| `localStorage` | Treat as `unknown`; parse and validate on read |

## Refactoring Existing Code

When you encounter `any` or `as T` in existing code:

1. Determine if it falls under an explicit exception above.
2. If not, replace it with a proper type, helper function, or validation.
3. If it requires a larger refactor to remove safely, add a `// TODO(type-safety): ...` comment and flag it.

## Checklist

Before submitting code, verify:

- [ ] No `any` types appear in engine code
- [ ] No `as T` or `as unknown as T` appear outside the explicit exceptions
- [ ] Branded IDs are created only through `brandXxx()` helpers
- [ ] Discriminated union switches are exhaustive
- [ ] Boundary data is validated (Zod, type guards) before entering typed code
- [ ] Framework interop is wrapped in thin adapter layers
