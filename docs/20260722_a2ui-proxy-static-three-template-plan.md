# A2UI Proxy Agent 3종 템플릿 AI 플래닝 구성

작성일: 2026-07-22
수정일: 2026-07-24
상태: Proxy 구현 및 Main → Proxy 실제 연동 검증 완료

## 1. 목표

Main Agent가 전달한 업무 데이터를 바탕으로 A2UI 화면을 판단하고 만드는 핵심 기능을 Python Proxy Agent 안에서 수행한다.

활성 템플릿은 다음 세 개다.

| 템플릿 ID | 라벨 | 용도 |
| --- | --- | --- |
| `collection.list` | 목록 | 제목과 설명 중심의 단순 목록 |
| `collection.cardGrid` | 카드 그리드 | 이미지와 메타데이터 중심 카드 |
| `matrix.table` | 데이터 테이블 | 여러 scalar 컬럼의 행 단위 비교 |

Admin, MCP, A2A A2UI Agent, 별도 Surface Planner 서버는 실행하지 않아도 된다. 기존 Admin과 A2A 코드는 나중에 다시 사용할 수 있도록 삭제하거나 변경하지 않는다.

## 2. 최종 책임 분리

### Main Agent

- 사용자 요청에서 업무 데이터 의도를 찾는다.
- 현재는 내부 로컬 데이터 제공자를 사용한다.
- 텍스트 이벤트와 원본 `data_result`를 Proxy에 전달한다.
- A2UI 템플릿 선택, 점수 계산, 필드 매핑을 하지 않는다.

### Proxy Agent

- `data_result`에서 반복 row와 필드를 찾는다.
- AI에 전달할 최대 10개 row, 20KB의 샘플을 만든다.
- secret, token, password, authorization, cookie, phone, email 계열 필드를 마스킹한다.
- 해당 민감 필드는 AI가 화면에 매핑하지 못하도록 derived schema의 field 후보에서도 제외한다.
- 데이터 타입, format, 역할, capability를 포함한 derived schema를 만든다.
- 세 템플릿 계약을 모두 OpenAI에 보내 스키마 적합도와 사용자 의도 적합도를 평가한다.
- 세 후보의 점수와 이유, 추천 하나를 `display_options`로 반환한다.
- 사용자가 실제로 선택한 템플릿에 대해 두 번째 OpenAI 호출로 source path와 template slot을 매핑한다.
- AI 응답을 코드에서 재검증한 뒤 원본 row를 선택 템플릿용 canonical schema로 변환한다.
- 최종 Surface를 만든다.

## 3. 런타임 흐름

```text
Chatbot
  → Proxy /chat/stream
    → Main Agent /chat/stream
      → data_result
    → bounded/masked sample 생성
    → derived schema 생성
    → OpenAI 1차 호출
      → 3개 템플릿 모두 schemaFit, intentFit, score 평가
      → 추천 템플릿 1개 선택
    → display_options
  → 사용자 템플릿 선택
  → Proxy /display-selection/stream
    → OpenAI 2차 호출
      → 선택 템플릿의 required/optional slot에 source path 매핑
    → 매핑 검증
    → canonical data 변환
    → Surface 생성
```

두 AI 단계 모두 Proxy 프로세스가 OpenAI Chat Completions API를 직접 호출한다. OpenAI API의 `response_format`은 사용하지 않는다. 대신 프롬프트에 출력 JSON 스키마와 JSON 객체 하나만 반환하라는 규칙을 포함한다. AI 출력이 구조 또는 데이터 스키마 검증을 통과하지 못하면 한 번 교정 요청한다.

## 4. AI 판단과 검증 규칙

### 4.1 템플릿 평가

AI는 다음 값을 세 템플릿 모두에 반환해야 한다.

- `decision`: `select` 또는 `reject`
- `score`: 종합 점수
- `schemaFit`: derived schema와 템플릿 required slot의 적합도
- `intentFit`: 사용자 요청과 화면 방식의 적합도
- `reason`: 데이터에 근거한 평가 이유

Proxy는 다음을 검증한다.

