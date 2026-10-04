import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, type Model, Type } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const MODEL_ID = process.env.MODEL_ID || "qwen3.6:latest";

const suggestGensetTool: AgentTool = {
	name: "suggest_genset",
	label: "Suggest Genset",
	description: "Recommends diesel generator options based on required kVA capacity.",
	parameters: Type.Object({
		kva: Type.Number({ description: "Power rating in kVA required by the customer" }),
	}),
	execute: async (_toolCallId, params) => {
		const kva = (params as { kva: number }).kva;
		console.log(`\n[Tool Executing] suggest_genset for ${kva} kVA...`);
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						model: `DG-${kva}-PRIME`,
						rating_kva: kva,
						voltage: "415V 3-Phase",
					}),
				},
			],
		};
	},
};

const ollamaModel: Model<"openai-completions"> = {
	id: MODEL_ID,
	name: "Ollama Qwen 3.6",
	api: "openai-completions",
	provider: "ollama",
	baseUrl: OLLAMA_BASE_URL,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 32768,
	maxTokens: 4096,
};

const ollamaProvider = createProvider({
	id: "ollama",
	name: "Local Ollama",
	baseUrl: OLLAMA_BASE_URL,
	auth: { apiKey: { name: "Ollama", resolve: async () => ({ auth: { apiKey: "ollama" } }) } },
	models: [ollamaModel],
	api: openAICompletionsApi(),
});

const models = createModels();
models.setProvider(ollamaProvider);

async function main() {
	const prompt = process.argv.slice(2).join(" ") || "Hello! We need a 350 kVA backup generator for a clinic.";
	console.log(`Model: ${MODEL_ID} (${OLLAMA_BASE_URL})`);
	console.log(`User Prompt: "${prompt}"\n--- Orchestrator Stream Start ---`);

	const agent = new Agent({
		initialState: {
			systemPrompt:
				"You are the sales and service orchestrator for diesel generators. Use suggest_genset when sizing is mentioned.",
			model: models.getModel("ollama", MODEL_ID)!,
			tools: [suggestGensetTool],
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
