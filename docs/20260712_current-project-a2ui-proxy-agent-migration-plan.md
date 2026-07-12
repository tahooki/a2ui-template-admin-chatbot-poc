# 현재 프로젝트 A2UI Proxy Agent 구조 전환 계획

작성일: 2026-07-12

## 1. 문서 목적

현재 프로젝트의 Chatbot, Main Agent, A2UI Agent 호출 구조를 A2UI Proxy Agent 중심 구조로 변경하기 위한 구현 계획을 정리한다.

이번 전환의 핵심은 Main Agent가 업무 데이터를 조회한 뒤, 채팅 답변뿐 아니라 **조회한 원본 데이터와 조회 메타데이터를 Proxy Agent에 함께 반환**하는 것이다.

Proxy Agent는 Main Agent가 반환한 데이터를 A2UI Agent에 전달하여 템플릿을 비교하고 A2UI Surface를 생성한다. Main Agent는 A2UI Agent를 직접 호출하거나 화면 템플릿을 결정하지 않는다.

## 2. 현재 프로젝트 구조

현재 프로젝트의 주요 호출 흐름은 다음과 같다.

```text
Chatbot UI
→ Next /api/chat
→ Main Agent /chat/stream
→ Business API Tool
→ Main Agent 내부 a2ui_render Tool
→ A2A A2UI Agent
→ A2UI Runtime / Template Matcher
→ SurfaceEnvelope
→ Main Agent SSE
→ Chatbot Renderer
```

현재는 Main Agent가 다음 책임을 모두 가지고 있다.

- 사용자 요청 해석
- Business API Tool 선택 및 실행
- 업무 데이터 조회
- A2UI Render Tool 호출
- A2UI Agent 호출
- 템플릿 비교 결과 수신
- 채팅 텍스트와 Surface 이벤트 생성

현재 구조에서 A2UI 관련 코드가 Main Agent에 포함된 주요 위치는 다음과 같다.

| 영역 | 현재 파일 | 역할 |
| --- | --- | --- |
| Chat API | `src/app/api/chat/route.ts` | Chatbot 요청을 Main Agent로 전달 |
| Chatbot UI | `src/features/a2ui-template-poc/chatbot-panel.tsx` | SSE 수신 및 텍스트·Surface 렌더링 |
| Main Agent API | `packages/a2ui-python-agent/app/main.py` | `/chat`, `/chat/stream` 제공 |
| Main Agent 흐름 | `packages/a2ui-python-agent/app/orchestrate.py` | 데이터 조회 후 A2UI Tool까지 호출 |
| A2UI Render Tool | `packages/a2ui-python-agent/app/a2ui_render_tool.py` | 조회 데이터를 A2UI 경계로 전달 |
| A2UI Client | `packages/a2ui-python-agent/app/a2a_client.py` | A2A A2UI Agent 호출 |
| A2UI Agent | `src/server/a2a/a2ui-message-handler.ts` | 템플릿 비교 및 Surface 생성 |
| A2UI Runtime | `src/server/a2ui-admin/*` | 템플릿 catalog, matcher, mapping 처리 |
| Renderer | `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx` | SurfaceEnvelope 화면 출력 |

## 3. 목표 구조

변경 후 목표 흐름은 다음과 같다.

```text
Chatbot UI
→ Next /api/chat
→ A2UI Proxy Agent /chat/stream
→ Main Agent /chat/stream
→ Business API Tool
→ Main Agent가 채팅 답변 + 조회 데이터 + 조회 메타데이터 반환
→ A2UI Proxy Agent가 조회 결과 수신
→ A2UI Proxy Agent가 A2A A2UI Agent 호출
→ A2UI Runtime이 템플릿 후보 비교
→ 사용자에게 표시 방식 선택 요청
→ 사용자가 템플릿 선택
→ 선택한 템플릿으로 Surface 생성
→ Chatbot Renderer에서 A2UI 화면 출력
```

