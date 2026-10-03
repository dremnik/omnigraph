# Plan 4: build, CI and release

Supporting material for [Studio: a local graph UI served by the CLI](../../2026-10-02-studio.md), sections 4 and 7. Surveyed against `.github/workflows/{ci,release}.yml`, `scripts/check-workflow-action-pins.py` and `scripts/check-dependency-sources.py` at `2bf5483a`.

## The rule

The Rust build never runs JavaScript. `cargo build --locked` on a clean checkout, `install-source.sh`, `cargo install --path`, the release matrix and the Docker image all produce a binary with the UI, because `ui/dist` is in the tree and `include_dir!` reads it at compile time. Bun is needed only by someone changing the UI, and by one CI job.

## Committed `dist`

`crates/omnigraph-studio/ui/dist/` is committed. Vite emits hashed filenames, so a UI change replaces files rather than editing them; `.gitattributes` marks `crates/omnigraph-studio/ui/dist/** linguist-generated -diff` so PR review collapses them. Expected size: 300 to 600 KB gzipped on disk for the phase 1 UI.

The reproducibility requirement: `bun run build` must be deterministic for a given `bun.lock`. Vite's output is deterministic by default; the config sets `build.sourcemap: false` and fixes `build.rollupOptions.output` naming so the hash depends only on content.

## CI job `studio-ui`

Added to `ci.yml` as its own job, running on every PR and on `main`:

```yaml
studio-ui:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<sha>            # same pin as the other jobs
    - uses: oven-sh/setup-bun@<sha>           # full-SHA pin, as check-workflow-action-pins.py requires
      with:
        bun-version: <exact>                  # equals "packageManager" in package.json
    - run: bun install --frozen-lockfile
      working-directory: crates/omnigraph-studio/ui
    - run: bun run check && bun run test      # tsc --noEmit, eslint, vitest (parser suite)
      working-directory: crates/omnigraph-studio/ui
    - run: bun run build
      working-directory: crates/omnigraph-studio/ui
    - run: git diff --exit-code -- crates/omnigraph-studio/ui/dist
```

The last step is the drift check: a PR that changes the UI without rebuilding, or rebuilds with a different toolchain, fails here with the diff in the log. It is the same guarantee `openapi.rs` gives for `openapi.json`, applied to a directory.

If maintainers prefer Node, the job swaps `setup-bun` for `setup-node` with `npm ci`; `package.json` and `vite.config.ts` do not change.

## Release

`release.yml` does not change. Its `cargo build --release --locked -p omnigraph-cli …` already picks up `ui/dist` through `include_dir!`. No runner needs Bun. The `omnigraph-server` package is unchanged and the Docker image gains nothing, since the server binary does not mount the studio router.

## Guards that already exist and how this fits

- `check-workflow-action-pins.py`: `setup-bun` is pinned by full SHA like every other action.
- `check-dependency-sources.py`: the new crates (`include_dir`, `mime_guess`, `webbrowser`) come from crates.io; no `path` or `[patch]` sources. Bun packages are not Cargo dependencies and are outside this check, as build scripts are.
- `cargo deny`: the three new crates are MIT or Apache-2.0 dual licensed. `include_dir` has no transitive dependencies of note.
- `typos`: `ui/dist` is excluded in `_typos.toml`, as minified output would otherwise trip it.
- `check-docs.py`: the RFC and this assets folder pass as of the draft.

## Local developer loop

```sh
cargo run -p omnigraph-cli -- studio --cluster .data/demo --no-open --bind 127.0.0.1:8798
cd crates/omnigraph-studio/ui && bun run dev      # Vite on :5173, proxies /graphs etc. to :8798
```

Edits to the UI hot-reload without touching Rust. Before committing a UI change: `bun run build`, then commit `dist` with the source.

## Rollout in PRs

1. **Seam.** Plan 1 alone: `serve_with_routes` plus its test. Reviewable in isolation, no UI, no CI change.
2. **Crate and subcommand, hidden.** Plans 2 and 3 with a placeholder `index.html`, the `studio-ui` job, and the `cli_studio.rs` tests. The subcommand is `#[command(hide = true)]`.
3. **Phase 1 UI.** The real `dist`, the user doc page under `docs/user/cli/`, the subcommand made visible. The RFC's `implementation` field moves to `partial`.

Each PR is independently revertible and leaves `main` releasable.
