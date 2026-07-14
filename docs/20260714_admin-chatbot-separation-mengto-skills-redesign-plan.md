# Admin·Chatbot 분리 및 MengTo Skills 기반 Admin 재설계 계획

## 1. 목적

현재 하나의 화면에 결합된 Admin, Agent Flow Board, Chatbot을 각각 독립적으로 개발하고 실행할 수 있는 구조로 분리한다.

Admin은 A2UI Template Catalog를 관리하는 운영 도구로 다시 설계하고, Chatbot은 Proxy Agent를 통한 대화와 A2UI Surface 렌더링에만 집중한다. Agent Flow Board와 시스템 로그는 제품 화면에서 분리하여 개발·검증용 Lab으로 이동한다.

Admin 디자인은 [MengTo/Skills](https://github.com/MengTo/Skills) 저장소의 스킬을 참고하여 재구성한다. 저장소 전체를 적용하지 않고 Admin 작업에 필요한 디자인 절차와 레이아웃 스킬만 선택적으로 사용한다.

## 2. 현재 구조와 문제점

현재 루트 페이지는 `A2UITemplatePocPage` 하나에서 다음 기능을 모두 조립한다.

```text
A2UITemplatePocPage
  ├─ AdminPanel
  ├─ AgentTracePanel
  └─ ChatbotPanel
```

현재 구조의 주요 문제는 다음과 같다.

- Admin과 Chatbot이 같은 페이지 생명주기와 레이아웃에 묶여 있다.
- Chatbot 이벤트가 상위 페이지를 거쳐 Flow Board 상태를 직접 갱신한다.
- Admin, Chatbot, Flow Board가 하나의 `styles.module.css`를 공유한다.
- 실제 챗봇으로 Renderer와 선택 흐름을 옮길 때 Admin과 데모 코드가 함께 따라갈 가능성이 있다.
- Admin 자체의 정보 구조보다 전체 POC 흐름을 한 화면에 보여주는 데 초점이 맞춰져 있다.
- Template Catalog 관리와 Agent 실행 관측의 책임 경계가 명확하지 않다.

## 3. 목표 구조

### 3.1 화면 분리

```text
/admin
  └─ A2UI Template Admin

/chat
  └─ Chatbot + Display Selection + A2UI Renderer

/lab/agent-flow
  └─ Agent Flow Board + Trace + System Log
```

### 3.2 서비스 연결

```text
Template Admin
  -> Admin Template API
  -> Template Catalog Store

Chatbot
  -> Chatbot Backend/BFF
  -> A2UI Proxy Agent
       -> Main Agent
       -> A2UI Agent

Agent Flow Lab
  -> Chat/Proxy SSE Event
  -> Trace Adapter
```

### 3.3 분리 원칙

- Admin은 `ChatbotPanel`과 채팅 실행 상태를 가져오지 않는다.
- Chatbot은 `AdminPanel`과 Admin 편집 상태를 가져오지 않는다.
- Chatbot은 브라우저의 Admin 상태가 아니라 서버 Template Catalog를 통해 템플릿 변경사항을 반영한다.
- Flow Board는 제품 Admin에서 제거하고 개발·검증용 화면으로 이동한다.
- Admin, Chatbot, Observability는 각각 독립된 스타일 모듈을 사용한다.
- 실제 챗봇 프로젝트에는 Chat 기능과 Renderer만 이식할 수 있도록 의존성을 제한한다.

## 4. MengTo Skills 조사 결과

[MengTo/Skills](https://github.com/MengTo/Skills)는 UI, 웹 디자인, 미디어, Codex 작업 절차를 폴더 단위 `SKILL.md`로 제공하는 스킬 모음이다. 저장소의 기본 원칙은 전체 라이브러리를 한꺼번에 사용하는 것이 아니라 현재 작업에 가장 좁게 맞는 스킬을 선택하는 것이다.

이번 Admin 재설계에서는 다음 스킬을 사용한다.

| 스킬 | 적용 목적 | 적용 범위 |
| --- | --- | --- |
| [`design-first-ui-prompting`](https://github.com/MengTo/Skills/blob/main/agent-skills/ui/design-first-ui-prompting/SKILL.md) | 구현 전에 목표, 레이아웃, 타입, 색상, 제약조건을 명세 | Admin 디자인 스펙 작성과 변형 관리 |
| [`framed-grid-layout`](https://github.com/MengTo/Skills/blob/main/agent-skills/web-design/framed-grid-layout/SKILL.md) | 정렬된 그리드와 일관된 경계선 시스템 구성 | Admin Shell, 목록, 편집 영역 |
| [`split-layout-technical`](https://github.com/MengTo/Skills/blob/main/agent-skills/web-design/split-layout-technical/SKILL.md) | 좌우 영역의 역할과 정보 밀도를 분리 | Template Catalog와 Editor 분할 |
| [`number-details`](https://github.com/MengTo/Skills/blob/main/agent-skills/web-design/number-details/SKILL.md) | 작은 숫자 표식으로 섹션과 편집 순서 보조 | 편집 섹션과 검증 단계 메타데이터 |

### 4.1 적용하지 않는 스킬

다음 계열은 이번 Admin의 목적과 맞지 않아 사용하지 않는다.

- WebGL, Three.js, 와이어프레임 오브젝트 중심 스킬
- 랜딩 페이지 전용 히어로 및 전환 효과 스킬
- 강한 유리 효과, 글로우, 레이저, 3D 장식 스킬
- 과도한 스크롤 애니메이션과 시네마틱 전환
- 마케팅 페이지용 이미지 중심 레이아웃

Admin은 반복 작업과 데이터 편집이 중심이므로 시각적 장식보다 정보 계층, 정렬, 상태 표현, 오류 방지에 우선순위를 둔다.

## 5. MengTo 스킬 적용 방식

### 5.1 프로젝트에 필요한 스킬만 고정

설계와 구현을 시작하기 전에 선택한 스킬 폴더만 프로젝트 작업 컨텍스트에 추가한다.

```text
.agents/skills/mengto/
  ├─ design-first-ui-prompting/
  ├─ framed-grid-layout/
  ├─ split-layout-technical/
  └─ number-details/
```

원본 저장소 주소와 적용 시점의 commit SHA를 별도 메모에 남겨 이후 스킬 변경에 따른 결과 차이를 추적할 수 있게 한다. 원본 라이선스와 출처도 함께 유지한다.

### 5.2 Design First 스펙 작성

구현 전에 Admin 디자인 스펙을 다음 항목으로 고정한다.

```text
GOAL
- A2UI Template Catalog를 빠르고 안전하게 관리하는 Admin
- 반복적인 조회, 편집, 검증, 저장에 최적화

LAYOUT
- 12열 기준 그리드
- 좌측 Template Catalog, 우측 Template Editor
- 동일한 경계선, 간격, 패딩 규칙

TYPE SYSTEM
- 제품 UI용 Sans Serif
- 코드와 ID에는 Mono 사용
- 제목보다 필드와 상태의 가독성 우선

COLOR
- 밝은 Neutral 배경
- Charcoal 계열 본문
- 상태와 주요 액션에 한 가지 Accent 사용

CONSTRAINTS
- 템플릿 미리보기 제외
- 과도한 카드 중첩 제외
- Heavy shadow, gradient, glass 효과 제외
- Admin과 Chatbot 컴포넌트 결합 금지
```

### 5.3 Framed Grid 적용

- 모든 주요 영역을 동일한 12열 그리드에 정렬한다.
- 패널 경계는 동일한 1px 선을 사용한다.
- 패널 간 간격과 내부 패딩을 디자인 토큰으로 관리한다.
- 목록, 편집기, 검증 영역의 수직·수평 기준선을 맞춘다.
- 떠다니는 카드 대신 화면 구조를 설명하는 프레임을 사용한다.
- 장식용 대각선 패턴은 사용하더라도 매우 낮은 명도로 제한한다.

### 5.4 Split Layout 적용

- 좌측 영역은 Template Catalog 탐색에 집중한다.
- 우측 영역은 선택한 Template의 편집과 검증에 집중한다.
- 기본 비율은 목록 35%, 편집기 65%로 설정한다.
- 목록과 편집기의 정보 밀도를 동일하게 만들지 않는다.
- 작은 화면에서는 좌우 분할 대신 목록 화면과 상세 화면을 전환한다.

## 6. Admin 정보 구조

### 6.1 Admin Shell

```text
┌────────────────────────────────────────────────────────────┐
│ A2UI ADMIN                 Catalog v12       저장 상태      │
├───────────────┬────────────────────────────────────────────┤
│ Template      │ Template Editor                            │
│ Catalog       │                                            │
│               │ 기본 정보                                  │
│ 검색          │ 이름 / 설명 / Component ID                │
│ 필터          │                                            │
│ 등록 상태     │ Matching Rules                            │
│               │ Roles / Intent / Input                    │
│ 템플릿 목록   │                                            │
│               │ Advanced Configuration                    │
│               │ Schema / Surface / Input JSON             │
│               ├────────────────────────────────────────────┤
│ + 새 템플릿   │ Validation Result                저장      │
└───────────────┴────────────────────────────────────────────┘
```

### 6.2 Template Catalog

- 템플릿 이름과 설명
- Component ID
- 등록 상태
- 마지막 수정 시각
- 검색
- View Type 또는 상태 필터
- 새 템플릿 생성
- 선택 상태 유지
- 로딩, 빈 목록, Catalog 오류 상태

### 6.3 Template Editor

편집기는 기본 정보와 고급 설정을 분리한다.

기본 정보:

- 템플릿 이름
- 설명
- Component ID
- Selection Guide
- 등록 상태

Matching Rules:

- Required Roles
- Intent Keywords
- 허용하는 Input Shape
- Required Slots
- Optional Slots

Advanced Configuration:

- Schema Spec JSON
- Input Schema JSON
- Surface Config JSON

### 6.4 Validation 영역

- JSON 문법 오류
- 필수 필드 누락
- 중복 Component ID
- View Type 누락
- Title Binding 누락
- Required Slot과 Mapping 불일치
- 저장 가능한 상태인지 표시

템플릿 미리보기 기능은 이번 범위에 포함하지 않는다.

## 7. Chatbot 분리 범위

Chatbot에는 다음 기능만 남긴다.

- 메시지 입력과 대화 이력
- `/api/chat` SSE 소비
- `text`, `delta`, `display_options`, `surface`, `error`, `done` 처리
- 최대 3개의 표시 방식 선택 UI
- `selectionId`와 `templateId`를 사용한 선택 요청
- A2UI Surface Renderer
- 선택 만료와 Agent 오류 처리

다음 기능은 Chatbot에서 제거한다.

- Template Catalog 목록
- Template Editor
- Admin 저장 상태
- Flow Board 상태 관리
- Python Hook Modal
- Registry Reset UI

## 8. Agent Flow Lab 분리 범위

현재 `AgentTracePanel`, `SequenceBoard`, `SystemLogPanel`, `DataBoundaryLabPanel`을 `/lab/agent-flow`로 이동한다.

Lab의 역할은 다음과 같다.

- Proxy Agent와 Main Agent 사이의 SSE 흐름 확인
- Main Agent `data_result` 확인
- A2UI 후보와 선택 결과 확인
- 데이터 경계와 무결성 메타데이터 확인
- Surface 생성 실패와 Text Fallback 진단
- 테스트 시나리오 재생

Lab은 제품 Admin의 필수 기능이 아니며 개발 환경에서만 노출할 수 있도록 구성한다.

## 9. 코드 구조 변경안

```text
src/
├─ app/
│  ├─ admin/
│  │  └─ page.tsx
│  ├─ chat/
│  │  └─ page.tsx
│  └─ lab/
│     └─ agent-flow/
│        └─ page.tsx
│
├─ features/
│  ├─ a2ui-admin/
│  │  ├─ admin-page.tsx
│  │  ├─ admin-shell.tsx
│  │  ├─ template-catalog.tsx
│  │  ├─ template-catalog-item.tsx
│  │  ├─ template-editor.tsx
│  │  ├─ template-basic-form.tsx
│  │  ├─ template-matching-rules.tsx
│  │  ├─ template-json-editor.tsx
│  │  ├─ template-validation.ts
│  │  ├─ admin-tokens.css
│  │  └─ admin.module.css
│  │
│  ├─ a2ui-chat/
│  │  ├─ chat-page.tsx
│  │  ├─ chatbot-panel.tsx
│  │  ├─ display-selection.tsx
│  │  ├─ sse-client.ts
│  │  ├─ surface-envelope.ts
│  │  ├─ a2ui-renderer.tsx
│  │  └─ chat.module.css
│  │
│  ├─ a2ui-observability/
│  │  ├─ agent-flow-page.tsx
│  │  ├─ agent-trace-panel.tsx
│  │  ├─ sequence-board.tsx
│  │  ├─ system-log-panel.tsx
│  │  ├─ data-boundary-lab-panel.tsx
│  │  └─ observability.module.css
│  │
│  └─ a2ui-core/
│     ├─ template-types.ts
│     ├─ surface-types.ts
│     ├─ agent-event-types.ts
│     └─ contracts.ts
```

## 10. API 경계

### Admin API

```text
GET    /api/admin/templates
POST   /api/admin/templates
PUT    /api/admin/templates/:componentId
POST   /api/admin/templates/reset
```

Admin API는 Template Catalog 관리만 담당한다.

### Chat API

```text
POST /api/chat
POST /api/chat/display-selection
```

Chat API는 Proxy Agent 스트림 중계와 선택 요청만 담당한다.

Admin과 Chat의 API 계약은 서로의 프론트 상태에 의존하지 않는다.

## 11. 구현 단계

### 단계 1. 스킬과 디자인 기준 고정

- MengTo 스킬 4개 선정 및 출처 기록
- Admin Design First 스펙 작성
- 디자인 토큰 확정
- Admin Shell의 그리드와 반응형 규칙 확정

### 단계 2. 라우트 분리

- `/admin` 생성
- `/chat` 생성
- `/lab/agent-flow` 생성
- 루트 페이지의 목적 결정 또는 리다이렉트 적용
- 기존 통합 페이지에서 화면별 상태 분리

### 단계 3. 기능 모듈 분리

- `a2ui-admin` 기능 이동
- `a2ui-chat` 기능 이동
- `a2ui-observability` 기능 이동
- 공통 계약을 `a2ui-core`로 이동
- 순환 import와 UI 간 직접 참조 제거

### 단계 4. Admin Shell 재개발

- Framed Grid 기반 전체 구조 구현
- Catalog와 Editor의 Split Layout 적용
- Admin 전용 Header와 상태 영역 구현
- 데스크톱과 작은 화면 전환 구현

### 단계 5. 편집 워크플로 개선

- 기본 정보와 고급 JSON 편집 분리
- Dirty State 표시
- 저장, 취소, 저장 중 상태 구현
- JSON과 템플릿 계약 검증
- 오류를 해당 필드와 Validation 영역에 표시

### 단계 6. Chatbot 단독 실행 검증

- Admin 없이 `/chat` 실행
- Proxy Agent SSE 연결
- 후보 선택과 Surface 렌더링
- Chat 기능이 Admin Registry Hook에 직접 의존하지 않는지 확인

### 단계 7. Agent Flow Lab 검증

- 기존 Flow Board 기능 이동
- Chat Event와 Trace Adapter 연결
- 제품 Admin 없이 진단 화면 단독 실행
- 개발 환경 전용 노출 설정

### 단계 8. 통합 검증

- Admin에서 저장한 Catalog가 서버에 반영되는지 확인
- 새로운 질문에서 변경된 Catalog가 A2UI Agent에 반영되는지 확인
- Admin 화면이 Chatbot 실행 여부와 무관하게 동작하는지 확인
- 일반 대화, 추천 선택, 대체 선택, 만료, 오류 흐름 확인
- 브라우저 반응형, 키보드 조작, 콘솔 오류 확인

## 12. 테스트 계획

### Admin

- Catalog 로딩, 빈 목록, 서버 오류
- 템플릿 검색과 필터
- 기존 템플릿 선택
- 신규 템플릿 생성
- 기본 정보 수정
- JSON 문법 오류
- 필수 필드 누락
- 저장 성공과 실패
- 저장하지 않은 변경사항 표시
- 작은 화면의 목록·상세 전환

### Chatbot

- 일반 텍스트 대화
- 데이터 요청
- `display_options` 표시
- 추천 템플릿 선택
- 대체 템플릿 선택
- 선택 만료
- Surface 렌더링
- Proxy Agent 및 A2UI Agent 오류

### 분리 검증

- `/admin` 번들에서 Chatbot UI 코드가 제외되는지 확인
- `/chat` 번들에서 Admin Editor 코드가 제외되는지 확인
- Admin을 새로고침해도 Chatbot 실행 상태에 영향이 없는지 확인
- Chatbot을 새로고침해도 Admin 편집 상태에 영향이 없는지 확인
- 서버 Catalog만 두 화면의 연결 지점인지 확인

## 13. 완료 기준

- Admin, Chatbot, Agent Flow Lab이 서로 다른 URL에서 단독 실행된다.
- Admin 코드가 `ChatbotPanel`을 import하지 않는다.
- Chatbot 코드가 `AdminPanel`과 Admin 편집 상태를 import하지 않는다.
- Chatbot은 Admin 브라우저 상태가 아니라 서버 Template Catalog를 사용한다.
- Flow Board가 제품 Admin에서 제거되고 Lab으로 이동한다.
- Admin의 목록, 편집, 검증, 저장 흐름이 한 화면에서 명확하게 이어진다.
- 템플릿 미리보기 없이도 Catalog 관리 작업을 완료할 수 있다.
- MengTo 스킬에서 선택한 그리드, 분할, 경계선, 한 가지 Accent 규칙이 일관되게 적용된다.
- 기존 Proxy Agent 기반 Chatbot E2E 흐름이 유지된다.
- 대표 브라우저 테스트에서 콘솔 오류와 의도하지 않은 레이아웃 오버플로가 발생하지 않는다.

## 14. 구현 시 주의사항

- MengTo 스킬의 시각 표현을 그대로 복사하기보다 현재 Admin의 작업 목적에 맞게 적용한다.
- 여러 시각 스타일 스킬을 동시에 섞지 않는다.
- Admin에 마케팅 페이지용 모션과 장식을 추가하지 않는다.
- 기존 Admin API와 Template Catalog 저장 형식은 UI 재설계와 분리하여 유지한다.
- 실제 챗봇 이식에 필요한 Renderer와 SSE Client는 Admin 폴더에 두지 않는다.
- POC 단계에서는 현재 메모리 기반 Proxy Selection Store를 유지할 수 있다.
- 다중 Proxy 인스턴스와 장시간 선택 상태가 필요해질 때 Redis 전환을 별도 범위로 진행한다.
