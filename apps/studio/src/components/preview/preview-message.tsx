"use client";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import { CheckIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

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
  const reasoningParts = message.parts.filter((part) => part.type === "reasoning");
  const reasoningText = reasoningParts.map((part) => part.text).join("\n\n");
  const hasReasoning = reasoningParts.length > 0;
  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isStreaming &&
    message.role === "assistant" &&
    lastPart?.type === "reasoning";

  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <Message from={message.role}>
      <MessageContent>
        {hasReasoning && message.role === "assistant" ? (
          <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        ) : null}

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
      </MessageContent>
    </Message>
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
      return <MessageResponse isAnimating={showCaret}>{part.text}</MessageResponse>;
    case "reasoning":
      return null;
    case "dynamic-tool":
      return (
        <EveToolPart
          canRespond={canRespond}
          isStreaming={isStreaming}
          onInputResponses={onInputResponses}
          part={part}
        />
      );
  }
}

function EveToolPart({
  canRespond,
  isStreaming,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly onInputResponses: (responses: readonly InputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const toolPart = part as DynamicToolUIPart;
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const kind = part.toolMetadata?.eve?.kind;
  const title = kind && kind !== "unknown" ? `${part.toolName} (${kindLabel(kind)})` : part.toolName;
  const defaultOpen =
    part.state === "approval-requested" ||
    part.state === "output-available" ||
    part.state === "output-error" ||
    (isStreaming &&
      (part.state === "input-streaming" || part.state === "input-available"));

  const output = formatToolOutput(part);

  return (
    <div className="w-full space-y-3">
      <Tool defaultOpen={defaultOpen}>
        <ToolHeader
          state={toolPart.state}
          title={title}
          toolName={part.toolName}
          type="dynamic-tool"
        />
        <ToolContent>
          {part.input !== undefined ? <ToolInput input={part.input} /> : null}
          <ToolOutput errorText={"errorText" in part ? part.errorText : undefined} output={output} />
        </ToolContent>
      </Tool>

      {part.approval ? (
        <Confirmation approval={part.approval as ToolUIPart["approval"]} state={toolPart.state}>
          <ConfirmationRequest>
            <ConfirmationTitle>
              Approval required to run <strong>{part.toolName}</strong>.
            </ConfirmationTitle>
          </ConfirmationRequest>
          <ConfirmationAccepted>
            <CheckIcon className="size-4" />
            <span>Tool execution approved</span>
          </ConfirmationAccepted>
          <ConfirmationRejected>
            <XIcon className="size-4" />
            <span>Tool execution denied</span>
          </ConfirmationRejected>
          <ConfirmationActions>
            <ConfirmationAction
              disabled={!canRespond}
              variant="outline"
              onClick={() =>
                void onInputResponses([{ optionId: "deny", requestId: part.approval!.id }])
              }
            >
              Deny
            </ConfirmationAction>
            <ConfirmationAction
              disabled={!canRespond}
              onClick={() =>
                void onInputResponses([{ optionId: "approve", requestId: part.approval!.id }])
              }
            >
              Approve
            </ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      ) : null}

      {inputRequest ? (
        <Alert className="border-dashed">
          <AlertDescription className="space-y-3">
            <p>{inputRequest.prompt}</p>
            {inputResponse ? (
              <p className="text-muted-foreground text-sm">
                Responded:{" "}
                {inputRequest.options?.find((option) => option.id === inputResponse.optionId)
                  ?.label ??
                  inputResponse.text ??
                  inputResponse.optionId}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {inputRequest.options?.map((option) => (
                  <Button
                    key={option.id}
                    disabled={!canRespond}
                    size="sm"
                    type="button"
                    variant={option.style === "danger" ? "destructive" : "default"}
                    onClick={() =>
                      void onInputResponses([
                        { optionId: option.id, requestId: inputRequest.requestId },
                      ])
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function formatToolOutput(part: EveDynamicToolPart): ReactNode | undefined {
  if (!("output" in part) || part.output === undefined) {
    return undefined;
  }

  if (typeof part.output === "string") {
    return <MessageResponse>{part.output}</MessageResponse>;
  }

  return part.output as ReactNode;
}

function kindLabel(kind: "load-skill" | "subagent-call" | "tool-call" | "unknown") {
  switch (kind) {
    case "load-skill":
      return "skill";
    case "subagent-call":
      return "subagent";
    case "tool-call":
      return "tool";
    default:
      return kind;
  }
}

function partKey(part: EveMessagePart, index: number): string {
  if (part.type === "dynamic-tool") return part.toolCallId;
  return `${part.type}:${index}`;
}
