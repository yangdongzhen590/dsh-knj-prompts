---
name: scene-package-exporter
description: Export one ordinary DSH prompt scene as a portable scene package ZIP.
---

# Scene Package Exporter

Export exactly one ordinary prompt scene as `<scene-id>.dshscene.zip`. Treat the scene's `operationManual` Markdown as the only source of truth for package operations, dependencies, materials, configuration templates, and verification guidance.

## Safety and confirmation

1. Ask which scene to export; read its prompt and `operationManual`.
2. Identify embedded skills, materials, and configuration guidance from that manual. When an old skill lacks migration instructions, infer a short migration description and **ask the user to confirm it** before including it.
3. Present a dry-run file tree and enumerate excluded source-environment runtime configuration values. Do not copy active credentials, tokens, endpoints, or local runtime values into the package.
4. Ask for explicit confirmation before writing the ZIP.

## V1 ZIP contract

```text
<scene-id>.dshscene.zip
├─ manifest.json
├─ scene.json
├─ README.md
├─ skills/                    # optional embedded skill directories
│  └─ <skill-id>/
│     ├─ SKILL.md
│     └─ ...
└─ materials/                 # optional files named by the manual
```

- `manifest.json` identifies format `dsh-scene-package`, version `1`, and the scene id.
- `scene.json` contains only one ordinary scene definition, including its `operationManual`.
- `README.md` copies or summarizes the operation manual for human inspection.
- Never package ordinary DSH plugin code, source-machine runtime configuration values, signatures, registry metadata, update state, or multiple scenes.

## Completion

After creating the ZIP, list its contents, report its path and size, and state which source values were deliberately excluded. Do not claim that installation has occurred.
