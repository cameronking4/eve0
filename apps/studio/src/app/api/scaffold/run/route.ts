import { runScaffoldPipeline } from "@forge/scaffolder";
import { NextResponse } from "next/server";
import {
  endRun,
  putScaffoldSession,
  resolveScaffoldSession,
  tryStartRun,
} from "@/lib/scaffold-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scaffolding (eve init + install + LLM) can take a while.
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    existing?: boolean;
    force?: boolean;
  };
  const id = body.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await resolveScaffoldSession(id);
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 });

  if (session.status === "complete") {
    return NextResponse.json({ error: "session already complete", status: session.status }, { status: 409 });
  }
  if (!tryStartRun(id)) {
    return NextResponse.json({ error: "scaffold already running", status: "running" }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // client disconnected
        }
      };
      try {
        await runScaffoldPipeline(
          session,
          (event) => {
            putScaffoldSession(session);
            send(event);
          },
          { existingProject: body.existing, force: body.force },
        );
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        putScaffoldSession(session);
        send({ type: "done", status: session.status });
        endRun(id);
        controller.close();
      }
    },
    cancel() {
      endRun(id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
