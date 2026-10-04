import http from "node:http";
import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createModels, createProvider, type Model, Type, type UserMessage } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { evaluateGuidelines, SERVICE_GUIDELINES } from "./service_guidelines.ts";
import { ALL_SERVICE_TOOLS, defaultSessionState, executeServiceTool, resetSessionState } from "./service_tools.ts";

const PORT = Number(process.env.PORT) || 7001;
const VLLM_BASE_URL = process.env.VLLM_BASE_URL || "http://192.168.63.12:8000/v1";
const MODEL_ID = process.env.MODEL_ID || "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const ENABLE_TOOLS = process.env.ENABLE_TOOLS === "true";

interface ClientHistoryItem {
	role: "user" | "assistant";
	content: string;
}

function convertHistoryToMessages(history: ClientHistoryItem[]): AgentMessage[] {
	const messages: AgentMessage[] = [];
	const now = Date.now();
	for (let i = 0; i < history.length; i++) {
		const item = history[i];
		if (!item.content || typeof item.content !== "string" || item.content.trim() === "") {
			continue;
		}
		const timestamp = now - (history.length - i) * 1000;
		if (item.role === "assistant") {
			messages.push({
				role: "assistant",
				content: [{ type: "text", text: item.content }],
				api: "openai-completions",
				provider: "vllm",
				model: MODEL_ID,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
				stopReason: "stop",
				timestamp,
			} as AssistantMessage);
		} else if (item.role === "user") {
			messages.push({
				role: "user",
				content: item.content,
				timestamp,
			} as UserMessage);
		}
	}
	return messages;
}

// 1. Register remote vLLM model provider
const vllmModel: Model<"openai-completions"> = {
	id: MODEL_ID,
	name: "Qwen 30B (vLLM)",
	api: "openai-completions",
	provider: "vllm",
	baseUrl: VLLM_BASE_URL,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100000,
	maxTokens: 4096,
};

