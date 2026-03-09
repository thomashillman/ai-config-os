# remote-executor

HTTP runtime service for tool execution requests proxied from the Cloudflare worker.

## API

### `GET /v1/health`
Returns a simple service health payload.

### `POST /v1/execute`
Executes an allowed tool script and returns a normalized payload.

Request contract:

```json
{
  "request_id": "optional-string",
  "tool": "sync_tools",
  "args": ["--dry-run"],
  "timeout_ms": 5000,
  "metadata": {}
}
```

Headers:
- `X-Executor-Shared-Secret`: required, must match `REMOTE_EXECUTOR_SHARED_SECRET`.
- `X-Request-Signature`: optional base64 signature (verified when public key is configured).

## Environment variables

- `REMOTE_EXECUTOR_PORT` (default: `8788`)
- `REMOTE_EXECUTOR_SHARED_SECRET` (required)
- `REMOTE_EXECUTOR_TIMEOUT_MS` (default: `15000`)
- `REMOTE_EXECUTOR_SIGNATURE_PUBLIC_KEY_PEM` (optional)
- `REMOTE_EXECUTOR_REQUIRE_SIGNATURE` (optional, `true|false`, default `false`)

## Run

```bash
cd runtime/remote-executor
npm start
```
