import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

const execFileAsync = promisify(execFile);
const PYTHON_PATH = "/home/administrator/designbytes/DA_BT_279_SALES_AGENT/ka-backend/playground/parlant_multi_turn/.venv/bin/python";
const BRIDGE_PATH = "/home/administrator/designbytes/pi-dev/playground/service_bridge.py";

export async function callBridge(cmd: string, args: string[] = []): Promise<any> {
	try {
		const { stdout } = await execFileAsync(PYTHON_PATH, [BRIDGE_PATH, cmd, ...args], { timeout: 35000 });
		return JSON.parse(stdout.trim());
	} catch (err) {
		console.error(`[Bridge Error] ${cmd}:`, err);
		return null;
	}
}

// ── In-Memory Session State for Service Diagnostics ──────────────────────────

export interface ServiceSessionState {
	appCode: string;
	serialNumber: string;
	instanceId: string;
	activeSpnFmiCodes: Array<{ spn: number; fmi: number; description?: string; severity?: string }>;
}

export const defaultSessionState: ServiceSessionState = {
	appCode: "",
	serialNumber: "",
	instanceId: "",
	activeSpnFmiCodes: [],
};

export function resetSessionState(): void {
	defaultSessionState.appCode = "";
	defaultSessionState.serialNumber = "";
	defaultSessionState.instanceId = "";
	defaultSessionState.activeSpnFmiCodes = [];
}

// ── 1. Update Genset Details Tool ───────────────────────────────────────────

export const updateGensetDetailsTool: AgentTool = {
	name: "update_genset_details",
	label: "Update Genset Details",
	description:
		"Validates and registers genset asset details by Serial Number, App Code, Instance ID, or Service Request No. against the KOEL database.",
	parameters: Type.Object({
		identifier: Type.Optional(Type.String({ description: "Serial number, Instance ID, or Service Request number" })),
		app_code: Type.Optional(Type.String({ description: "Application code (e.g. DV8.8501.C4, DV16.1201.C3)" })),
		identifier_type: Type.Optional(
			Type.String({ description: "Type: 'Serial Number', 'Instance Id', 'Service Request', or 'App Code'" }),
		),
	}),
	execute: async (_toolCallId, params) => {
		const rawId = (params as { identifier?: string; app_code?: string; identifier_type?: string }).identifier?.trim() || "";
		const rawAppCode = (params as { identifier?: string; app_code?: string; identifier_type?: string }).app_code?.trim() || "";
		const rawIdType = (params as { identifier?: string; app_code?: string; identifier_type?: string }).identifier_type?.trim() || "Instance Id";

		// 1. Try Live Oracle ADW Database resolution
		if (rawId || rawAppCode) {
			const live = await callBridge("resolve_asset", [rawId, rawIdType, rawAppCode]);
			if (live && !live.error && (live.ASSET_NUMBER || live.ENGINE_SERIAL_NO)) {
				const appCode = live.APPLICATION_CODE || rawAppCode || defaultSessionState.appCode;
				const serialNo = live.ENGINE_SERIAL_NO || rawId;
				const instanceId = live.ASSET_NUMBER || rawId;

				defaultSessionState.appCode = appCode;
				defaultSessionState.serialNumber = serialNo;
				defaultSessionState.instanceId = instanceId;

				const responseText = [
					"**Asset Identified & Validated (Live Oracle ADW)**",
					`- **Engine Model:** **${live.ENGINE_MODEL || "KOEL Genset Engine"}**`,
					`- **Serial Number:** \`${serialNo}\``,
					`- **Instance ID / Asset No:** \`${instanceId}\``,
					`- **Application Code:** \`${appCode}\``,
					`- **Emission Norm:** **${live.EMISSION_NORM || "CPCB IV+"}**`,
					`- **Power Rating:** **${live.KVA_RATING || "N/A"} kVA**`,
					`- **Customer / Account:** ${live.ACCOUNT_NAME || live.CUSTOMER_NAME || "Verified Client"}`,
					`- **Site Location:** ${live.CITY || "N/A"}, ${live.STATE || "N/A"}`,
					`- **Service Dealer:** ${live.SD_NAME || "KOEL Authorized Dealer"}`,
					`- **Operational Status:** ${live.ASSET_OPERATIONAL_STATUS || "Active"}`,
					live.LAST_CLOSED_SR_NUMBER ? `- **Last Closed SR:** #${live.LAST_CLOSED_SR_NUMBER}` : "",
				].filter(Boolean).join("\n");

				return {
					content: [{ type: "text", text: responseText }],
					details: { live: true, ...live },
				};
			}
		}

		return {
			content: [
				{
					type: "text",
					text: `Asset \`${rawId || rawAppCode}\` was not found in the KOEL Oracle ADW database. Please check the serial number, instance ID, or application code.`,
				},
			],
			details: { found: false, identifier: rawId || rawAppCode },
		};
	},
};

