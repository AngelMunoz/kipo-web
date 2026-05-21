# AI Agent Instructions

## Quick Start

- Read this file completely before making any code changes
- Follow TypeScript conventions and Data Oriented Programming principles strictly
- When in doubt, ask clarifying questions

## General Guidelines

- Do not add extra comments to the code
- Follow the coding style and conventions used in the existing codebase
- Avoid aggressive refactors; always do small, methodical, incremental, and verifiable changes
- If working on an implementation that is part of the current plan, always update the corresponding document to reflect the current progress
- Use `pnpm` as the package manager; do not use `npx` or `pnpx` unless explicitly instructed

**IMPORTANT**: ALWAYS present the investigation and analysis of the issue before presenting the solution.

- Ask the right questions to get the context of the issue.
- Do not assume things, research the code, trace the workflow and understand the context before presenting the solution.
- Do not present bandaids or half-baked solutions, always provide a sensible solution.
- IF you are unable to present a good solution, it is all right to say you are unable to do so, present your hypothesis and ask the user to handle the situation.

**IMPORTANT**: You can find supplementary guidelines and conventions in the `.agents` folder in the project root. See [./.agents/README.md](./.agents/README.md) for details.

## Programming Paradigm Hierarchy

**MANDATORY PARADIGM ORDER - STRICTLY ENFORCE:**

1. **PRIMARY: Data Oriented Programming (DOP)** - Default programming style

   - Data structures are first-class citizens
   - Immutable data with pure transformations
   - Separation of data and logic
   - Functions operate on data, not encapsulated within objects

2. **SECONDARY: Interface-based Abstraction** - For service boundaries only

   - Use interfaces for engine services and external dependencies
   - Abstractions must be minimal and focused

3. **TERTIARY: Imperative Programming** - Limited, controlled usage

   - Only for performance-critical sections
   - Must be clearly documented and justified

4. **QUATERNARY: Mutable Imperative** - Exceptional cases only
   - Must be self-contained within single functions
   - Requires explicit documentation of mutation scope
   - Never expose mutable state outside function boundaries

## Data Oriented Programming with TypeScript

### Core DOP Principles

- **Data as Primary Organizing Principle**: All game logic organized around immutable data structures
- **Pure Data Transformations**: Functions transform data without side effects
- **Non-Reactive by Default**: Use standard collections (`Map`, `Set`, arrays) for most game systems. Reserve reactive patterns (RxJS, SolidJS stores) for state that genuinely benefits from automatic change propagation
- **Reactive When Warranted**: Use reactive patterns only when you need automatic change propagation or expensive derived computations that benefit from caching

### TypeScript Implementation

- **Authoritative State**: The game's core state is maintained in a central, mutable-only-through-functions world state
- **Derived Data**: All other game views and stats should be derived from this authoritative state using projections
- **Collections**:
  - Use `Map` for entity databases and component storage by key
  - Use `Set` for active entities, selected units, collision groups
  - Use arrays for ordered collections like inventory, turn order
  - Use plain arrays/Maps for per-frame data (positions, velocities); do not wrap them in reactive abstractions unless UI genuinely needs it
- **Projections**: Compute derived views once per update cycle and cache them; avoid recomputing the same projection multiple times per frame

## Performance Guidelines

**Engine code must favor low-allocation operations since it runs in a game-like environment where garbage collection may result in performance penalties.**

- Prefer `const` and readonly data structures by default
- Favor single-object mutations over array/object reconstructions in hot paths
- Batch state writes and flush once per frame
- Avoid closures in per-frame loops when possible

### Memory Optimization Patterns

- Pool frequently-created objects (see existing projectile/effect pooling patterns)
- Use const assertions and frozen objects for static configuration
- Pre-allocate arrays and buffers where size is known

## Testing Strategy

- **Unit Tests with Fakes**: Test core logic modules in isolation by providing fake implementations of engine service interfaces
- **Property-Based Tests**: Use libraries like `fast-check` to verify mathematical correctness of rules, such as stat composition and effect stacking
- **Deterministic Simulation**: Leverage the deterministic nature of the core logic by using a fixed seed for the random number generator in tests to reproduce complex scenarios

## Code Conventions

**CRITICAL**: Please review the general TypeScript coding conventions defined in [./.agents/typescript_conventions.md](./.agents/typescript_conventions.md) before proceeding.

**IMPORTANT**: Guidelines below are particular opinions that take priority for this codebase; anything else not mentioned here should follow the general TypeScript conventions.

### Functions Must Be Focused

When you are suggesting code to the user, your proposed code should avoid living in a single place.

- Large function bodies should be refactored into smaller functions.
- Logic that can be reused should be moved to module-level functions.
- Avoid putting large amounts of logic directly inside class methods.

Each function should be descriptive of what it does. If a function is doing too much, it can either use:

**Local functions:**

```typescript
function calculateDamage(attacker: CombatStats, defender: CombatStats): number {
  const computeBaseDamage = (a: CombatStats, d: CombatStats): number => { ... };
  const applyModifiers = (base: number, a: CombatStats, d: CombatStats): number => { ... };

  const baseDamage = computeBaseDamage(attacker, defender);
  const modifiedDamage = applyModifiers(baseDamage, attacker, defender);
  return modifiedDamage;
}
```

**Module-level functions:**

```typescript
// combat.ts
function computeBaseDamage(attacker: CombatStats, defender: CombatStats): number { ... }
function applyModifiers(baseDamage: number, attacker: CombatStats, defender: CombatStats): number { ... }

export function calculateDamage(attacker: CombatStats, defender: CombatStats): number {
  const baseDamage = computeBaseDamage(attacker, defender);
  const modifiedDamage = applyModifiers(baseDamage, attacker, defender);
  return modifiedDamage;
}
```

Functions and modules do not need to be private/internal; that is up to the developer's discretion.

### Services

Services should be object expressions.

They should declare an interface (or inherit from `GameSystem`) and the module should export a factory function of said interface.

```typescript
export interface MyInterface {
  do(): MyType;
}

export function createMyInterface(...dependencies): MyInterface {
  return {
    do() {
      return <value>;
    },
  };
}
```


