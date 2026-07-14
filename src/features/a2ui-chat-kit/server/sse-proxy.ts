type ForwardA2UISseOptions = {
  url: string;
  body: unknown;
  timeoutMs?: number;
  connectErrorMessage: string;
  upstreamErrorMessage: string;
  headers?: HeadersInit;
};

function sse(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function a2uiStreamResponse(body: ReadableStream<Uint8Array>) {
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

export function a2uiErrorStream(message: string, details?: string) {
  const encoder = new TextEncoder();
  return a2uiStreamResponse(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse("error", { message, details, branch: "error" })));
      controller.enqueue(encoder.encode(sse("done", { mode: "error", branch: "error" })));
      controller.close();
    },
  }));
}

export async function forwardA2UISse({
  url,
  body,
  timeoutMs = 2500,
  connectErrorMessage,
  upstreamErrorMessage,
  headers,
}: ForwardA2UISseOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => "");
      return a2uiErrorStream(upstreamErrorMessage, details || `HTTP ${response.status}`);
    }
    return a2uiStreamResponse(response.body);
  } catch (error) {
    clearTimeout(timeout);
    return a2uiErrorStream(
      connectErrorMessage,
      error instanceof Error ? error.message : String(error),
    );
  }
}