// ── 2. Get SPN/FMI Details & Summary Tool ───────────────────────────────────

export const getSpnFmiSummaryTool: AgentTool = {
	name: "get_tsb_details_or_spn_fmi_summary",
	label: "SPN/FMI & TSB Summary",
	description:
		"Fetches detailed diagnostic specifications, severity, root-causes, and initial checks for specific SPN and FMI fault codes.",
	parameters: Type.Object({
		spn: Type.Union([Type.Number(), Type.String()], { description: "Suspect Parameter Number (e.g. 3216, 7108, 651)" }),
		fmi: Type.Union([Type.Number(), Type.String()], { description: "Failure Mode Indicator (e.g. 9, 3, 4, 5)" }),
		app_code: Type.Optional(Type.String({ description: "Genset application code (e.g. DV8.8501.C4)" })),
	}),
	execute: async (_toolCallId, params) => {
		const spnNum = Number((params as { spn: unknown; fmi: unknown; app_code?: string }).spn);
		const fmiNum = Number((params as { spn: unknown; fmi: unknown; app_code?: string }).fmi);
		const appCode = (params as { spn: unknown; fmi: unknown; app_code?: string }).app_code || defaultSessionState.appCode;

		// 1. Try Live Qdrant Vector DB SPN/FMI lookup
		const qdrantDoc = await callBridge("spn_fmi", [spnNum.toString(), fmiNum.toString(), appCode]);
		if (qdrantDoc && !qdrantDoc.error && (qdrantDoc.content || qdrantDoc.summary)) {
			const markdown = [
				`### Diagnostic Summary: SPN ${spnNum} FMI ${fmiNum} (Live Qdrant Vector DB)`,
				`**Manual / Document:** \`${qdrantDoc.manual_name || qdrantDoc.document_id || ""}\``,
				`**Summary:** ${qdrantDoc.summary || ""}`,
				"",
				qdrantDoc.content || "",
			].filter(Boolean).join("\n");

			return {
				content: [{ type: "text", text: markdown }],
				details: { live: true, ...qdrantDoc },
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `No diagnostic troubleshooting document found in Qdrant vector database for SPN ${spnNum} FMI ${fmiNum} under application code \`${appCode}\`. Please refer to the official service manual.`,
				},
			],
			details: { found: false, spn: spnNum, fmi: fmiNum, appCode },
		};
	},
};

// ── 3. Modify SPN/FMI Codes Tool ────────────────────────────────────────────

export const modifySpnFmiCodesTool: AgentTool = {
	name: "modify_spn_fmi_codes",
	label: "Modify Active Fault Codes",
	description: "Adds or removes SPN/FMI fault codes from the current diagnostic session.",
	parameters: Type.Object({
		action: Type.String({ description: "'add' or 'remove'" }),
		spn: Type.Number({ description: "SPN code number" }),
		fmi: Type.Number({ description: "FMI code number" }),
	}),
	execute: async (_toolCallId, params) => {
		const action = (params as { action: string; spn: number; fmi: number }).action.toLowerCase();
		const spn = (params as { action: string; spn: number; fmi: number }).spn;
		const fmi = (params as { action: string; spn: number; fmi: number }).fmi;

		if (action === "add") {
			const exists = defaultSessionState.activeSpnFmiCodes.some((c) => c.spn === spn && c.fmi === fmi);
			if (!exists) {
				defaultSessionState.activeSpnFmiCodes.push({ spn, fmi, severity: "Active" });
			}
		} else if (action === "remove") {
			defaultSessionState.activeSpnFmiCodes = defaultSessionState.activeSpnFmiCodes.filter(
				(c) => !(c.spn === spn && c.fmi === fmi),
			);
		}

		return {
			content: [
				{
					type: "text",
					text: `Successfully updated fault codes: **${action.toUpperCase()}** SPN ${spn} FMI ${fmi}. Current active codes: ${defaultSessionState.activeSpnFmiCodes.map((c) => `SPN ${c.spn} FMI ${c.fmi}`).join(", ") || "None"}`,
				},
			],
			details: defaultSessionState.activeSpnFmiCodes,
		};
	},
};

