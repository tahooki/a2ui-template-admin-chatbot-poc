import { forwardA2UISse } from "@/features/a2ui-chat-kit/server/sse-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisplaySelectionRequest = {
  selectionId?: string;
  templateId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DisplaySelectionRequest;
  const selectionId = body.selectionId?.trim();
  const templateId = body.templateId?.trim();
  if (!selectionId || !templateId) {
    return Response.json({ error: "selectionId and templateId are required" }, { status: 400 });
  }

  const proxyAgentUrl = (process.env.A2UI_PROXY_AGENT_URL ?? "http://localhost:8200").replace(/\/$/, "");
  const configuredTimeoutMs = Number(process.env.A2UI_PROXY_CONNECT_TIMEOUT_MS ?? "2500");
  const timeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 2500;
  return forwardA2UISse({
    url: `${proxyAgentUrl}/display-selection/stream`,
    body: { selectionId, templateId },
    timeoutMs,
    connectErrorMessage: "A2UI Proxy Agent에 연결할 수 없습니다.",
    upstreamErrorMessage: "선택한 A2UI 화면 응답을 받을 수 없습니다.",
  });
}
