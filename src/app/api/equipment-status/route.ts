import { equipmentStatusItems, paginate } from "@/server/equipment/equipment-data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "44");
  return Response.json(paginate(equipmentStatusItems, page, pageSize));
}