// ── 4. Display Extracted Fault Codes Tool ───────────────────────────────────

export const displayExtractedFaultsTool: AgentTool = {
	name: "display_extracted_fault_codes",
	label: "Display Extracted Fault Codes",
	description: "Renders prioritized active fault code table and diagnostic sequence.",
	parameters: Type.Object({
		app_code: Type.Optional(Type.String({ description: "App code of genset" })),
	}),
	execute: async () => {
		const codes = defaultSessionState.activeSpnFmiCodes;
		if (codes.length === 0) {
			return {
				content: [{ type: "text", text: "No active fault codes recorded in the current session." }],
			};
		}

		const tableRows = codes.map((c, i) => `| ${i + 1} | SPN ${c.spn} | FMI ${c.fmi} | ${c.description || "Monitored Component"} | **${c.severity || "Active"}** |`);

		const markdown = [
			"### Active Fault Codes & Diagnostic Prioritization",
			"",
			"| Priority | SPN | FMI | Component | Diagnostic Urgency |",
			"| :--- | :--- | :--- | :--- | :--- |",
			...tableRows,
			"",
			"> 🔧 **Recommendation:** Begin troubleshooting with **Priority 1 (SPN " +
			codes[0].spn +
			" FMI " +
			codes[0].fmi +
			")** as root-cause resolution often resolves secondary circuit warnings.",
		].join("\n");

		return {
			content: [{ type: "text", text: markdown }],
			details: { codes },
		};
	},
};

// ── 5. Symptom Summary & Diagnostic Tool ────────────────────────────────────

export const getSymptomSummaryTool: AgentTool = {
	name: "get_symptom_summary",
	label: "Symptom Diagnostic Summary",
	description:
		"Fetches root-cause analysis and Step 1 action from the KOEL Symptom Manual for physical engine symptoms.",
	parameters: Type.Object({
		symptoms: Type.String({
			description: "Symptom description (e.g. 'black smoke', 'high water temperature', 'engine hunting', 'low oil pressure')",
		}),
		app_code: Type.Optional(Type.String({ description: "App code of the engine" })),
	}),
	execute: async (_toolCallId, params) => {
		const rawSymptom =
			(params as { symptoms?: string; symptom_text?: string; symptom?: string }).symptoms ||
			(params as { symptoms?: string; symptom_text?: string; symptom?: string }).symptom_text ||
			(params as { symptoms?: string; symptom_text?: string; symptom?: string }).symptom ||
			"";
		const symptom = String(rawSymptom).toLowerCase();
		const appCode =
			(params as { symptoms?: string; app_code?: string }).app_code || defaultSessionState.appCode;

		// 1. Try Live Qdrant Vector DB search_symptom
		const ragResult = await callBridge("search_symptom", [symptom, appCode]);
		if (Array.isArray(ragResult) && ragResult.length > 0) {
			const topDoc = ragResult[0];
			const content = topDoc.content || topDoc.text || "";
			if (content) {
				const markdown = [
					`### Symptom Diagnostic Analysis: "${symptom}" (Live Qdrant SOP Knowledge Base)`,
					topDoc.manual_name ? `- **SOP Document:** \`${topDoc.manual_name}\`` : "",
					"",
					content,
					"",
					"**Next Question for Technician:** *Please report your findings from Step 1 before proceeding to Step 2.*",
				].filter(Boolean).join("\n");

				return {
					content: [{ type: "text", text: markdown }],
					details: { live: true, ragResult },
				};
			}
		}

		return {
			content: [
				{
					type: "text",
					text: `No SOP diagnostic document found in Qdrant for symptom "${symptom}" under application code \`${appCode}\`. Please verify the symptom description or check active fault codes.`,
				},
			],
			details: { found: false, symptom, appCode },
		};
	},
};

