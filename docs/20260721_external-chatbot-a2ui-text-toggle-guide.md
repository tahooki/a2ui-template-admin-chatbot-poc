# 외부 챗봇 A2UI / 텍스트 응답 토글 적용 가이드

## 1. 목적

이 문서는 외부 React 챗봇에 다음 사용자 선택 기능을 추가하는 방법을 설명한다.

- `A2UI ON`: 데이터 질문을 A2UI 표시 방식 선택과 Surface로 제공
- `A2UI OFF`: 같은 데이터 질문을 일반 텍스트 답변으로 제공

토글은 화면을 숨기는 기능이 아니다. 요청을 처리하는 서버가 A2UI Agent 호출 여부까지 결정하는 프레젠테이션 모드다.

## 2. 공통 요청 계약

채팅 요청 body에 `presentationMode`를 추가한다.

```ts
export type A2UIPresentationMode = "a2ui" | "text";
```

```json
{
  "message": "장비 상태를 알려줘",
  "history": [],
  "presentationMode": "a2ui"
}
```

| 값 | 서버 동작 | 브라우저에 올 수 있는 주요 이벤트 |
| --- | --- | --- |
| `a2ui` | Main Agent의 조회 결과를 Proxy가 A2UI Agent에 전달 | `text`, `display_options`, `surface`, `done` |
| `text` | Main Agent가 조회 결과를 텍스트로 요약하고 A2UI Agent는 호출하지 않음 | `text`, `done` |

기존 클라이언트와의 호환성을 위해 값이 없으면 `a2ui`로 처리한다. 허용되지 않은 값은 BFF 또는 API 경계에서 `400 Bad Request`로 거절한다.

## 3. 전체 처리 흐름

### A2UI ON

```text
React Chatbot
  -> BFF POST /api/chat { presentationMode: "a2ui" }
  -> Proxy Agent
  -> Main Agent 데이터 조회
  -> Proxy Agent가 data_result를 브라우저에 숨김
  -> A2UI Agent 추천
  -> display_options
  -> 사용자 템플릿 선택
  -> surface
```

### A2UI OFF

```text
React Chatbot
  -> BFF POST /api/chat { presentationMode: "text" }
  -> Proxy Agent
  -> Main Agent 데이터 조회 및 텍스트 요약
  -> text
  -> done

  A2UI Agent 호출 없음
  display_options 없음
  surface 없음
```

## 4. 외부 챗봇에서 필요한 작업 범위

외부 챗봇이 이 저장소의 최신 Proxy/Main Agent를 공용으로 사용한다면 다음 세 가지만 적용한다.

1. React 챗봇에 토글 상태 추가
2. `/api/chat` 요청에 `presentationMode` 추가
3. BFF가 값을 검증하고 Proxy Agent에 그대로 전달

외부 시스템이 Proxy Agent와 Main Agent도 별도로 운영한다면 이 문서의 7절까지 모두 적용해야 한다.

## 5. React 챗봇 토글 구현

### 상태 추가

```tsx
import { useState } from "react";
import type { A2UIPresentationMode } from "./a2ui-chat-kit";

const [presentationMode, setPresentationMode] =
  useState<A2UIPresentationMode>("a2ui");
```

### 접근 가능한 토글 예시

```tsx
<label className="a2ui-mode-control">
  <span>A2UI 응답</span>
  <input
    type="checkbox"
    checked={presentationMode === "a2ui"}
    disabled={isRunning}
    onChange={(event) =>
      setPresentationMode(event.target.checked ? "a2ui" : "text")
    }
  />
  <span>{presentationMode === "a2ui" ? "ON" : "OFF"}</span>
</label>
```

요청 중에는 토글을 비활성화한다. 한 요청이 시작된 뒤 모드가 바뀌면 화면과 서버가 서로 다른 모드를 인식할 수 있기 때문이다.

### 채팅 요청에 모드 추가

```ts
async function sendMessage(message: string) {
  const requestPresentationMode = presentationMode;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history,
      presentationMode: requestPresentationMode,
    }),
  });

  await consumeA2UISse(response, ({ event, data }) => {
    if (event === "text" || event === "delta") {
      appendAssistantText(data);
      return;
    }

    // 서버 계약 오류에 대한 브라우저 측 방어선이다.
    if (requestPresentationMode !== "a2ui") return;

    if (event === "display_options") {
      showDisplayOptions(data);
      return;
    }

    if (event === "surface") {
      showSurface(data);
    }
  });
}
```

요청 시작 시 `requestPresentationMode`로 값을 복사한다. 스트림 처리 중 React 상태가 바뀌더라도 해당 요청은 시작할 때의 모드를 유지한다.

### 기존 메시지 처리 정책

- 토글 변경은 다음 질문부터 적용한다.
- 이미 표시된 A2UI Surface는 제거하지 않는다.
- 이전 메시지에 남아 있는 표시 방식 선택도 해당 메시지가 생성된 모드를 따른다.
- 대화 초기화와 모드 초기화는 별개로 취급한다. 사용자가 고른 모드는 대화 초기화 후에도 유지하는 편이 자연스럽다.

## 6. BFF/API에서 모드 검증

브라우저가 Proxy Agent를 직접 호출하지 않도록 기존 챗봇 서버에서 요청을 중계한다.

Next.js Route Handler 예시:

