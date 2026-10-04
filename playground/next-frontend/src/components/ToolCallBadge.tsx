"use client";

import React, { useState } from "react";
import type { ToolCallState } from "../types/chat";

export function ToolCallBadge({ toolCall }: { toolCall: ToolCallState }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="tool-card">
      <div className="tool-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="tool-info">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="tool-badge">{toolCall.tool}</span>
        </div>

        <div className="tool-status-tag-wrapper">
          {toolCall.status === "running" ? (
            <span className="tool-status-tag running">
              <span className="status-dot" style={{ backgroundColor: "var(--status-warning)" }} />
              Executing...
            </span>
          ) : (
            <span className="tool-status-tag completed">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Completed
            </span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="tool-body">
          {toolCall.args && (
            <div style={{ marginBottom: toolCall.result ? 8 : 0 }}>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Parameters:</div>
              {JSON.stringify(toolCall.args, null, 2)}
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>Result:</div>
              {typeof toolCall.result === "string"
                ? toolCall.result
                : JSON.stringify(toolCall.result, null, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