구조를 간단하게 표현하면 다음과 같다.

```text
Chatbot
   ↓
A2UI Proxy Agent
   ├─→ Main Agent → Business API
   │      └─ 채팅 답변 + 조회 데이터 반환
   │
   └─→ A2UI Agent → Template Matcher / Surface 생성
          └─ 템플릿 후보 또는 Surface 반환
```

## 4. 컴포넌트별 책임

### 4.1 Chatbot UI

- 사용자 메시지 입력
- Proxy Agent의 스트림 응답 수신
- 일반 채팅 텍스트 표시
- A2UI 템플릿 후보 버튼 표시
- 사용자의 표시 방식 선택 전달
- 선택된 Surface를 Renderer로 출력
- 오류 및 텍스트 fallback 표시

### 4.2 A2UI Proxy Agent

- Chatbot 요청 수신
- Main Agent 호출
- Main Agent 스트림 수신 및 필요한 이벤트 중계
- Main Agent가 반환한 조회 데이터와 메타데이터 추출
- 조회 데이터를 A2UI Agent에 전달
- A2UI 템플릿 후보 수신 및 정리
- 사용자 선택에 필요한 임시 컨텍스트 관리
- 선택된 템플릿으로 Surface 생성 요청
- Chatbot용 SSE 이벤트 생성
- Main Agent 또는 A2UI Agent 오류 시 fallback 처리

### 4.3 Main Agent

- 사용자 요청 해석
- Business API Tool 선택
- 업무 데이터 조회
- 일반 채팅 답변 생성
- 조회한 원본 데이터와 메타데이터를 Proxy Agent에 반환
- 일반 질문인 경우 채팅 텍스트만 반환

Main Agent에서 제외할 책임은 다음과 같다.

- A2UI Render Tool 호출
- A2UI Agent 호출
- A2UI 템플릿 선택
- Surface 생성
- A2UI 전용 SSE 이벤트 생성

### 4.4 A2UI Agent

- Proxy Agent가 전달한 조회 데이터 분석
- 데이터 스키마와 등록 템플릿 비교
- 적용 가능한 템플릿 후보 반환
- 템플릿별 점수와 선택 이유 반환
- 지정된 템플릿으로 데이터 필드 매핑
- 최종 SurfaceEnvelope 생성
- 템플릿 미매칭 시 fallback 정보 반환

### 4.5 A2UI Admin

- 템플릿 목록 관리
- 템플릿 등록 및 수정
- 템플릿 활성화 및 비활성화
- 입력 데이터 스키마 관리
- 데이터 필드 매핑 관리

템플릿 미리보기, 승인 절차 및 버전 관리는 이번 POC 범위에서 제외한다.

## 5. Main Agent 반환 구조

Main Agent는 데이터 요청을 처리한 경우 채팅 답변과 조회 결과를 함께 반환해야 한다.

POC에서 사용할 수 있는 기본 이벤트 구성은 다음과 같다.

```text
event: state
data: 요청 분석 및 Business Tool 실행 상태

event: text
data: 사용자에게 표시할 일반 채팅 답변

event: data_result
data: 조회한 원본 데이터와 조회 메타데이터

event: done
data: Main Agent 처리 완료
```

`data_result` 예시는 다음과 같다.

```json
{
  "turnId": "turn-123",
  "intentKey": "equipment.status.lookup",
  "sourceToolName": "get_equipment_status",
  "sourceToolResultId": "tool-result-123",
  "apiId": "equipment-status",
  "data": {
    "items": [
      {
        "id": "equipment-01",
        "name": "설비 01",
        "status": "RUNNING"
      }
    ],
    "total": 1
  },
  "metadata": {
    "sourceDataHash": "sha256...",
    "sourceRowCount": 1,
    "sourceDataShape": "object{items:array<object>}"
  }
}
```

