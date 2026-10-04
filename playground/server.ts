import http from "node:http";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createModels, createProvider, type Model, type UserMessage } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import {
	buildSalesSystemPrompt,
	type ClientHistoryItem,
	createInitialState,
	extractSizingParameters,
	type GensetCandidate,
	queryAvailableGensets,
	type SalesProposalSessionState,
	updateSessionState,
} from "./sales_proposal_service.ts";

const PORT = Number(process.env.PORT) || 7001;
const VLLM_BASE_URL = process.env.VLLM_BASE_URL || "http://192.168.63.12:8000/v1";
const MODEL_ID = process.env.MODEL_ID || "Qwen/Qwen3-Coder-30B-A3B-Instruct";

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

// Active in-memory session state for sales proposal
let sessionState: SalesProposalSessionState = createInitialState();
let cachedCandidates: GensetCandidate[] | null = null;

const server = http.createServer(async (req, res) => {
	// CORS Headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	if (req.method === "GET" && req.url === "/api/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok", model: MODEL_ID, vllm: VLLM_BASE_URL, session: sessionState }));
		return;
	}

	if (req.method === "POST" && req.url === "/api/chat") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});

		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}");
				const message = (parsed.message || "").trim();
				const history: ClientHistoryItem[] = Array.isArray(parsed.history) ? parsed.history : [];
				const action = parsed.action;

				if (action === "reset" || (Array.isArray(history) && history.length === 0 && !message)) {
					sessionState = createInitialState();
					cachedCandidates = null;
					console.log("[Sales Session] State reset to initial state.");
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ status: "reset", session: sessionState }));
					return;
				}

				if (!message) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Missing message" }));
					return;
				}

				if (Array.isArray(history) && history.length === 0) {
					sessionState = createInitialState();
					cachedCandidates = null;
				}

				const startTime = Date.now();
				console.log(`\n================================================================`);
				console.log(`[Sales Agent Turn ${sessionState.historyTurns + 1}] Incoming message: "${message}"`);
				console.log(`[Session State Before] ratingKva: ${sessionState.ratingKva}, blockLoadingKva: ${sessionState.blockLoadingKva}, footprint: ${sessionState.footprint}, step: ${sessionState.step}`);

				// Step 1 Extraction: Extract sizing parameters using LLM without regex
				const extracted = await extractSizingParameters(message, sessionState, VLLM_BASE_URL, MODEL_ID);
				console.log(`[Parameter Extraction Result]`, JSON.stringify(extracted));

				// Update session state
				sessionState = updateSessionState(sessionState, extracted);
				console.log(`[Session State After] ratingKva: ${sessionState.ratingKva}, blockLoadingKva: ${sessionState.blockLoadingKva}, footprint: ${sessionState.footprint}, step: ${sessionState.step}`);

				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				});

				const sendEvent = (eventData: Record<string, unknown>) => {
					res.write(`data: ${JSON.stringify(eventData)}\n\n`);
				};

				// Step 2 Transition: If all 3 values are gathered, trigger available gensets query
				if (sessionState.step === 2 && !cachedCandidates && sessionState.ratingKva && sessionState.blockLoadingKva) {
					console.log("[Sales Agent] Step 1 Complete -> Transitioning to Step 2 (Query Available Gensets)");
					sendEvent({
						kind: "tool_start",
						tool: "query_available_gensets",
						args: {
							rating_kva: sessionState.ratingKva,
							block_loading_kva: sessionState.blockLoadingKva,
							footprint: sessionState.footprint,
						},
					});

					cachedCandidates = await queryAvailableGensets(
						sessionState.ratingKva,
						sessionState.blockLoadingKva,
						sessionState.footprint,
					);

					sendEvent({
						kind: "tool_end",
						tool: "query_available_gensets",
						result: cachedCandidates,
					});
				}

				// Build the guided system prompt for this turn
				const turnSystemPrompt = buildSalesSystemPrompt(sessionState, cachedCandidates || undefined);
				const historyMessages = convertHistoryToMessages(history);

				const agent = new Agent({
					initialState: {
						systemPrompt: turnSystemPrompt,
						model: models.getModel("vllm", MODEL_ID)!,
						messages: historyMessages,
					},
					streamFn: models.streamSimple.bind(models),
				});

				agent.subscribe((event) => {
					if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
						sendEvent({ kind: "text", delta: event.assistantMessageEvent.delta });
					}
				});

				await agent.prompt(message);

				sendEvent({ kind: "done" });
				res.end();

				const elapsed = Date.now() - startTime;
				console.log(`[Turn Finished] Completed in ${elapsed}ms. Step: ${sessionState.step}`);
			} catch (err: unknown) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				console.error("[Sales Agent Error]:", errorMessage);
				if (!res.headersSent) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: errorMessage }));
				} else {
					res.write(`data: ${JSON.stringify({ kind: "error", error: errorMessage })}\n\n`);
					res.end();
				}
			}
		});
		return;
	}

	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
	console.log(`\n================================================================`);
	console.log(`KOEL Sales Proposal Agent Server running on http://localhost:${PORT}`);
	console.log(`Target vLLM: ${VLLM_BASE_URL} (Model: ${MODEL_ID})`);
	console.log(`Status: Step 1 (Requirements Gathering) & Step 2 (Suggest Gensets) Active`);
	console.log(`================================================================\n`);
});
