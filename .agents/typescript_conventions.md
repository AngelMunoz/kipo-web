# TypeScript Code Generation Instructions

## CRITICAL: Indentation and Formatting Rules

### Absolute Requirements

**SPACES ONLY - NEVER TABS:**

- Use 2 spaces per indentation level
- Consistency mandatory across entire file

### Indentation Patterns

**Variable Declarations:**

```typescript
const x = 42;
const y =
  someExpression +
  another;

const result = () => {
  const inner = 10;
  return inner + 20;
};
```

**Functions:**

```typescript
function add(a: number, b: number): number { return a + b; }

function processData(input: string): string {
  const validated = validate(input);
  const transformed = transform(validated);
  return save(transformed);
}
```

**Switch / Pattern Matching:**

```typescript
function describe(x: number): string {
  switch (x) {
    case 0: return 'zero';
    case 1: return 'one';
    default: return 'other';
  }
}

// Multiline arms
function complexMatch(x: Option<number>): number {
  switch (x.kind) {
    case 'Some': {
      console.log('Found:', x.value);
      return x.value * 2;
    }
    case 'None': {
      console.log('Not found');
      return 0;
    }
  }
}
```

**If/Then/Else:**

```typescript
const x = condition ? a : b;

// Multiline
const result = condition
  ? doSomething()
  : doOtherThing();
```

**Method Chains:**

```typescript
const result = input
  .map(validate)
  .filter(isValid)
  .reduce(combine, initial);
```

**Object Literals:**

```typescript
const person = {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
};

const updated = { ...person, age: 31 };
```

**Arrays:**

```typescript
const numbers = [1, 2, 3, 4, 5];

// Multiline
const numbers = [
  1,
  2,
  3,
];
```

### Whitespace Rules

**DO:**

- One space after commas: `(1, 2, 3)`
- One space around operators: `x + y`
- Blank line between top-level declarations
- `spam(ham(1))` — no space between function name and opening paren in call

**DO NOT:**

- Spaces inside parentheses: `spam( ham 1 )`
- Align by variable name length (fragile)
- Use tabs

```typescript
// CORRECT
const shortName = value1;
const veryLongName = value2;

// WRONG - aligned by name length
const shortName    = value1;
const veryLongName = value2;
```

### Comments

```typescript
// Use // for inline comments

/**
 * Use JSDoc for public API documentation
 */
export function publicFunction(x: number): number { return x + 1; }
```

## Core Principles

Generate TypeScript code following five principles:

1. **Succinct, expressive, composable** — Minimal boilerplate, clear intent, natural composition
2. **Interoperable** — Consider both TS and JS consumption
3. **Object programming selectively** — Use classes to encapsulate complexity or framework requirements, not as default
4. **Performance without exposed mutation** — Hide mutation behind functional interfaces
5. **Toolable** — Compatible with TypeScript tooling and strict settings

## API Design by Consumer Context

### Context 1: Internal/Private TypeScript Code

**Types:**

- Discriminated unions (tagged unions) for domain modeling
- Readonly interfaces/records for data structures
- `T | undefined` or branded `Option<T>` for absent values
- `Result<T, E>` for expected failures
- Branded types for type-safe primitive wrappers (e.g., `EntityId`, `SkillId`)

**Functions:**

- Organize in modules (files or namespaces), not classes
- Function composition
- Utility functions for common operations

**Organization:**

- Keep mutation local and hidden
- Export only what is necessary

### Context 2: Public API (Module Exports)

**Types:**

- Discriminated unions for domain states/choices
- Readonly interfaces for DTOs
- `Result<T, E>` for anticipated failures
- Model errors as discriminated unions

**Organization:**

- Explicit exports; avoid barrel files unless necessary
- JSDoc on all public members

**Error Handling:**

- `Result<T, Error>` for expected errors (validation, parsing, business rules)
- Exceptions only for unrecoverable conditions
- Never return `null` from functions that claim to return `T`; return `T | undefined` or `Result<T, E>`

### Context 3: Framework Boundary (SolidJS, Phaser)

**Types:**

- Follow framework conventions where they dominate (e.g., SolidJS signals, Phaser game objects)
- Wrap framework types in thin abstraction layers when crossing into engine code

**Error Handling:**

- Validate at boundaries using Zod or explicit guards
- Convert framework-specific types to engine types immediately on entry

## Type System

### Interfaces / Types

- Default readonly fields where immutability is expected
- PascalCase field names
- Spread/copy-and-update: `{ ...record, field: value }`
- `readonly` arrays and tuples for immutable collections
- DO NOT use mutable fields unless performance-critical and profiled

### Discriminated Unions

- PascalCase case names in `kind` / `type` tags
- Include data in cases directly
- Use branded wrappers for type safety around primitives

### Optional Types

- Use `T | undefined` in internal TS APIs
- Pattern match or use utility functions (map, bind, defaultValue)
- DO NOT mix `null` and `undefined`; choose `undefined` consistently
- Convert to nullable at framework boundaries only if required

## Code Organization

### Modules and Files

- Top level: exported types and functions
- Within files: group related functions under a module object or as flat exports
- Maximum 2-3 logical nesting levels of directories

### File Structure

Within files, order:

1. Import statements (grouped: external, then internal)
2. Type definitions and interfaces
3. Module-level constants and pure functions
4. Component/system classes that delegate to the above

### Dependency Order

- Definitions before usage
- Helpers before callers
- Types before functions using them

## Pattern Matching

### Switch Statements / Discriminated Unions

Each branch of a switch or pattern match on a discriminated union should be concise. If a branch is complex, consider extracting it into a separate function.

