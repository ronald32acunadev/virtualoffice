import type { Message } from "../api/types";

function Collapsible({ summary, body }: { summary: string; body: string }) {
  return (
    <details>
      <summary>{summary}</summary>
      <pre>{body}</pre>
    </details>
  );
}

export function MessageItem({ message, nested = false }: { message: Message; nested?: boolean }) {
  const cls = `msg msg-${message.kind}${nested ? " msg-nested" : ""}`;
  switch (message.kind) {
    case "user_text":
      return (
        <div className={cls}>
          <span className="msg-who">You</span>
          <p>{message.content}</p>
        </div>
      );
    case "agent_text":
      return (
        <div className={cls}>
          <span className="msg-who">Agent</span>
          <p>{message.content}</p>
        </div>
      );
    case "tool_call":
      return (
        <div className={cls}>
          <Collapsible summary={`Tool: ${message.toolName ?? "unknown"}`} body={message.content} />
        </div>
      );
    case "tool_result":
      return (
        <div className={cls}>
          <Collapsible summary="Tool result" body={message.content} />
        </div>
      );
    case "system":
      return (
        <div className={cls}>
          <p>{message.content}</p>
        </div>
      );
  }
}
