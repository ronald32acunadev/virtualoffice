import React, { useState } from "react";
import type { ActivityGroupBlock } from "../state/activityGroups";
import {
  classifyStep,
  extractEditDiff,
  extractCommandView,
  fileBasename,
  extractFilePath,
} from "../state/activityGroups";
import { buildToolLabel, splitLabel } from "../state/toolLabel";

interface ActivityGroupProps {
  block: ActivityGroupBlock;
}

export const ActivityGroup: React.FC<ActivityGroupProps> = ({ block }) => {
  return (
    <details className={`activity-group activity-${block.status}`} open={block.status === "running"}>
      <summary className="activity-header">
        <span className={`activity-status-dot ${block.status}`} />
        <span className="activity-summary">{block.summary}</span>
        {block.files.length > 0 && (
          <span className="activity-files">
            {block.files.slice(0, 6).map((file, idx) => (
              <span key={idx} className="file-pill">
                {file}
              </span>
            ))}
            {block.files.length > 6 && (
              <span className="file-pill file-pill-more">+{block.files.length - 6}</span>
            )}
          </span>
        )}
      </summary>
      <div className="activity-steps">
        {block.items.map((item, idx) => {
          const category = classifyStep(item);
          if (category === "thought") {
            return (
              <div key={item.message.id || idx} className="activity-step activity-step-thought">
                <div className="activity-step-head">
                  <span className="activity-step-icon">💭</span>
                  <span className="activity-step-title">Thought</span>
                </div>
                <div className="activity-step-content markdown-body">{item.message.content}</div>
              </div>
            );
          }

          const toolName = item.message.toolName ?? null;
          const content = item.message.content ?? "";
          const resultContent = item.result?.content ?? null;
          const labelText = buildToolLabel(toolName, content);
          const labelParts = splitLabel(labelText);

          const diff = extractEditDiff(toolName, content);
          const cmd = extractCommandView(toolName, content, resultContent);
          const filePath = extractFilePath(content);

          let icon = "⚙";
          if (category === "read") icon = "📖";
          else if (category === "edit") icon = "✏️";
          else if (category === "search") icon = "🔍";
          else if (category === "command") icon = "⌘";

          return (
            <details key={item.message.id || idx} className="activity-step" open={false}>
              <summary className="activity-step-head">
                <span className="activity-step-icon">{icon}</span>
                <span className="activity-step-title">
                  {labelParts.map((p, pIdx) =>
                    p.code ? (
                      <code key={pIdx} className="inline-code">
                        {p.text}
                      </code>
                    ) : (
                      <span key={pIdx}>{p.text}</span>
                    )
                  )}
                </span>
                {filePath && <span className="activity-step-file">{fileBasename(filePath)}</span>}
              </summary>
              <div className="activity-step-body">
                {diff ? (
                  <div className="diff-view">
                    {"isNewFile" in diff ? (
                      <div className="diff-add">+ {diff.content}</div>
                    ) : (
                      <>
                        {diff.oldText.split("\n").map((line, lIdx) => (
                          <div key={`del-${lIdx}`} className="diff-del">
                            - {line}
                          </div>
                        ))}
                        {diff.newText.split("\n").map((line, lIdx) => (
                          <div key={`add-${lIdx}`} className="diff-add">
                            + {line}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : cmd ? (
                  <div className="cmd-view">
                    <div className="cmd-line">$ {cmd.command}</div>
                    {cmd.output && <pre className="cmd-output">{cmd.output}</pre>}
                  </div>
                ) : (
                  <div className="tool-raw">
                    <div className="tool-section">
                      <strong>Input:</strong>
                      <pre>{content}</pre>
                    </div>
                    {resultContent && (
                      <div className="tool-section">
                        <strong>Result:</strong>
                        <pre>{resultContent}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
};
