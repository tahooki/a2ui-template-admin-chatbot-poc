export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  message?: string;
  input?: string;
  history?: Array<{ role: string; content: string }>;
};

function sse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorStream(message: string, details?: string) {
  const encoder = new TextEncoder();
  return streamResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse("error", { message, details, branch: "error" })));
        controller.enqueue(encoder.encode(sse("done", { mode: "error", branch: "error" })));
        controller.close();
      },
    }),
  );
}

function isDevelopmentErrorProbe(message: string) {
  return process.env.NODE_ENV !== "production" && ["오류 테스트", "/error", "__force_error__"].includes(message);
}

async function proxyMainAgent(body: ChatRequestBody) {
  const mainAgentUrl = (process.env.MAIN_AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");

  const controller = new AbortController();
  const configuredTimeoutMs = Number(process.env.MAIN_AGENT_CONNECT_TIMEOUT_MS ?? "2500");
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 2500;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${mainAgentUrl}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      return errorStream("Main Agent 응답을 받을 수 없습니다.", details || `HTTP ${response.status}`);
    }
    return streamResponse(response.body);
  } catch (error) {
    clearTimeout(timeout);
    const details = error instanceof Error ? error.message : String(error);
    return errorStream("Main Agent에 연결할 수 없습니다.", details);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
  const message = (body.message ?? body.input ?? "").trim();
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (isDevelopmentErrorProbe(message)) {
    return errorStream("Agent 오류 시나리오를 재현했습니다.", "Development-only Flow Board error probe.");
  }

  return proxyMainAgent({ ...body, message });
}
