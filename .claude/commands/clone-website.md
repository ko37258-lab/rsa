---
description: Rebuild one or more websites as working Next.js pages (AI Website Cloner in website-cloner/). Use for website cloning, replication, or reverse engineering.
argument-hint: "<url1> [<url2> ...]"
---

This repository keeps the AI Website Cloner template in `website-cloner/`. Treat `${CLAUDE_PROJECT_DIR}/website-cloner` as the app root for this whole task:

1. If `website-cloner/node_modules` is missing, run `npm ci` inside `website-cloner/` first.
2. Read `${CLAUDE_PROJECT_DIR}/website-cloner/AGENTS.md`, then read `${CLAUDE_PROJECT_DIR}/website-cloner/.agents/skills/clone-website/SKILL.md` completely and follow it for the target URL or URLs in the user's request.
3. Every path the skill names (`src/app/`, `src/components/sites/<site>/`, `public/sites/<site>/`, `docs/research/<site>/`, ...) lives under `website-cloner/`, and every `npm run ...` command runs inside `website-cloner/`.

When invoked directly, `$ARGUMENTS` contains those URL arguments.
