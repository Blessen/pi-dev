"use client";

import React, { useState } from "react";
import type { ChatMessage as ChatMessageType } from "../types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallBadge } from "./ToolCallBadge";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [showThinking, setShowThinking] = useState(true);

  return (
    <div className={`message-row ${isUser ? "user" : "assistant"}`}>
      <div className={`avatar ${isUser ? "user" : "assistant"}`}>
        {isUser ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
      </div>

      <div className="message-content-wrapper">
        <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
          {/* Thinking / Reasoning Section */}
          {message.thinking && (
            <div className="thinking-card">
              <div
                className="thinking-header"
                onClick={() => setShowThinking(!showThinking)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>{showThinking ? "Hide Thought Process" : "Show Thought Process"}</span>
              </div>
              {showThinking && <div className="thinking-body">{message.thinking}</div>}
            </div>
          )}

          {/* Tool Calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div style={{ marginBottom: message.content ? 12 : 0 }}>
              {message.toolCalls.map((toolCall, idx) => (
                <ToolCallBadge key={idx} toolCall={toolCall} />
              ))}
            </div>
          )}

          {/* Message Text */}
          {isUser ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          ) : (
            <>
              {message.content ? (
                <MarkdownRenderer content={message.content} />
              ) : isStreaming && !message.toolCalls?.length && !message.thinking ? (
                <span style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>
                  Generating response...
                </span>
              ) : null}
              {isStreaming && <span className="streaming-cursor" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
