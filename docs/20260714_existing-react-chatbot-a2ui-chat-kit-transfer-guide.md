# 기존 React 챗봇 A2UI Chat Kit 이식 가이드

## 1. 문서 목적

이 문서는 현재 프로젝트에서 검증한 A2UI 화면 선택 UI와 Renderer를 다른 React 챗봇 코드에 옮기는 방법을 설명한다.

이번 이식에서는 다음 서비스는 현재 실행 환경의 것을 그대로 사용한다.

- Main Agent
- A2UI Proxy Agent
- A2UI Agent
- Template Admin
- 템플릿 저장소와 Agent 측 데이터 보관 기능

다른 React 챗봇에는 A2UI를 화면에 표시하는 프론트 코드만 복사한다. 기존 챗봇의 입력창, 메시지 목록, 사용자 인증, 일반 텍스트 스트리밍 기능은 유지한다.

## 2. 이식 후 구조

```text
[기존 실행 환경: 그대로 유지]

Template Admin ───────────────┐
                              v
Main Agent <─> A2UI Proxy Agent <─> A2UI Agent
                    ^
                    │ SSE
                    │
[보안 PC의 기존 React 챗봇]

Chatbot Backend/BFF
  ├─ POST /api/chat
  └─ POST /api/chat/display-selection
                    ^
                    │ SSE
                    v
React Chatbot
  ├─ 기존 텍스트 메시지 UI
  ├─ A2UI 표시 방식 선택 컴포넌트
  └─ A2UI Surface Renderer
```

핵심은 서버와 Admin 코드를 챗봇으로 복사하는 것이 아니다. React 챗봇에 `a2ui-chat-kit`을 복사하고, 기존 스트림 처리 코드가 Proxy Agent의 A2UI 이벤트도 처리하도록 연결하는 작업이다.

## 3. 유지하는 것과 옮기는 것

| 구분 | 처리 | 설명 |
| --- | --- | --- |
| 기존 챗봇 화면과 입력창 | 유지 | 현재 채팅 UX를 그대로 사용한다. |
| 기존 텍스트 스트림 처리 | 유지 후 확장 | `text`, `delta` 처리는 유지하고 A2UI 이벤트만 추가한다. |
| Main/Proxy/A2UI Agent | 이동하지 않음 | 현재 서버에서 계속 실행한다. |
| Template Admin | 이동하지 않음 | 기존 Admin에서 템플릿을 계속 관리한다. |
| A2UI Renderer | React 챗봇으로 복사 | 최종 Surface를 실제 컴포넌트로 출력한다. |
| 표시 방식 선택 컴포넌트 | React 챗봇으로 복사 | 목록, 카드, 테이블 등 최대 3개 후보를 표시한다. |
| A2UI 타입과 응답 변환 코드 | React 챗봇으로 복사 | Proxy 이벤트를 챗봇 메시지 상태로 변환한다. |
| SSE 파서 | React 챗봇으로 복사 | 기존 파서를 확장하기 어렵다면 Kit 파서를 사용한다. |
| BFF 스트림 중계 코드 | 필요할 때만 적용 | 챗봇 서버가 Proxy Agent를 이미 중계하면 새로 복사하지 않는다. |

## 4. 복사할 폴더

현재 프로젝트의 다음 폴더를 대상 React 챗봇의 `src` 아래로 전체 복사한다.

```text
src/features/a2ui-chat-kit/
├─ contracts.ts
├─ sse-client.ts
├─ surface-envelope.ts
├─ display-selection.tsx
├─ a2ui-surface-renderer.tsx
├─ a2ui-chat-kit.module.css
├─ sample-surface.ts
├─ index.ts
└─ server/
   └─ sse-proxy.ts
```

권장 대상 위치는 다음과 같다.

```text
기존-react-chatbot/
└─ src/
   └─ features/
      └─ a2ui-chat-kit/
```

### 파일별 역할

