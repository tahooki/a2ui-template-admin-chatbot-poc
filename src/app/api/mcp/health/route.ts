import { readTemplateCatalog } from "@/server/a2ui-admin/catalog-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await readTemplateCatalog();
  return Response.json({
    ok: true,
    name: "a2ui-template-admin-mcp",
    catalogVersion: catalog.version,
    templateCount: catalog.templates.length,
    updatedAt: catalog.updatedAt,
  });
}