```ts
type PresentationMode = "a2ui" | "text";

type ChatRequestBody = {
  message?: string;
  history?: Array<{ role: string; content: string }>;
  presentationMode?: PresentationMode;
};

export async function POST(request: Request) {
  const body = await request.json() as ChatRequestBody;
  const presentationMode = body.presentationMode ?? "a2ui";

  if (presentationMode !== "a2ui" && presentationMode !== "text") {
    return Response.json(
      { error: "presentationMode must be a2ui or text" },
      { status: 400 },
    );
  }

  return forwardA2UISse({
    url: `${process.env.A2UI_PROXY_AGENT_URL}/chat/stream`,
    body: { ...body, presentationMode },
    connectErrorMessage: "A2UI Proxy Agent에 연결할 수 없습니다.",
    upstreamErrorMessage: "A2UI Proxy Agent 응답을 받을 수 없습니다.",
  });
}
```

Java, Python 또는 다른 Node 서버를 사용해도 JSON 필드와 SSE 스트림을 보존하면 된다. 서버가 SSE 응답을 버퍼링하지 않도록 설정한다.

## 7. Proxy Agent와 Main Agent를 별도 운영하는 경우

### Proxy Agent 책임

Proxy Agent는 다음을 보장해야 한다.

- `presentationMode`를 Main Agent에 전달
- `text` 모드에서 `data_result`가 들어와도 브라우저로 전달하지 않음
- `text` 모드에서 A2UI Agent를 호출하지 않음
- `text` 모드의 마지막 이벤트를 `done: { mode: "text" }`로 종료
- `a2ui` 모드에서는 기존 추천, 선택, Surface 흐름 유지

Python/Pydantic 계약 예시:

```py
from typing import Literal
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)
    presentationMode: Literal["a2ui", "text"] = "a2ui"
```

### Main Agent 책임

Main Agent는 텍스트 모드에서 조회 자체를 생략하면 안 된다. 업무 도구로 데이터를 조회한 뒤 실제 결과를 텍스트로 요약해야 한다.

```text
presentationMode = text
  -> 의도 판단
  -> 업무 도구 호출
  -> 제한된 샘플 생성
  -> 민감 필드 마스킹
  -> 텍스트 요약
  -> text + done
```

원본 전체 데이터나 인증 값이 LLM 프롬프트 또는 브라우저로 전달되지 않도록 다음 제한을 적용한다.

- 행 샘플 개수 제한
- 프롬프트 바이트 제한
- `secret`, `token`, `password`, `authorization`, `cookie`, `phone`, `email` 계열 필드 마스킹
- 총 건수와 샘플 건수를 구분
- LLM 실패 시 안전한 건수 기반 요약 제공

## 8. 운영용 전역 플래그와 사용자 토글 구분

사용자 토글과 운영 기능 플래그는 목적이 다르다.

| 설정 | 범위 | 용도 |
| --- | --- | --- |
| `presentationMode` | 요청 또는 대화 | 사용자가 A2UI/텍스트 응답 선택 |
| `A2UI_PROXY_ENABLED` 같은 환경 변수 | 서비스 전체 | 장애 대응, 점진 배포, 전체 롤백 |

사용자 토글을 환경 변수로 구현하면 사용자마다 다른 모드를 선택할 수 없다. 반대로 운영 장애 시에는 서버 전역 플래그로 모든 요청을 텍스트 경로로 강제할 수 있다.

## 9. 필수 테스트

| 시나리오 | 기대 결과 |
| --- | --- |
| 모드 생략 | 기존과 같이 A2UI 흐름 사용 |
| `a2ui` + 데이터 질문 | `display_options` 발생, 선택 후 `surface` 발생 |
| `text` + 데이터 질문 | `text`, `done`만 발생 |
| `text` + 데이터 질문 | A2UI Agent 호출 횟수 0 |
| `text` + 일반 질문 | 일반 텍스트 답변 |
| 잘못된 모드 | BFF 또는 API에서 400 |
| 민감 필드 포함 데이터 | 요약 입력에 원본 값이 없고 `[masked]`만 존재 |
| 요청 중 토글 클릭 | 토글 비활성화로 변경되지 않음 |
| 과거 Surface가 있는 상태에서 OFF | 과거 Surface 유지, 새 요청만 텍스트 |

브라우저 Network에서 `text` 모드 응답에 `data_result`, `display_options`, `surface`가 없는지 직접 확인한다.

## 10. 배포 순서

1. Main Agent에 `presentationMode`와 텍스트 데이터 요약 지원 배포
2. Proxy Agent에 모드 전달 및 A2UI 호출 차단 배포
3. BFF에 모드 검증과 전달 배포
4. 외부 React 챗봇에 토글 UI 배포
5. 기본값 `a2ui` 상태로 회귀 테스트
6. 일부 사용자에게 OFF 모드 테스트 후 전체 공개

서버보다 프론트를 먼저 배포하면 토글 값이 무시될 수 있다. 서버부터 배포하면 기존 클라이언트는 기본값 `a2ui`를 사용하므로 기존 동작을 유지한다.

## 11. 현재 프로젝트 참고 파일

- 프론트 토글과 요청: `src/features/a2ui-chat/chatbot-panel.tsx`
- 공용 프론트 타입: `src/features/a2ui-chat-kit/contracts.ts`
- Next.js BFF 검증: `src/app/api/chat/route.ts`
- Proxy 요청 계약: `packages/a2ui-proxy-agent/app/contracts.py`
- Proxy 분기: `packages/a2ui-proxy-agent/app/orchestrate.py`
- Main Agent 분기: `packages/a2ui-python-agent/app/orchestrate.py`
- 마스킹된 텍스트 요약: `packages/a2ui-python-agent/app/ai/llm_client.py`
- Proxy 테스트: `packages/a2ui-proxy-agent/tests/test_proxy_orchestrate.py`
- Main Agent 테스트: `packages/a2ui-python-agent/tests/test_orchestrate_data_result.py`
- 실제 서비스 E2E: `scripts/e2e-proxy-flow.mjs`