| 파일 | 필수 여부 | 역할 |
| --- | --- | --- |
| `contracts.ts` | 필수 | 챗봇에서 사용할 최소 A2UI 타입 |
| `sse-client.ts` | 필수 | LF/CRLF를 지원하는 SSE 스트림 파싱 |
| `surface-envelope.ts` | 필수 | 선택 후보, Surface, 오류 이벤트 변환 |
| `display-selection.tsx` | 필수 | 표시 방식 선택 버튼 UI |
| `a2ui-surface-renderer.tsx` | 필수 | A2UI Surface 렌더링 |
| `a2ui-chat-kit.module.css` | 필수 | 선택 UI와 Renderer 스타일 |
| `index.ts` | 필수 | 프론트 공개 모듈 export |
| `sample-surface.ts` | 권장 | Agent 연결 전 Renderer 단독 확인 |
| `server/sse-proxy.ts` | 선택 | TypeScript/Next.js BFF에서 SSE를 중계할 때만 사용 |

`server/sse-proxy.ts`는 브라우저 컴포넌트에서 import하지 않는다. 기존 챗봇 서버가 Java, Python 또는 별도 Node 서버라면 이 파일을 사용하지 않고 해당 서버의 기존 SSE 중계 방식을 유지한다.

## 5. 사전 확인

대상 챗봇에서 다음 항목을 확인한다.

- React와 TypeScript를 사용하고 있는가
- `.module.css` CSS Module을 지원하는가
- 브라우저 `fetch` 응답의 `ReadableStream`을 사용하고 있는가
- 기존 Assistant 메시지를 부분 업데이트할 수 있는가
- 채팅 요청 URL과 표시 방식 선택 요청 URL을 설정할 수 있는가
- 챗봇 서버가 SSE를 버퍼링하지 않고 전달하는가

Vite, Create React App, Next.js는 일반적으로 CSS Module을 지원한다. 지원하지 않는 빌드 환경에서는 `a2ui-chat-kit.module.css`를 일반 CSS 또는 기존 디자인 시스템 스타일로 변환해야 한다.

## 6. 1단계: Renderer만 먼저 확인

Agent 연결을 변경하기 전에 샘플 Surface를 렌더링한다. 이 화면이 보이면 컴포넌트와 CSS 복사는 성공한 것이다.

```tsx
import {
  A2UISurfaceRenderer,
  SAMPLE_A2UI_SURFACE,
} from "./features/a2ui-chat-kit";

export function A2UIRendererSmokeTest() {
  return (
    <A2UISurfaceRenderer
      data={SAMPLE_A2UI_SURFACE.data}
      profile={SAMPLE_A2UI_SURFACE.profile}
      renderPlan={SAMPLE_A2UI_SURFACE.renderPlan}
    />
  );
}
```

확인할 내용은 다음과 같다.

- 빌드 오류 없이 컴포넌트가 import되는가
- 샘플 목록이 표시되는가
- 챗봇 메시지 너비를 벗어나지 않는가
- 좁은 화면에서 테이블이 가로 스크롤되는가
- 기존 챗봇 CSS가 Renderer 내부 스타일을 덮어쓰지 않는가

## 7. 2단계: 기존 메시지 타입 확장

기존 메시지 타입을 교체하지 말고 Assistant 메시지에 A2UI 상태만 추가한다.

```ts
import type {
  A2UIChatSurface,
  A2UIDisplaySelectionState,
} from "./features/a2ui-chat-kit";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;

  // A2UI에서만 사용하는 선택 상태
  displaySelection?: A2UIDisplaySelectionState;

  // 사용자가 표시 방식을 선택한 뒤 전달되는 최종 화면
  surface?: A2UIChatSurface;
};
```

일반 대화에서는 두 필드가 없기 때문에 기존 텍스트 메시지만 표시된다.

권장 상태 변경 방식은 특정 Assistant 메시지 하나를 부분 업데이트하는 것이다.

```ts
function patchMessage(
  messageId: string,
  patch: Partial<ChatMessage>,
) {
  setMessages((current) =>
    current.map((message) =>
      message.id === messageId
        ? { ...message, ...patch }
        : message,
    ),
  );
}
```

## 8. 3단계: 챗봇 호출 대상을 Proxy Agent 흐름으로 연결

서버 프로세스와 Admin은 그대로 실행한다. 챗봇에서는 기존 Main Agent 직접 호출 대신 Proxy Agent를 경유하는 채팅 API를 사용한다.

권장 연결은 다음과 같다.

```text
React Chatbot
  -> 기존 챗봇 서버 POST /api/chat
  -> A2UI Proxy Agent POST /chat/stream
```

환경 설정 예시는 다음과 같다.

```env
# 챗봇 서버에서만 사용한다. 브라우저 환경 변수로 노출하지 않는다.
A2UI_PROXY_AGENT_URL=http://a2ui-proxy-agent-host:8200
```

