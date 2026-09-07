---
name: scene-package-installer
description: Preflight and install a one-scene DSH scene package ZIP with explicit user confirmation.
---

# Scene Package Installer

Install the scene package ZIP provided by the user. The browser/plugin may have staged it under `<DSH_HOME>/knj-prompts/imports`; that path is local input, not a signal to trust or execute the package blindly.

## Required preflight — no writes

1. Confirm the ZIP path exists and inspect it without executing content.
2. Require V1 root files: `manifest.json`, `scene.json`, and `README.md`; validate that the manifest identifies one `dsh-scene-package` version `1` and scene metadata describes exactly one ordinary scene.
3. Read the scene `operationManual` and README. Show the user the proposed scene, embedded skills, materials, target directories, needed configuration questions, and validation plan.
4. Ask for the current target DSH skills root (normally `<DSH_HOME>/skills`) and configuration values required by each embedded skill. Never reuse or infer source-machine runtime values from the ZIP.
5. Before any write, check every embedded `skills/<skill-id>` against the target root. If **any** target skill directory already exists, report all collisions and stop: do not overwrite, merge, delete, or perform partial writes.
6. Ask for explicit confirmation after presenting the final write plan.

## Install after confirmation

1. Create the ordinary scene and copy embedded skills/materials only to the confirmed target locations.
2. For every installed skill, write current-environment configuration only to the file/path/format that skill itself documents. If a configuration requirement is ambiguous, stop and ask rather than inventing a format.
3. Validate the completed files: expected scene data, one `SKILL.md` per installed skill, declared materials, and each skill's documented configuration checks.
4. Report installed paths, skipped non-runtime package data, configuration locations (not values), and validation results.

## V1 limits

Do not install DSH plugin code. Do not support multi-scene packages, merging, overwrite, remote registries, signatures, dependency graph resolution, update/sync, or automatic configuration discovery.
