import type {
  EquipmentApiResponse,
  EquipmentCatalogItem,
  EquipmentStatusItem,
} from "./template-types";

export type DemoApiId = "equipment-catalog" | "equipment-status";

export type DemoApiResult =
  | {
      apiId: "equipment-catalog";
      title: string;
      data: EquipmentApiResponse<EquipmentCatalogItem>;
    }
  | {
      apiId: "equipment-status";
      title: string;
      data: EquipmentApiResponse<EquipmentStatusItem>;
    };

export function chooseApiForPrompt(prompt: string): DemoApiId {
  if (/장비\s*목록\s*보여줘/i.test(prompt)) return "equipment-catalog";
  if (/장비\s*보여줘/i.test(prompt)) return "equipment-catalog";
  if (/이미지|사진|카탈로그|설비|그림/i.test(prompt)) return "equipment-catalog";
  return "equipment-status";
}

export async function fetchDemoApi(apiId: DemoApiId): Promise<DemoApiResult> {
  const endpoint = apiId === "equipment-catalog" ? "/api/equipment-catalog" : "/api/equipment-status";
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}`);
  }
  const data = await response.json();
  if (apiId === "equipment-catalog") {
    return { apiId, title: "장비 카탈로그 API", data };
  }
  return { apiId, title: "장비 상태 API", data };
}