### 기존 챗봇 서버가 이미 Proxy Agent를 중계하는 경우

`/api/chat`은 그대로 사용한다. 프론트의 SSE 이벤트 처리만 확장하면 된다.

### 기존 챗봇이 Main Agent를 직접 호출하는 경우

기존 Agent URL을 Proxy Agent의 `/chat/stream`으로 변경한다. 브라우저가 Agent를 직접 호출하고 있다면 POC에서는 사용할 수 있지만, 인증 정보와 Agent 주소 노출을 막기 위해 기존 챗봇 서버를 통한 중계를 권장한다.

### 선택 API는 별도로 필요

최초 질문과 표시 방식 선택은 서로 다른 요청이다. 기존 챗봇 서버에 다음 중계 경로가 없으면 하나 추가해야 한다.

```text
React Chatbot
  -> POST /api/chat/display-selection
  -> A2UI Proxy Agent POST /display-selection/stream
```

요청 body는 다음 두 값만 전달한다.

```json
{
  "selectionId": "selection-uuid",
  "templateId": "collection.list"
}
```

현재 프로젝트의 BFF 예시는 다음 파일을 참고한다.

- `src/app/api/chat/route.ts`
- `src/app/api/chat/display-selection/route.ts`

## 9. 4단계: 기존 SSE 처리 코드에 A2UI 이벤트 추가

기존의 `text`와 `delta` 처리는 유지한다. 여기에 `display_options`, `surface`, `error`, `done` 처리를 추가한다.

```ts
import {
  a2uiErrorMessage,
  consumeA2UISse,
  displaySelectionFromA2UIEvent,
  surfaceFromA2UIEnvelope,
} from "./features/a2ui-chat-kit";

async function consumeChatResponse(
  response: Response,
  assistantMessageId: string,
) {
  if (!response.ok) {
    throw new Error(`채팅 요청에 실패했습니다. (${response.status})`);
  }

  await consumeA2UISse(response, ({ event, data }) => {
    if (event === "text") {
      const content = typeof data.message === "string"
        ? data.message
        : typeof data.text === "string"
          ? data.text
          : "";
      if (content) patchMessage(assistantMessageId, { content });
      return;
    }

    if (event === "delta") {
      const delta = typeof data.delta === "string" ? data.delta : "";
      if (delta) {
        setMessages((current) => current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: message.content + delta }
            : message,
        ));
      }
      return;
    }

    if (event === "display_options") {
      const displaySelection = displaySelectionFromA2UIEvent(data);
      if (displaySelection) {
        patchMessage(assistantMessageId, { displaySelection });
      }
      return;
    }

    // Proxy 설정에 따라 최초 요청에서 바로 Surface가 올 수도 있다.
    if (event === "surface") {
      const surface = surfaceFromA2UIEnvelope(data);
      if (surface) patchMessage(assistantMessageId, { surface });
      return;
    }

    if (event === "error") {
      patchMessage(assistantMessageId, {
        content: a2uiErrorMessage(data),
      });
    }

    if (event === "done") {
      // 기존 챗봇의 질문 로딩 상태를 종료한다.
      setChatBusy(false);
    }
  });
}
```

기존 챗봇에 안정적으로 동작하는 SSE parser가 이미 있다면 `consumeA2UISse`를 반드시 사용할 필요는 없다. 기존 parser에서 같은 이벤트 이름과 JSON data만 전달해도 된다.

## 10. 5단계: 메시지 하단에 선택 UI와 Renderer 추가

기존 Assistant 말풍선의 텍스트 아래에 다음 두 영역을 추가한다.

```tsx
import {
  A2UIDisplaySelection,
  A2UISurfaceRenderer,
} from "./features/a2ui-chat-kit";

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <article className="assistant-message">
      <p>{message.content}</p>

      {message.displaySelection ? (
        <A2UIDisplaySelection
          selection={message.displaySelection}
          busy={message.displaySelection.status === "loading"}
          onSelect={(templateId) =>
            selectDisplayTemplate(
              message.id,
              message.displaySelection!.selectionId,
              templateId,
            )
          }
        />
      ) : null}

      {message.surface ? (
        <A2UISurfaceRenderer
          data={message.surface.data}
          profile={message.surface.profile}
          renderPlan={message.surface.renderPlan}
        />
      ) : null}
    </article>
  );
}
```