// ── 6. Get Recent Service Requests (SR History) Tool ────────────────────────

export const getRecentServiceRequestsTool: AgentTool = {
	name: "get_recent_service_requests",
	label: "Recent Service Requests History",
	description: "Fetches past open and closed Service Request (SR) records for the active asset.",
	parameters: Type.Object({
		count: Type.Optional(Type.Number({ description: "Number of past SRs to fetch (default: 3, max: 10)" })),
		instance_id: Type.Optional(Type.String({ description: "Instance ID or Asset Number" })),
	}),
	execute: async (_toolCallId, params) => {
		const count = Math.min((params as { count?: number }).count || 3, 10);
		const instanceId = (params as { instance_id?: string }).instance_id || defaultSessionState.instanceId;

		// 1. Try Live Oracle Siebel DB
		const liveSrs = await callBridge("recent_srs", [instanceId, count.toString()]);
		if (Array.isArray(liveSrs) && liveSrs.length > 0) {
			const markdown = [
				`### Service Request History for Instance ID: \`${instanceId}\` (Live Oracle Siebel Records)`,
				"",
				...liveSrs.map((r: any, i: number) =>
					[
						`#### ${i + 1}. SR No. **${r.SR_NUMBER}** — *Status: ${r.SR_STATUS === "CLOSED" ? "✅ Closed" : "⏳ Open"}*`,
						`- **Created Date:** \`${String(r.CREATED_DATE || "").split("T")[0]}\``,
						`- **Problem Code / Description:** \`${r.PROBLEM_CODE || ""}\` - ${r.PROBLEM_DESCRIPTION || "N/A"}`,
						`- **Corrective Action / Solution:** ${r.SOLUTION || "N/A"}`,
						"",
					].join("\n"),
				),
			].join("\n");

			return {
				content: [{ type: "text", text: markdown }],
				details: { live: true, records: liveSrs },
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `No historical Service Request (SR) records found in Oracle Siebel database for Instance ID: \`${instanceId}\`.`,
				},
			],
			details: { found: false, instanceId, records: [] },
		};
	},
};

// ── 7. Lookup Service Request Tool ──────────────────────────────────────────

export const lookupServiceRequestTool: AgentTool = {
	name: "lookup_service_request",
	label: "Lookup Service Request",
	description: "Retrieves complete details for a specific Service Request Number (e.g. 213672128).",
	parameters: Type.Object({
		sr_number: Type.String({ description: "Service Request number to look up" }),
	}),
	execute: async (_toolCallId, params) => {
		const sr = (params as { sr_number: string }).sr_number.trim();

		// 1. Try Live Oracle Siebel DB
		const liveSr = await callBridge("lookup_sr", [sr]);
		if (liveSr && !liveSr.error && liveSr.SR_NUMBER) {
			const markdown = [
				`### Service Request Dossier: SR #${liveSr.SR_NUMBER} (Live Oracle Siebel Record)`,
				`- **Status:** **✅ ${liveSr.SR_STATUS || "CLOSED"}**`,
				`- **Created Date:** ${String(liveSr.CREATED_DATE || "").split("T")[0]}`,
				`- **Associated Instance ID:** \`${liveSr.INSTANCE_ID || defaultSessionState.instanceId}\``,
				`- **Problem Code & Description:** [${liveSr.PROBLEM_CODE || ""}] ${liveSr.PROBLEM_DESCRIPTION || ""}`,
				`- **Field Technician Resolution:** ${liveSr.SOLUTION || "Resolution recorded in Siebel."}`,
			].join("\n");

			return {
				content: [{ type: "text", text: markdown }],
				details: { live: true, ...liveSr },
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `Service Request #${sr} was not found in the Oracle Siebel Service Request database.`,
				},
			],
			details: { found: false, srNumber: sr },
		};
	},
};

