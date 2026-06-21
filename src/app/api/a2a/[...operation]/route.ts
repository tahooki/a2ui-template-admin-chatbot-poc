import { type A2ASendMessageRequest, A2A_JSON, A2A_VERSION, a2aHeaders } from "@/server/a2a/a2a-types";
import { buildA2AStreamEvents, handleA2AMessageSend } from "@/server/a2a/a2ui-message-handler";
import { getTask } from "@/server/a2a/a2ui-task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type A2ARouteContext = {
  params: Promise<{ operation?: string[] }>;
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: a2aHeaders(init?.headers),
  });
}

function problem(status: number, message: string, details?: unknown) {
  return json({ error: { message, details } }, { status });
}

function authProblem(request: Request) {
  const token = process.env.A2UI_A2A_TOKEN;
  if (!token) return null;
  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${token}`) return null;
  return problem(401, "Unauthorized A2A request");
}

function versionProblem(request: Request) {
  const version = request.headers.get("a2a-version");
  if (!version || version === A2A_VERSION) return null;
  return problem(400, `Unsupported A2A version: ${version}`, { supported: A2A_VERSION });
}

async function operation(ctx: A2ARouteContext) {
  const { operation: segments = [] } = await ctx.params;
  return segments;
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function stream(events: Iterable<unknown> | AsyncIterable<unknown>) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for await (const event of events) {
          controller.enqueue(encoder.encode(sse(event)));
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

function taskIdFromSubscribeOperation(segments: string[]) {
  if (segments[0] !== "tasks") return undefined;
  const id = segments[1];
  if (!id) return undefined;
  if (id.endsWith(":subscribe")) return id.replace(/:subscribe$/, "");
  if (segments[2] === ":subscribe") return id;
  return undefined;
}

export async function GET(_request: Request, ctx: A2ARouteContext) {
  const auth = authProblem(_request);
  if (auth) return auth;
  const version = versionProblem(_request);
  if (version) return version;

  const segments = await operation(ctx);
  if (segments[0] === "tasks" && segments[1] && segments.length === 2) {
    const task = getTask(segments[1]);
    if (!task) return problem(404, `Task not found: ${segments[1]}`);
    return json({ task });
  }

  return problem(404, `Unsupported A2A GET operation: ${segments.join("/") || "(empty)"}`);
}

export async function POST(request: Request, ctx: A2ARouteContext) {
  const auth = authProblem(request);
  if (auth) return auth;
  const version = versionProblem(request);
  if (version) return version;

  const segments = await operation(ctx);
  const op = segments.join("/");

  const subscribeTaskId = taskIdFromSubscribeOperation(segments);
  if (subscribeTaskId) {
    const task = getTask(subscribeTaskId);
    if (!task) return problem(404, `Task not found: ${subscribeTaskId}`);
    return stream([{ task }, { statusUpdate: { taskId: subscribeTaskId, status: task.status } }]);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return problem(400, "Invalid A2A JSON body");
  }

  if (op === "message:send") {
    return json(await handleA2AMessageSend(body as A2ASendMessageRequest));
  }

  if (op === "message:stream") {
    return stream(buildA2AStreamEvents(body as A2ASendMessageRequest));
  }

  return problem(404, `Unsupported A2A POST operation: ${op || "(empty)"}`, {
    contentType: A2A_JSON,
  });
}
