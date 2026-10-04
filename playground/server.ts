import http from "node:http";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { createModels, createProvider, type Model, Type } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const PORT = Number(process.env.PORT) || 3001;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const MODEL_ID = process.env.MODEL_ID || "qwen3.6:latest";

// 1. Define sample domain tools (e.g. Genset sizing)
const suggestGensetTool: AgentTool = {
	name: "suggest_genset",
	label: "Suggest Genset",
	description: "Recommends diesel generator options based on required kVA capacity and application.",
	parameters: Type.Object({
		kva: Type.Number({ description: "Power rating in kVA required by the customer" }),
		application: Type.Optional(Type.String({ description: "Industry or application (e.g., hospital, factory, residential)" })),
	}),
	execute: async (_toolCallId, params) => {
		const kva = (params as { kva: number; application?: string }).kva;
		const application = (params as { kva: number; application?: string }).application || "commercial";

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify({
						status: "matched",
						options: [
							{
								model: `DG-${kva}-PRIME`,
								rating_kva: kva,
								voltage: "415V 3-Phase",
								estimated_fuel_burn_lph: Math.round(kva * 0.22 * 10) / 10,
								notes: application.toLowerCase().includes("hospital")
									? "Includes N+1 auto-mains failure panel recommendation"
									: "Standard sound-attenuated enclosure",
							},
						],
					}),
				},
			],
			details: { kva, application },
		};
	},
};

// 2. Register local Ollama model provider
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

// 3. System Prompt containing business guidelines
const SYSTEM_PROMPT = `You are the lead sales and service orchestrator for a power solutions company.
Guidelines:
1. Always recommend suitable genset models using the 'suggest_genset' tool when user mentions capacity or loads.
2. If application is hospital or medical, emphasize power redundancy.
3. Be professional, technical, and concise.`;

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
				const { message } = JSON.parse(body || "{}");
				if (!message) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Missing 'message' in request body" }));
					return;
				}

				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});

				const agent = new Agent({
					initialState: {
						systemPrompt: SYSTEM_PROMPT,
						model: models.getModel("ollama", MODEL_ID)!,
						tools: [suggestGensetTool],
					},
					streamFn: models.streamSimple.bind(models),
				});

				const unsubscribe = agent.subscribe((event) => {
					if (event.type === "message_update") {
						const ev = event.assistantMessageEvent;
						if (ev.type === "text_delta") {
							res.write(`data: ${JSON.stringify({ kind: "text", delta: ev.delta })}\n\n`);
						} else if (ev.type === "thinking_delta") {
							res.write(`data: ${JSON.stringify({ kind: "thinking", delta: ev.delta })}\n\n`);
						}
					} else if (event.type === "tool_execution_start") {
						res.write(
							`data: ${JSON.stringify({ kind: "tool_start", tool: event.toolName, args: event.args })}\n\n`,
						);
					} else if (event.type === "tool_execution_end") {
						res.write(
							`data: ${JSON.stringify({ kind: "tool_end", tool: event.toolCallId, result: event.result })}\n\n`,
						);
					} else if (event.type === "agent_end") {
						res.write(`data: ${JSON.stringify({ kind: "done" })}\n\n`);
						res.end();
					}
				});

				await agent.prompt(message);
				unsubscribe();
			} catch (err: unknown) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				res.write(`data: ${JSON.stringify({ kind: "error", error: errorMessage })}\n\n`);
				res.end();
			}
		});
		return;
	}

	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "Route not found. Use POST /api/chat" }));
});

server.listen(PORT, () => {
	console.log(`Pi Orchestrator Server running at http://localhost:${PORT}/api/chat`);
	console.log(`Connected to Ollama: ${OLLAMA_BASE_URL} (Model: ${MODEL_ID})`);
});