Renderer는 별도 페이지가 아니라 해당 질문에 대한 Assistant 메시지 내부에 표시하는 것을 권장한다. 이렇게 해야 이전 질문의 A2UI 화면도 대화 이력에 남는다.

## 11. 6단계: 표시 방식 선택 요청 구현

사용자가 선택 버튼을 누르면 `selectionId`와 `templateId`를 선택 API로 전달한다.

```ts
async function selectDisplayTemplate(
  messageId: string,
  selectionId: string,
  templateId: string,
) {
  patchMessage(messageId, {
    displaySelection: {
      ...findMessage(messageId).displaySelection!,
      status: "loading",
      selectedTemplateId: templateId,
      error: undefined,
    },
  });

  try {
    const response = await fetch("/api/chat/display-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectionId, templateId }),
    });

    if (!response.ok) {
      throw new Error(`화면 선택 요청에 실패했습니다. (${response.status})`);
    }

    await consumeA2UISse(response, ({ event, data }) => {
      if (event === "surface") {
        const surface = surfaceFromA2UIEnvelope(data);
        if (!surface) return;

        const currentSelection = findMessage(messageId).displaySelection!;
        patchMessage(messageId, {
          surface,
          displaySelection: {
            ...currentSelection,
            status: "completed",
            selectedTemplateId: templateId,
          },
        });
      }

      if (event === "error") {
        throw new Error(a2uiErrorMessage(data));
      }
    });
  } catch (error) {
    const currentSelection = findMessage(messageId).displaySelection!;
    patchMessage(messageId, {
      displaySelection: {
        ...currentSelection,
        status: "error",
        error: error instanceof Error
          ? error.message
          : "선택한 화면을 생성할 수 없습니다.",
      },
    });
  }
}
```

위 코드는 상태 변경 지점을 설명하기 위한 예시다. 실제 챗봇에서는 `findMessage` 대신 현재 프로젝트의 reducer, Zustand, Redux 또는 React state 갱신 방식을 사용한다.

선택 요청 중에는 중복 클릭을 막고, 완료 후에는 선택 버튼을 비활성화한다. `A2UIDisplaySelection`은 `loading`과 `completed` 상태일 때 버튼을 자동으로 비활성화한다.

## 12. 프론트에 보관되는 데이터

최초 질문이 끝났을 때 프론트는 원본 조회 데이터를 들고 있지 않는다. 다음 값만 메시지 상태에 저장한다.

```text
selectionId
표시 방식 후보 최대 3개
추천 여부
안내 텍스트
```

원본 데이터는 Proxy Agent가 `selectionId`에 연결해 잠시 보관한다. 사용자가 표시 방식을 선택하면 프론트는 `selectionId`와 `templateId`만 다시 전달한다.

그 뒤 Proxy Agent가 최종 `surface`를 반환한다. 이 시점에는 실제 화면을 그리는 데 필요한 데이터, 데이터 프로필, 렌더 계획이 프론트로 전달되고 해당 Assistant 메시지의 `surface` 상태에 저장된다.

```text
질문
  -> Proxy가 원본 데이터 보관
  -> 프론트는 selectionId와 후보만 보관
  -> 사용자가 표시 방식 선택
  -> Proxy가 최종 surface 생성
  -> 프론트 Renderer가 surface 출력
```

선택 유효 시간이 만료되거나 Proxy Agent가 재시작되면 기존 `selectionId`를 사용할 수 없다. 이 경우 “데이터를 다시 조회해 주세요”라는 오류를 표시한다.

## 13. Kit Renderer가 지원하는 화면

현재 복사되는 Renderer는 다음 `viewType`을 지원한다.

| 화면 | `viewType` |
| --- | --- |
| 목록 | `collection.list`, `simpleTextList` |
| 카드 그리드 | `collection.cardGrid`, `imageCardList` |
| 상세 | `record.detail` |
| 데이터 테이블 | `matrix.table`, `telemetryStatusTable` |
| 상태 매트릭스 | `matrix.statusMatrix`, `statusBooleanList` |
| 지표 카드 | `metric.statCards` |
| 진행률 목록 | `metric.progressList` |
| 타임라인 | `time.timeline` |
| 처리 대기열 | `process.queue` |
| 계층 트리 | `relation.tree` |

