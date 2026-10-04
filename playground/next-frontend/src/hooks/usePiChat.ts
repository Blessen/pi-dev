"use client";

import { useState, useRef, useCallback } from "react";
import type { ChatMessage, ServerEvent } from "../types/chat";

export function usePiChat(initialEndpoint = "http://localhost:3001/api/chat") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(initialEndpoint);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setError(null);
  }, [stopStreaming]);

  const sendMessage = useCallback(
    async (userInput: string) => {
      const trimmed = userInput.trim();
      if (!trimmed || isStreaming) return;

      setError(null);
      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;

      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      const initialAssistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        thinking: "",
        toolCalls: [],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: trimmed }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("No readable stream response body received from server.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const lines = part.split("\n");
            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const event: ServerEvent = JSON.parse(jsonStr);

                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  if (lastIndex < 0 || updated[lastIndex].id !== assistantMessageId) {
                    return updated;
                  }

                  const current = { ...updated[lastIndex] };

                  if (event.kind === "text") {
                    current.content = (current.content || "") + event.delta;
                  } else if (event.kind === "thinking") {
                    current.thinking = (current.thinking || "") + event.delta;
                  } else if (event.kind === "tool_start") {
                    const currentTools = current.toolCalls ? [...current.toolCalls] : [];
                    currentTools.push({
                      tool: event.tool,
                      args: event.args,
                      status: "running",
                    });
                    current.toolCalls = currentTools;
                  } else if (event.kind === "tool_end") {
                    if (current.toolCalls && current.toolCalls.length > 0) {
                      const updatedTools = [...current.toolCalls];
                      for (let i = updatedTools.length - 1; i >= 0; i--) {
                        if (updatedTools[i].status === "running") {
                          updatedTools[i] = {
                            ...updatedTools[i],
                            status: "completed",
                            result: event.result,
                          };
                          break;
                        }
                      }
                      current.toolCalls = updatedTools;
                    }
                  } else if (event.kind === "error") {
                    current.content += `\n\n> ⚠️ **Error:** ${event.error}`;
                  }

                  updated[lastIndex] = current;
                  return updated;
                });

                if (event.kind === "done") {
                  setIsStreaming(false);
                }
              } catch (parseError) {
                console.warn("Failed to parse SSE payload line:", line, parseError);
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          console.log("Stream aborted by user");
        } else {
          const errMsg = err instanceof Error ? err.message : String(err);
          setError(errMsg);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant" && !last.content) {
              last.content = `> ⚠️ **Connection Error:** Could not connect to Pi server at \`${apiEndpoint}\`.\n>\n> Make sure the server is running with \`./node_modules/.bin/tsx --tsconfig ./tsconfig.json playground/server.ts\`.\n>\n> Details: ${errMsg}`;
            }
            return [...updated];
          });
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [apiEndpoint, isStreaming]
  );

  return {
    messages,
    isStreaming,
    apiEndpoint,
    setApiEndpoint,
    error,
    sendMessage,
    stopStreaming,
    clearChat,
  };
}
