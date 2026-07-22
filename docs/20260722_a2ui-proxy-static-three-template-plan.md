# A2UI Proxy Agent 고정 3종 템플릿 직접 생성 수정 계획

작성일: 2026-07-22
상태: 구현 완료

## 1. 목표

A2UI Proxy Agent가 별도 MCP 또는 A2A A2UI Agent를 호출하지 않고 다음 고정 템플릿 3종을 직접 제공한다.

| 템플릿 ID | 라벨 | 용도 |
| --- | --- | --- |
| `collection.list` | 목록 | 간단한 항목 목록 |
| `collection.cardGrid` | 카드 | 이미지와 설명 중심 카드 |
| `matrix.table` | 데이터 테이블 | 여러 필드 비교 |

Main Agent는 기존처럼 업무 의도 판단과 데이터 조회만 담당한다. Proxy Agent는 `data_result`를 서버 내부에 보관하고, 표시 방식 선택과 SurfaceEnvelope 생성을 직접 처리한다.

## 2. 범위 원칙

핵심 런타임 작업은 `packages/a2ui-proxy-agent`에 한정한다. 저장소의 Proxy 개발·테스트 명령이 동일한 standalone runtime을 사용하도록 Proxy 전용 root script만 함께 수정한다.

다음 구성은 삭제하거나 수정하지 않는다.

- 기존 템플릿 Admin UI와 `/admin` route
- `/api/admin/templates`와 파일 기반 템플릿 카탈로그
- Next A2A route와 A2A server 코드
- Agent Flow와 Data Boundary Lab
- Main Agent의 기존 코드와 테스트
- Chatbot UI, Renderer, 내비게이션, 기본 진입점
- root README, root `.env.example`, Proxy 외 실행/E2E script

Admin과 기존 10종 템플릿은 향후 다시 사용할 수 있도록 그대로 보존한다. 활성 Chatbot 요청에서 Proxy만 Admin/A2A 경로를 우회한다.

## 3. 목표 흐름

```text
Chatbot UI
→ Next /api/chat
→ A2UI Proxy Agent
→ Main Agent
→ Business API
→ Main Agent data_result
→ Proxy가 데이터를 정규화하고 고정 3종 선택지 생성
→ display_options
→ 사용자 선택
→ Proxy가 SurfaceEnvelope 직접 생성
→ surface
→ 기존 Chatbot Renderer
```

Proxy가 호출하는 Agent는 Main Agent 하나뿐이다. 템플릿 추천과 Surface 생성 과정에서는 MCP, A2A A2UI Agent, Admin API를 호출하지 않는다.

## 4. Proxy 구현 내용

### 4.1 고정 템플릿

`app/static_templates.py`에서 템플릿 ID, 라벨, `viewType`, 최대 표시 행을 정의한다. 허용 가능한 템플릿 ID는 세 개로 제한한다.

### 4.2 데이터 정규화 및 필드 매핑

`app/surface_builder.py`에서 다음 작업을 수행한다.

- object 배열과 `items`, `rows`, `list` 응답 정규화
- `result`, `data`, `payload` 내부 중첩 응답 탐색
- 최대 20개 row를 이용한 scalar field 프로파일링
- title, content, image, category, status 역할 추론
- 목록, 카드, 테이블별 field mapping 생성
- `{ items, total }` 형태의 표시 데이터 생성
- 빈 배열, primitive 데이터, 매핑 불가 데이터의 text fallback

### 4.3 결정적 추천

추천에는 LLM을 사용하지 않는다.

1. 질문의 `카드`, `목록`, `테이블` 등 명시적 표현 우선
2. 이미지 필드가 있으면 카드
3. scalar field가 3개 이하면 목록
4. 그 외에는 테이블

세 템플릿은 모두 선택지로 반환하며 추천은 정확히 하나만 지정한다.

### 4.4 선택 컨텍스트

기존 메모리 기반 `SelectionStore`와 TTL을 유지한다.

