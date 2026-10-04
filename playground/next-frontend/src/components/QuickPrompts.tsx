"use client";

import React from "react";

interface QuickPromptsProps {
  onSelect: (promptText: string) => void;
}

const STARTER_PROMPTS = [
  {
    title: "🏥 Hospital Power Redundancy",
    desc: "We need an emergency backup generator of 250 kVA for a private clinic.",
    prompt: "We need an emergency backup generator of 250 kVA for a private clinic.",
  },
  {
    title: "🏭 Industrial Plant Sizing",
    desc: "Recommend diesel genset options for a 500 kVA manufacturing facility.",
    prompt: "Recommend diesel genset options for a 500 kVA manufacturing facility.",
  },
  {
    title: "⚡ Capabilities Overview",
    desc: "What power ratings and genset specifications can you provide?",
    prompt: "What power ratings and genset specifications can you provide?",
  },
  {
    title: "🔧 Commercial Backup",
    desc: "Suggest a 125 kVA prime power generator for an IT office.",
    prompt: "Suggest a 125 kVA prime power generator for an IT office.",
  },
];

export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  return (
    <div className="welcome-hero">
      <div className="welcome-logo">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <h1 className="welcome-title">Pi Power & Service Copilot</h1>
      <p className="welcome-desc">
        AI Orchestrator with integrated genset sizing tools, real-time telemetry recommendations, and live streaming.
      </p>

      <div className="quick-prompts-grid">
        {STARTER_PROMPTS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            className="prompt-card"
            onClick={() => onSelect(item.prompt)}
          >
            <div className="prompt-card-title">
              <span>{item.title}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <div className="prompt-card-desc">{item.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
