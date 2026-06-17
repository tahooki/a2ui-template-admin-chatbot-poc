import { toolResult } from "@/server/a2ui-admin/a2ui-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const toolDefinitions = [
  {
    name: "a2ui.listTemplates",
    description: "등록된 A2UI 템플릿 catalog를 반환합니다.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "a2ui.recommendTemplate",
    description: "사용자 요청과 bounded sampleDataPreview/derivedSchema를 기준으로 A2UI 템플릿 또는 text fallback을 추천합니다.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        query: { type: "string" },
        apiId: { type: "string", enum: ["equipment-catalog", "equipment-status"] },
        facts: { type: "object", additionalProperties: true },
        derivedSchema: { type: "object", additionalProperties: true },
        sampleDataPreview: { type: "object", additionalProperties: true },
        options: {
          type: "object",
          additionalProperties: false,
          properties: {
            includeTrace: { type: "boolean" },
            allowIntentFallback: { type: "boolean" },
          },
        },
      },
    },
  },
  {
    name: "a2ui.resolveTemplateData",
    description: "선택된 템플릿으로 renderer가 사용할 SurfaceEnvelope을 생성합니다.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        templateId: { type: "string" },
        query: { type: "string" },
        apiId: { type: "string", enum: ["equipment-catalog", "equipment-status"] },
        context: { type: "object", additionalProperties: true },
        mapping: { type: "object", additionalProperties: true },
      },
      required: ["templateId"],
    },
  },
  {
    name: "a2ui.getTemplateContract",
    description: "특정 템플릿의 schemaSpec과 surfaceConfig를 반환합니다.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        templateId: { type: "string" },
      },
      required: ["templateId"],
    },
  },
];

function jsonRpc(id: JsonRpcRequest["id"], result: unknown, init?: ResponseInit) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, init);
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 400) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

export async function GET() {
  return Response.json({
    name: "a2ui-template-admin-mcp",
    transport: "json-rpc-over-http",
    tools: toolDefinitions,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body || typeof body !== "object") {
    return jsonRpcError(null, -32700, "Invalid JSON-RPC body");
  }

  if (body.method === "initialize") {
    return jsonRpc(
      body.id,
      {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: {
          name: "a2ui-template-admin-mcp",
          version: "0.1.0",
        },
      },
      { headers: { "mcp-session-id": "a2ui-template-admin-poc" } },
    );
  }

  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (body.method === "tools/list") {
    return jsonRpc(body.id, {
      tools: toolDefinitions,
    });
  }

  if (body.method !== "tools/call") {
    return jsonRpcError(body.id, -32601, `Unsupported method: ${body.method ?? "unknown"}`, 404);
  }

  const params = body.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const args =
    params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};

  if (!name) return jsonRpcError(body.id, -32602, "Tool name is required");

  const result = await toolResult(name, args);
  return jsonRpc(body.id, result, result.isError ? { status: 500 } : undefined);
}
