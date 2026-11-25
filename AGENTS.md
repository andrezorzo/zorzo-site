# AGENTS.md

## Documents

This repo holds only the static front. The documents that define the product, the architecture and the
contract live in [zorzo-api](https://github.com/andrezorzo/zorzo-api), which is their single source:

1. `docs/product-brief.md`: what and for whom.
2. `docs/hld.md`: the system design, including the front's place in it (static site on S3 + CloudFront).
3. `docs/lld.md`: rules, values and the API contract the front consumes (SSE events, errors, health).
4. `docs/adr/`: decision records, one numbering for the whole system.
5. `docs/roadmap.md` and `docs/features/`: features, specs and tasks, front tasks included.
6. `GLOSSARY.md`: the domain vocabulary. Use its terms in code, interface text and tests.

**Where each piece of information lives**

- **What the system does** lives in zorzo-api `docs/`. This repo never repeats a rule, value or contract;
  it points to the document and section title.
- **How the front is built** lives in `docs/lld.md`; commands and code practices live in this file.
- **Planning** follows the zorzo-api `AGENTS.md`, "Planning": a front task is planned and tracked there,
  and its code lands here, in a PR that names the task (`F<NN>-T<NN>`).

## Commands

Run from the repository root. The site has no build: what is in the repository is what is served.

| What | Command |
| --- | --- |
| Serve the site locally | `npm run serve`, then open http://127.0.0.1:4173 |
| Use the API's published data instead of the demo copy | `cp -r ../zorzo-api/var/data ./data` (after an ingest with `--activate`; see zorzo-api `apps/ingest/AGENTS.md`) |
| Install the test tools | `npm ci && npx playwright install chromium` |
| Browser tests | `npm test` |
| Refresh the test fixture | in zorzo-api, ingest `tests/fixtures/corpus` with `EMBEDDER=fake APP_ENV=local --activate` into an empty `DATA_DIR`, then copy that folder to `tests/fixtures/data/` |
| Rebuild the brain data | download the mesh (see `tools/build_brain.py`), then `uv run tools/build_brain.py` |
| Rebuild the still image | `npm run serve`, then `uv run tools/make_poster.py` |

## Code practices

- How the front is built (modules, the brain's data, the fallback without 3D) is in `docs/lld.md`; read it
  before changing `assets/js/`.
- The interface gets answers only through `ask(question, {signal})` and its stream events; it never reads the
  search directly. The scene and the data never import the interface.
- Nothing loads from another origin: libraries and fonts are vendored with their license files.
- Text the visitor reads goes through `i18n.js`, in both languages.

## Web platform

This project's Baseline target is Baseline Widely available.

- A feature outside the target enters only as progressive enhancement, with a fallback that keeps the
  answer usable.
- The site works without WebGL: the 3D brain is an enhancement, never a requirement (F01 PRD, story S11).
- Prefer native platform features (dialog, popover, anchor positioning, View Transitions) over libraries
  when they meet the target.

## Git conventions

- **Main branch:** `main`. Never commit directly to it.
- **Work branches:** `feature/*`, `bugfix/*`, `hotfix/*` and `docs/*`, created from `main` and merged by
  pull request.
- **Commits:** conventional commits (`docs:`, `feat:`, `fix:` …), short and focused on why.
- **Review before push:** on the unreviewed diff, run `simplify`, then `code-review` at level `high`; no code
  reaches GitHub until the review comes back with nothing accepted, plus a `security-review` when the diff
  touches secrets, configuration, error handling, user input or rendering of model output. Fixes from a review
  are new code and go through the same loop. When a library or browser default affects security, check it in
  the installed source or the spec, not from memory.
- **Pull request description:** follows `.github/pull_request_template.md`. A task PR has the task title, a
  summary, the plan path in zorzo-api, a "Criteria" section with one item per `AC<n>` (the test that proves
  it, or what a human reviewer checks and where) and optional "Notes". Any other PR has "What", "Why"
  (where it came from, e.g. a review) and "Review" (the files and sections to look at).
- **No AI attribution:** no co-author trailers or "generated with" lines in commits or pull requests.
- **Merge:** merging is the owner's decision. An agent merges only when the owner explicitly authorizes
  that PR or task, and a refused `gh pr merge` is never worked around.

## Library documentation

When you need a library's documentation, use context7 for current and accurate information.

## Agent skill usage

Always load the skills the task needs. When a skill disagrees with `AGENTS.md` or the rules, `AGENTS.md`
and the rules win.

- **modern-web-guidance** (project plugin, `.claude/settings.json`): search it before writing HTML, CSS or
  browser JS, and follow the Baseline target above. Its telemetry is off (`DISABLE_TELEMETRY=1`).
- **frontend-design**: visual direction. Modern-web-guidance covers how to use the platform; this covers
  how the site looks.