- 정확히 세 템플릿이 한 번씩 평가되었는가
- 정확히 한 후보가 `select`인가
- `selectedTemplateId`와 `select` 후보가 같은가
- 모든 점수가 0~1 범위인가
- 선택 후보가 최고 종합 점수인가
- 모든 후보에 평가 이유가 있는가

### 4.2 필드 및 슬롯 매핑

AI는 사용자가 선택한 템플릿을 바꿀 수 없다. derived schema의 `fields[].path`에 존재하는 정확한 path만 사용할 수 있다.

- 공통 required mapping: `titleSourcePath`
- optional mapping: content, image, category, status
- table mapping: title 외 scalar column 2~6개

Proxy는 path 존재 여부, slot별 허용 타입, 이미지 URI 역할, 중복 컬럼, 테이블 최소 컬럼 수를 검증한다.

검증 후 Proxy가 source row를 다음 canonical field로 변환한다.

```text
title, content, image, category, status
```

테이블의 추가 컬럼은 source path를 기반으로 충돌 없는 canonical field 이름을 만들고 `fieldMapping.fields`에 연결한다.

## 5. 실패 처리

AI는 이 기능의 핵심이므로 다음 상황에서 기존의 필드명 별칭/컬럼 수 기반 추천으로 조용히 우회하지 않는다.

- `OPENAI_API_KEY`가 없음
- OpenAI 요청 실패
- 구조화 출력 파싱 실패
- 세 후보 평가 계약 위반
- 선택 템플릿 변경
- derived schema에 없는 path 매핑
- template slot 타입 불일치

이 경우 Proxy는 SSE `error`와 `done(mode=error)`를 반환한다. 빈 데이터나 표시 가능한 field가 없는 데이터만 `text_fallback`으로 처리한다.

## 6. 서버 구성

Proxy 폴더만 복사한 환경에서는 다음과 같이 실행한다.

```bash
cd a2ui-proxy-agent
cp .env.example .env.local
python3 run.py
```

`run.py`는 `.venv` 생성, `requirements.txt` 설치, Uvicorn 실행을 자동 처리한다. 모듈을 별도로 수동 설치할 필요가 없다.

필수 설정은 다음 두 값이다.

```env
MAIN_AGENT_URL=http://main-agent-host:8000
OPENAI_API_KEY=...
```

전체 설정:

| 환경 변수 | 필수 여부 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `MAIN_AGENT_URL` | 배포 시 필수 | `http://localhost:8000` | Main Agent base URL |
| `OPENAI_API_KEY` | 필수 | 없음 | Proxy 내부 AI 플래너 인증 |
| `OPENAI_MODEL` | 선택 | `gpt-4.1-mini` | 템플릿 평가와 필드 매핑 모델 |
| `OPENAI_BASE_URL` | 선택 | `https://api.openai.com/v1` | OpenAI-compatible `/v1` base URL |
| `A2UI_AI_TIMEOUT_SECONDS` | 선택 | `100` | 각 AI 호출 timeout |
| `A2UI_FLOW_LOG_MAX_CHARS` | 선택 | `50000` | 단계별 flow log 최대 문자 수 |
| `MAIN_AGENT_TIMEOUT_SECONDS` | 선택 | `45` | Main Agent SSE timeout |
| `A2UI_SELECTION_TTL_SECONDS` | 선택 | `300` | 선택 컨텍스트 유지 시간 |
| `A2UI_PROXY_HOST` | 선택 | `0.0.0.0` | bind host |
| `A2UI_PROXY_PORT` 또는 `PORT` | 선택 | `8200` | bind port |

`/health`에서는 다음 상태를 확인할 수 있다.

```json
{
  "templateMode": "proxy-ai",
  "aiPlanner": "openai-structured-output",
  "aiConfigured": true,
  "templateIds": [
    "matrix.table",
    "collection.cardGrid",
    "collection.list"
  ]
}
```

## 7. Redis 없는 운영

선택 전 원본 데이터, derived schema, AI 추천 결과는 Proxy의 메모리 `SelectionStore`에 보관한다. Redis 없이 동작하지만 첫 배포는 다음 조건을 따른다.

