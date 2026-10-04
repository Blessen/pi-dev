"use client";

import React, { useState } from "react";

interface ChatHeaderProps {
  apiEndpoint: string;
  onUpdateEndpoint: (newUrl: string) => void;
  onClearChat: () => void;
  hasMessages: boolean;
}

export function ChatHeader({
  apiEndpoint,
  onUpdateEndpoint,
  onClearChat,
  hasMessages,
}: ChatHeaderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempEndpoint, setTempEndpoint] = useState(apiEndpoint);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateEndpoint(tempEndpoint);
    setIsSettingsOpen(false);
  };

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <div>
          <div className="brand-title">Pi AI Sales Copilot</div>
          <div className="brand-subtitle">
            <span className="badge-status">
              <span className="status-dot" />
              Connected (Local Ollama)
            </span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        {hasMessages && (
          <button
            type="button"
            className="btn-icon"
            onClick={onClearChat}
            title="Clear Chat History"
            id="btn-clear-chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className="btn-icon"
          onClick={() => {
            setTempEndpoint(apiEndpoint);
            setIsSettingsOpen(true);
          }}
          title="Backend Connection Settings"
          id="btn-settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Connection Settings</h2>
              <button
                type="button"
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                onClick={() => setIsSettingsOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label" htmlFor="endpoint-input">
                  Pi Agent SSE Server Endpoint
                </label>
                <input
                  id="endpoint-input"
                  type="text"
                  className="form-input"
                  value={tempEndpoint}
                  onChange={(e) => setTempEndpoint(e.target.value)}
                  placeholder="http://localhost:3001/api/chat"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
