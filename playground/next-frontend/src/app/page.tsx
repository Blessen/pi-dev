"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePiChat } from "../hooks/usePiChat";
import { ChatHeader } from "../components/ChatHeader";
import { ChatMessage } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";
import { QuickPrompts } from "../components/QuickPrompts";

export default function Home() {
  const {
    messages,
    isStreaming,
    apiEndpoint,
    setApiEndpoint,
    sendMessage,
    stopStreaming,
    clearChat,
  } = usePiChat();

  const [input, setInput] = useState("");
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom("smooth");
    }
  }, [messages, showScrollBottom]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 120;
    setShowScrollBottom(isScrolledUp);
  };

  const handlePromptSubmit = () => {
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    sendMessage(text);
  };

  const handleSelectQuickPrompt = (promptText: string) => {
    if (isStreaming) return;
    sendMessage(promptText);
  };

  return (
    <div className="app-container">
      <ChatHeader
        apiEndpoint={apiEndpoint}
        onUpdateEndpoint={setApiEndpoint}
        onClearChat={clearChat}
        hasMessages={messages.length > 0}
      />

      <main className="chat-layout">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="messages-container"
          id="messages-scroll-area"
        >
          {messages.length === 0 ? (
            <QuickPrompts onSelect={handleSelectQuickPrompt} />
          ) : (
            messages.map((message, index) => {
              const isLastAssistant =
                isStreaming &&
                index === messages.length - 1 &&
                message.role === "assistant";

              return (
                <ChatMessage
                  key={message.id || index}
                  message={message}
                  isStreaming={isLastAssistant}
                />
              );
            })
          )}
          <div ref={messagesEndRef} style={{ height: 1 }} />
        </div>

        {showScrollBottom && (
          <button
            type="button"
            className="scroll-bottom-btn"
            onClick={() => {
              setShowScrollBottom(false);
              scrollToBottom("smooth");
            }}
            id="btn-scroll-bottom"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            Scroll to bottom
          </button>
        )}

        <ChatInput
          input={input}
          setInput={setInput}
          onSubmit={handlePromptSubmit}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </main>
    </div>
  );
}
