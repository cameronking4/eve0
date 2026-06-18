"use client";

import { useEveAgent } from "eve/react";
import Link from "next/link";
import { FormEvent, useRef, useEffect } from "react";
import { PreviewMessage, type InputResponse } from "./preview-message";
import styles from "./preview.module.css";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentPreview({
  agentName = "Agent",
  embedded = false,
  eveHost,
}: {
  agentName?: string;
  embedded?: boolean;
  eveHost?: string | null;
}) {
  const agent = useEveAgent(eveHost ? { host: eveHost } : undefined);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [agent.data.messages.length, agent.status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") ?? "").trim();
    if (!message || isBusy) return;
    event.currentTarget.reset();
    await agent.send({ message });
  };

  const handleInputResponses = async (responses: readonly InputResponse[]) => {
    await agent.send({ inputResponses: responses });
  };

  return (
    <div className={`${styles.previewShell} ${embedded ? styles.embedded : ""}`}>
      <header className={styles.previewHeader}>
        <div className={styles.previewHeaderLeft}>
          <Link href="/" className={styles.backLink}>
            ← Editor
          </Link>
          <h1>{agentName}</h1>
          <StatusDot status={agent.status} />
          <span className={styles.previewBadge}>Live preview</span>
        </div>
        <div className={styles.previewHeaderRight}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => agent.reset()}
            disabled={isBusy}
          >
            New session
          </button>
          {isBusy && (
            <button type="button" className={styles.ghostBtn} onClick={() => agent.stop()}>
              Stop
            </button>
          )}
        </div>
      </header>

      {agent.error ? (
        <div className={styles.errorBanner}>
          <strong>Preview unavailable</strong>
          <p>{agent.error.message}</p>
          <p className="text-xs opacity-80">
            Restart with <code className="rounded bg-black/20 px-1">forge dev</code> from your agent
            folder, or run <code className="rounded bg-black/20 px-1">npm install</code> if Eve is
            missing. See CONNECTIONS.md for channel setup.
          </p>
        </div>
      ) : null}

      <div className={styles.conversation} ref={scrollRef}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <h2>{agentName}</h2>
            <p>Send a message to test your agent. Tool calls, reasoning, and approvals appear here in real time.</p>
          </div>
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
      </div>

      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          name="message"
          rows={2}
          placeholder="Message your agent..."
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className={styles.sendBtn} disabled={isBusy}>
          {isBusy ? "Running…" : "Send"}
        </button>
      </form>
    </div>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? styles.dotError
      : isLive
        ? styles.dotLive
        : status === "ready"
          ? styles.dotReady
          : styles.dotIdle;

  return (
    <span className={styles.statusDot} title={status}>
      <span className={`${styles.dot} ${tone}`} />
      {isLive ? <span className={styles.pulse} /> : null}
    </span>
  );
}
