import type { A2UITemplateRegistration } from "./template-types";

export const IMAGE_CARD_REGISTRATION_PRESET: A2UITemplateRegistration = {
  componentId: "equipment.imageCardList",
  title: "장비 이미지 카드",
  description: "이미지, 이름, 설명이 있는 장비 목록을 카드 그리드로 보여준다.",
  selectionGuide:
    "사용자가 장비 목록, 이미지 목록, 설비 카탈로그를 보고 싶다고 말하고 데이터에 imageUrl/name/description 필드가 있을 때 사용한다.",
  schemaSpec: {
    dataShape: "array<object>",
    listPath: "items",
    requiredRoles: ["title", "content", "image"],
    fieldHints: {
      title: ["name", "title"],
      content: ["description", "content", "summary"],
      image: ["imageUrl", "thumbnailUrl", "photoUrl"],
    },
    intentKeywords: ["이미지", "사진", "장비 리스트", "카탈로그", "설비"],
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
        slot: "cards[].imageUrl",
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
      queryKeywords: ["이미지", "사진", "장비 리스트", "카탈로그", "설비"],
      bestFor: ["equipment catalog image card grid"],
      priority: 3,
    },
  },
  surfaceConfig: {
    viewType: "imageCardList",
    titleBinding: "items[].name",
    contentBinding: "items[].description",
    imageBinding: "items[].imageUrl",
    maxItems: 6,
  },
  status: "registered",
  updatedAt: new Date().toISOString(),
};
