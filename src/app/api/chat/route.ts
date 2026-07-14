import { a2uiErrorStream, forwardA2UISse } from "@/features/a2ui-chat-kit/server/sse-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequestBody = {
  message?: string;
  input?: string;
  history?: Array<{ role: string; content: string }>;
};

function isDevelopmentErrorProbe(message: string) {
  return process.env.NODE_ENV !== "production" && ["오류 테스트", "/error", "__force_error__"].includes(message);
}

async function proxyA2UIAgent(body: ChatRequestBody) {
  const proxyAgentUrl = (process.env.A2UI_PROXY_AGENT_URL ?? "http://localhost:8200").replace(/\/$/, "");
  const configuredTimeoutMs = Number(process.env.A2UI_PROXY_CONNECT_TIMEOUT_MS ?? "2500");
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 2500;
  return forwardA2UISse({
    url: `${proxyAgentUrl}/chat/stream`,
    body,
    timeoutMs,
    connectErrorMessage: "A2UI Proxy Agent에 연결할 수 없습니다.",
    upstreamErrorMessage: "A2UI Proxy Agent 응답을 받을 수 없습니다.",
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
  const message = (body.message ?? body.input ?? "").trim();
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (isDevelopmentErrorProbe(message)) {
    return a2uiErrorStream("Agent 오류 시나리오를 재현했습니다.", "Development-only Flow Board error probe.");
  }

  return proxyA2UIAgent({ ...body, message });
}
