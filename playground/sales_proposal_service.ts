export interface SalesProposalSessionState {
	ratingKva: number | null;
	blockLoadingKva: number | null;
	footprint: string | null;
	step: 1 | 2;
	historyTurns: number;
}

export interface GensetCandidate {
	model: string;
	ratingKva: number;
	blockLoadingKva: number;
	engineModel: string;
	dimensions: string;
	description: string;
}

export interface ExtractedParams {
	rating_kva: number | null;
	block_loading_kva: number | null;
	footprint: string | null;
}

export interface ClientHistoryItem {
	role: "user" | "assistant";
	content: string;
}

export function createInitialState(): SalesProposalSessionState {
	return {
		ratingKva: null,
		blockLoadingKva: null,
		footprint: null,
		step: 1,
		historyTurns: 0,
	};
}

/**
 * Checks if all three inputs are accounted for:
 * 1. ratingKva is provided
 * 2. blockLoadingKva is provided
 * 3. footprint is provided or explicitly skipped
 */
export function isStep1Complete(state: SalesProposalSessionState): boolean {
	return (
		state.ratingKva !== null &&
		state.blockLoadingKva !== null &&
		state.footprint !== null
	);
}

/**
 * Extract genset sizing requirements using the LLM parameter extractor.
 * Zero regex matching: uses structured JSON schema output from the model.
 */
