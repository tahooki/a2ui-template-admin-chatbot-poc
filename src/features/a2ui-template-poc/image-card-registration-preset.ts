import type { A2UITemplateRegistration } from "@/features/a2ui-core/template-types";

export const IMAGE_CARD_REGISTRATION_PRESET: A2UITemplateRegistration = {
  componentId: "collection.cardGrid.custom",
  title: "커스텀 카드 그리드",
  description: "이미지, 제목, 설명이 있는 반복 데이터를 카드 그리드로 보여준다.",
  selectionGuide:
    "사용자가 이미지 목록, 카탈로그, 카드형 결과를 보고 싶다고 말하고 데이터에 image/title/description 필드가 있을 때 사용한다.",
  schemaSpec: {
    dataShape: "array<object>",
    listPath: "items",
    requiredRoles: ["title", "content", "image"],
    fieldHints: {
      title: ["name", "title"],
      content: ["description", "content", "summary"],
      image: ["imageUrl", "thumbnailUrl", "photoUrl"],
    },
    intentKeywords: ["이미지", "사진", "카탈로그", "카드", "그리드"],
  },
  inputSchema: {
    schemaVersion: "2026-06-11",
    accepts: {
      shape: ["array<object>"],
      minRows: 1,
      capabilities: {
        hasImages: true,
      },
    },
    requiredSlots: [
      {
        slot: "cards[].title",
        acceptsTypes: ["string"],
        acceptsRoles: ["title", "label"],
        required: true,
      },
      {
        slot: "cards[].image",
        acceptsTypes: ["string"],
        acceptsRoles: ["image", "uri"],
        acceptsFormats: ["image-url", "uri"],
        required: true,
      },
    ],
    optionalSlots: [
      {
        slot: "cards[].description",
        acceptsTypes: ["string"],
        acceptsRoles: ["content", "description"],
        required: false,
      },
    ],
    selectionHints: {
      queryKeywords: ["이미지", "사진", "카탈로그", "카드", "그리드"],
      bestFor: ["generic image card grid"],
      priority: 3,
    },
  },
  surfaceConfig: {
    viewType: "collection.cardGrid",
    titleBinding: "items[].title",
    contentBinding: "items[].description",
    imageBinding: "items[].image",
    maxItems: 6,
  },
  status: "registered",
  updatedAt: new Date().toISOString(),
};