- 단일 Proxy replica
- 단일 worker process
- Proxy 재시작 시 진행 중인 `selectionId`가 사라지는 것을 허용

다중 replica가 필요하면 sticky session 또는 공유 저장소가 필요하다. Redis는 Python 모듈 설치에 필요한 것이 아니라 다중 인스턴스가 선택 상태를 공유할 때만 필요한 선택 사항이다.

### 단계별 서버 로그

Proxy 표준 출력에는 `[a2ui-proxy-agent][flow]` 접두사의 JSON 로그가 순서대로 기록된다.

```text
요청 원문 수신
→ Main Agent 호출 직전 입력
→ Main Agent에서 받은 각 SSE 이벤트
→ schema 변환 직전 data_result
→ sample/derived schema 결과
→ AI 템플릿 비교 직전 입력과 완료 결과
→ OpenAI structured request와 원본 response
→ display options
→ 사용자 선택 원문
→ AI slot mapping 직전 입력과 완료 결과
→ OpenAI structured request와 원본 response
→ Surface 생성 직전 입력과 완료 결과
```

각 처리 직전 로그는 `previousResult`, 처리 완료 로그는 `result`에 값을 담는다. 민감 필드는 마스킹하며 큰 로그는 `A2UI_FLOW_LOG_MAX_CHARS`에서 자르고 잘린 문자 수를 표시한다.

## 8. 수정 파일

```text
packages/a2ui-proxy-agent/
├─ .env.example
├─ README.md
├─ app/
│  ├─ ai_planner.py          # OpenAI 2단계 structured-output planner
│  ├─ config.py              # OpenAI runtime 설정
│  ├─ derived_schema.py      # bounded preview와 데이터 스키마
│  ├─ main.py                # AI planner health 정보
│  ├─ orchestrate.py         # Main → schema → AI → 선택 → AI → Surface
│  ├─ selection_store.py     # AI planning context 보관
│  ├─ static_templates.py    # 정확히 3개 템플릿 전체 계약
│  └─ surface_builder.py     # AI mapping 기반 canonical 변환과 Surface
└─ tests/
   ├─ test_ai_planner.py
   ├─ test_derived_schema.py
   ├─ test_proxy_orchestrate.py
   ├─ test_selection_store.py
   ├─ test_surface_builder.py
   └─ test_run.py
```

Admin, MCP, Next A2A 관련 파일은 이번 수정 범위에 포함하지 않는다.

## 9. 검증 결과

- Proxy 단위 테스트 28개 통과
- 실제 OpenAI 1차 호출에서 세 템플릿 점수와 추천 결과 확인
- 실제 OpenAI 2차 호출에서 title/image source path 매핑 확인
- Main Agent와 Proxy만 실행한 SSE 통합 검증 통과
- 통합 요청 결과:
  - `proxy_schema_derived`
  - `proxy_ai_template_selection`
  - 후보 3개와 각각의 점수
  - `proxy_ai_slot_mapping`
  - `strategy=proxy_ai_schema_planner` Surface
- Admin, MCP, A2A 서버를 실행하지 않은 상태에서 동작 확인

검증 명령:

```bash
npm run proxy-agent:test
curl http://localhost:8200/health
```

## 10. 완료 조건

- [x] 세 템플릿 전체 계약을 Proxy에 내장
- [x] bounded preview와 민감정보 마스킹
- [x] derived schema 생성
- [x] AI가 세 템플릿 모두 비교하고 점수화
- [x] AI 추천 이유와 후보별 이유 반환
- [x] 사용자 선택 후 AI가 필드와 슬롯 매핑
- [x] AI mapping을 코드로 검증
- [x] 원본 데이터를 선택 템플릿 schema로 변환
- [x] 고정 규칙 fallback 제거
- [x] Admin, MCP, A2A 서버 없는 실행
- [x] Redis 없는 단일 인스턴스 실행
- [x] 실제 OpenAI와 Main → Proxy 통합 검증