export async function extractSizingParameters(
	userMessage: string,
	currentState: SalesProposalSessionState,
	vllmBaseUrl: string,
	modelId: string,
): Promise<ExtractedParams> {
	const extractionPrompt = `You are a strict parameter extractor for diesel generator sizing requirements.
Extract user-provided sizing values from the user input into JSON.

Current known state:
- rating_kva: ${currentState.ratingKva ?? "null"}
- block_loading_kva: ${currentState.blockLoadingKva ?? "null"}
- footprint: ${currentState.footprint ?? "null"}

Parameters to extract:
1. "rating_kva": Sizing capacity / generator power rating in kVA (e.g., 500, 250, 125). If not mentioned, return null.
2. "block_loading_kva": Transient load / block loading capacity in kVA (e.g., 200, 300). If specified as a percentage of rating, calculate kVA. If not mentioned, return null.
3. "footprint": Physical dimension or area preference (e.g., "compact", "standard", "canopy 4x2m"). 
   CRITICAL RULE FOR FOOTPRINT: If the user says they want to skip footprint, or says footprint doesn't matter, or says "skip" / "no preference" / "not needed", return "skipped". If footprint was not mentioned, return null.

Respond ONLY with a valid JSON object matching this schema:
{
  "rating_kva": number | null,
  "block_loading_kva": number | null,
  "footprint": string | null
}`;

	try {
		const response = await fetch(`${vllmBaseUrl}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: modelId,
				temperature: 0,
				messages: [
					{ role: "system", content: extractionPrompt },
					{ role: "user", content: userMessage },
				],
			}),
		});

		if (!response.ok) {
			console.error(`[ParameterExtractor] vLLM responded with HTTP ${response.status}`);
			return { rating_kva: null, block_loading_kva: null, footprint: null };
		}

		const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const rawText = data?.choices?.[0]?.message?.content?.trim() || "{}";
		const jsonMatch = rawText.match(/\{[\s\S]*\}/);
		const cleanedJson = jsonMatch ? jsonMatch[0] : rawText;
		const parsed = JSON.parse(cleanedJson) as ExtractedParams;

		return {
			rating_kva: typeof parsed.rating_kva === "number" ? parsed.rating_kva : null,
			block_loading_kva: typeof parsed.block_loading_kva === "number" ? parsed.block_loading_kva : null,
			footprint: typeof parsed.footprint === "string" && parsed.footprint.trim() !== "" ? parsed.footprint.trim() : null,
		};
	} catch (err) {
		console.error("[ParameterExtractor] Error parsing JSON output:", err);
		return { rating_kva: null, block_loading_kva: null, footprint: null };
	}
}

/**
 * Updates the session state with newly extracted values.
 */
export function updateSessionState(
	currentState: SalesProposalSessionState,
	extracted: ExtractedParams,
): SalesProposalSessionState {
	const nextState: SalesProposalSessionState = {
		...currentState,
		historyTurns: currentState.historyTurns + 1,
	};

	if (extracted.rating_kva !== null) {
		nextState.ratingKva = extracted.rating_kva;
	}
	if (extracted.block_loading_kva !== null) {
		nextState.blockLoadingKva = extracted.block_loading_kva;
	}
	if (extracted.footprint !== null) {
		nextState.footprint = extracted.footprint;
	}

	if (isStep1Complete(nextState)) {
		nextState.step = 2;
	}

	return nextState;
}

/**
 * Query available gensets matching the requested sizing.
 * Query implementation is modular so live SQL/ADW query can be plugged in later.
 */
export async function queryAvailableGensets(
	ratingKva: number,
	blockLoadingKva: number,
	footprint: string | null,
): Promise<GensetCandidate[]> {
	console.log(`[SalesProposal] Querying available gensets for rating=${ratingKva} kVA, blockLoad=${blockLoadingKva} kVA, footprint=${footprint}`);

	// Decoupled candidate list - replace with live database query
	const dims1 = footprint && footprint !== "skipped" ? footprint : "3200 x 1200 x 1850 mm";
	const dims2 = footprint && footprint !== "skipped" ? footprint : "3450 x 1300 x 1950 mm";

	return [
		{
			model: `KG1-${ratingKva}WS`,
			ratingKva: ratingKva,
			blockLoadingKva: blockLoadingKva,
			engineModel: `KOEL 4R1040TA (${ratingKva} kVA Prime)`,
			dimensions: dims1,
			description: `KOEL Green Silent Diesel Generator (${ratingKva} kVA) with CPCB IV+ compliance, optimal fuel economy, and acoustic enclosure.`,
		},
		{
			model: `KG1-${ratingKva}WS-HD`,
			ratingKva: ratingKva,
			blockLoadingKva: Math.round(blockLoadingKva * 1.15),
			engineModel: `KOEL 6R1080TA Heavy-Duty`,
			dimensions: dims2,
			description: `KOEL Heavy-Duty Industrial Diesel Generator (${ratingKva} kVA) with high transient load capacity and heavy-duty radiator.`,
		},
	];
}

/**
 * Constructs the contextual prompt guiding the agent for the current turn.
 */
export function buildSalesSystemPrompt(
	state: SalesProposalSessionState,
	candidates?: GensetCandidate[],
): string {
	const baseRules = `You are the KOEL Power Solutions Sales Engineering Copilot assisting customers with diesel generator selection and commercial proposals.
Tone: Professional, direct, concise, and helpful. Never output filler or boilerplate. Technical prose only.`;

	if (state.step === 1) {
		const ratingText = state.ratingKva !== null ? `${state.ratingKva} kVA (Received)` : "Not provided (REQUIRED)";
		const blockLoadText = state.blockLoadingKva !== null ? `${state.blockLoadingKva} kVA (Received)` : "Not provided (REQUIRED)";
		const footprintText = state.footprint !== null
			? (state.footprint === "skipped" ? "Skipped by customer (Received)" : `${state.footprint} (Received)`)
			: "Not provided (OPTIONAL - customer can specify or skip)";

		return `${baseRules}

### Conversation Goal: Step 1 - Requirement Gathering
We require 3 inputs to generate a proposal:
1. Genset rating in kVA (Required)
2. Block loading rating in kVA (Required)
3. Footprint / dimensions preference (Optional, can be skipped)

### Current Input Status:
- Genset Rating: ${ratingText}
- Block Loading: ${blockLoadText}
- Footprint: ${footprintText}

### Instructions for this turn:
- Acknowledge whatever inputs have already been provided.
- Politely prompt the customer for the remaining missing input(s).
- Explicitly inform the customer that footprint is optional and can be skipped if they do not have specific space constraints.
- DO NOT suggest or list genset models yet until all required values are received.`;
	}

	// Step 2: Sizing complete, suggest gensets
	const candidateList = (candidates || [])
		.map(
			(c, idx) =>
				`${idx + 1}. **${c.model}**
   - Prime Power Rating: ${c.ratingKva} kVA
   - Block Loading Capability: ${c.blockLoadingKva} kVA
   - Engine Model: ${c.engineModel}
   - Dimensions (L x W x H): ${c.dimensions}
   - Description: ${c.description}`,
		)
		.join("\n\n");

	const footprintSummary = state.footprint === "skipped" ? "None (Standard acoustic enclosure)" : state.footprint;

	return `${baseRules}

### Conversation Goal: Step 2 - Available Genset Recommendation
All initial sizing inputs have been collected:
- Genset Power Rating: ${state.ratingKva} kVA
- Block Loading Requirement: ${state.blockLoadingKva} kVA
- Footprint Preference: ${footprintSummary}

### Available Genset Options:
${candidateList}

### Instructions for this turn:
- Present the available genset options to the customer in a clear, formatted comparison.
- Highlight how each option meets their ${state.ratingKva} kVA prime load and ${state.blockLoadingKva} kVA block loading requirements.
- Ask the customer which model they would prefer, or if they would like to proceed with configuring detailed commercial terms / accessories for the proposal.`;
}
