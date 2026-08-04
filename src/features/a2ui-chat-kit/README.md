# A2UI Chat Kit

기존 React 챗봇에 A2UI 표시 방식 선택과 Surface Renderer를 이식하기 위한 복사 단위다. 이 폴더의 브라우저 코드는 프로젝트 alias, Admin, Observability, Next.js API에 의존하지 않는다.

## 1. 폴더 복사

대상 챗봇 프로젝트로 `a2ui-chat-kit` 폴더 전체를 복사한다.

```text
a2ui-chat-kit/
├─ contracts.ts                 # 브라우저에 필요한 최소 계약
├─ sse-client.ts                # LF/CRLF SSE 스트림 파서
├─ surface-envelope.ts          # Proxy 이벤트 정규화와 검증
├─ display-selection.tsx        # 최대 3개 표시 방식 선택 UI
├─ a2ui-surface-renderer.tsx    # 10개 A2UI viewType Renderer
├─ a2ui-chat-kit.module.css     # Kit 전용 스타일
├─ sample-surface.ts            # Agent 없이 Renderer를 확인하는 fixture
└─ index.ts                     # 공개 export
```

런타임 의존성은 React뿐이다. CSS Module을 지원하지 않는 빌드에서는 `a2ui-chat-kit.module.css`를 일반 CSS 또는 대상 디자인 시스템으로 변환한다.

## 2. Renderer만 먼저 확인

```tsx
import { A2UISurfaceRenderer, SAMPLE_A2UI_SURFACE } from "./a2ui-chat-kit";

export function RendererSmokeTest() {
  return (
    <A2UISurfaceRenderer
      data={SAMPLE_A2UI_SURFACE.data}
      profile={SAMPLE_A2UI_SURFACE.profile}
      renderPlan={SAMPLE_A2UI_SURFACE.renderPlan}
    />
  );
}
```

## 3. 기존 메시지 타입 확장

기존 메시지 입력, 대화 이력, 텍스트 출력은 유지하고 Assistant 메시지에 두 필드만 추가한다.

```ts
import type {
  A2UIChatSurface,
  A2UIDisplaySelectionState,
} from "./a2ui-chat-kit";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  displaySelection?: A2UIDisplaySelectionState;
  surface?: A2UIChatSurface;
};
```

## 4. 기존 SSE 처리에 A2UI 이벤트 추가

```ts
import {
  a2uiErrorMessage,
  consumeA2UISse,
  displaySelectionFromA2UIEvent,
  surfaceFromA2UIEnvelope,
} from "./a2ui-chat-kit";

await consumeA2UISse(response, ({ event, data }) => {
  if (event === "text" || event === "delta") {
    // 기존 챗봇 텍스트 처리
    return;
  }

  if (event === "display_options") {
    const displaySelection = displaySelectionFromA2UIEvent(data);
    if (displaySelection) updateAssistantMessage({ displaySelection });
    return;
  }

  if (event === "surface") {
    const surface = surfaceFromA2UIEnvelope(data);
    if (surface) updateAssistantMessage({ surface });
    return;
  }

  if (event === "error") showError(a2uiErrorMessage(data));
});
```

## 5. 메시지 하단에 선택 UI와 Renderer 추가

```tsx
import { A2UIDisplaySelection, A2UISurfaceRenderer } from "./a2ui-chat-kit";

{message.displaySelection ? (
  <A2UIDisplaySelection
    selection={message.displaySelection}
    busy={selectingMessageId === message.id}
    onSelect={(templateId) => selectDisplayTemplate(
      message.id,
      message.displaySelection!.selectionId,
      templateId,
    )}
  />
) : null}

{message.surface ? (
  <A2UISurfaceRenderer
    data={message.surface.data}
    profile={message.surface.profile}
    renderPlan={message.surface.renderPlan}
  />
) : null}
```

## 6. 표시 방식 선택 요청

```ts
const proxyAgentUrl =
  process.env.NEXT_PUBLIC_A2UI_PROXY_AGENT_URL ?? "http://localhost:8200";

const response = await fetch(`${proxyAgentUrl}/display-selection/stream`, {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ selectionId, templateId }),
});

await consumeA2UISse(response, ({ event, data }) => {
  if (event !== "surface") return;
  const surface = surfaceFromA2UIEnvelope(data);
  if (surface) updateAssistantMessage({ surface });
});
```

