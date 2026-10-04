"use client";

import React, { useRef, useEffect } from "react";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  onStop,
  isStreaming,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && input.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="input-section">
      <div className="input-container">
        <textarea
          id="chat-textarea"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or request a power sizing recommendation..."
          className="chat-textarea"
          rows={1}
        />

        <div className="input-actions">
          {isStreaming ? (
            <button
              type="button"
              className="btn-stop"
              onClick={onStop}
              title="Stop response generation"
              id="btn-stop-streaming"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="btn-send"
              onClick={onSubmit}
              disabled={!input.trim()}
              title="Send message (Enter)"
              id="btn-send-message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="input-footer-hint">
        Pi Orchestrator with integrated genset sizing tools. Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for newline.
      </div>
    </div>
  );
}