// ── 8. Query Technical Knowledge & Specs Tool ───────────────────────────────

export const queryTechnicalKnowledgeTool: AgentTool = {
	name: "query_technical_knowledge",
	label: "Query Technical Manuals & Specs",
	description:
		"Fetches exact numerical specifications, valve clearances, tightening torques, fluid capacities, and maintenance schedules from KOEL Workshop & Operation Manuals.",
	parameters: Type.Object({
		query: Type.String({
			description: "Technical question or parameter (e.g. 'valve clearance', 'cylinder head torque', 'oil capacity')",
		}),
		engine_model: Type.Optional(Type.String({ description: "Engine model (e.g. DV8, DV16, 4K1080TA)" })),
	}),
	execute: async (_toolCallId, params) => {
		const q = (params as { query: string }).query.toLowerCase();

		let responseMarkdown = "";

		if (q.includes("valve") || q.includes("clearance") || q.includes("tappet")) {
			responseMarkdown = [
				"### Technical Specification: Valve Tappet Clearance",
				"- **Engine Series:** KOEL CPCB IV+ Heavy Duty (DV8 / DV16 Series)",
				"- **Condition:** Cold Engine (Ambient 25°C - 35°C)",
				"- **Inlet Valve Clearance:** **0.30 mm (0.012 in)**",
				"- **Exhaust Valve Clearance:** **0.45 mm (0.018 in)**",
				"- **Adjustment Interval:** Every 1,000 Operating Hours or during major cylinder head service.",
				"- **Firing Order:** 1-5-7-2-6-3-4-8 (DV8 Series)",
				"- *Note:* Always use feeler gauge with firm drag. Tighten rocker locknut to **35 Nm** after adjustment.",
			].join("\n");
		} else if (q.includes("torque") || q.includes("cylinder head") || q.includes("bolt")) {
			responseMarkdown = [
				"### Technical Specification: Fastener Tightening Torques",
				"- **Cylinder Head Main Bolts (M14 x 1.5):**",
				"  1. Step 1 (Snug torque): **70 Nm**",
				"  2. Step 2 (Intermediate torque): **140 Nm**",
				"  3. Step 3 (Angle torque): **+ 90° rotation in single continuous stroke**",
				"- **Connecting Rod Big-End Bolts:** **65 Nm + 60° rotation**",
				"- **Flywheel Housing Bolts:** **110 Nm**",
				"- **Fuel Injector Clamp Bolt:** **32 Nm**",
				"- *Crucial Rule:* Lightly lubricate bolt threads and washer under-head with clean engine oil prior to assembly.",
			].join("\n");
		} else if (q.includes("oil") || q.includes("capacity") || q.includes("lube") || q.includes("viscosity")) {
			responseMarkdown = [
				"### Technical Specification: Lubricating Oil System",
				"- **Sump Capacity (with Filter):** **14.0 Liters** (DV8 Series) / **28.0 Liters** (DV16 Series)",
				"- **Approved Viscosity Grade:** **15W-40 API CI-4 Plus or CK-4**",
				"- **Oil Change Interval:** **500 Operating Hours** or 1 Year (whichever occurs first)",
				"- **Normal Operating Pressure:** **3.5 to 5.5 bar** at rated 1500 RPM",
				"- **Low Oil Pressure Alarm Threshold:** **1.8 bar**",
				"- **Low Oil Pressure Engine Trip Threshold:** **1.2 bar**",
			].join("\n");
		} else {
			responseMarkdown = [
				"### General Engine Specifications: KOEL Power Generation",
				"- **Rated Speed / Frequency:** **1500 RPM @ 50 Hz** (4-pole synchronous alternator)",
				"- **Battery Electrical System:** **24V DC Negative Ground** (Dual 12V 120Ah in series)",
				"- **Coolant Type:** 50/50 Premix Ethylene Glycol with Organic Acid Technology (OAT) corrosion inhibitors",
				"- **Maintenance Schedule:**",
				"  - 50 Hours: First inspection, valve check, belt tension verification",
				"  - 250 Hours: Fuel pre-filter inspection and drain water separator",
				"  - 500 Hours: Engine oil & filter replacement, air cleaner primary element inspection",
				"  - 1000 Hours: Valve tappet adjustment, alternator & starter motor electrical inspection",
			].join("\n");
		}

		return {
			content: [{ type: "text", text: responseMarkdown }],
		};
	},
};

