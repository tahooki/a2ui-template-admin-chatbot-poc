# A2UI Proxy Agent 고정 3종 템플릿 직접 생성 수정 계획

작성일: 2026-07-22
상태: Proxy 구현 완료 / 서버 배포 구성 계획 수립

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

## 8. 서버 배포 구성 계획

### 8.1 현재 상태와 배포 목표

현재 Proxy 폴더는 Python 3.10 이상이 설치된 환경에서 `python3 run.py`만 실행하면 전용 `.venv` 생성, `requirements.txt` 설치, Uvicorn 실행까지 자동 처리한다. 이 방식은 로컬 개발과 일반 VM에서 바로 실행하기 위한 구성이다.

실제 서버에 배포할 때는 Proxy를 독립 Docker 서비스로 패키징한다. Python과 모든 모듈을 이미지 빌드 시점에 포함하여, 배포 서버에서 별도로 가상환경을 만들거나 `pip install`을 실행하지 않도록 한다.

```text
Chatbot API
→ A2UI Proxy 컨테이너:8200
→ MAIN_AGENT_URL
→ Main Agent 서버
```

Proxy 배포 서버에는 Redis, MCP 서버, 템플릿 Admin, A2A 서버가 필요하지 않다. 단, `MAIN_AGENT_URL`로 지정한 Main Agent의 `POST /chat/stream` SSE endpoint에 네트워크로 접근할 수 있어야 한다.

### 8.2 추가할 배포 파일

후속 서버 배포 작업에서는 Proxy 패키지 안에 다음 파일을 추가한다.

```text
packages/a2ui-proxy-agent/
├─ Dockerfile       # Python runtime과 requirements를 포함한 실행 이미지
└─ .dockerignore    # .venv, cache, test 산출물을 이미지에서 제외
```

Docker 이미지는 다음 원칙으로 구성한다.

1. Python 3.12 slim 이미지를 기반으로 한다.
2. `requirements.txt`를 먼저 복사하고 이미지 빌드 중 의존성을 설치한다.
3. Proxy 소스만 이미지에 복사한다.
4. 컨테이너에서는 `python run.py --no-install`로 실행한다.
5. `0.0.0.0`과 배포 환경이 주입한 `PORT`에 bind한다.
6. `/health`를 load balancer와 container health check에 사용한다.

예상 Dockerfile은 다음과 같다.

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV A2UI_PROXY_HOST=0.0.0.0
ENV A2UI_PROXY_PORT=8200

EXPOSE 8200

CMD ["python", "run.py", "--no-install"]
```

### 8.3 배포 환경 변수

| 환경 변수 | 필수 여부 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `MAIN_AGENT_URL` | 배포 시 필수 | `http://localhost:8000` | Main Agent base URL |
| `PORT` | 플랫폼에 따라 필요 | `8200` | Proxy 공개 포트 |
| `A2UI_PROXY_HOST` | 선택 | `0.0.0.0` | Proxy bind host |
| `MAIN_AGENT_TIMEOUT_SECONDS` | 선택 | `45` | Main Agent 응답 timeout |
| `A2UI_SELECTION_TTL_SECONDS` | 선택 | `300` | 메모리 선택 컨텍스트 유지 시간 |

민감한 값이 생기더라도 Docker 이미지나 `.env.local`을 이미지에 포함하지 않고, 배포 플랫폼의 환경 변수 또는 secret 기능으로 주입한다.

### 8.4 Redis 없는 운영 제약

`SelectionStore`는 Proxy 프로세스 메모리를 사용한다. 따라서 Redis 없이 운영하는 첫 배포는 다음 조건을 따른다.

- Proxy replica를 1개로 운영한다.
- Proxy 재시작 시 진행 중인 선택 컨텍스트가 사라지는 것을 허용한다.
- 여러 worker process를 사용하지 않는다.
- 다중 replica가 꼭 필요하면 load balancer sticky session을 적용하거나, 이후 별도 공유 저장소를 도입한다.

단일 replica에서는 현재 구조 그대로 Redis 없이 동작한다. 다중 replica에 일반 round-robin을 사용하면 표시 방식 선택 요청이 다른 프로세스로 전달되어 `selectionId`를 찾지 못할 수 있다.

### 8.5 배포 절차와 검증

```bash
docker build -t a2ui-proxy-agent packages/a2ui-proxy-agent
docker run --rm \
  -p 8200:8200 \
  -e MAIN_AGENT_URL=http://main-agent:8000 \
  a2ui-proxy-agent
curl http://localhost:8200/health
```

서버 배포 완료 조건은 다음과 같다.

- [ ] `Dockerfile`과 `.dockerignore` 추가
- [ ] 이미지 빌드 중 requirements 설치 확인
- [ ] 컨테이너 시작 시 runtime `pip install`이 실행되지 않는지 확인
- [ ] `/health` container 및 load balancer health check 연결
- [ ] 배포 환경의 `MAIN_AGENT_URL`로 Main Agent SSE 연결 확인
- [ ] 단일 replica에서 표시 방식 선택과 Surface 생성 E2E 확인
- [ ] 재시작 시 진행 중 선택이 만료될 수 있음을 운영 문서에 명시

## 9. 완료 조건

- 변경 파일이 문서와 `packages/a2ui-proxy-agent` 아래에만 존재한다.
- Proxy가 Main Agent 외의 Agent, MCP, Admin API를 호출하지 않는다.
- 데이터 요청에 정확히 세 개의 표시 방식이 제공된다.
- 세 템플릿 모두 Proxy가 직접 SurfaceEnvelope를 생성한다.
- 선택 전 원본 업무 데이터가 브라우저에 노출되지 않는다.
- 기존 Admin과 A2A 관련 파일 및 route가 그대로 남아 있다.
