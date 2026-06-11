import { resetTemplateCatalog } from "@/server/a2ui-admin/catalog-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(await resetTemplateCatalog());
}
