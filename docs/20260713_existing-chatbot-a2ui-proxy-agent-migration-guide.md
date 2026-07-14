# 기존 챗봇 A2UI Proxy Agent 마이그레이션 가이드

## 1. 문서 목적

현재 POC에서 검증한 A2UI Proxy Agent 흐름을 기존 챗봇에 적용하기 위한 작업 범위와 연동 계약을 정리한다.

기존 챗봇의 일반 대화 UI와 메시지 관리는 유지하고 다음 기능을 추가하는 것을 목표로 한다.

- 챗봇의 Agent 호출 대상을 Main Agent에서 Proxy Agent로 변경
- Main Agent가 조회한 업무 데이터를 Proxy Agent가 임시 보관
- A2UI Agent가 조회 데이터에 적합한 화면 템플릿 후보를 생성
- 사용자가 표시 방식을 선택할 수 있는 UI 추가
- 선택된 A2UI Surface를 기존 챗봇 메시지 영역에서 렌더링

템플릿 미리보기와 운영용 고급 관리 기능은 이번 POC 마이그레이션 범위에 포함하지 않는다.

## 2. 목표 구조

### 변경 전

```text
Chatbot
  -> Main Agent
  -> 텍스트 또는 기존 응답 표시
```

### 변경 후

```text
Chatbot Frontend
  -> Chatbot Backend/BFF
  -> A2UI Proxy Agent
       -> Main Agent
            -> 업무 데이터 조회
       -> A2UI Agent
            -> 템플릿 후보 추천
            -> 선택한 Surface 생성
  -> Chatbot Frontend Renderer
```

브라우저가 Proxy Agent를 직접 호출하지 않고 기존 챗봇 서버의 API를 경유하도록 구성한다. Proxy Agent 주소와 Agent 인증 정보가 브라우저에 노출되는 것을 방지하고, 기존 챗봇의 인증과 접근 제어를 그대로 활용하기 위함이다.

## 3. 핵심 데이터 흐름

### 3.1 최초 질문

1. 사용자가 기존 챗봇에 데이터 조회 요청을 입력한다.
2. 챗봇 서버가 요청을 Proxy Agent의 `/chat/stream`으로 전달한다.
3. Proxy Agent가 Main Agent의 `/chat/stream`을 호출한다.
4. Main Agent가 업무 API를 호출하고 `data_result` 이벤트로 원본 데이터와 메타데이터를 반환한다.
5. Proxy Agent가 원본 데이터를 서버 메모리에 임시 보관한다.
6. Proxy Agent가 같은 데이터를 A2UI Agent에 전달한다.
7. A2UI Agent가 추천 Surface와 호환 가능한 템플릿 후보를 생성한다.
8. Proxy Agent는 브라우저에 원본 데이터를 보내지 않고 `selectionId`와 최대 3개의 표시 방식만 전달한다.

### 3.2 사용자 선택

1. 사용자가 목록, 카드 그리드, 데이터 테이블 등의 표시 방식을 선택한다.
2. 챗봇 프론트가 `selectionId`와 `templateId`를 챗봇 서버로 전달한다.
3. 챗봇 서버가 Proxy Agent의 `/display-selection/stream`으로 요청을 전달한다.
4. Proxy Agent가 보관 중인 원본 데이터와 선택 가능한 템플릿을 검증한다.
5. 추천 템플릿을 선택한 경우 미리 준비된 Surface를 사용한다.
6. 다른 템플릿을 선택한 경우 보관 중인 동일한 데이터를 A2UI Agent에 다시 전달하여 선택한 Surface를 생성한다.
7. Proxy Agent가 완성된 `surface` 이벤트를 반환한다.
8. 챗봇 프론트가 Surface payload를 Renderer에 전달한다.
9. 선택 처리가 완료되면 Proxy Agent가 해당 선택 컨텍스트를 삭제한다.

선택 대기 데이터는 기본 300초 동안 유지한다. 시간이 만료되거나 Proxy Agent가 재시작되면 사용자가 데이터를 다시 조회해야 한다.

## 4. 서비스별 책임

| 구성 요소 | 책임 |
| --- | --- |
| Chatbot Frontend | 메시지 입력, 스트림 표시, 표시 방식 선택, A2UI Surface 렌더링 |
| Chatbot Backend/BFF | 인증 유지, Proxy Agent 요청 전달, SSE 스트림 중계 |
| Proxy Agent | Main Agent 중계, 데이터 임시 보관, 후보 제한, 선택 검증, 최종 Surface 반환 |
| Main Agent | 사용자 의도 처리, 업무 API 호출, 조회 데이터와 출처 메타데이터 반환 |
| A2UI Agent | 데이터와 템플릿 비교, 추천 후보 생성, 필드 매핑, Surface 생성 |
| A2UI Renderer | Surface의 데이터와 render plan을 실제 UI 컴포넌트로 출력 |
| Template Admin | A2UI 템플릿 등록과 수정, 카탈로그 버전 관리 |

