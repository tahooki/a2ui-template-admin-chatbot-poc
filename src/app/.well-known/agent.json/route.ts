import { a2aHeaders } from "@/server/a2a/a2a-types";
import { buildA2UIAgentCard } from "@/server/a2a/a2ui-agent-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(buildA2UIAgentCard(origin), {
    headers: a2aHeaders(),
  });
}
