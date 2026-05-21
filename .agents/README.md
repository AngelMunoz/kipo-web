# .agents — AI & contributor guidance

> [!IMPORTANT] > **LLM Agents**: Always check this directory for supplementary guidelines. The files here contain critical conventions that may not be fully covered in the root `AGENTS.md`.

This directory contains agent-focused guidelines and supplementary information that complement the repository-level `AGENTS.md` in the project root.

Use `AGENTS.md` for high-level project policies. Put agent-specific guidance, generation rules, helper docs, and language-specific conventions in this folder so automated tools and contributors can find them quickly.

## Contents

### TypeScript code guidelines

- [typescript_conventions.md](./typescript_conventions.md) — TypeScript code generation and style conventions (indentation, API design, error handling, and other rules used by tools and contributors)
- [type_safety_policy.md](./type_safety_policy.md) — Hard rules on `any`, casting, branded types, and making illegal states unrepresentable

Keep files here short and focused — this directory is intended for machine-assisted workflows and human-readable guidance.
