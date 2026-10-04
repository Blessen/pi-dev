export interface ToolCallState {
  tool: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: "running" | "completed";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: ToolCallState[];
  timestamp: number;
}

export type ServerEvent =
  | { kind: "text"; delta: string }
  | { kind: "thinking"; delta: string }
  | { kind: "tool_start"; tool: string; args: Record<string, unknown> }
  | { kind: "tool_end"; tool: string; result: unknown }
  | { kind: "done" }
  | { kind: "error"; error: string };
