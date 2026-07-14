import type { A2UIChatSurface } from "./contracts";

/** Renderer 연결만 먼저 확인할 때 사용하는 네트워크 독립 fixture입니다. */
export const SAMPLE_A2UI_SURFACE: A2UIChatSurface = {
  apiTitle: "Sample Work Items",
  apiId: "sample-work-items",
  templateId: "collection.list",
  data: {
    items: [
      { id: "work-1", title: "업무 데이터 연결", description: "Main Agent 응답을 Proxy로 연결합니다." },
      { id: "work-2", title: "표시 방식 선택", description: "사용자가 원하는 A2UI Surface를 선택합니다." },
      { id: "work-3", title: "Renderer 출력", description: "선택한 Surface를 메시지 하단에 표시합니다." },
    ],
    total: 3,
    page: 1,
    pageSize: 3,
  },
  profile: { rowCount: 3 },
  renderPlan: {
    viewType: "collection.list",
    fieldMapping: {
      title: "items[].title",
      content: "items[].description",
    },
    maxItems: 8,
  },
};
