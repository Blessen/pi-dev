# Pi Sales & Service Playground

This playground demonstrates running the Pi agent orchestrator ([`@earendil-works/pi-agent-core`](../packages/agent)) against a remote vLLM model (`Qwen/Qwen3-Coder-30B-A3B-Instruct` at `http://192.168.63.12:8000/v1`) with full KOEL Service Assistant guidelines and tools from `DA_BT_279_SALES_AGENT`.

---

## Files

- [`server.ts`](./server.ts): HTTP SSE Server (`POST /api/chat` on port 7001) wrapping Pi Agent with real-time text and tool streaming.
- [`service_tools.ts`](./service_tools.ts): The full suite of 12 KOEL Service Agent tools.
- [`test_cli.ts`](./test_cli.ts): Direct terminal streaming script (no HTTP server required).
- [`test_curl.sh`](./test_curl.sh): Executable curl test script.

---

## Service Agent Tools Suite (`service_tools.ts`)

1. **`update_genset_details`**: Resolves and validates assets by Serial Number, App Code, Instance ID, or SR No.
2. **`get_tsb_details_or_spn_fmi_summary`**: SPN/FMI fault code analysis, severity rating, root causes, and initial checks.
3. **`modify_spn_fmi_codes`**: Adds or removes SPN/FMI fault codes from active diagnostic sessions.
4. **`display_extracted_fault_codes`**: Renders prioritized fault table and diagnostic sequence.
5. **`get_symptom_summary`**: Diagnoses engine symptoms (black smoke, overheating, hunting, low oil pressure) with Step 1 verbatim action.
6. **`get_recent_service_requests`**: Retrieves past Service Requests (dates, problem codes, field solutions).
7. **`lookup_service_request`**: Retrieves full case details for a specific SR number.
8. **`query_technical_knowledge`**: Queries exact workshop manual specifications (valve clearances, head bolt torques, oil capacities).
9. **`get_wiring_diagram`**: Electrical schematic diagrams and ECU pinout references.
10. **`display_continue_options`**: Interactive action widget (View Issue Details, Issue Resolved, Change SPN/FMI).
11. **`display_feedback_block`**: Issue resolution and satisfaction rating widget.
12. **`suggest_genset`**: Sizing recommendations based on required kVA capacity.

---

## 1. Direct Terminal Run (No Server Needed)

### Diagnostic Troubleshooting:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/test_cli.ts "I am troubleshooting a genset with app code DV8.8501.C4 and serial number 2320045 showing fault SPN 3216 FMI 9. How do we start diagnosis?"
```

### Technical Manual Query:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/test_cli.ts "What are the exact valve clearances and head bolt torques for CPCB IV+?"
```

### Physical Symptom Diagnosis:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/test_cli.ts "The engine is emitting black smoke under load. What is step 1?"
```

---

## 2. Running the HTTP Server & Curl

### Start the Server:
```bash
./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/server.ts
```
The server will listen at `http://localhost:7001/api/chat`.

### In another terminal, run curl tests:
```bash
./playground/test_curl.sh
```

Or run manual curl:
```bash
curl -N -X POST http://localhost:7001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the procedure for SPN 3216 FMI 9 on app code DV8.8501.C4?"}'
```