Main Agent가 반환하는 `data`는 A2UI 화면 생성에 사용할 원본 조회 결과다. Proxy Agent는 이 데이터를 브라우저에 그대로 노출하지 않고 A2UI Agent 호출에 사용한다.

## 6. Proxy Agent 처리 흐름

### 6.1 일반 채팅 요청

```text
사용자 요청
→ Proxy Agent
→ Main Agent
→ text 이벤트 수신
→ Chatbot으로 text 이벤트 중계
→ 종료
```

Main Agent가 `data_result`를 반환하지 않으면 A2UI Agent를 호출하지 않는다.

### 6.2 데이터 조회 요청

```text
사용자 요청
→ Proxy Agent
→ Main Agent
→ text + data_result 수신
→ text는 Chatbot으로 중계
→ data_result는 Proxy Agent에서 보관
→ Proxy Agent가 A2UI Agent에 데이터 전달
→ 템플릿 후보 수신
→ Chatbot에 display_options 이벤트 전달
```

### 6.3 사용자 템플릿 선택

```text
사용자가 테이블 / 카드 / 요약 중 하나 선택
→ Chatbot이 selectionId + templateId 전달
→ Proxy Agent가 보관 중인 조회 데이터 확인
→ A2UI Agent에 선택된 templateId와 데이터 전달
→ A2UI Agent가 Surface 생성
→ Proxy Agent가 surface 이벤트 전달
→ Chatbot Renderer가 화면 출력
```

POC에서는 조회 데이터와 템플릿 후보를 Proxy Agent 메모리에 일정 시간 보관한다.

- `selectionId`를 키로 사용
- 짧은 만료 시간 적용
- 사용 완료 또는 만료 시 데이터 삭제
- 서버 재시작 시 데이터가 삭제되어도 허용

운영 단계에서 필요하면 Redis 또는 별도 저장소로 교체할 수 있다.

## 7. Chatbot용 스트림 이벤트

Proxy Agent가 Chatbot에 전달할 이벤트는 다음과 같이 구성한다.

| 이벤트 | 설명 |
| --- | --- |
| `state` | 요청 분석, 데이터 조회, A2UI 처리 상태 |
| `text` | 일반 채팅 답변 |
| `display_options` | 사용자가 선택할 템플릿 후보 |
| `surface` | 선택된 A2UI Surface |
| `error` | Main Agent 또는 A2UI Agent 오류 |
| `done` | 현재 단계의 처리 완료 |

`display_options` 예시는 다음과 같다.

```json
{
  "selectionId": "selection-123",
  "message": "어떤 방식으로 보시겠습니까?",
  "options": [
    {
      "templateId": "data-table",
      "label": "테이블",
      "score": 0.92
    },
    {
      "templateId": "card-list",
      "label": "카드",
      "score": 0.84
    },
    {
      "templateId": "summary-detail",
      "label": "요약",
      "score": 0.71
    }
  ]
}
```

POC에서는 다음 기준을 적용한다.

- 유효한 후보가 2개 이상이면 사용자에게 선택 요청
- 후보가 1개면 바로 Surface를 표시하거나 확인 버튼만 제공
- 후보가 없으면 일반 채팅 답변만 유지
- 후보는 최대 3개까지만 표시

## 8. 현재 프로젝트 변경 계획

### 8.1 A2UI Proxy Agent 패키지 추가

신규 패키지를 다음과 같이 추가한다.

```text
packages/a2ui-proxy-agent/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── contracts.py
│   ├── main_agent_client.py
│   ├── a2ui_agent_client.py
│   ├── orchestrate.py
│   └── selection_store.py
├── tests/
└── requirements.txt
```

각 파일의 역할은 다음과 같다.

| 파일 | 역할 |
| --- | --- |
| `main.py` | `/chat`, `/chat/stream`, `/display-selection` API 제공 |
| `config.py` | Main Agent URL, A2UI Agent URL, timeout 설정 |
| `contracts.py` | Main Agent 및 Chatbot 이벤트 데이터 모델 |
| `main_agent_client.py` | Main Agent 스트림 호출 및 파싱 |
| `a2ui_agent_client.py` | A2A A2UI Agent 호출 |
| `orchestrate.py` | Main Agent와 A2UI Agent 흐름 조합 |
| `selection_store.py` | 사용자 선택용 임시 데이터 보관 |

