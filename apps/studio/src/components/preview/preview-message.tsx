"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import styles from "./preview.module.css";

export type InputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function PreviewMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly InputResponse[]) => void | Promise<void>;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <article className={`${styles.message} ${styles[message.role]}`}>
      <header className={styles.messageRole}>{message.role}</header>
      <div className={styles.messageBody}>
        {message.parts.map((part, index) => (
          <PreviewMessagePart
            key={partKey(part, index)}
            canRespond={canRespond}
            isStreaming={isStreaming}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={index === lastTextIndex && isStreaming && message.role === "assistant"}
          />
        ))}
      </div>
    </article>
  );
}

function PreviewMessagePart({
  canRespond,
  isStreaming,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly onInputResponses: (responses: readonly InputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <p className={styles.textPart}>
          {part.text}
          {showCaret ? <span className={styles.caret} /> : null}
        </p>
      );
    case "reasoning":
      return (
        <details className={styles.reasoning} open={part.state === "streaming"}>
          <summary>Reasoning</summary>
          <pre>{part.text}</pre>
        </details>
      );
    case "dynamic-tool":
      return (
        <ToolPart
          canRespond={canRespond}
          isStreaming={isStreaming}
          onInputResponses={onInputResponses}
          part={part}
        />
      );
  }
}

function ToolPart({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly onInputResponses: (responses: readonly InputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  const inputResponse = part.toolMetadata?.eve?.inputResponse;

  return (
    <div className={styles.tool}>
      <div className={styles.toolHeader}>
        <span className={styles.toolName}>{part.toolName}</span>
        <span className={`${styles.toolState} ${styles[`state_${part.state}`]}`}>
          {part.state}
        </span>
      </div>
      {part.input !== undefined && (
        <details className={styles.toolSection}>
          <summary>Input</summary>
          <pre>{JSON.stringify(part.input, null, 2)}</pre>
        </details>
      )}
      {"output" in part && part.output !== undefined && (
        <details className={styles.toolSection} open>
          <summary>Output</summary>
          <pre>{JSON.stringify(part.output, null, 2)}</pre>
        </details>
      )}
      {"errorText" in part && part.errorText && (
        <p className={styles.toolError}>{part.errorText}</p>
      )}
      {part.state === "approval-requested" && (
        <div className={styles.approvalActions}>
          <p>Approval required to run this tool.</p>
          <button
            type="button"
            disabled={!canRespond}
            className={styles.approveBtn}
            onClick={() =>
              void onInputResponses([
                { requestId: part.approval!.id, optionId: "approve" },
              ])
            }
          >
            Approve
          </button>
          <button
            type="button"
            disabled={!canRespond}
            className={styles.denyBtn}
            onClick={() =>
              void onInputResponses([
                { requestId: part.approval!.id, optionId: "deny" },
              ])
            }
          >
            Deny
          </button>
        </div>
      )}
      {inputRequest && (
        <div className={styles.inputRequest}>
          <p>{inputRequest.prompt}</p>
          {inputResponse ? (
            <p className={styles.muted}>
              Responded:{" "}
              {inputRequest.options?.find((o) => o.id === inputResponse.optionId)?.label ??
                inputResponse.text ??
                inputResponse.optionId}
            </p>
          ) : (
            <div className={styles.optionRow}>
              {inputRequest.options?.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!canRespond}
                  className={
                    option.style === "danger" ? styles.denyBtn : styles.approveBtn
                  }
                  onClick={() =>
                    void onInputResponses([
                      {
                        optionId: option.id,
                        requestId: inputRequest.requestId,
                      },
                    ])
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function partKey(part: EveMessagePart, index: number): string {
  if (part.type === "dynamic-tool") return part.toolCallId;
  return `${part.type}:${index}`;
}
