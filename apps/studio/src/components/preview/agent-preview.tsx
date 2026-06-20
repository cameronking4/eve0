"use client";

import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatStatus, UIMessage } from "ai";
import { useEveAgent } from "eve/react";
import { BotIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PreviewMessage, type InputResponse } from "./preview-message";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentPreview({
  agentName = "Agent",
  embedded = false,
  eveHost,
  agentScope,
}: {
  agentName?: string;
  embedded?: boolean;
  eveHost?: string | null;
  /** Changes when the active agent switches — resets the Eve session and aborts in-flight streams. */
  agentScope?: string;
}) {
  const agent = useEveAgent(eveHost ? { host: eveHost } : undefined);
  const [input, setInput] = useState("");
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;
  const stopRef = useRef(agent.stop);
  stopRef.current = agent.stop;

  useEffect(() => {
    return () => {
      stopRef.current();
    };
  }, [agentScope]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || isBusy) return;
    setInput("");
    await agent.send({ message: text });
  };

  const handleInputResponses = async (responses: readonly InputResponse[]) => {
    await agent.send({ inputResponses: responses });
  };

  const chatStatus = toChatStatus(agent.status);
  const uiMessages = agent.data.messages as UIMessage[];

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background")}>
      {!embedded ? (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              href="/"
            >
              ← Editor
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <BotIcon className="size-4 shrink-0 text-muted-foreground" />
              <h1 className="truncate font-semibold text-sm">{agentName}</h1>
              <StatusBadge status={agent.status} />
            </div>
            <Badge className="shrink-0" variant="secondary">
              Live preview
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button disabled={isBusy} size="sm" type="button" variant="outline" onClick={() => agent.reset()}>
              New session
            </Button>
            {isBusy ? (
              <Button size="sm" type="button" variant="outline" onClick={() => agent.stop()}>
                Stop
              </Button>
            ) : null}
          </div>
        </header>
      ) : null}

      {agent.error ? (
        <Alert className="mx-4 mt-4 shrink-0 border-destructive/40 bg-destructive/10" variant="destructive">
          <AlertTitle>Preview unavailable</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{agent.error.message}</p>
            <p className="text-xs opacity-90">
              Restart with <code className="rounded bg-black/10 px-1">forge dev</code> from your agent
              folder, or run <code className="rounded bg-black/10 px-1">npm install</code> if Eve is
              missing. See CONNECTIONS.md for channel setup.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className={cn("mx-auto w-full max-w-3xl", embedded && "gap-6 p-3")}>
          {isEmpty ? (
            <ConversationEmptyState
              description="Send a message to test your agent. Tool calls, reasoning, and approvals appear here in real time."
              icon={<MessageSquare className="size-10" />}
              title={agentName}
            />
          ) : (
            agent.data.messages.map((message, index) => (
              <PreviewMessage
                key={message.id}
                canRespond={!isBusy && index === agent.data.messages.length - 1}
                isStreaming={
                  isBusy &&
                  message.role === "assistant" &&
                  index === agent.data.messages.length - 1
                }
                message={message}
                onInputResponses={handleInputResponses}
              />
            ))
          )}
          {agent.status === "submitted" ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              <span>Waiting for response…</span>
            </div>
          ) : null}
        </ConversationContent>
        {!embedded && !isEmpty ? <ConversationDownload messages={uiMessages} /> : null}
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t bg-background px-4 py-3">
        <PromptInput
          className={cn(
            "relative mx-auto w-full",
            embedded ? "max-w-none" : "max-w-3xl",
          )}
          onSubmit={handleSubmit}
        >
          <PromptInputTextarea
            className="min-h-11 pr-12"
            disabled={isBusy}
            placeholder="Message your agent…"
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          <PromptInputSubmit
            className="absolute right-1.5 bottom-1.5"
            disabled={!input.trim() && !isBusy}
            status={chatStatus}
            onStop={() => agent.stop()}
          />
        </PromptInput>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";

  if (isLive) {
    return (
      <Badge className="gap-1.5" variant="default">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
        </span>
        {status === "streaming" ? "Streaming" : "Running"}
      </Badge>
    );
  }

  if (status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }

  return (
    <Badge className="text-muted-foreground" variant="outline">
      Ready
    </Badge>
  );
}

function toChatStatus(status: AgentStatus): ChatStatus {
  return status;
}