Admin에서 기존 템플릿의 데이터 매핑이나 문구를 수정하는 작업은 챗봇 재배포 없이 Agent 결과에 반영할 수 있다. 다만 Admin에 새로운 `viewType`을 추가하면 React 챗봇의 Renderer에도 해당 화면 컴포넌트를 추가해서 다시 배포해야 한다.

## 14. 스타일 적용 시 확인할 점

Kit CSS는 다른 프로젝트로 복사할 수 있도록 별도 CSS Module로 분리되어 있다. 대상 챗봇에서는 다음 부분을 확인한다.

- Assistant 말풍선에 `overflow: hidden`이 있어 Surface가 잘리지 않는가
- 메시지 최대 너비가 너무 작지 않은가
- 테이블 부모 영역에 가로 스크롤이 허용되는가
- 기존 전역 `button`, `table`, `img` 스타일이 Kit 스타일과 충돌하지 않는가
- 다크 모드가 있다면 배경색과 글자색을 추가 조정해야 하는가
- 모바일에서 카드 열 수와 간격이 적절한가

Renderer를 말풍선 안에 넣었을 때 너무 좁다면 A2UI 메시지만 말풍선 최대 너비를 넓히는 방식을 권장한다.

```css
.assistant-message:has([data-a2ui-surface]) {
  max-width: min(100%, 960px);
}
```

대상 브라우저가 `:has()`를 지원하지 않으면 메시지 데이터에 `surface`가 있을 때 별도 class를 부여한다.

## 15. 서버와 Admin에서 추가로 하지 않아도 되는 작업

다음 항목은 이번 React 챗봇 이식 범위에 포함하지 않는다.

- Admin 화면 코드 복사
- 템플릿 데이터베이스 복사
- Main Agent 코드 복사
- Proxy Agent 코드 복사
- A2UI Agent 코드 복사
- 원본 업무 API 호출 코드를 React 챗봇에 구현
- 선택 대기 데이터를 React 상태나 브라우저 저장소에 보관

서버 쪽에서는 현재 Proxy Agent와 Admin을 계속 실행하면 된다. 챗봇 서버의 기존 채팅 중계가 Proxy Agent를 바라보는지와 선택 중계 경로가 있는지만 확인한다.

## 16. 적용 확인 시나리오

### Renderer 단독 확인

1. `SAMPLE_A2UI_SURFACE`를 Renderer에 전달한다.
2. 목록 화면과 CSS가 정상 출력되는지 확인한다.
3. 브라우저 콘솔 오류가 없는지 확인한다.

### 일반 채팅 회귀 확인

1. 데이터 조회가 아닌 일반 질문을 입력한다.
2. 기존 텍스트가 스트림으로 표시되는지 확인한다.
3. 선택 UI나 Renderer가 잘못 나타나지 않는지 확인한다.

### A2UI 정상 흐름

1. `work-items API를 목록으로 보여줘`를 입력한다.
2. Assistant 안내 텍스트가 표시되는지 확인한다.
3. 최대 3개의 표시 방식 버튼이 나타나는지 확인한다.
4. 추천 버튼을 선택한다.
5. 선택 중 버튼이 비활성화되는지 확인한다.
6. `surface` 이벤트 수신 후 목록이 표시되는지 확인한다.
7. 다시 질문하고 데이터 테이블 등 다른 표시 방식도 확인한다.

### 오류 흐름

1. Proxy Agent를 사용할 수 없을 때 기존 오류 UI가 표시되는지 확인한다.
2. 선택 유효 시간이 지난 뒤 재조회 안내가 표시되는지 확인한다.
3. 선택 API가 4xx/5xx를 반환할 때 버튼이 영구 로딩 상태로 남지 않는지 확인한다.
4. 잘못된 Surface가 들어와도 전체 챗봇이 중단되지 않는지 확인한다.

### 보안 확인

1. 브라우저 환경 변수에 Proxy Agent 인증 토큰이 없는지 확인한다.
2. 최초 `display_options` 응답에 Main Agent의 원본 `data_result`가 포함되지 않는지 확인한다.
3. 다른 사용자의 `selectionId`를 재사용할 수 없는지 서버 정책을 확인한다.
4. Network 탭에서 Agent 내부 URL이 노출되지 않는지 확인한다.

## 17. 자주 발생하는 문제

### 텍스트만 나오고 선택 버튼이 보이지 않음

