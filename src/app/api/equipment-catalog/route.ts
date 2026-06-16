import { proxyEquipmentData } from "@/server/equipment/equipment-data";

export async function GET(request: Request) {
  return proxyEquipmentData("catalog", request);
}
