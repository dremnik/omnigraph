# Plan 2: the `studio` subcommand

Supporting material for [Studio: a local graph UI served by the CLI](../../2026-10-02-studio.md), section 3. Surveyed against `crates/omnigraph-cli/src/{cli,helpers,operator}.rs` and `crates/omnigraph-server/src/settings.rs` at `2bf5483a`.

## Shape

A new variant in the `Subcommand` enum in `cli.rs`, beside `Snapshot` and `Graphs`:

```text
omnigraph studio --cluster <dir> [--graph <id>] [--bind <addr>] [--no-open] [--as <actor>]
omnigraph studio --server <name|url> [--graph <id>] [--bind <addr>] [--no-open]
```

| Flag | Rule |
|---|---|
| `--cluster <dir>` | Boot mode. A cluster config directory, as `omnigraph-server --cluster` takes it. Object-storage roots are refused in phase 1: the single-writer risk is highest there and attach mode is the right tool. |
| `--server <name\|url>` | Attach mode. Resolved by the existing `resolve_server_flag`: a value with `://` is a literal base URL, anything else is a `servers:` name in `~/.omnigraph/config.yaml`. Exactly one of `--cluster` and `--server` is required; clap enforces the pair. |
| `--graph <id>` | The graph the UI opens first. Optional; without it the UI shows the graph list from `GET /graphs`. |
| `--bind <addr>` | Default `127.0.0.1:0`, which asks the OS for a free port. A non-loopback host is refused before anything starts. |
| `--no-open` | Print the URL and do not launch a browser. The URL is always printed. |
| `--as <actor>` | Boot mode only. Open question 1 in the RFC decides whether it is needed; if the server's `Open` runtime state already attributes commits to a usable actor, the flag is dropped. |

The global `--direct`, `--profile`, `--store` and `--cluster` flags that other verbs accept do not apply; `studio` rejects them with the same message `cluster` subcommands use for `--as` today, so the addressing rules stay one set.

## Boot mode sequence

1. Validate `--bind` is loopback.
2. `load_server_settings(Some(dir), Some(bind), true /* unauthenticated */, false)` from `omnigraph-server`. This is the same loader the server binary uses, so an unapplied folder fails with the server's own `cluster_state_missing` error and a quarantined graph behaves as it does under `omnigraph-server`.
3. Build the studio router from `omnigraph_studio::router()` (plan 3).
4. Spawn `serve_with_routes(settings, router)` on the CLI's tokio runtime.
5. Poll `GET /readyz` on the bound port until `ready: true` or a five-second deadline, then print the URL and open the browser unless `--no-open`.
6. Wait for Ctrl-C. The server's RFC 0049 shutdown runs as it does for the binary.

The bound port is learned from the listener. `serve_config` resolves `config.bind` itself, so step 4 needs the seam to report the bound address; the simplest form is a `tokio::sync::oneshot` the CLI passes in, or `serve_with_routes` returning the `SocketAddr` through a callback. Plan 1 settles that detail in review.

The startup banner states the mode and the rule: "Boot mode serves `<dir>` from this process. Do not boot the studio on a folder another server is serving; use `--server` for a served cluster."

## Attach mode sequence

1. Validate `--bind` is loopback.
2. Resolve the base URL with `resolve_server_flag(server, graph)` and the credential with `resolve_remote_bearer_token(Some(&url))`. Both exist today and give `studio` the same `login`, keyed-env and `OMNIGRAPH_TOKEN` behavior as `query --server`.
3. Build an axum app: the studio router merged with a fallback handler that proxies every other path.
4. Bind, print, open, wait for Ctrl-C.

The proxy is one handler on the existing `reqwest` client: copy method, path, query string, headers minus hop-by-hop and minus any incoming `Authorization`, add `Authorization: Bearer <token>`, stream the request body, stream the response body back with the remote's status and headers. A 30-second request timeout and the server's own `DEFAULT_REQUEST_BODY_LIMIT_BYTES` as the body bound. No retry, no rewriting of error bodies: a `403` from policy, a `412` from a stale precondition, or a `404` for a route an older server lacks reach the UI as the server wrote them.

Only `/graphs/*`, `/healthz`, `/readyz` and `/openapi.json` are forwarded. Any other unmatched path is a `404` from the studio, so the local port never becomes a general proxy to the remote.

## Errors

| Case | Behavior |
|---|---|
| `--bind` not loopback | Refused: "studio binds loopback only; got `0.0.0.0:…`". |
| Both or neither of `--cluster` and `--server` | clap usage error. |
| Unapplied cluster folder | The server's `cluster_state_missing` error, unchanged. |
| `--server` name unknown | The existing "unknown server, defined servers are …" error. |
| No credential for a remote | Start anyway. The UI shows the remote's `401` on the first request. Same as `query --server` without a token. |
| Browser launch fails | Print the URL; not an error. |
| Port in use (explicit `--bind`) | OS error, exit non-zero. |

## Tests

New `crates/omnigraph-cli/tests/cli_studio.rs` on `tests/support`:

- boot: an applied folder serves `GET /` with the UI index and `GET /graphs` with the inventory; `--no-open` prints a loopback URL; `--bind 0.0.0.0:0` is refused; an unapplied folder exits with `cluster_state_missing`.
- attach: against a server booted by `support` with a static token, `GET /graphs/{id}/snapshot` through the studio port returns the same body as a direct call; the request the server receives carries the configured `Authorization` header; an incoming `Authorization` header on the studio port is dropped, not forwarded; `GET /anything-else` is `404` and never reaches the remote.
- `parity_matrix.rs` and `system_remote.rs` are untouched: `studio` is not a data verb and does not enter the addressing matrix.

## Dependencies

`webbrowser` or `open` for launching the browser, both MIT/Apache and pure Rust. One new crate, subject to `cargo deny`. Everything else is already in the CLI's tree.
