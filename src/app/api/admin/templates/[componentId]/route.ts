import { deleteTemplate, getTemplate, saveTemplate } from "@/server/a2ui-admin/catalog-store";
import { templateFromRequestBody, validateTemplateRegistration } from "@/server/a2ui-admin/template-validation";
import type { A2UITemplateRegistration } from "@/features/a2ui-template-poc/template-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{
    componentId: string;
  }>;
};

async function componentIdFromContext(context: RouteParams) {
  const params = await context.params;
  return decodeURIComponent(params.componentId);
}

export async function GET(_request: Request, context: RouteParams) {
  const componentId = await componentIdFromContext(context);
  const template = await getTemplate(componentId);
  if (!template) return Response.json({ error: "Template not found" }, { status: 404 });
  return Response.json(template);
}

export async function PUT(request: Request, context: RouteParams) {
  const componentId = await componentIdFromContext(context);
  const template = templateFromRequestBody(await request.json().catch(() => null));
  const error = validateTemplateRegistration(template ? { ...template, componentId } : null);
  if (error) return Response.json({ error }, { status: 400 });
  if (!template) return Response.json({ error: "Template body is required." }, { status: 400 });

  const nextTemplate = template as A2UITemplateRegistration;
  const catalog = await saveTemplate({
    ...nextTemplate,
    componentId,
    status: nextTemplate.status ?? "registered",
  });
  return Response.json(catalog);
}

export async function DELETE(_request: Request, context: RouteParams) {
  const componentId = await componentIdFromContext(context);
  return Response.json(await deleteTemplate(componentId));
}