- 선택 전 원본 `data_result`는 브라우저에 전달하지 않는다.
- `selectionId`와 허용된 세 템플릿 ID만 브라우저에 전달한다.
- 사용자가 선택하면 Proxy가 해당 시점에 Surface를 생성한다.
- 잘못되거나 만료된 선택은 거부한다.
- 성공한 선택 컨텍스트는 삭제한다.

### 4.5 제거하는 Proxy 내부 의존성

- `app/a2ui_agent_client.py`
- Proxy의 `A2UI_A2A_URL`, token, timeout 설정
- A2A progress/candidate 변환 로직
- 추천 Surface 사전 생성과 `prepared_surface`

이는 Proxy 패키지 내부 정리이며, Next의 A2A/Admin 구현 자체는 보존한다.

## 5. 변경 파일

```text
packages/a2ui-proxy-agent/
├─ .env.example                 # 신규. 독립 서버 설정 예시
├─ README.md
├─ run.py                       # 신규. venv/requirements 자동 준비 및 실행
├─ app/
│  ├─ a2ui_agent_client.py       # 삭제
│  ├─ config.py
│  ├─ main.py
│  ├─ orchestrate.py
│  ├─ selection_store.py
│  ├─ static_templates.py        # 신규
│  └─ surface_builder.py         # 신규
└─ tests/
   ├─ test_proxy_orchestrate.py
   ├─ test_run.py               # 신규. standalone runner 검증
   ├─ test_selection_store.py
   └─ test_surface_builder.py    # 신규

scripts/
├─ proxy-agent-dev.mjs          # standalone runner 호출로 변경
└─ proxy-agent-test.mjs         # Proxy 전용 venv 준비 후 테스트
```

## 6. 완료 체크리스트

- [x] 고정 템플릿 3종 정의
- [x] 응답 데이터 정규화와 필드 프로파일링 구현
- [x] 목록, 카드, 테이블 field mapping 구현
- [x] 결정적 추천 규칙 구현
- [x] Proxy 직접 SurfaceEnvelope 생성 구현
- [x] Proxy의 A2A A2UI Agent 호출 제거
- [x] 선택 전 원본 업무 데이터 미노출 유지
- [x] 잘못되거나 만료된 선택 거부
- [x] 텍스트 모드의 A2UI 우회 유지
- [x] Proxy health에 static template mode와 3개 ID 표시
- [x] Proxy 단위 테스트 25개 통과
- [x] Admin, A2A, Main Agent, Chatbot 코드는 원래 상태로 보존
- [x] Proxy 폴더만 복사해 `python3 run.py`로 실행 가능
- [x] Proxy 전용 `.venv` 생성과 requirements 설치 자동화
- [x] Main Agent venv에 대한 Proxy 실행 의존성 제거

## 7. 검증 명령

```bash
npm run proxy-agent:test
npm run main-agent:test
npm run lint
npm run build
```

통합 확인 시 기존 Admin/A2A 서비스의 존재 여부와 관계없이 Chatbot의 `/api/chat` 요청이 Proxy의 고정 3종 선택지를 받고, 선택 후 Proxy가 만든 Surface를 수신하는지 확인한다.

검증 결과:

- Proxy Agent 단위 테스트 25개 통과
- 기존 Main Agent 단위 테스트 42개 통과
- lint와 production build 통과
- 기존 `e2e:proxy-flow` 통과
- production build에서 `/admin`, `/api/admin/*`, `/api/a2a/*`, `/lab/agent-flow` route 유지 확인
- 실행 중 `/api/admin/templates`가 기존 템플릿 카탈로그를 정상 반환하는지 확인

## 8. 완료 조건

- 변경 파일이 문서와 `packages/a2ui-proxy-agent` 아래에만 존재한다.
- Proxy가 Main Agent 외의 Agent, MCP, Admin API를 호출하지 않는다.
- 데이터 요청에 정확히 세 개의 표시 방식이 제공된다.
- 세 템플릿 모두 Proxy가 직접 SurfaceEnvelope를 생성한다.
- 선택 전 원본 업무 데이터가 브라우저에 노출되지 않는다.
- 기존 Admin과 A2A 관련 파일 및 route가 그대로 남아 있다.
