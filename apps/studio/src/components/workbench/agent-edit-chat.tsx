"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";
import { Sparkles } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Summarize what this agent does",
  "What tools does it have and what do they do?",
  "Suggest a new skill that would make this agent more useful",
  "Rewrite the instructions to be clearer and more concise",
];

export function AgentEditChat({ agentName = "Agent" }: { agentName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isBusy = status === "submitted" || status === "streaming";

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
  }, []);

  const runChat = useCallback(
    async (history: ChatMessage[]) => {
      setError(null);
      setStatus("submitted");
      const assistantId = nanoid();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            agentName,
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!res.ok || !res.body) {
          let message = `Request failed (${res.status})`;
          try {
            const data = await res.json();
            if (data?.error) message = data.error;
          } catch {
            // keep default message
          }
          throw new Error(message);
        }

        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
        setStatus("streaming");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
        setStatus("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setStatus("ready");
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [agentName],
  );

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      const userMessage: ChatMessage = { id: nanoid(), role: "user", content: trimmed };
      const next = [...messages, userMessage];
      setMessages(next);
      setInput("");
      void runChat(next);
    },
    [isBusy, messages, runChat],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => submitText(message.text),
    [submitText],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {error ? (
        <Alert className="mx-3 mt-3 shrink-0 border-destructive/40 bg-destructive/10" variant="destructive">
          <AlertTitle>Chat unavailable</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{error}</p>
            <p className="text-xs opacity-90">
              Set <code className="rounded bg-black/10 px-1">OPENAI_API_KEY</code> or{" "}
              <code className="rounded bg-black/10 px-1">AI_GATEWAY_API_KEY</code> in your agent
              project&apos;s .env.local.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-2xl gap-6 p-4">
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">Edit your agent with AI</h3>
                  <p className="max-w-sm text-muted-foreground text-sm">
                    Describe the changes you want and I&apos;ll use your full agent definition as
                    context. Editing lands soon — for now I can explain and plan.
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      className="h-auto whitespace-normal py-1.5 text-left text-xs"
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => submitText(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.role === "assistant" ? (
                    <MessageResponse>{message.content}</MessageResponse>
                  ) : (
                    message.content
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              <span>Reading your agent…</span>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t bg-background px-4 py-3">
        <PromptInput className="relative mx-auto w-full max-w-2xl" onSubmit={handleSubmit}>
          <PromptInputTextarea
            className={cn("min-h-11 pr-12")}
            placeholder="Describe a change to your agent…"
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          <PromptInputSubmit
            className="absolute right-1.5 bottom-1.5"
            disabled={!input.trim() && !isBusy}
            status={status}
            onStop={stop}
          />
        </PromptInput>
      </div>
    </div>
  );
}