### 8.2 Main Agent 단순화

`packages/a2ui-python-agent/app/orchestrate.py`에서 다음 부분을 분리한다.

- `_run_a2ui_tool()` 제거
- `_stream_a2ui_tool()` 제거
- `a2ui_tool_selected`, `a2ui_tool_call`, `matcher`, `surface` 이벤트 생성 제거
- Business Tool 실행 후 `data_result` 이벤트 생성
- 사용자용 기본 `text` 이벤트 생성
- Main Agent 처리 완료 `done` 이벤트 생성

다음 코드는 Main Agent에서 Proxy Agent로 이동한다.

- A2UI A2A Client 사용 코드
- A2UI 진행 상태 변환 코드
- Matcher 결과 처리 코드
- Surface 이벤트 생성 코드

기존 패키지 이름은 POC 기간에는 유지한다. 구조가 안정된 후 `main-agent`로 이름을 변경하는 것은 별도 작업으로 둔다.

### 8.3 Chat API 대상 변경

`src/app/api/chat/route.ts`의 호출 대상을 Main Agent에서 A2UI Proxy Agent로 변경한다.

```text
기존 환경 변수
MAIN_AGENT_URL

변경 환경 변수
A2UI_PROXY_AGENT_URL
```

Next Chat API는 브라우저 요청을 Proxy Agent에 전달하고 Proxy Agent의 SSE 응답을 그대로 중계한다.

사용자 템플릿 선택 요청을 전달하기 위한 API도 추가한다.

```text
POST /api/chat/display-selection
```

요청에 포함할 기본 값은 다음과 같다.

```json
{
  "selectionId": "selection-123",
  "templateId": "data-table"
}
```

### 8.4 Chatbot UI 변경

`src/features/a2ui-template-poc/chatbot-panel.tsx`에 다음 기능을 추가한다.

- `display_options` 이벤트 파싱
- ChatMessage에 템플릿 후보 상태 추가
- 템플릿 선택 버튼 표시
- 선택 중 중복 클릭 방지
- 선택 요청 API 호출
- 선택 완료 후 버튼 비활성화
- `surface` 이벤트 수신 후 기존 `A2UIDemoRenderer`로 출력
- 선택 요청 실패 시 일반 텍스트 유지

기존 Renderer는 최대한 유지하고, Chatbot 이벤트와 Renderer 사이에 변환 Adapter를 두는 방식으로 처리한다.

### 8.5 A2UI Agent 계약 확장

현재 A2UI Agent는 가장 적합한 템플릿 하나를 선택하고 Surface를 바로 생성한다. 사용자 선택을 지원하려면 다음 두 가지 요청 모드를 추가한다.

```text
recommend
  데이터에 적용 가능한 템플릿 후보를 반환

render_selected
  사용자가 선택한 templateId로 Surface를 생성
```

A2A Render Request의 POC 확장 예시는 다음과 같다.

```json
{
  "a2uiOptions": {
    "mode": "recommend",
    "includeTrace": true,
    "maxCandidates": 3
  }
}
```

선택 이후 요청은 다음과 같이 처리한다.

```json
{
  "a2uiOptions": {
    "mode": "render_selected",
    "selectedTemplateId": "data-table",
    "includeTrace": true
  }
}
```

`src/server/a2a/a2ui-message-handler.ts`와 `src/server/a2ui-admin/*`에는 다음 변경이 필요하다.

- 후보 목록만 반환하는 recommend 처리
- 활성화된 템플릿인지 검증
- 선택된 템플릿이 데이터 스키마와 호환되는지 검증
- 선택된 템플릿 기준 필드 매핑
- 선택이 유효하지 않으면 fallback 반환

