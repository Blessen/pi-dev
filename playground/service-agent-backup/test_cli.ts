import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, type Model, Type } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { ALL_SERVICE_TOOLS } from "./service_tools.ts";

const VLLM_BASE_URL = process.env.VLLM_BASE_URL || "http://192.168.63.12:8000/v1";
const MODEL_ID = process.env.MODEL_ID || "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const ENABLE_TOOLS = process.env.ENABLE_TOOLS === "true";

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

const SERVICE_SYSTEM_PROMPT = `You are the lead Service, Maintenance, and Technical Diagnostic Copilot for KOEL Power Solutions (Kirloskar Oil Engines Limited).

### Primary Objective & Behavioral Guidelines:
You guide field service engineers, dealership technicians, and plant managers through fault diagnosis, preventive maintenance, and technical queries for diesel gensets and industrial engines.

### 1. Asset Identification & Validation Protocol
- When the user provides an App Code (e.g. DV8.8501.C4), Serial Number (e.g. 2320045), Instance ID, or Service Request Number (SR No.):
  - Identify the engine model, serial number, instance ID, emission norms (CPCB IV+ / CPCB II), and application code.
  - If a specific asset has not yet been identified during a fault investigation, politely prompt for the App Code or Serial Number.

### 2. Diagnostic Fault Codes (SPN / FMI) & TSB Analysis
- For reported SPN and FMI fault codes (e.g. SPN 3216 FMI 9, SPN 7108 FMI 3, SPN 651 FMI 5):
  - State the monitored component, failure mode description, severity rating, and primary root-cause hypotheses.
  - Prioritize which fault code to address first if multiple codes are active.

### 3. Step-by-Step Diagnostic Troubleshooting Protocol
- STRICT ADHERENCE: Do NOT summarize, extrapolate, or invent mechanical sub-steps. Quote the action required verbatim from the manual.
- Present ONE troubleshooting step at a time.
- Ask what the engineer/technician observed after each step before moving forward.
- AVOID LOOPS: Advance immediately to the next logical check once confirmed.
- Never use TSBs for mechanical step-by-step repair instructions.

### 4. Technical Specifications & Maintenance Standards
- When answering direct technical questions (e.g., valve clearances, fastener torques, fluid capacities, service intervals):
  - Reproduce exact figures, tolerances, and conditions (e.g., Inlet: 0.30 mm, Exhaust: 0.45 mm cold; Cylinder head: 70 Nm + 140 Nm + 90° angle; Oil: 15W-40 CI-4 Plus).

### 5. Tone & Style
- Professional, technical, concise, and direct.`;

async function main() {
	const prompt = process.argv.slice(2).join(" ") || "Hello! We need a 350 kVA backup generator for a clinic.";
	console.log(`Model: ${MODEL_ID} (${VLLM_BASE_URL})`);
	console.log(`User Prompt: "${prompt}"\n--- Orchestrator Stream Start ---`);

	const agent = new Agent({
		initialState: {
			systemPrompt: SERVICE_SYSTEM_PROMPT,
			model: models.getModel("vllm", MODEL_ID)!,
			...(ENABLE_TOOLS ? { tools: ALL_SERVICE_TOOLS } : {}),
		},
		streamFn: models.streamSimple.bind(models),
	});

	let inThinking = false;
	agent.subscribe((event) => {
		if (event.type === "message_update") {
			const ev = event.assistantMessageEvent;
			if (ev.type === "thinking_delta") {
				if (!inThinking) {
					process.stdout.write("[Thinking]\n");
					inThinking = true;
				}
				process.stdout.write(ev.delta);
			} else if (ev.type === "text_delta") {
				if (inThinking) {
					process.stdout.write("\n\n[Response]\n");
					inThinking = false;
				}
				process.stdout.write(ev.delta);
			}
		} else if (event.type === "tool_execution_start") {
			console.log(`\n\n[Tool Executing] ${event.toolName}(${JSON.stringify(event.args)})`);
		} else if (event.type === "tool_execution_end") {
			console.log(`[Tool Result] Finished.`);
		}
	});

	await agent.prompt(prompt);
	if (agent.state.errorMessage) {
		console.error("\nAgent error:", agent.state.errorMessage);
	}
	console.log("\n\n--- Orchestrator Stream End ---");
}

main().catch(console.error);