const vllmProvider = createProvider({
	id: "vllm",
	name: "Remote vLLM",
	baseUrl: VLLM_BASE_URL,
	auth: { apiKey: { name: "vLLM", resolve: async () => ({ auth: { apiKey: "none" } }) } },
	models: [vllmModel],
	api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(vllmProvider);

// 2. Comprehensive Service Agent System Prompt & Guidelines (DA_BT_279_SALES_AGENT)
const SYSTEM_PROMPT = `You are the lead Service, Maintenance, and Technical Diagnostic Copilot for KOEL Power Solutions (Kirloskar Oil Engines Limited).

### Primary Objective & Behavioral Guidelines:
You guide field service engineers, dealership technicians, and plant managers through fault diagnosis, preventive maintenance, and technical queries for diesel gensets and industrial engines.

### 1. Asset Identification & Validation Protocol
- When the user provides an App Code (e.g., DV8.8501.C4, DV16.1201.C3), Serial Number (e.g., 2320045), Instance ID, or Service Request Number (SR No.):
  - Validate and identify the engine model, serial number, instance ID, emission norms (CPCB IV+ / CPCB II), and application code.
  - If a specific asset has not yet been identified during a fault investigation, politely prompt for the App Code or Serial Number.

### 2. Diagnostic Fault Codes (SPN / FMI) & TSB Analysis
- For reported SPN and FMI fault codes (e.g., SPN 3216 FMI 9, SPN 7108 FMI 3, SPN 651 FMI 5):
  - State the monitored component, failure mode description, severity rating, and primary root-cause hypotheses.
  - Prioritize which fault code to address first if multiple codes are active, explaining why (e.g., primary power or CAN bus communication vs downstream sensor alarms).

### 3. Step-by-Step Diagnostic Troubleshooting Protocol
When guiding the technician through troubleshooting:
- STRICT ADHERENCE: Do NOT summarize, extrapolate, or invent mechanical sub-steps. Quote the action required verbatim from the manual.
- Present ONE troubleshooting step at a time.
- Ask what the engineer/technician found or observed after each step before moving forward.
- AVOID LOOPS: Once the technician reports or confirms an inspection result, advance immediately to the next logical check. Never repeat questions or steps.
- Source Priority: 1) SPN/FMI troubleshooting data, 2) Symptom Manual, 3) Workshop Manual, 4) Operation Manual.
- CRITICAL: Never use Technical Service Bulletins (TSBs) for mechanical step-by-step repair instructions. TSBs provide field modification bulletins; repair steps must come strictly from the diagnostic manuals.

### 4. Technical Specifications & Maintenance Standards
- When answering direct technical questions (e.g., valve clearances, fastener torques, fluid capacities, service intervals):
  - Reproduce exact figures, tolerances, and conditions (e.g., Inlet: 0.30 mm, Exhaust: 0.45 mm cold; Cylinder head: 70 Nm + 140 Nm + 90° angle; Oil: 15W-40 CI-4 Plus).
  - Never round or approximate critical engine tolerances.

### 5. Service History & Resolution Workflow
- When asked for past service history, summarize past Service Requests (SR numbers, dates, reported complaints, and field solutions).
- When the technician confirms the issue is resolved, conclude cleanly and offer the feedback and closeout workflow.

### 6. Tone & Style
- Professional, technical, concise, and direct.
- No conversational filler, cheerful emojis, or extraneous commentary.`;

// 4. HTTP SSE Server
const server = http.createServer((req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	if (req.method === "POST" && req.url === "/api/chat") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});

		req.on("end", async () => {
			try {
				const { message, history = [], action } = JSON.parse(body || "{}");

				if (action === "reset") {
					resetSessionState();
					console.log(`[Session Reset] Cleared session state.`);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ status: "reset" }));
					return;
				}

				if (!message) {
					console.warn(`[WARN] Received POST /api/chat with empty message`);
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Missing 'message' in request body" }));
					return;
				}

				if (Array.isArray(history) && history.length === 0) {
					resetSessionState();
				}

				const startTime = Date.now();
				console.log(`\n================================================================`);
				console.log(`[HTTP POST /api/chat] Incoming prompt: "${message}" (History turns: ${history.length})`);
				console.log(`[vLLM Dispatch] Connecting to ${VLLM_BASE_URL} (Model: ${MODEL_ID})`);
				console.log(`[Architecture] Guideline-Driven Orchestration (Parlant-Equivalent)`);
				console.log(`--- Streaming Response from Qwen 30B vLLM ---`);

				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});

				// Guideline-Driven Orchestration (Zero Regex, 100% Guideline & Tool Evaluation)
				console.log(`[Guideline Router] Evaluating user intent against KOEL guidelines...`);
				const evalResult = await evaluateGuidelines(message, history, defaultSessionState, VLLM_BASE_URL, MODEL_ID);
				console.log(`[Guidelines Matched]`, evalResult.matched_guidelines);
				console.log(`[Tool Calls Generated]`, evalResult.tool_calls);

				let dynamicContext = "";

				// Execute tool calls triggered by matched guidelines
				for (const tc of evalResult.tool_calls) {
					console.log(`\n[Guideline Tool Execution] ${tc.name}(${JSON.stringify(tc.args)})`);
					res.write(`data: ${JSON.stringify({ kind: "tool_start", tool: tc.name, args: tc.args })}\n\n`);
					const toolOutput = await executeServiceTool(tc.name, tc.args);
					res.write(
						`data: ${JSON.stringify({ kind: "tool_end", tool: tc.name, result: toolOutput?.result })}\n\n`,
					);
					if (toolOutput?.text) {
						dynamicContext += `\n${toolOutput.text}\n`;
					}
				}

				// If an asset is already registered in the session but no new asset was fetched, retain identity
				if (defaultSessionState.instanceId && !dynamicContext.includes("Oracle")) {
					dynamicContext += `\n### Active Registered Genset:
- Instance ID: ${defaultSessionState.instanceId}
${defaultSessionState.serialNumber ? `- Serial Number: ${defaultSessionState.serialNumber}\n` : ""}${defaultSessionState.appCode ? `- Application Code: ${defaultSessionState.appCode}\n` : ""}`;
				}

				// Inject Matched Guideline Directives
				if (evalResult.matched_guidelines.length > 0) {
					const guidelineDirectives = evalResult.matched_guidelines
						.map((gid) => SERVICE_GUIDELINES.find((g) => g.id === gid))
						.filter(Boolean)
						.map((g) => `### Guideline Directive: ${g!.name}\nRequired Action: ${g!.action}`)
						.join("\n\n");
					dynamicContext += `\n\n### Active Guideline Directives:\n${guidelineDirectives}\n`;
				}

				const effectiveSystemPrompt = dynamicContext
					? `${SYSTEM_PROMPT}\n\n${dynamicContext}`
					: SYSTEM_PROMPT;

				const initialMessages: AgentMessage[] = convertHistoryToMessages(history);

				const agent = new Agent({
					initialState: {
						systemPrompt: effectiveSystemPrompt,
						model: models.getModel("vllm", MODEL_ID)!,
						messages: initialMessages,
						...(ENABLE_TOOLS ? { tools: ALL_SERVICE_TOOLS } : {}),
					},
					streamFn: models.streamSimple.bind(models),
				});

				const unsubscribe = agent.subscribe((event) => {
					if (event.type === "message_update") {
						const ev = event.assistantMessageEvent;
						if (ev.type === "text_delta") {
							process.stdout.write(ev.delta);
							res.write(`data: ${JSON.stringify({ kind: "text", delta: ev.delta })}\n\n`);
						} else if (ev.type === "thinking_delta") {
							res.write(`data: ${JSON.stringify({ kind: "thinking", delta: ev.delta })}\n\n`);
						}
					} else if (event.type === "tool_execution_start") {
						console.log(`\n[Tool Executing] ${event.toolName}(${JSON.stringify(event.args)})`);
						res.write(
							`data: ${JSON.stringify({ kind: "tool_start", tool: event.toolName, args: event.args })}\n\n`,
						);
					} else if (event.type === "tool_execution_end") {
						console.log(`[Tool Result] ${event.toolName} completed.`);
						res.write(
							`data: ${JSON.stringify({ kind: "tool_end", tool: event.toolCallId, result: event.result })}\n\n`,
						);
					} else if (event.type === "agent_end") {
						console.log(`\n--- Stream Completed in ${Date.now() - startTime}ms ---`);
						console.log(`================================================================\n`);
						res.write(`data: ${JSON.stringify({ kind: "done" })}\n\n`);
						res.end();
					}
				});

				await agent.prompt(message);
				unsubscribe();
			} catch (err: unknown) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				console.error(`[Server Error]:`, errorMessage);
				res.write(`data: ${JSON.stringify({ kind: "error", error: errorMessage })}\n\n`);
				res.end();
			}
		});
		return;
	}

	console.log(`[HTTP ${req.method} ${req.url}] 404 Not Found`);
	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "Route not found. Use POST /api/chat" }));
});

server.listen(PORT, () => {
	console.log(`Pi Orchestrator Server running at http://localhost:${PORT}/api/chat`);
	console.log(`Connected to vLLM: ${VLLM_BASE_URL} (Model: ${MODEL_ID})`);
});
