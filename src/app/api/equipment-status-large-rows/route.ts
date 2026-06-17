import { buildLargeRowsEquipmentStatus } from "@/server/equipment/equipment-test-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(buildLargeRowsEquipmentStatus());
}
