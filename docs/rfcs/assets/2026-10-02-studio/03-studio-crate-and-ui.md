# Plan 3: the `omnigraph-studio` crate and the UI

Supporting material for [Studio: a local graph UI served by the CLI](../../2026-10-02-studio.md), section 4. API shapes verified against a running 0.11.0 server and `openapi.json`.

## Crate layout

```text
crates/omnigraph-studio/
├── Cargo.toml          # axum, include_dir, mime_guess; no engine dependency
├── src/lib.rs          # pub fn router() -> axum::Router
└── ui/
    ├── package.json    # pinned Bun via "packageManager"; scripts: dev, build, check, test
    ├── bun.lock
    ├── vite.config.ts  # dev proxy: /graphs, /healthz, /readyz -> the studio port
    ├── src/
    └── dist/           # committed build output (plan 4)
```

`router()` serves `ui/dist/index.html` at `/` and every file under `ui/dist` at `/_studio/<path>`, with `Cache-Control: no-cache` on the index and immutable caching on the hashed assets. Unknown paths under `/_studio/` are `404`; every other path falls through to the server, which is what makes the merge in plan 1 safe. The crate has no dependency on the engine, the server or the cluster crates. It is a static-file router and nothing else.

## UI stack

Vite, React, TypeScript. TanStack Query for fetching and caching, TanStack Table for the grid, Tailwind for styling, lucide for icons, React Router for URL state. No component library, no state manager beyond Query, no code generation. Bun runs the toolchain; the Rust build never does.

## What the UI reads

| Screen element | Route | Notes |
|---|---|---|
| Graph list and breadcrumb | `GET /graphs` | `graph_id` and `uri`. In attach mode a `graph_list` denial shows as the server's error, not a studio failure. |
| Sidebar types and columns | `GET /graphs/{id}/schema` | `schema_source` is the `.pg` text with comments. Parsed in the browser (below). |
| Sidebar counts, branch, manifest version | `GET /graphs/{id}/snapshot?branch=…` | `datasets[]` with `entity_kind`, `type_name`, `entity_count`. |
| Branch list | `GET /graphs/{id}/branches` | `branches[]`. |
| Head commit, commit count | `GET /graphs/{id}/commits` | Newest first; `graph_commit_id`, `actor_id`, `created_at`. |
| Grid rows | `POST /graphs/{id}/query` | One generated query per type and page, below. Response carries `columns`, `rows`, `row_count`, `graph_commit_id`. |
| Structure tab | the same `schema_source` | Rendered as the source text, with the type under the cursor highlighted. |

No studio-only endpoint. Attach mode and boot mode run the same UI code against the same routes.

## Generated queries

For node type `T` on page `n` with page size `p`:

```text
query studio_rows() {
  match { $x: T }
  return { $x }
  order { $x.<first indexed or first property> asc }
  limit p
}
```

Returning `$x` yields the entity object with `@id` and every property, which the grid splits into columns using the parsed schema, so `columns` from the response is only used to confirm the shape. Edge types match `$a -[$e: E]-> $b` and return `$e`, `$a`, `$b` so the grid can show endpoints by id. Paging uses `offset` if GQ supports it at the surveyed version; otherwise the grid pages by keyset on the ordered property. Which one applies is checked in the first implementation step and recorded in the UI's query module; the RFC does not depend on it.

Every grid shows the `graph_commit_id` the rows were read at next to the branch. Refresh re-runs the query; it never silently retries.

## The `.pg` parser

A hand-written recursive-descent parser in TypeScript for the grammar in `docs/user/schema/index.md`: `interface`, `node … implements …`, `edge A: B -> C @card(…)`, property types including `enum(…)`, `[T]`, `T?`, `Vector(N)`, `Blob`, property attributes (`@key`, `@unique`, `@index`, `@embed`, …) and block constraints (`@range`, `@unique(@src, @dst)`, …). Line and block comments are kept as tokens so the sidebar can read section markers.

Output: a list of declarations in source order, each with its name, kind, properties with type and nullability, and the comment lines immediately above it. The grid header shows `string`, `string?`, `date?` from this.

Folders: a line comment matching `^//\s*\d+\s*[—–-]\s*(.+)$` opens a folder named by the capture; declarations after it belong to it until the next marker. Declarations before the first marker sit at the root. This is a studio convention, documented in the studio's user page; the schema language is unchanged and open question 2 in the RFC asks whether a formal annotation is preferred later.

Tests: a `vitest` suite with one case per construct in the schema doc, plus the Lumen demo schema as a whole-file case asserting 11 node types, 18 edge types and 4 folders.

## Phase 1 screens

1. **Shell.** Breadcrumb (mode, cluster name from `cluster.yaml` `metadata.name` in boot mode or the server name in attach mode, graph), theme toggle, sidebar, main pane.
2. **Sidebar.** Folders and types with counts; node and edge types distinguished by icon; selection drives the URL `/g/:graph/t/:type`.
3. **Data tab.** Grid with sticky header, type-annotated column headers, row numbers, a client-side search over the loaded page, pager with `n–m of total` and the server time of the last query, refresh.
4. **Structure tab.** Schema source with the selected type highlighted.
5. **Header strip.** Branch name, head commit id, branch count, commit count. Branch switching is phase 2; phase 1 reads `main`.

Light and dark themes, keyboard focus on the grid, no mobile layout.

## Demo fixture

`crates/omnigraph-studio/demo/`: `schema.pg` (Lumen Labs, 11 node and 18 edge types in four sections) and `seed.ndjson` (1,922 records). `bun run demo` creates `.data/demo`, runs `omnigraph cluster import` and `cluster apply`, boots `omnigraph studio --cluster .data/demo --no-open`, and loads the seed through `POST /graphs/lumen/load/ndjson`. The end-to-end test in plan 4 uses the same fixture. All names in it are invented and every URL is an `.example` domain.