## 5. 연동 API 계약

### 5.1 채팅 요청

기존 챗봇 서버에 A2UI 채팅 중계 API를 추가하거나 기존 채팅 API의 호출 대상만 Proxy Agent로 변경한다.

```http
POST /chat/stream
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "message": "work-items 데이터를 보여줘",
  "history": [
    {
      "role": "user",
      "content": "이전 질문"
    },
    {
      "role": "assistant",
      "content": "이전 답변"
    }
  ]
}
```

### 5.2 최초 응답 SSE 이벤트

| 이벤트 | 프론트 처리 |
| --- | --- |
| `text` | Assistant 메시지를 표시하거나 교체 |
| `delta` | 기존 Assistant 메시지에 텍스트 추가 |
| `display_options` | 표시 방식 선택 UI 생성 |
| `state` | POC 디버그 화면에서는 표시하고 실제 챗봇에서는 생략 가능 |
| `error` | 기존 챗봇 오류 메시지 정책으로 표시 |
| `done` | 질문 로딩 상태 종료 |

`display_options` 예시는 다음과 같다.

```json
{
  "selectionId": "selection-uuid",
  "message": "어떤 방식으로 보시겠습니까?",
  "options": [
    {
      "templateId": "collection.list",
      "label": "목록",
      "score": 0.95,
      "recommended": true
    },
    {
      "templateId": "collection.cardGrid",
      "label": "카드 그리드",
      "score": 0.87,
      "recommended": false
    },
    {
      "templateId": "matrix.table",
      "label": "데이터 테이블",
      "score": 0.82,
      "recommended": false
    }
  ]
}
```

프론트에는 선택 전 원본 업무 데이터를 전달하지 않는다. `selectionId`는 Proxy Agent가 보관 중인 데이터 컨텍스트를 식별하는 일회성 값이다.

### 5.3 표시 방식 선택 요청

```http
POST /display-selection/stream
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "selectionId": "selection-uuid",
  "templateId": "matrix.table"
}
```

### 5.4 선택 응답 SSE 이벤트

| 이벤트 | 프론트 처리 |
| --- | --- |
| `state` | 선택한 화면 생성 중 상태 처리 |
| `surface` | Surface payload를 Renderer에 전달 |
| `error` | 만료, 허용되지 않은 템플릿, 렌더 실패 표시 |
| `done` | 선택 로딩 상태 종료 |

`surface`의 핵심 구조는 다음과 같다.

```json
{
  "surface": {
    "templateId": "matrix.table",
    "payload": {
      "apiId": "work-items",
      "apiTitle": "Work Items",
      "data": {},
      "profile": {},
      "renderPlan": {}
    }
  }
}
```

Renderer는 `payload.data`, `payload.profile`, `payload.renderPlan`을 입력으로 사용한다.

## 6. 기존 챗봇 프론트 변경

### 6.1 채팅 전송 로직

- 기존 메시지 입력과 대화 이력 생성 로직은 유지한다.
- 기존 Main Agent URL 대신 챗봇 서버의 Proxy 중계 API를 호출한다.
- 일반 JSON 응답이 아니라 SSE 스트림을 읽도록 변경한다.
- 기존 텍스트 응답과 A2UI 응답이 같은 메시지 안에서 공존하도록 메시지 모델을 확장한다.

