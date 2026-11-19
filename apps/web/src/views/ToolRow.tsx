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
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        </div>
      );
    default:
      return <div className="bubble-system">{message.content}</div>;
  }
}
