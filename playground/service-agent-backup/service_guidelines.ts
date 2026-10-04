export interface ServiceGuideline {
	id: string;
	name: string;
	condition: string;
	action: string;
	tools?: string[];
}

export const SERVICE_GUIDELINES: ServiceGuideline[] = [
	{
		id: "update_genset_details_guideline",
		name: "Asset Identification & Validation",
		condition:
			"The user provides an App Code (e.g. DV8.8501.C4), Serial Number (e.g. 2320045), Instance ID / Asset Number (e.g. 100809908), or Service Request Number, or asks to validate / register / identify an asset.",
		action: "Execute update_genset_details with the extracted identifier and identifier_type to fetch verified asset specs from Oracle ADW.",
		tools: ["update_genset_details"],
	},
	{
		id: "sr_guideline",
		name: "Service History & Recent SRs",
		condition:
			"The user asks to view, list, or provide the service history of past Service Requests (SRs), recent complaints, or previous field resolutions.",
		action: "Execute get_recent_service_requests with the active instance ID and requested count (default 3) to fetch live records from Oracle ADW.",
		tools: ["get_recent_service_requests"],
	},
	{
		id: "sr_lookup_guideline",
		name: "Lookup Single Service Request",
		condition:
			"The user provides a specific 9-digit Service Request Number (e.g. 213704575) to look up its detailed dossier or history.",
		action: "Execute lookup_service_request with the SR number to retrieve detailed Siebel records from Oracle ADW.",
		tools: ["lookup_service_request"],
	},
	{
		id: "symptom_summary_guideline",
		name: "Symptom Diagnosis & Troubleshooting",
		condition:
			"The user reports a physical, audible, or observable symptom (e.g. 'black smoke', 'hunting', 'high water temp', 'low oil pressure', 'engine overheating', 'starting trouble', 'white smoke').",
		action: "Execute get_symptom_summary to retrieve the verified Standard Operating Procedure (SOP) manual from Qdrant vector database.",
		tools: ["get_symptom_summary"],
	},
	{
		id: "spn_summary_guideline",
		name: "Diagnostic Fault Codes (SPN / FMI)",
		condition:
			"The user reports or inquires about specific SPN and FMI fault codes (e.g. SPN 3216 FMI 9, SPN 7108 FMI 3, SPN 651 FMI 5).",
		action: "Execute get_spn_fmi_summary to fetch the official troubleshooting document from Qdrant vector database.",
		tools: ["get_spn_fmi_summary"],
	},
	{
		id: "wiring_diagram_guideline",
		name: "Electrical Wiring Diagram",
		condition:
			"The user asks for the wiring diagram, terminal pinouts, harness connections, or electrical schematics for the genset.",
		action: "Execute get_wiring_diagram with the application code to retrieve drawing details from MSSQL.",
		tools: ["get_wiring_diagram"],
	},
	{
		id: "diagnostic_guideline",
		name: "Step-by-Step Diagnostic Protocol",
		condition:
			"The technician reports findings of an inspection check (e.g. 'filter is clean', 'this looks good', 'checked injectors'), confirms an observation, or asks for the next diagnostic step.",
		action: "Advance to the NEXT sequential diagnostic check verbatim from the manual. Never repeat steps already completed.",
	},
	{
		id: "technical_qna_guideline",
		name: "Technical Specifications & Tolerances",
		condition:
			"The user asks a direct technical question about engine clearances, torques, fluid capacities, or service intervals.",
		action: "Provide exact numerical specifications and tolerances verbatim without approximation.",
	},
];

export interface GuidelineToolCall {
	name: string;
	args: Record<string, any>;
}

export interface GuidelineEvaluationResult {
	matched_guidelines: string[];
	tool_calls: GuidelineToolCall[];
}

/**
 * Evaluates conversation history and user prompt against KOEL Service Guidelines using vLLM Qwen 30B.
 * No hardcoded regex matching is performed.
 */
export async function evaluateGuidelines(
	userPrompt: string,
	history: Array<{ role: string; content: string }>,
	sessionState: { appCode: string; serialNumber: string; instanceId: string },
	vllmBaseUrl: string,
	modelId: string,
): Promise<GuidelineEvaluationResult> {
	const recentTurns = history.slice(-4).map((h) => ({
		role: h.role === "assistant" ? "assistant" : "user",
		content: typeof h.content === "string" ? h.content.slice(0, 500) : "",
	}));

	const systemInstruction = `You are the KOEL Service Guideline Router.
Your task is to analyze the user message and conversation context, determine which service guidelines match, and generate tool calls with extracted parameters.

Active Session Context:
- Instance ID: "${sessionState.instanceId || "None"}"
- Serial Number: "${sessionState.serialNumber || "None"}"
- Application Code: "${sessionState.appCode || "None"}"

Service Guidelines:
${SERVICE_GUIDELINES.map((g) => `- [${g.id}] ${g.name}:
  Condition: ${g.condition}
  Action: ${g.action}${g.tools ? `\n  Associated Tools: ${g.tools.join(", ")}` : ""}`).join("\n\n")}

Tool Signatures:
- update_genset_details(identifier: string, identifier_type: "Instance Id" | "Serial Number" | "App Code", app_code?: string)
- get_recent_service_requests(instance_id: string, count?: number)
- lookup_service_request(sr_number: string)
- get_symptom_summary(symptom_text: string, app_code?: string)
- get_spn_fmi_summary(spn: number, fmi: number, app_code?: string)
- get_wiring_diagram(app_code: string)

Instructions:
1. Match all guidelines whose conditions are met.
2. If the user asks for past SRs or service history, supply the active session Instance ID if not explicitly specified.
3. For tools associated with matched guidelines, output their name and extracted arguments.
4. Output STRICT JSON only. Format:
{
  "matched_guidelines": ["guideline_id_1"],
  "tool_calls": [
    { "name": "tool_name", "args": { ... } }
  ]
}`;

	try {
		const response = await fetch(`${vllmBaseUrl}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: modelId,
				messages: [
					{ role: "system", content: systemInstruction },
					...recentTurns,
					{ role: "user", content: userPrompt },
				],
				temperature: 0,
				max_tokens: 350,
			}),
		});

		if (!response.ok) {
			console.error(`[Guideline Router Error] vLLM responded with HTTP ${response.status}`);
			return { matched_guidelines: [], tool_calls: [] };
		}

		const data: any = await response.json();
		const rawContent = data?.choices?.[0]?.message?.content?.trim() || "";

		// Extract JSON substring if wrapped in markdown code fence
		const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			return {
				matched_guidelines: Array.isArray(parsed.matched_guidelines) ? parsed.matched_guidelines : [],
				tool_calls: Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [],
			};
		}

		return { matched_guidelines: [], tool_calls: [] };
	} catch (err) {
		console.error(`[Guideline Router Exception]:`, err);
		return { matched_guidelines: [], tool_calls: [] };
	}
}