```typescript
switch (event.kind) {
  case 'Damage': return handleDamageEvent(event);
  case 'Heal': return handleHealEvent(event);
  case 'Buff': return handleBuffEvent(event);
}
```

### Exhaustive Matching

For user-authored discriminated union types, try to ensure that all cases are handled explicitly.

**DO:**

```typescript
switch (status) {
  case 'Active': return ...;
  case 'Inactive': return ...;
  case 'Pending': return ...;
}
```

**DO NOT:**

```typescript
switch (status) {
  case 'Active': return ...;
  case 'Inactive': return ...;
  default: return ...;  // avoid catch-all unless logically unreachable
}
```

In special cases a catch-all may be needed if there is truly no logical way for other cases to occur, but avoid this pattern when possible.

### Avoid Deep Nesting

Where possible use early returns and function composition to flatten nested logic.

## Game Systems

When implementing systems, the class/component must be a **thin wrapper** that:

1. Stores dependencies as `const` bindings
2. Delegates all logic to module-level functions
3. Resolves reactive/state values only inside update/render calls

```typescript
// module-level pure logic
function processEntity(stateWrite: StateWrite, entityId: EntityId, position: WorldPosition): void {
  // Pure logic here
  stateWrite.updatePosition(entityId, position);
}

// system class is a thin wrapper
class SomeSystem {
  constructor(
    private projections: Projections,
    private stateWrite: StateWrite
  ) {}

  update(): void {
    const snapshot = this.projections.computeSnapshot();
    for (const [id, pos] of snapshot.positions) {
      processEntity(this.stateWrite, id, pos);
    }
  }
}
```

## Modules Must Be Cohesive

Group related functions and types into modules that represent a single concept or area of functionality.

## Immutability vs Mutability

**Default Immutable:**

- `const` bindings (not `let`)
- Readonly interfaces and `readonly` arrays
- Spread/copy-and-update instead of mutation
- Array transformations (`map`, `filter`) instead of loops where performance allows

**Mutable Only When:**

- Performance-critical tight loops (profiled)
- Interop with mutable APIs (e.g., Phaser, DOM)
- Local optimization hidden from callers

**Encapsulate Mutation:**

```typescript
function processData(data: number[]): number {
  let acc = 0; // hidden, local only
  for (const item of data) {
    acc += compute(item);
  }
  return acc; // pure function interface
}
```

## Error Handling by Context

### Internal APIs

- `Result<T, ValidationError>` for expected errors
- `T | undefined` for absence
- Exceptions only for unrecoverable errors

### Framework-Facing APIs

- Validate inputs at boundaries
- Return `Result` into the engine; throw only for truly unrecoverable errors at the outermost boundary

## Function Design

### Composability

- Small, focused, single-responsibility functions
- Pipeline compatible (data-last parameter where appropriate)

### Parameter Order

- General to specific
- Data parameter last for pipeline compatibility

## Naming

- **PascalCase**: Types, interfaces, enums, type aliases, component classes
- **camelCase**: Functions, variables, parameters, local bindings, module objects
- **Acronyms**: Treat as words (`XmlDocument`, not `XMLDocument`)

## Domain Modeling

### Make Illegal States Unrepresentable

```typescript
type EmailAddress = string & { readonly __brand: 'EmailAddress' };

function createEmailAddress(str: string): EmailAddress | undefined {
  if (isValidEmail(str)) return str as EmailAddress;
  return undefined;
}
```

### Model Workflows as Type Transformations

```typescript
type UnvalidatedOrder = { customerName: string; items: string[] };
type ValidatedOrder = { customerName: ValidatedName; items: Item[] };
type PricedOrder = { order: ValidatedOrder; totalPrice: number };

function placeOrder(order: UnvalidatedOrder): Result<PricedOrder, Error> {
  return pipe(order, validate, resultBind(price), resultBind(save));
}
```

### Separate Data from Behavior

- Types/interfaces for data structures
- Module functions for operations
- DO NOT add methods to data interfaces (except when required by a framework)

## Performance

### Collection Types

- Arrays: performance-critical indexed access, small collections
- Maps: by-key lookup, entity databases
- Sets: membership tests

### Iteration

- Use `for...of` for readable loops
- Use `for` index loops only in performance-critical paths
- Prefer `map`/`filter`/`reduce` for transformations where clarity outweighs micro-optimization

## Critical Rules: DO NOT vs DO

| DO NOT | DO |
| --- | --- |
| Use tabs for indentation | Use 2 spaces per indentation level |
| Align code by variable name length | Use consistent indentation only |
| Expose mutable state from public APIs | Encapsulate mutation behind pure interfaces |
| Mix `null` and `undefined` | Choose `undefined` consistently |
| Use exceptions for expected errors | Use `Result` for expected errors |
| Create deeply nested modules (>3 levels) | Keep hierarchies shallow (2-3 max) |
| Abbreviate names arbitrarily | Use full descriptive names |
| Return `null` from functions | Return `T \| undefined` or `Result<T, E>` |
| Use mutable by default | Use immutable by default |
| Add methods to plain data objects | Use separate functions/modules |
| Use `any` or in-place `as T` casting | See [type_safety_policy.md](./type_safety_policy.md) |

## Summary Checklist

When generating TypeScript code:

- [ ] Use 2 spaces for indentation (NEVER tabs)
- [ ] Respect consistent block alignment
- [ ] Identify consumer context (internal, public API, framework boundary)
- [ ] Apply appropriate type choices for context
- [ ] Default to immutability (`const`, readonly, spreads)
- [ ] Use discriminated unions and exhaustive switches for control flow
- [ ] Compose small functions
- [ ] Handle errors with `Result` (internal APIs) or explicit validation (boundaries)