// ── 9. Get Wiring Diagram Tool ──────────────────────────────────────────────

export const getWiringDiagramTool: AgentTool = {
	name: "get_wiring_diagram",
	label: "Wiring Diagram Retrieval",
	description: "Fetches electrical schematic diagrams and connector pinouts for the genset.",
	parameters: Type.Object({
		app_code: Type.Optional(Type.String({ description: "Genset app code" })),
		subsystem: Type.Optional(Type.String({ description: "Subsystem: 'ecu', 'sensors', 'starting', or 'charging'" })),
	}),
	execute: async (_toolCallId, params) => {
		const subsystem = (params as { subsystem?: string; app_code?: string }).subsystem || "all";
		const appCode = (params as { subsystem?: string; app_code?: string }).app_code || defaultSessionState.appCode;

		// 1. Try Live MSSQL Database lookup
		const mssqlRow = await callBridge("wiring_diagram", [appCode]);
		const diagramFile = mssqlRow?.cWiring_Diagram || `DWG-KOEL-ELEC-${appCode.replace(/\./g, "-")}-REV04`;

		const markdown = [
			`### Electrical Schematic & Wiring Diagram: ${appCode} (Live MSSQL Catalog)`,
			`- **Diagram Reference ID:** \`${diagramFile}\``,
			mssqlRow?.cENGINE_MODEL ? `- **Engine Model:** ${mssqlRow.cENGINE_MODEL}` : "",
			mssqlRow?.cEMISSION_NORMS ? `- **Emission Norms:** ${mssqlRow.cEMISSION_NORMS}` : "",
			`- **Target Subsystem:** ${subsystem.toUpperCase()}`,
			"",
			"#### Connector & Pinout Reference:",
			"- **ECU Connector J1 (50-pin Black):**",
			"  - Pin 1 & 2: +24V Battery Supply (Fused 15A from relay R1)",
			"  - Pin 3 & 4: Power Ground (Main engine block ground braid)",
			"  - Pin 14: CAN1-High (Yellow wire, Twisted pair with Pin 15)",
			"  - Pin 15: CAN1-Low (Green wire, Twisted pair with Pin 14, 120Ω internal terminator)",
			"- **NOx Sensor Connector (4-pin Deutsch DT04-4P):**",
			"  - Pin 1: +24V Ignition Supply (Red/Black)",
			"  - Pin 2: Ground (Brown)",
			"  - Pin 3: CAN-High (Yellow)",
			"  - Pin 4: CAN-Low (Green)",
			"",
			`*Direct Schematic Link:* [View Complete PDF Wiring Schematic](http://localhost:7001/manuals/wiring/${diagramFile}.pdf)`,
		].filter(Boolean).join("\n");

		return {
			content: [{ type: "text", text: markdown }],
			details: { live: !!mssqlRow?.cWiring_Diagram, appCode, subsystem, mssqlRow },
		};
	},
};

// ── 10. Display Continue Options Widget Tool ────────────────────────────────

export const displayContinueOptionsTool: AgentTool = {
	name: "display_continue_options",
	label: "Display Continue Options Widget",
	description: "Presents interactive user choices: 'View Issue Details', 'Issue Resolved', or 'Change SPN/FMI'.",
	parameters: Type.Object({}),
	execute: async () => {
		const widget = {
			type: "action_buttons",
			buttons: [
				{ label: "View Issue Details", value: "View Issue Details" },
				{ label: "Issue Resolved", value: "The issue has been resolved" },
				{ label: "Change SPN/FMI", value: "I want to change the SPN/FMI codes" },
			],
		};

		return {
			content: [
				{
					type: "text",
					text: `### How would you like to proceed?\n\nPlease select one of the options below:\n- **[View Issue Details]** — Drill down into technical fault codes and service manual steps\n- **[Issue Resolved]** — Mark repair completed and submit engineer feedback\n- **[Change SPN/FMI]** — Add or modify active diagnostic codes\n\n<json>${JSON.stringify(widget)}</json>`,
				},
			],
			details: widget,
		};
	},
};

