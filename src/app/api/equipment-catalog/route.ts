import { equipmentCatalogItems, paginate } from "@/features/a2ui-template-poc/mock-api-fixtures";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "44");
  return Response.json(paginate(equipmentCatalogItems, page, pageSize));
}