권장 메시지 상태 예시는 다음과 같다.

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  displaySelection?: {
    selectionId: string;
    message: string;
    options: Array<{
      templateId: string;
      label: string;
      recommended?: boolean;
    }>;
    status: "idle" | "loading" | "completed" | "error";
    selectedTemplateId?: string;
    error?: string;
  };
  surface?: {
    data: unknown;
    profile: unknown;
    renderPlan: unknown;
  };
};
```

### 6.2 선택 UI

- `display_options`를 받은 Assistant 메시지 하단에 선택 버튼을 표시한다.
- `recommended: true`인 항목에는 추천 표시를 추가한다.
- 선택 요청 중에는 중복 클릭을 막는다.
- Surface 수신이 완료되면 모든 선택 버튼을 비활성화한다.
- 선택이 만료된 경우 “데이터를 다시 조회해 주세요” 안내를 표시한다.

### 6.3 Renderer

POC에서 검증한 코드 중 이식에 필요한 부분은 `a2ui-chat-kit`으로 분리되어 있다. 대상 챗봇에는 이 폴더 전체를 먼저 복사한 뒤 기존 디자인 시스템에 맞춰 스타일을 조정한다.

이식 대상의 중심 파일은 다음과 같다.

- `src/features/a2ui-chat-kit/a2ui-surface-renderer.tsx`
- `src/features/a2ui-chat-kit/contracts.ts`
- `src/features/a2ui-chat-kit/a2ui-chat-kit.module.css`
- `src/features/a2ui-chat-kit/sse-client.ts`
- `src/features/a2ui-chat-kit/surface-envelope.ts`
- `src/features/a2ui-chat-kit/display-selection.tsx`
- `src/features/a2ui-chat-kit/server/sse-proxy.ts`

세부 복사·연결 절차와 최소 예제는 `src/features/a2ui-chat-kit/README.md`에 정리되어 있다. 현재 POC의 `src/features/a2ui-chat/chatbot-panel.tsx`도 동일한 Kit을 사용하므로 실제 동작 예제로 볼 수 있다.

기존 챗봇의 스타일과 충돌하지 않도록 Renderer 스타일은 별도 CSS Module 또는 기존 디자인 시스템 컴포넌트로 분리한다.

## 7. 기존 챗봇 서버 변경

기존 챗봇 서버는 Proxy Agent 앞의 BFF 역할을 담당한다.

### 필요한 엔드포인트

```text
POST /api/chat
  -> Proxy Agent POST /chat/stream

POST /api/chat/display-selection
  -> Proxy Agent POST /display-selection/stream