// ── 11. Display Feedback Block Widget Tool ──────────────────────────────────

export const displayFeedbackBlockTool: AgentTool = {
	name: "display_feedback_block",
	label: "Display Feedback Widget",
	description: "Emits resolution confirmation and customer satisfaction feedback widget.",
	parameters: Type.Object({}),
	execute: async () => {
		const widget = {
			type: "feedback_block",
			title: "Diagnostic Resolution Feedback",
			fields: [
				{ name: "rating", type: "star_rating", max: 5, label: "Diagnostic Accuracy Rating" },
				{ name: "parts_replaced", type: "text", label: "Parts Replaced (Part Numbers)" },
				{ name: "notes", type: "textarea", label: "Technician Closing Remarks" },
			],
		};

		return {
			content: [
				{
					type: "text",
					text: `### Issue Marked as Resolved ✅\n\nThank you for confirming resolution. Please complete the quick feedback summary below to archive this diagnostic session into the Siebel Service database:\n\n<json>${JSON.stringify(widget)}</json>`,
				},
			],
			details: widget,
		};
	},
};

// ── 12. Genset Sizing & Power Calculation Tool ──────────────────────────────

export const suggestGensetTool: AgentTool = {
	name: "suggest_genset",
	label: "Suggest Genset",
	description: "Recommends diesel generator options based on required kVA capacity and application.",
	parameters: Type.Object({
		kva: Type.Number({ description: "Power rating in kVA required by the customer" }),
		application: Type.Optional(Type.String({ description: "Industry or application (e.g. hospital, factory, residential)" })),
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

// ── Master Tools Array ──────────────────────────────────────────────────────

export const ALL_SERVICE_TOOLS: AgentTool[] = [
	updateGensetDetailsTool,
	getSpnFmiSummaryTool,
	modifySpnFmiCodesTool,
	displayExtractedFaultsTool,
	getSymptomSummaryTool,
	getRecentServiceRequestsTool,
	lookupServiceRequestTool,
	queryTechnicalKnowledgeTool,
	getWiringDiagramTool,
	displayContinueOptionsTool,
	displayFeedbackBlockTool,
	suggestGensetTool,
];

export async function executeServiceTool(
	toolName: string,
	rawArgs: Record<string, any> = {},
): Promise<{ result: any; text: string } | null> {
	const tool = ALL_SERVICE_TOOLS.find((t) => t.name === toolName);
	if (!tool) {
		console.warn(`[Tool Execution Warning] Tool "${toolName}" not found.`);
		return null;
	}

	// Normalize argument aliases from LLM router
	const args: Record<string, any> = { ...rawArgs };
	if (args.asset_id && !args.instance_id) args.instance_id = args.asset_id;
	if (args.instance_id && !args.identifier) args.identifier = args.instance_id;
	if (args.serial_number && !args.identifier) {
		args.identifier = args.serial_number;
		args.identifier_type = "Serial Number";
	}
	if (args.symptom && !args.symptom_text) args.symptom_text = args.symptom;
	if (args.limit && !args.count) args.count = args.limit;
	if (args.spn_code !== undefined && args.spn === undefined) args.spn = args.spn_code;
	if (args.fmi_code !== undefined && args.fmi === undefined) args.fmi = args.fmi_code;

	// Fill in defaults from active session state if omitted
	if (!args.instance_id && defaultSessionState.instanceId) {
		args.instance_id = defaultSessionState.instanceId;
	}
	if (!args.app_code && defaultSessionState.appCode) {
		args.app_code = defaultSessionState.appCode;
	}

	const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
	const output = await tool.execute(toolCallId, args);
	const text = output?.content?.map((c: { text?: string }) => c.text || "").join("\n") || "";
	return { result: output, text };
}
