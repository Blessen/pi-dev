# Pi Sales & Service Playground

This playground demonstrates running the Pi agent orchestrator ([`@earendil-works/pi-agent-core`](../packages/agent)) against a local Ollama model (`qwen3.6:latest` at `http://localhost:11434/v1`).

---

## Files

- [`server.ts`](./server.ts): HTTP SSE Server (`POST /api/chat`) wrapping Pi Agent with real-time text and tool streaming.
- [`test_cli.ts`](./test_cli.ts): Direct terminal streaming script (no HTTP server required).
- [`test_curl.sh`](./test_curl.sh): Executable curl test script.

---

## 1. Direct Terminal Run (No Server Needed)

To test the agent and streaming directly in your terminal:

```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/test_cli.ts "Hello! Who are you?"
```

With tool invocation:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/test_cli.ts "We need a 500 kVA genset for a hospital"
```

---

## 2. Running the HTTP Server & Curl

### Start the Server:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/server.ts
```
The server will listen at `http://localhost:3001/api/chat`.

### In another terminal, run the curl tests:
```bash
./playground/test_curl.sh
```

Or run manual curl:
```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, introduce yourself."}'
```
