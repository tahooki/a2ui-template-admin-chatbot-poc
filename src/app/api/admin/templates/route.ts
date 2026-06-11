import { readTemplateCatalog, saveTemplate } from "@/server/a2ui-admin/catalog-store";
import { templateFromRequestBody, validateTemplateRegistration } from "@/server/a2ui-admin/template-validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readTemplateCatalog());
}

export async function POST(request: Request) {
  const template = templateFromRequestBody(await request.json().catch(() => null));
  const error = validateTemplateRegistration(template);
  if (error) return Response.json({ error }, { status: 400 });
  if (!template) return Response.json({ error: "Template body is required." }, { status: 400 });

  const catalog = await saveTemplate({
    ...template,
    status: template.status ?? "registered",
  });
  return Response.json(catalog);
}