### 8.6 실행 스크립트 및 환경 설정 변경

`scripts/dev-all.mjs`에서 다음 세 서비스를 함께 실행한다.

```text
Next Web          : 3001
Main Agent        : 8000
A2UI Proxy Agent  : 8200
```

환경 변수 구성안은 다음과 같다.

```text
A2UI_PROXY_AGENT_URL=http://localhost:8200
MAIN_AGENT_URL=http://localhost:8000
A2UI_A2A_URL=http://localhost:3001/api/a2a
A2UI_PROXY_TIMEOUT_SECONDS=60
A2UI_SELECTION_TTL_SECONDS=300
```

실제 포트와 변수명은 구현 시 기존 실행 환경과 충돌하지 않도록 최종 확정한다.

## 9. 구현 순서

### 1단계: Main Agent 응답 계약 분리

- Business Tool 결과를 `data_result` 이벤트로 반환
- 원본 데이터와 source metadata 포함
- Main Agent의 A2UI 호출 제거
- 일반 채팅과 데이터 요청 회귀 테스트

### 2단계: Proxy Agent 기본 흐름 구현

- Proxy Agent API 추가
- Main Agent 스트림 호출
- `state`, `text`, `data_result`, `done` 이벤트 파싱
- 텍스트 및 상태 이벤트 중계
- 데이터 요청일 때만 A2UI Agent 호출

### 3단계: A2UI 후보 반환 기능 구현

- A2UI Agent recommend 모드 추가
- 템플릿 후보 최대 3개 반환
- Proxy Agent에서 `display_options` 이벤트 생성
- 후보가 없는 경우 텍스트 fallback 처리

### 4단계: 사용자 선택 및 Surface 생성

- Proxy Agent 임시 selection store 추가
- Chatbot 템플릿 선택 버튼 추가
- 선택 요청 API 추가
- A2UI Agent render_selected 모드 추가
- 선택된 Surface 렌더링

### 5단계: 통합 및 POC 검증

- 전체 서비스 실행 스크립트 수정
- 주요 시나리오 E2E 테스트
- 오류 및 timeout 처리
- 데이터 무결성 비교
- POC 시연 흐름 정리

## 10. 테스트 계획

### 10.1 Main Agent 테스트

- 일반 질문은 `text`만 반환하는지 확인
- 데이터 요청은 `text`와 `data_result`를 반환하는지 확인
- `data_result.data`가 Business Tool 원본 결과와 일치하는지 확인
- source hash, row count 및 shape가 유지되는지 확인
- Main Agent가 A2UI Agent를 호출하지 않는지 확인

### 10.2 Proxy Agent 테스트

- Main Agent의 텍스트 이벤트를 순서대로 중계하는지 확인
- `data_result`를 브라우저로 직접 전달하지 않는지 확인
- `data_result`가 있을 때만 A2UI Agent를 호출하는지 확인
- Main Agent 오류를 Chatbot용 오류 이벤트로 변환하는지 확인
- A2UI Agent 오류 시 기존 채팅 답변이 유지되는지 확인

### 10.3 사용자 선택 테스트

- 후보가 여러 개일 때 선택 버튼이 표시되는지 확인
- 선택한 templateId로 Surface가 생성되는지 확인
- 중복 선택 요청이 방지되는지 확인
- 만료된 selectionId 요청이 안전하게 실패하는지 확인
- 비활성화되거나 존재하지 않는 템플릿 선택이 거부되는지 확인

### 10.4 데이터 무결성 테스트

다음 지점을 비교한다.

```text
Business Tool 원본 데이터
→ Main Agent data_result
→ Proxy Agent 수신 데이터
→ A2UI Agent 수신 데이터
→ Surface payload 데이터
```

각 단계에서 다음 값을 확인한다.

- 데이터 hash
- 데이터 byte length
- row count
- 데이터 shape
- 주요 top-level key