- 챗봇이 아직 Main Agent를 직접 호출하고 있는지 확인한다.
- SSE parser가 `event: display_options`를 버리고 있지 않은지 확인한다.
- `displaySelectionFromA2UIEvent` 결과가 메시지 상태에 저장되는지 확인한다.

### 선택 버튼을 누르면 404가 발생함

- 챗봇 서버에 `/api/chat/display-selection` 경로가 있는지 확인한다.
- 이 경로가 Proxy Agent의 `/display-selection/stream`으로 연결되는지 확인한다.

### 선택 직후 만료 오류가 발생함

- 최초 질문과 선택 요청이 같은 Proxy Agent 환경으로 전달되는지 확인한다.
- Proxy Agent가 질문과 선택 사이에 재시작되지 않았는지 확인한다.
- 여러 Proxy 인스턴스를 사용한다면 선택 저장소 공유 또는 sticky session이 필요한지 확인한다.

### Surface 이벤트는 오지만 화면이 비어 있음

- `surfaceFromA2UIEnvelope`가 `null`을 반환하는지 확인한다.
- payload에 `data`, `profile.rowCount`, `renderPlan.viewType`, `renderPlan.fieldMapping`이 있는지 확인한다.
- 반환된 `viewType`이 현재 Renderer 지원 목록에 포함되는지 확인한다.

### 화면이 챗봇 말풍선 밖으로 잘림

- 말풍선의 `overflow`, `max-width`, `min-width`를 확인한다.
- 테이블 화면에는 가로 스크롤 영역을 허용한다.
- A2UI Surface가 있는 메시지에 더 넓은 class를 적용한다.

## 18. 완료 기준

- 기존 일반 텍스트 채팅이 이전과 동일하게 동작한다.
- React 챗봇에 `a2ui-chat-kit`이 독립 폴더로 들어가 있다.
- 데이터 질문에서 표시 방식 후보가 나타난다.
- 사용자가 선택한 뒤 최종 Surface가 같은 Assistant 메시지에 표시된다.
- 추천 템플릿과 추천이 아닌 템플릿을 모두 선택할 수 있다.
- 선택 중 중복 요청이 발생하지 않는다.
- 만료와 Agent 오류가 사용자에게 표시된다.
- 브라우저에 Proxy Agent 인증 정보가 노출되지 않는다.
- 브라우저 콘솔 오류 없이 대표 시나리오가 완료된다.

## 19. 롤백 방법

A2UI 적용 중 문제가 생기면 다음 순서로 기존 챗봇 흐름으로 되돌린다.

1. 챗봇의 Agent 호출 대상을 기존 Main Agent URL로 되돌린다.
2. 메시지 화면의 `A2UIDisplaySelection`과 `A2UISurfaceRenderer` 렌더링을 기능 플래그로 끈다.
3. `display_options`와 `surface` 이벤트는 무시하고 기존 텍스트 이벤트만 처리한다.
4. `a2ui-chat-kit`은 코드에 남겨 두어도 기존 채팅에는 영향을 주지 않는다.

권장 기능 플래그 예시는 다음과 같다.

```env
VITE_A2UI_ENABLED=true
```

Next.js라면 프로젝트의 공개 환경 변수 규칙에 맞춰 이름을 변경한다. 기능 플래그에는 인증 정보나 Agent 내부 URL을 넣지 않는다.

## 20. 현재 프로젝트 참고 위치

| 참고 내용 | 파일 |
| --- | --- |
| 복사 단위와 최소 예제 | `src/features/a2ui-chat-kit/README.md` |
| Kit 전체 공개 export | `src/features/a2ui-chat-kit/index.ts` |
| 실제 React 챗봇 적용 예시 | `src/features/a2ui-chat/chatbot-panel.tsx` |
| 채팅 SSE 중계 예시 | `src/app/api/chat/route.ts` |
| 표시 방식 선택 중계 예시 | `src/app/api/chat/display-selection/route.ts` |
| 전체 Proxy Agent 마이그레이션 계약 | `docs/20260713_existing-chatbot-a2ui-proxy-agent-migration-guide.md` |

보안 PC로 전달할 때는 우선 `src/features/a2ui-chat-kit` 폴더와 이 문서를 함께 전달한다. 대상 챗봇의 실제 메시지 타입과 상태 관리 방식에 맞춰 7~11장의 연결 코드만 조정하면 된다.
