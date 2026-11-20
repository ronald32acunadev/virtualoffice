import { isValidElement, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TimelineItem } from "../state/timeline";
import { buildToolLabel, splitLabel } from "../state/toolLabel";

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
  switch (message.kind) {
    case "user_text":
      return (
        <div className="bubble bubble-user">
          <p>{message.content}</p>
        </div>
      );
    case "agent_text":
      return (
        <div className="bubble bubble-agent markdown">
          <RichMarkdown content={message.content} />
        </div>
      );
    default:
      return <div className="bubble-system">{message.content}</div>;
  }
}
