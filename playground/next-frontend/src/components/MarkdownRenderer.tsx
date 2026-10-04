"use client";

import React, { useState } from "react";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{language || "text"}</span>
        <button type="button" onClick={handleCopy} className="btn-copy-code" title="Copy code">
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="markdown-content">
      {blocks.map((block, idx) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const firstLineEnd = block.indexOf("\n");
          let language = "";
          let code = "";

          if (firstLineEnd !== -1) {
            language = block.slice(3, firstLineEnd).trim();
            code = block.slice(firstLineEnd + 1, -3).replace(/\n$/, "");
          } else {
            code = block.slice(3, -3);
          }

          return <CodeBlock key={idx} code={code} language={language} />;
        }

        const lines = block.split("\n");
        const renderedElements: React.ReactNode[] = [];
        let listBuffer: string[] = [];

        const flushList = () => {
          if (listBuffer.length > 0) {
            renderedElements.push(
              <ul key={`ul-${renderedElements.length}`}>
                {listBuffer.map((item, liIdx) => (
                  <li key={liIdx}>{formatInline(item)}</li>
                ))}
              </ul>
            );
            listBuffer = [];
          }
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          if (trimmed.startsWith("# ")) {
            flushList();
            renderedElements.push(<h1 key={`h1-${i}`}>{formatInline(trimmed.slice(2))}</h1>);
          } else if (trimmed.startsWith("## ")) {
            flushList();
            renderedElements.push(<h2 key={`h2-${i}`}>{formatInline(trimmed.slice(3))}</h2>);
          } else if (trimmed.startsWith("### ")) {
            flushList();
            renderedElements.push(<h3 key={`h3-${i}`}>{formatInline(trimmed.slice(4))}</h3>);
          } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed)) {
            const cleanText = trimmed.replace(/^([-*]|\d+\.)\s+/, "");
            listBuffer.push(cleanText);
          } else if (trimmed === "") {
            flushList();
          } else {
            flushList();
            renderedElements.push(<p key={`p-${i}`}>{formatInline(line)}</p>);
          }
        }
        flushList();

        return <React.Fragment key={idx}>{renderedElements}</React.Fragment>;
      })}
    </div>
  );
}
