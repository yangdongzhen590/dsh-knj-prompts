# Scene Package MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add portable one-scene package guidance, manual persistence, bootstrap skills, and ZIP-to-AI installation handoff to `dsh-knj-prompts`.

**Architecture:** Scene metadata remains in the existing JSON store and gains one free-text manual. The server owns bootstrap skill seeding and ZIP staging; the React picker owns user selection and draft handoff. ZIP extraction, filesystem installation, and configuration remain instructions in two bundled skills.

**Tech Stack:** TypeScript, Node.js `node:http` and `node:fs`, React 18, tsdown, Node built-in test runner.

**Spec:** `D:\workspace\iobs_pro\openspec\changes\add-scene-package-mvp\{proposal,design,tasks}.md`

## Global Constraints

- Maintain legacy `scenes.json` compatibility by treating absent manuals as empty strings.
- Bundle bootstrap skills but never overwrite existing `<DSH_HOME>/skills/<skill-id>` directories.
- Accept only same-origin ZIP uploads with a bounded request body and safe server-generated filenames.
- Keep package execution out of the plugin; skills preflight, seek confirmation, install, configure, and verify.
- Do not write UTF-8 BOM in JSON/YAML files.

---

### Task 1: Scene model and seed contract

**Files:**
- Modify: `src/types.ts`, `src/client/engine.ts`, `src/store.ts`, `engine.test.mjs`

**Interfaces:**
- Produces: `Scene.operationManual: string`, `SceneForm.operationManual: string`.

- [ ] Write tests that `validateScene` normalizes omitted manuals and that `buildSceneEdit` preserves a supplied manual.
- [ ] Run `node --test engine.test.mjs` and observe the missing-field assertion fail.
- [ ] Add the field, seed package scenes, normalization, dirty tracking, and edit construction.
- [ ] Re-run `node --test engine.test.mjs` and observe a pass.

### Task 2: Manual editor

**Files:**
- Modify: `src/client/ScenePicker.tsx`, `src/client/styles.ts`

**Interfaces:**
- Consumes: `SceneForm.operationManual`.
- Produces: a default-collapsed manual `<details>` editor in the existing modal.

- [ ] Add a focused client typecheck assertion by compiling the changed picker.
- [ ] Add the controlled details/textarea UI and styles without creating another window or tab.
- [ ] Run `npm.cmd run check:client`.

### Task 3: Bootstrap skills

**Files:**
- Create: `skills/scene-package-exporter/SKILL.md`, `skills/scene-package-installer/SKILL.md`, `src/bootstrap-skills.ts`
- Modify: `src/index.ts`, `package.json`

**Interfaces:**
- Produces: `ensureBootstrapSkills(dshHome, sourceRoot)` which only copies missing target directories.

- [ ] Write Node tests using temporary directories to prove missing skills are copied and existing targets survive.
- [ ] Run the test and observe it fail before `ensureBootstrapSkills` exists.
- [ ] Implement directory-only copy and invoke it during server setup.
- [ ] Re-run the focused test and the server typecheck.

### Task 4: ZIP staging and draft handoff

**Files:**
- Create: `src/scene-package.ts`
- Modify: `src/routes.ts`, `src/index.ts`, `src/client/api.ts`, `src/client/ScenePicker.tsx`

**Interfaces:**
- Produces: `mountPackageRoutes(host, importsDir)` and `uploadScenePackage(file): Promise<{ path: string }>`.

- [ ] Write tests for a valid ZIP filename, rejected extension, and bounded stream validation helper.
- [ ] Run the focused test and observe failures.
- [ ] Implement upload endpoint plus picker state/UI that uploads only for installation seed and writes the staged path into the generated prompt.
- [ ] Re-run tests, typechecks, and client bundle build.

### Task 5: Documentation and delivery evidence

**Files:**
- Modify: `README.md`, OpenSpec task list

- [ ] Document layout, bootstrap discovery, upload handoff, and explicit V1 limits.
- [ ] Run `node --test engine.test.mjs`, `npm.cmd run typecheck`, `npm.cmd run check:client`, `npm.cmd run build`, and `npm.cmd run build:client`.
- [ ] Mark every completed OpenSpec task and record delivery verification.