```

### 구현 시 주의사항

- SSE 응답을 버퍼링하지 않고 그대로 스트리밍한다.
- 응답 헤더에 `Content-Type: text/event-stream`과 `Cache-Control: no-store`를 지정한다.
- Nginx를 사용하는 경우 `X-Accel-Buffering: no` 또는 동일한 스트림 비활성화 설정을 적용한다.
- Proxy Agent 연결 주소와 인증 토큰은 서버 환경 변수로 관리한다.
- 챗봇 사용자 인증 정보가 필요한 경우 Proxy 요청 헤더에 서버에서 필요한 식별 정보를 추가한다.
- 브라우저에서 Proxy Agent 주소를 직접 사용하지 않는다.

현재 프로젝트에서는 다음 파일을 참고할 수 있다.

- `src/app/api/chat/route.ts`
- `src/app/api/chat/display-selection/route.ts`

## 8. Proxy Agent 배포 설정

Proxy Agent의 주요 환경 변수는 다음과 같다.

```env
MAIN_AGENT_URL=http://main-agent-host
A2UI_A2A_URL=http://a2ui-agent-host/api/a2a
A2UI_SELECTION_TTL_SECONDS=300
MAIN_AGENT_TIMEOUT_SECONDS=45
A2UI_A2A_TIMEOUT_SECONDS=45
```

챗봇 서버에는 Proxy Agent 주소를 설정한다.

```env
A2UI_PROXY_AGENT_URL=http://a2ui-proxy-agent-host
A2UI_PROXY_CONNECT_TIMEOUT_MS=2500
```

POC에서는 Proxy Agent의 프로세스 메모리에 선택 컨텍스트를 저장한다. 운영 단계에서 다음 요구가 생기면 Redis 등의 공유 저장소로 변경한다.

- Proxy Agent 다중 인스턴스 운영
- 배포나 재시작 중에도 선택 상태 유지
- 5분보다 긴 선택 유효 시간
- 선택 이력과 감사 로그 보관

## 9. 마이그레이션 작업 순서

### 1단계: 인터페이스 확인

- 기존 챗봇의 프론트 프레임워크와 메시지 상태 구조 확인
- 기존 챗봇 서버의 Agent 호출 위치 확인
- Main Agent의 `data_result` 계약 확인
- Proxy Agent와 A2UI Agent의 접근 URL 확인

### 2단계: 서버 호출 교체

- 기존 Main Agent 직접 호출을 Proxy Agent 호출로 변경
- `/api/chat` SSE 중계 적용
- `/api/chat/display-selection` 중계 API 추가
- 텍스트 질문과 일반 대화 회귀 테스트

### 3단계: 프론트 선택 흐름 추가

- SSE parser와 consumer 적용
- `display_options` 메시지 상태 추가
- 사용자 선택 버튼과 로딩/완료/오류 상태 구현
- 만료된 선택에 대한 재조회 안내 구현

### 4단계: A2UI Renderer 이식

- Renderer, 타입, 스타일 이식
- `surface` 이벤트 파싱 및 Renderer 연결
- 목록, 카드 그리드, 데이터 테이블 우선 검증
- 실제 챗봇 레이아웃의 너비와 스크롤 처리 조정

### 5단계: 통합 검증

- 추천 템플릿 선택
- 추천이 아닌 템플릿 선택
- 일반 텍스트 질문
- Main Agent 오류
- A2UI Agent 오류
- 선택 만료
- 연속 질문과 메시지 스크롤

## 10. 4주 POC 일정

| 기간 | 작업 |
| --- | --- |
| 1주차 | 기존 챗봇 구조 확인, 연동 계약 확정, Proxy Agent 배포 및 채팅 SSE 중계 적용 |
| 2주차 | `display_options` 선택 UI, 선택 API, 메시지 상태 처리 구현 |
| 3주차 | A2UI Renderer 이식, 기존 챗봇 스타일 조정, 주요 템플릿 3종 검증 |
| 4주차 | 통합 테스트, 오류/만료 처리, 수정 반영, 실행 및 전달 문서 정리 |

POC에서는 주요 템플릿 3종을 목록, 카드 그리드, 데이터 테이블로 잡고 우선 검증한다. 이후 템플릿은 같은 Surface 계약을 사용하므로 Renderer 지원 범위를 순차적으로 확대할 수 있다.

## 11. 필수 테스트 시나리오

### 정상 흐름

1. `work-items 데이터를 보여줘`를 입력한다.
2. Main Agent의 안내 텍스트가 표시되는지 확인한다.
3. 최대 3개의 표시 방식이 나타나는지 확인한다.
4. 추천된 목록을 선택하고 Surface가 렌더링되는지 확인한다.
5. 다시 조회한 뒤 데이터 테이블을 선택하고 같은 데이터가 다른 형식으로 표시되는지 확인한다.

### 일반 대화

1. 데이터 조회가 아닌 일반 질문을 입력한다.
2. 선택 버튼이나 A2UI Surface 없이 텍스트 답변만 표시되는지 확인한다.

### 오류와 만료

1. 선택지를 표시한 뒤 TTL이 지나도록 기다린다.
2. 선택 시 재조회 안내가 나타나는지 확인한다.
3. Main Agent 또는 A2UI Agent 연결 실패 시 기존 채팅 영역에 오류가 표시되는지 확인한다.
4. 허용되지 않은 `templateId`를 전달했을 때 Surface가 생성되지 않는지 확인한다.

### UI 회귀

- 선택 요청 중 버튼 중복 클릭 방지
- Surface 표시 후 채팅 입력 재활성화
- 긴 데이터의 챗봇 영역 스크롤
- 모바일 또는 좁은 화면의 Surface 가로 스크롤
- 새 질문 후 이전 Surface와 선택 결과 유지

## 12. 완료 기준

- 기존 챗봇이 Main Agent를 직접 호출하지 않고 Proxy Agent를 경유한다.
- 일반 텍스트 채팅 기능이 기존과 동일하게 동작한다.
- 데이터 요청 시 브라우저에 원본 데이터 대신 표시 방식 후보가 먼저 전달된다.
- 사용자가 최대 3개의 호환 가능한 템플릿 중 하나를 선택할 수 있다.
- 추천 템플릿과 다른 템플릿 모두 정상적으로 Surface를 생성한다.
- 선택된 Surface가 기존 챗봇 메시지 영역에서 렌더링된다.
- 선택 중복, 선택 만료, Agent 오류가 사용자에게 이해 가능한 상태로 표시된다.
- 브라우저 콘솔 오류 없이 대표 E2E 시나리오가 완료된다.

## 13. POC 이후 보완 항목

다음 항목은 실제 운영 전환 시 별도 범위로 검토한다.

- Proxy Agent 선택 저장소를 Redis로 변경
- Proxy Agent와 A2UI Agent 사이 인증 적용
- 사용자별 선택 컨텍스트 소유권 검증
- Surface payload 크기 제한과 대용량 데이터 페이징
- 요청 추적 ID와 서비스별 로그 연계
- 추천/선택/렌더 실패율 모니터링
- 템플릿 버전 호환성과 롤백 정책
- 접근성, 다국어, 모바일 화면 품질 검증

## 14. 롤백 방법

마이그레이션 중 문제가 발생하면 기존 챗봇 서버의 호출 대상을 Main Agent로 되돌리고, 프론트의 `display_options`와 `surface` 처리를 기능 플래그로 비활성화한다.

권장 기능 플래그 예시는 다음과 같다.

```env
A2UI_PROXY_ENABLED=true
```

기능 플래그가 꺼진 경우 기존 Main Agent 직접 호출 경로를 사용하도록 구성하면 POC 적용과 롤백을 짧은 시간 안에 수행할 수 있다.
