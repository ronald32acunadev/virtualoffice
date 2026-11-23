import { isValidElement, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getToken } from "../api/client";
import type { MessageAttachment } from "../api/types";
import type { TimelineItem } from "../state/timeline";
import { buildToolLabel, splitLabel } from "../state/toolLabel";
import { buildAuthenticatedAttachmentUrl, formatFileSize, isPreviewableImageMime } from "../state/attachments";

function prettyInput(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function Label({ text }: { text: string }) {
  return (
    <>
      {splitLabel(text).map((part, index) =>
        part.code ? <code key={index}>{part.text}</code> : <span key={index}>{part.text}</span>,
      )}
    </>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  let language = "code";
  if (isValidElement<{ className?: string }>(children) && typeof children.props.className === "string") {
    const match = /language-([^\s]+)/.exec(children.props.className);
    if (match?.[1]) language = match[1];
  }
  const raw = extractText(children).replace(/\n$/, "");

  const copy = () => {
    void navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-lang">{language}</span>
        <button type="button" className="code-copy-btn" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function RichMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      }}
    >
      {content}
    </Markdown>
  );
}

export function ToolRow({ item }: { item: TimelineItem }) {
  const { message, result, children } = item;
  const orphanResult = message.kind === "tool_result";
  const label = orphanResult ? "Tool result" : buildToolLabel(message.toolName, message.content);
  return (
    <div className="tool-row">
      <details>
        <summary>
          <Label text={label} />
        </summary>
        <div className="tool-body">
          {orphanResult ? null : (
            <>
              <span className="tool-caption">Input</span>
              <pre>{prettyInput(message.content)}</pre>
            </>
          )}
          {result || orphanResult ? (
            <>
              <span className="tool-caption">Result</span>
              <pre>{(result ?? message).content || "(empty)"}</pre>
            </>
          ) : null}
        </div>
      </details>
      {children.length > 0 ? (
        <div className="msg-children">
          {children.map((child) =>
            child.message.kind === "tool_call" || child.message.kind === "tool_result" ? (
              <ToolRow key={child.message.id} item={child} />
            ) : (
              <TextBubble key={child.message.id} item={child} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function TextBubble({ item }: { item: TimelineItem }) {
  const { message } = item;
  const token = getToken();
  const [preview, setPreview] = useState<MessageAttachment | null>(null);

  switch (message.kind) {
    case "user_text": {
      const atts = message.attachments;
      return (
        <div className="bubble bubble-user">
          {atts && atts.length > 0 ? (
            <div className="msg-attachments">
              {atts.map((att) => {
                const authUrl = buildAuthenticatedAttachmentUrl(att.url, token);
                const isImg = isPreviewableImageMime(att.mimeType);
                if (isImg) {
                  return (
                    <button
                      key={att.id}
                      type="button"
                      className="msg-attachment-thumb"
                      onClick={() => setPreview(att)}
                      title={att.name}
                    >
                      <img src={authUrl} alt={att.name} />
                    </button>
                  );
                }
                return (
                  <a
                    key={att.id}
                    className="msg-attachment-chip"
                    href={authUrl}
                    download={att.name}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span aria-hidden="true">📄</span>
                    <span className="msg-attachment-name">{att.name}</span>
                    <small>{formatFileSize(att.size)}</small>
                  </a>
                );
              })}
            </div>
          ) : null}
          {message.content !== "" ? <p>{message.content}</p> : null}
          {preview ? (
            <div
              className="attachment-lightbox"
              role="dialog"
              aria-modal="true"
              onClick={() => setPreview(null)}
            >
              <div className="attachment-lightbox-content" onClick={(e) => e.stopPropagation()}>
                <div className="attachment-lightbox-bar">
                  <span className="msg-attachment-name">{preview.name}</span>
                  <a
                    className="composer-attach-btn"
                    href={buildAuthenticatedAttachmentUrl(preview.url, token)}
                    download={preview.name}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", fontSize: "14px", padding: "4px 8px" }}
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    className="composer-attachment-remove"
                    onClick={() => setPreview(null)}
                    title="Close preview"
                    aria-label="Close preview"
                  >
                    ×
                  </button>
                </div>
                <img
                  className="attachment-lightbox-img"
                  src={buildAuthenticatedAttachmentUrl(preview.url, token)}
                  alt={preview.name}
                />
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    case "agent_text": {
      const [copied, setCopied] = useState(false);
      const copy = () => {
        void navigator.clipboard?.writeText(message.content).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      };
      return (
        <div className="bubble-agent-wrap">
          <div className="bubble bubble-agent markdown">
            <RichMarkdown content={message.content} />
          </div>
          <div className="bubble-agent-actions">
            <button type="button" className="bubble-copy-btn" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      );
    }
    case "thinking":
      return (
        <details className="thought-card">
          <summary className="thought-summary">
            <span className="thought-icon" aria-hidden="true">💭</span>
            <span>Thought</span>
          </summary>
          <div className="thought-body markdown">
            <RichMarkdown content={message.content} />
          </div>
        </details>
      );
    default:
      return <div className="bubble-system">{message.content}</div>;
  }
}