### 10.5 E2E 시나리오

1. 일반 질문 → 텍스트 응답
2. 데이터 요청 → 텍스트 응답 → 템플릿 후보 표시
3. 테이블 선택 → 테이블 Surface 출력
4. 카드 선택 → 카드 Surface 출력
5. 후보 1개 → 단일 화면 처리
6. 후보 없음 → 텍스트 fallback
7. Main Agent 오류 → 오류 메시지
8. A2UI Agent 오류 → 채팅 답변 유지
9. 선택 정보 만료 → 재조회 안내

## 11. POC 범위와 제외 범위

### 포함 범위

- A2UI Proxy Agent 신규 개발
- Main Agent 데이터 반환 구조 변경
- Main Agent의 A2UI 책임 분리
- Chatbot 호출 대상을 Proxy Agent로 변경
- 템플릿 후보 선택 UI
- 선택한 템플릿의 Surface 렌더링
- 기본 템플릿 3종 연동
- Admin 기본 등록·수정·활성화 기능 연동
- 기본 로그, 오류 및 timeout 처리
- 핵심 흐름 통합 테스트

### 제외 범위

- 템플릿 미리보기
- 사용자별 상세 권한 관리
- 템플릿 승인 워크플로
- 템플릿 버전 관리
- selection 데이터 영구 저장
- 다중 Proxy 인스턴스 간 selection 동기화
- 대규모 트래픽 최적화
- 운영 수준 모니터링 및 고가용성 구성

## 12. 예상 일정

| 주차 | 주요 작업 |
| --- | --- |
| 1주차 | Main Agent 응답 계약 변경, A2UI 호출 분리, Proxy Agent 기본 API 구성 |
| 2주차 | Proxy 스트림 중계, A2UI Agent 후보 반환 기능, Chat API 연결 |
| 3주차 | Chatbot 선택 UI, 선택 요청, 선택 템플릿 Surface 생성 |
| 4주차 | 전체 통합, 데이터 무결성 확인, 오류 수정, POC 시연 준비 |

## 13. 완료 기준

- Chatbot의 모든 Agent 요청이 A2UI Proxy Agent를 경유한다.
- Main Agent는 업무 데이터 조회와 채팅 답변만 담당한다.
- Main Agent가 조회한 원본 데이터와 메타데이터를 Proxy Agent에 반환한다.
- Proxy Agent가 반환받은 데이터로 A2UI Agent를 호출한다.
- A2UI Agent가 적용 가능한 템플릿 후보를 반환한다.
- 사용자가 표시 방식을 선택할 수 있다.
- 선택한 템플릿으로 Surface가 생성된다.
- Chatbot의 기존 Renderer에서 Surface가 정상 출력된다.
- 템플릿 미매칭 또는 A2UI 오류 시 일반 채팅 답변이 유지된다.
- Business Tool부터 Surface까지 데이터 무결성을 확인할 수 있다.

## 14. 최종 목표 흐름

```text
1. 사용자가 Chatbot에 데이터 요청
2. Chatbot이 Proxy Agent 호출
3. Proxy Agent가 Main Agent 호출
4. Main Agent가 업무 API 실행
5. Main Agent가 채팅 답변과 조회 데이터를 Proxy Agent에 반환
6. Proxy Agent가 채팅 답변을 먼저 전달
7. Proxy Agent가 조회 데이터를 A2UI Agent에 전달
8. A2UI Agent가 템플릿 후보 반환
9. Proxy Agent가 사용자에게 표시 방식 질문
10. 사용자가 템플릿 선택
11. Proxy Agent가 선택 템플릿으로 Surface 생성 요청
12. Chatbot Renderer가 A2UI 화면 출력
```

이 구조를 통해 Main Agent의 업무 처리 책임과 A2UI의 화면 생성 책임을 분리하고, Proxy Agent가 두 Agent의 결과를 Chatbot에 맞는 하나의 스트림으로 조합하도록 한다.