선택 요청 중에는 `displaySelection.status`를 `loading`, 완료 후에는 `completed`, 실패 시에는 `error`로 변경한다.

## 7. 브라우저에서 Proxy Agent 직접 호출

별도 BFF 없이 브라우저가 Proxy Agent의 두 SSE 엔드포인트를 직접 호출한다.

```text
Chatbot browser
  -> A2UI Proxy Agent POST /chat/stream
  -> A2UI Proxy Agent POST /display-selection/stream
  -> work-items JSON (mock mode)
     or Main Agent POST /chat/stream (remote mode)
```

최초 채팅 요청:

```ts
const response = await fetch(`${proxyAgentUrl}/chat/stream`, {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message, history, presentationMode }),
});
```

Next.js에서 `NEXT_PUBLIC_A2UI_PROXY_AGENT_URL`은 빌드 시 브라우저
번들에 포함된다. 운영 빌드 전에 실제 HTTPS Proxy 주소로 설정해야 한다.
Proxy Agent는 Chatbot origin을 CORS로 허용해야 한다.

## 8. Proxy SSE 계약

| 이벤트 | 처리 |
| --- | --- |
| `text`, `delta` | 기존 Assistant 텍스트 표시 |
| `display_options` | `A2UIDisplaySelection` 출력 |
| `surface` | `A2UISurfaceRenderer` 출력 |
| `state` | 운영 UI에서는 생략 가능 |
| `error` | 기존 오류 UI로 표시 |
| `done` | 로딩 상태 종료 |

최초 질문에서 원본 업무 데이터는 브라우저로 전달되지 않는다. Proxy Agent가 `selectionId`와 함께 데이터를 임시 보관하고, 사용자가 선택한 뒤 완성된 `surface`만 브라우저에 반환한다.

목 모드에서는 Proxy가 `intent`와 `shouldUseA2UI`를 결정한다. 현재 메시지의 명확한 데이터 요청이 이전 대화 기록보다 우선하며, 해당 요청에 포함된 최신 `presentationMode`로 A2UI 사용 여부를 정한다. 따라서 일반 대화나 텍스트 요약 뒤에 토글을 켜도 새 데이터 요청은 `display_options` 단계로 진행한다. 일반 대화는 A2UI 토글이 켜져 있어도 `text`와 `done`만 반환한다.

## 9. 이식 확인 순서

1. `SAMPLE_A2UI_SURFACE`로 Renderer 단독 출력 확인
2. 일반 텍스트 질문이 기존과 동일하게 표시되는지 확인
3. 데이터 질문에서 `display_options` 버튼이 표시되는지 확인
4. 추천/대체 템플릿 선택 시 `surface`가 표시되는지 확인
5. 선택 만료와 Proxy 오류가 기존 오류 UI에 표시되는지 확인
6. 브라우저 Network에서 `data_result`가 노출되지 않는지 확인

## 10. A2UI / 텍스트 응답 토글

Kit은 `A2UIPresentationMode` 타입을 제공한다. 채팅 요청에 `presentationMode: "a2ui" | "text"`를 포함한다.

```tsx
const [presentationMode, setPresentationMode] = useState<A2UIPresentationMode>("a2ui");

await fetch(`${proxyAgentUrl}/chat/stream`, {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message, history, presentationMode }),
});
```

`text` 모드는 프론트에서 Surface만 숨기는 기능이 아니다. Proxy가 해당 값을 받아 A2UI 템플릿 선택과 필드 매핑을 생략한다. 목 모드에서는 로컬 work-items JSON의 제한·마스킹된 미리보기를 Proxy LLM이 요약하고, 원격 모드에서는 Main Agent 응답을 사용한다. Proxy 서버 계약은 `../../../packages/a2ui-proxy-agent/README.md`를 참고한다.

현재 POC의 Proxy 직접 호출 예시는 `../a2ui-chat/chatbot-panel.tsx`를 참고한다.
