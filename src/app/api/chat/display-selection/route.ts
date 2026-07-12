export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisplaySelectionRequest = {
  selectionId?: string;
  templateId?: string;
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DisplaySelectionRequest;
  const selectionId = body.selectionId?.trim();
  const templateId = body.templateId?.trim();
  if (!selectionId || !templateId) {
    return Response.json({ error: "selectionId and templateId are required" }, { status: 400 });
  }

  const proxyAgentUrl = (process.env.A2UI_PROXY_AGENT_URL ?? "http://localhost:8200").replace(/\/$/, "");
  const controller = new AbortController();
  const configuredTimeoutMs = Number(process.env.A2UI_PROXY_CONNECT_TIMEOUT_MS ?? "2500");
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 2500;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${proxyAgentUrl}/display-selection/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectionId, templateId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      return errorStream("선택한 A2UI 화면 응답을 받을 수 없습니다.", details || `HTTP ${response.status}`);
    }
    return streamResponse(response.body);
  } catch (error) {
    clearTimeout(timeout);
    const details = error instanceof Error ? error.message : String(error);
    return errorStream("A2UI Proxy Agent에 연결할 수 없습니다.", details);
  }
}
