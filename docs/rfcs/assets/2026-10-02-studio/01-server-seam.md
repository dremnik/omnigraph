# Plan 1: the server seam

Supporting material for [Studio: a local graph UI served by the CLI](../../2026-10-02-studio.md), section 4. Surveyed against `crates/omnigraph-server/src/lib.rs` at `2bf5483a`.

## What exists

`serve(config)` calls the private `serve_config(config, None, None)`, which loads tokens, classifies the runtime state, opens the cluster into `AppState`, builds the axum app, binds `config.bind`, and runs it with the RFC 0049 shutdown protocol. The app is assembled by a private function that nests the per-graph router under `/graphs/{graph_id}`, merges the management routes, adds `/healthz`, `/readyz`, `/openapi.json`, conditionally merges the MCP router, then applies the body limit and trace layers and attaches the state. Nothing outside the crate can reach the app before it is bound.

## The change

One public function and one line in each existing entry point.

```rust
/// Serve the configured cluster with additional routes merged into the app.
/// The server's own routes are registered first, so a path the server defines
/// always wins. Extra routes carry no authentication of their own; callers
/// bind them only on a loopback socket.
pub async fn serve_with_routes(config: ServerConfig, extra: Router) -> Result<()> {
    serve_config(config, None, None, extra).await
}

pub async fn serve(config: ServerConfig) -> Result<()> {
    serve_config(config, None, None, Router::new()).await
}
```

`serve_with_data_token_trust` passes `Router::new()` too. Inside `serve_config`, `extra` goes into the app builder, which merges it after the server's own routes and before the body-limit and trace layers, so an extra route has the same request-size bound and the same tracing as everything else. The extra router is `Router<()>`: it gets no `AppState`, so it cannot reach the engine, the token map or the policy. That is the whole boundary: static files in, nothing out.

The `omnigraph-server` binary (`src/main.rs`) keeps calling `serve` and `serve_with_data_token_trust`. Its behavior is byte-for-byte unchanged.

## Why a merge and not a layer or a nest

A nest under `/_studio` would hide the UI's index from `/`, and the whole point of the command is that the printed URL opens the UI. A merge lets the extra router own `/` and `/_studio/*` while the server keeps `/graphs/*`, `/healthz`, `/readyz`, `/openapi.json` and `/mcp`. axum rejects two routes for the same path at build time, so a future server route that collides with a studio route fails the server's own tests, not the user's session.

## Tests

- `crates/omnigraph-server/tests/`: a new `extra_routes.rs` on the existing `tests/support` fixtures. It boots a cluster through `serve_with_routes` with a one-route extra router, asserts `GET /` returns that route's body, asserts `GET /graphs` still requires a bearer token, and asserts `/graphs/{id}/query` returns the same shape as in `data_routes.rs`.
- `openapi.rs` runs unchanged. The extra router is outside `served_openapi()`, so the committed `openapi.json` does not move. This is the evidence that the documented surface is unaffected.
- A path-collision test: an extra router that defines `/healthz` makes `serve_with_routes` panic at app build, as axum's `merge` does today. Documented, not worked around.

## Size

About thirty lines of change in `lib.rs`, one new test file. No new dependencies.
