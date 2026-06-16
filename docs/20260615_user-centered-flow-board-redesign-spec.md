# User-Centered Flow Board Redesign Spec

Date: 2026-06-15

## 1. 목적

이 문서는 A2UI Agent Flow Board를 다시 설계하기 위한 사용자 중심 UI/UX 기준 문서다.

이전 체크리스트는 DOM 존재, 버튼 동작, 로그 발생처럼 기능 검수에 치우쳐 있었다. 그 결과 사용자가 실제로 보는 화면에서는 가운데 보드가 답답하고, 좌우 pan이 거의 되지 않고, actor/step 박스가 깨져 보였는데도 통과처럼 보였다.

이번 문서의 기준은 다르다.

- 사용자가 처음 봤을 때 무엇을 이해하는가
- 사용자가 마우스로 보드를 잡았을 때 큰 캔버스를 탐색한다고 느끼는가
- Figma처럼 넓은 작업판을 viewport camera로 보고 있다고 느끼는가
- 각 agent, 데이터, registry, fallback 경로가 시각적으로 읽히는가
- 실행 중인 단계에 맞춰 camera가 자동으로 focus되는가
- 실행 중인 흐름이 "불 들어오는 보드"처럼 살아 보이는가
- 로그가 보드의 상태를 신뢰하게 만드는가

## 2. 사용자가 느껴야 하는 것

### 첫 인상

사용자는 화면에 들어오자마자 이렇게 느껴야 한다.

> "오른쪽에서 채팅을 치면, 가운데 큰 보드에서 Agent가 어디를 거쳐 처리하는지 움직이며 보여주는구나."

느껴지면 안 되는 것:

- "작은 표를 억지로 구겨 넣었네."
- "박스 글자가 깨져서 뭘 봐야 할지 모르겠다."
- "좌우로 움직이는 캔버스라더니 사실 거의 안 움직이네."
- "그냥 스크롤 영역이지, Figma 같은 작업판 느낌은 아니다."
- "작동 중인데 카메라가 어디를 봐야 하는지 잡아주지 않는다."
- "로그는 있는데 보드랑 무슨 관계인지 모르겠다."

### 채팅 전

채팅 전 상태에서 사용자는 전체 구조를 어렴풋이 파악해야 한다.

- 왼쪽은 템플릿/Registry 준비 영역
- 오른쪽은 사용자가 요청을 넣는 Chat 영역
- 가운데는 가장 중요한 실행 관측 영역
- 가운데 상단은 큰 flow canvas
- 가운데 하단은 system log

채팅 전에는 모든 step을 완벽히 이해할 필요는 없다. 대신 "여기에서 실행 흐름이 켜지겠구나"라는 기대가 생겨야 한다.

### 채팅 중

사용자가 prompt를 보내면 다음 감각이 있어야 한다.

- 지금 어떤 node/edge가 실행 중인지 눈이 따라간다.
- camera가 현재 중요한 node/edge 묶음을 viewport 중앙으로 데려온다.
- zoom level이 실행 관찰에 적합한 크기로 자동 정렬된다.
- 완료된 경로는 남아서 "여기를 지나왔구나"가 보인다.
- 아직 가지 않은 branch는 흐리게 남아 있다.
- 성공/실패/error가 다른 길이라는 것이 색과 위치로 느껴진다.
- 아래 log가 같은 사건을 시간순으로 증명한다.

### 채팅 후

사용자는 결과를 보고 이렇게 말할 수 있어야 한다.

> "이 요청은 데이터 API를 조회했고, A2UI Agent가 schema/profile을 만들고, registry에서 template을 찾고, matcher가 성공해서 SurfaceEnvelope로 끝났구나."

또는:

> "이 요청은 데이터는 가져왔지만 맞는 template이 없어서 fallback text로 끝났구나. 이건 오류가 아니라 매칭 실패구나."

## 3. 화면 구조

기본 구조는 유지한다.

```text
┌────────────────────────────────────────────────────────────────┐
│ A2UI Studio                                           Reset     │
├──────────────┬──────────────────────────────────────┬──────────┤
│ Templates    │ Agent Flow Board                      │ Chat     │
│ Registry     │ ┌──────────────────────────────────┐ │ Prompt   │
│              │ │ Large Navigable Canvas            │ │ Result   │
│              │ │ nodes / edges / active packet     │ │          │
│              │ ├──────────────────────────────────┤ │          │
│              │ │ System Log                        │ │ Composer │
└──────────────┴──────────────────────────────────────┴──────────┘
```

우선순위:

1. 가운데 Flow Board가 주인공이다.
2. 오른쪽 Chat은 실행을 시작하고 결과를 확인하는 곳이다.
3. 왼쪽 Templates는 보드의 Registry/Template 맥락을 제공한다.

## 4. Flow Board 설계

### 4.1 큰 캔버스 원칙

Flow Board는 한 화면에 모든 것을 구겨 넣는 sequence table이 아니다. 사용자는 큰 캔버스를 탐색해야 한다.

필수 기준:

- 기본 100% zoom에서 canvas scrollWidth는 viewport width의 최소 1.6배 이상이어야 한다.
- 권장 canvas width는 desktop 기준 1200px 이상이다.
- actor node는 최소 120px, 권장 140px 이상의 폭을 가진다.
- 주요 label은 보기 싫게 두세 글자 단위로 쪼개지면 안 된다.
- 좌우 drag 후 scrollLeft가 최소 200px 이상 바뀔 수 있어야 한다.
- "7개 actor가 한 화면에 다 보인다"는 목표가 아니다. 중요한 것은 "큰 보드를 탐색하는 느낌"이다.

현재 실패 예시:

```text
viewport width: 567
canvas scrollWidth: 568
actor box width: 68
```

이 상태는 기능적으로 렌더링되어도 UX 기준으로 받아들이면 안 된다. 좌우 pan이 거의 불가능하고, actor label이 깨져 보이기 때문이다.

### 4.2 Actor 표현

Actor는 좁은 lane label이 아니라 노드처럼 보여야 한다.

필수 actor:

- Chat UI
- Next /api/chat
- Python Agent / Bridge
- A2UI Agent
- LLM
- Business DB/API
- A2UI Registry

표현 기준:

- 각 actor는 120~160px 폭의 node header로 보인다.
- `Python Agent / Bridge`와 `A2UI Agent`는 서로 다른 책임으로 확실히 분리된다.
- `Renderer`는 actor로 만들지 않는다.
- A2A/MCP는 actor가 아니라 transport detail로 log나 small badge에만 나타난다.

### 4.3 Step / Edge 표현

Step은 단순한 작은 pill이 아니라 "이 시점에 어떤 메시지가 이동한다"는 느낌을 줘야 한다.

기본 step:

- POST /api/chat
- Open /chat/stream
- Delegate turn
- Intent classify
- Text answer
- Query business data
- Build profile/schema
- Load template contracts
- Match template/fields
- Emit SurfaceEnvelope
- No compatible template
- Emit fallback text
- Runtime error

표현 기준:

- edge는 충분히 길어야 한다.
- label은 edge 위 또는 옆에 붙되, 선과 겹쳐 읽기 어려우면 안 된다.
- self-loop는 너무 작은 원형 선으로 뭉개지지 않아야 한다.
- active edge는 색, 두께, glow, packet 중 최소 2가지로 강조한다.

### 4.4 Branch 표현

Branch는 "작은 박스 몇 개"가 아니라 사용자가 결과 경로를 이해하는 구획이어야 한다.

Branch:

| Branch | 사용자 해석 | 시각적 느낌 |
| --- | --- | --- |
| general | 데이터 작업이 아니라 일반 답변 | 짧은 회색/teal 경로 |
| data | 데이터 기반 A2UI 처리 시작 | 중심 trunk path |
| matched | template 매칭 성공 | 초록/teal success route |
| no_template | 데이터는 있으나 template 없음 | amber fallback route |
| error | 실제 장애 | red error route |

중요:

- `no_template`은 error가 아니다.
- 성공 경로에서 fallback warning이 보이면 안 된다.
- error는 no_template과 색, label, log severity가 분리되어야 한다.

## 5. Canvas Interaction 설계

이 보드는 단순 scrollable div가 아니라 Figma 같은 canvas viewport로 설계한다.

내부 모델은 다음 개념을 가져야 한다.

```text
camera = {
  x: number,
  y: number,
  zoom: number,
  target: activeFocusRegion | userControlled
}
```

사용자가 보는 화면은 canvas 전체가 아니라 camera viewport다. drag는 camera를 움직이는 행위이고, zoom은 camera scale을 바꾸는 행위다. 실행 중 auto-focus는 camera target을 active step에 맞춰 옮기는 행위다.

### 5.1 Pan

사용자는 캔버스 아무 빈 곳이나 잡고 움직일 수 있어야 한다.

완료 조건:

- 기본 100% zoom에서 좌우 drag가 가능하다.
- drag 후 `scrollLeft`가 200px 이상 이동 가능한 여유가 있다.
- 세로 drag도 가능하지만, 세로 이동만 되는 것은 pan 통과가 아니다.
- cursor는 grab/grabbing으로 바뀐다.
- drag 중 text selection이 일어나지 않는다.

수정이 필요한 상태:

- `scrollWidth`가 viewport와 거의 같아 좌우 이동이 안 된다.
- zoom-in 해야만 좌우 이동이 조금 된다.
- scroll bar만 있고 마우스 drag로는 움직이지 않는다.

### 5.2 Zoom

Zoom은 보드 탐색과 실행 focus를 돕는 camera scale이다.

필수:

- Zoom out
- Zoom in
- Reset
- 현재 zoom %

권장:

- 기본 zoom은 90~100% 사이에서 시작한다.
- zoom out은 "더 넓은 맥락 보기"에 유용해야 한다.
- zoom in은 "특정 branch 자세히 보기"에 유용해야 한다.
- zoom controls는 actor나 step을 가리지 않는다.
- 채팅 실행이 시작되면 관찰용 focus zoom으로 자동 정렬된다.
- focus zoom은 글자를 읽을 수 있으면서 주변 node 맥락도 남겨야 한다.

### 5.3 Camera Focus / Auto-follow

실행 중에는 active step을 따라가는 것이 아니라, active step을 이해하는 데 필요한 node/edge 묶음을 camera 중앙에 둔다.

핵심 감각:

> "보드 위에서 카메라가 다음 처리 단계로 부드럽게 이동한다."

기준:

- 새 turn이 시작되면 request 근처로 이동한다.
- active step이 바뀌면 focus target도 바뀐다.
- focus target은 작은 label 하나가 아니라 이해에 필요한 컴포넌트 묶음이다.
- active target이 viewport 중앙 40% 영역 안에 들어와야 한다.
- 필요하면 zoom을 focus zoom으로 자동 조정한다.
- 이동은 순간이동이 아니라 smooth pan/zoom이어야 한다.
- active step이 viewport 밖으로 나가면 부드럽게 따라간다.
- 사용자가 방금 drag한 경우에는 auto-follow를 잠시 멈추거나 과도하게 튀지 않는다.

권장 focus target:

| Runtime phase | Camera focus target |
| --- | --- |
| request | Chat UI -> Next /api/chat edge |
| bridge | Next /api/chat -> Python Agent / Bridge edge |
| planning | Python Agent / Bridge -> A2UI Agent edge |
| intent | A2UI Agent + LLM edge |
| data_loaded | A2UI Agent + Business DB/API edge |
| profile | A2UI Agent 내부 profile/schema 영역 |
| registry_loaded | A2UI Agent + A2UI Registry edge |
| matcher | A2UI Agent 내부 matcher 영역 + Registry context |
| surface | matched route + SurfaceEnvelope + Chat UI 도착점 |
| no_template | no_template branch + fallback route 시작점 |
| text_fallback | fallback route + Chat UI 도착점 |
| error | error route + Chat UI 도착점 |

수정이 필요한 상태:

- active step이 바뀌어도 camera가 움직이지 않는다.
- camera가 label 하나만 따라가서 주변 맥락을 잃는다.
- zoom이 너무 작아 글자를 읽기 어렵다.
- zoom이 너무 커서 현재 단계가 어디서 온 것인지 모른다.
- 사용자가 drag 중인데 auto-follow가 계속 빼앗아 간다.

## 6. System Log 설계

System Log는 "보드가 진짜 이벤트에 반응한다"는 신뢰를 준다.

필수 표시:

- time
- phase
- label
- detail
- severity

사용자가 읽어야 하는 것:

- request가 시작됨
- bridge가 stream을 열었음
- intent가 data/general로 판정됨
- data/profile/registry/matcher가 실행됨
- surface/fallback/error 중 어디로 끝났는지

금지:

- raw DB rows 전체를 그대로 출력
- 긴 detail이 패널 밖으로 밀림
- 성공 경로에 warning처럼 보이는 fallback 표시

## 7. 사용자 여정

### Journey A: 일반 챗팅

1. 사용자가 `안녕`을 입력한다.
2. 보드는 Chat UI -> Next -> Python Bridge -> A2UI Agent -> LLM 흐름을 보여준다.
3. data branch는 흐리게 남는다.
4. Text answer 경로가 켜진다.
5. log에는 `general_chat`과 text answer가 쌓인다.

사용자 느낌:

> "이건 데이터 UI 생성이 아니라 그냥 답변으로 끝났구나."

### Journey B: 매칭 성공

1. 사용자가 `장비 상태 목록 보여줘`를 입력한다.
2. 보드는 data trunk를 따라간다.
3. Business DB/API, profile/schema, registry, matcher가 순서대로 켜진다.
4. matched branch가 켜지고 SurfaceEnvelope로 끝난다.
5. Chat에는 A2UI surface가 나온다.

사용자 느낌:

> "Agent가 데이터를 가져와서 등록된 템플릿과 맞춘 뒤 UI를 만들었구나."

### Journey C: 매칭 불가

1. 사용자가 `장비 목록 보여줘`를 입력한다.
2. 보드는 data trunk를 따라간다.
3. matcher 이후 no_template branch로 갈라진다.
4. fallback text가 켜진다.
5. log는 warning이지만 error는 아니다.

사용자 느낌:

> "데이터 처리는 됐지만 맞는 A2UI template이 없어서 텍스트로 답했구나."

### Journey D: 실제 오류

1. API 또는 agent stream에서 실제 오류가 발생한다.
2. 보드는 fallback이 아니라 error branch로 이동한다.
3. log severity는 error다.
4. Chat에는 사용자에게 이해 가능한 오류 문장이 표시된다.

사용자 느낌:

> "이건 template 부족이 아니라 시스템 문제가 생긴 거구나."

## 8. TODO List

이 문서는 점수표가 아니라 수정 작업을 끝까지 밀고 가기 위한 TODO list다. 각 항목은 화면 확인 후 `Done`, `Doing`, `Blocked`, `Needs revision` 중 하나로 상태를 갱신한다.

### 8.0 Browser Verification Evidence

| Code | Evidence |
| --- | --- |
| D1 | Desktop first load: viewport 567px, canvas scrollWidth 1496px, ratio 2.64, actor width 140px, body 1170/1170 with no page-level horizontal scroll. |
| D2 | Desktop 100% drag: canvas drag changed scrollLeft from 0 to 400. |
| D3 | Zoom controls: zoom out 90%, zoom in 100%, reset 100% with scrollLeft 0. |
| D4 | Matched flow: `상태 목록` completed with surface, camera target `matched`, zoom 95%, System Log reached `Completed with surface`. |
| D5 | No-template flow: `장비 목록` completed with text, camera target `no_template`, zoom 95%, `No compatible template` and `Emit fallback text` fully visible. |
| D6 | Error flow: `오류 테스트` development probe emitted error SSE, camera target `error`, red `Runtime error` route visible, System Log reached `Completed with error`. |
| D7 | General chat flow: `안녕` completed with text, camera target `general`, zoom 95%, `Text answer` visible, System Log reached `Completed with text`. |
| M1 | Mobile 390x844: Admin -> Flow Board -> Chat stack order, body 390/390 with no page-level horizontal scroll, canvas ratio 3.84. |
| M2 | Mobile drag: internal canvas drag changed scrollLeft from 0 to 300. |
| V1 | Browser console warning/error logs: empty list. |
| V2 | `npm run lint` passed with one existing `<img>` warning, `npm run build` passed, `npm run python-agent:test` passed 7 tests. |

### 8.1 First Impression

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] 첫 화면에서 가운데 Flow Board가 주인공으로 보이게 한다. | Done | D1 | 유지 |
| [x] 사용자가 "큰 캔버스를 탐색한다"는 기대를 가지게 만든다. | Done | D1, D2 | 유지 |
| [x] Admin/Chat이 중앙 보드를 압도하지 않게 유지한다. | Done | D1 | 유지 |
| [x] 화면이 landing/설명 페이지가 아니라 실제 도구처럼 바로 시작하게 한다. | Done | D1 | 유지 |
| [x] 빈 상태에서도 실행 흐름이 시작될 위치가 예상되게 한다. | Done | D1 | 유지 |

### 8.2 Canvas Exploration

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] 기본 100% zoom에서 canvas scrollWidth가 viewport width의 1.6배 이상이 되게 한다. | Done | D1 ratio 2.64 | 유지 |
| [x] 기본 100% zoom에서 좌우 drag 후 scrollLeft가 200px 이상 이동 가능하게 한다. | Done | D2 delta 400 | 유지 |
| [x] 세로 이동만으로 pan 완료 처리하지 않는다. | Done | D2 horizontal delta measured | 유지 |
| [x] Zoom out/in/reset이 보드 탐색에 실제로 도움이 되게 한다. | Done | D3 | 유지 |
| [x] Zoom controls가 actor/step/log를 가리지 않게 한다. | Done | D1, D3 screenshots | 유지 |
| [x] drag 중 cursor와 interaction이 직접 조작하는 느낌을 주게 한다. | Done | D2, M2 | 유지 |
| [x] 캔버스에 여백과 확장감이 있어 Figma 같은 작업판 느낌이 나게 한다. | Done | D1, D2 | 유지 |
| [x] mobile에서도 canvas 내부 pan/zoom을 유지한다. | Done | M1, M2 | 유지 |

### 8.3 Node / Label Readability

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] Actor node 폭을 충분히 키워 label이 보기 싫게 깨지지 않게 한다. | Done | D1 actor 140px | 유지 |
| [x] `Python Agent / Bridge`와 `A2UI Agent`가 책임이 다른 노드로 보이게 한다. | Done | D1, D2 screenshots | 유지 |
| [x] Step label이 선/노드와 겹쳐 읽기 어려워지지 않게 한다. | Done | D4, D5, D6 screenshots | 유지 |
| [x] Branch block이 흐름을 돕는 구획처럼 보이게 한다. | Done | D4, D5, D6 | 유지 |
| [x] Active/complete/muted 상태를 색과 강도로 분리한다. | Done | D4 success, D5 warning, D6 error | 유지 |
| [x] 전체 보드가 과하게 압축되어 보이지 않게 한다. | Done | D1 ratio 2.64 | 유지 |

### 8.4 Camera Focus Behavior

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] 채팅 turn 시작 시 camera가 실행 관찰에 적합한 zoom으로 자동 정렬되게 한다. | Done | D4, D5, D6 zoom 95% | 유지 |
| [x] active phase가 바뀔 때 관련 node/edge 묶음이 viewport 중앙 40% 영역에 들어오게 한다. | Done | D4 planning/profile/matched, D5 planning/profile/no_template | 유지 |
| [x] camera 이동이 순간이동처럼 튀지 않고 smooth pan/zoom으로 느껴지게 한다. | Done | D4, D5, D6 smooth scroll behavior observed | 유지 |
| [x] focus target이 label 하나가 아니라 이해 가능한 컴포넌트 묶음이 되게 한다. | Done | D4, D5, D6 branch focus | 유지 |
| [x] 사용자가 직접 drag/pan 중일 때 auto-follow가 조작을 빼앗지 않게 한다. | Done | D2, camera user mode pause implemented | 유지 |
| [x] matched/no_template/error 결과 위치로 camera가 명확히 이동하게 한다. | Done | D4, D5, D6 | 유지 |
| [x] focus zoom에서도 label을 읽을 수 있고 주변 node 맥락이 남게 한다. | Done | D4, D5, D6 screenshots | 유지 |
| [x] 수동 pan 이후에도 새 turn이 시작되면 auto-follow mode로 자연스럽게 복귀하게 한다. | Done | D2 followed by D4/D5/D6 | 유지 |
| [x] 현재 focus target이 시각적으로 camera의 중심 대상처럼 느껴지게 한다. | Done | D4, D5, D6 | 유지 |

### 8.5 Runtime Story Clarity

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] 일반 챗팅은 짧은 text answer 경로로 이해되게 한다. | Done | D7 | 유지 |
| [x] 데이터 요청은 DB/API, profile, registry, matcher를 거치는 중심 경로로 이해되게 한다. | Done | D4, D5 log sequence | 유지 |
| [x] 매칭 성공은 SurfaceEnvelope 도착으로 명확히 끝나게 한다. | Done | D4 | 유지 |
| [x] 매칭 불가는 no_template/fallback으로 보이고 error와 혼동되지 않게 한다. | Done | D5 | 유지 |
| [x] 실제 오류는 fallback과 다른 error route로 보이게 한다. | Done | D6 | 유지 |
| [x] A2A/MCP는 actor가 아니라 transport detail로만 보이게 한다. | Done | D4, D5 log detail only | 유지 |
| [x] 보드는 실제 이벤트에 반응하며 fake animation처럼 보이지 않게 한다. | Done | D4, D5, D6 event-driven camera targets | 유지 |
| [x] 실행 후 사용자가 "왜 이 결과가 나왔는지" 말할 수 있게 한다. | Done | D4, D5, D6 board + chat + log alignment | 유지 |

### 8.6 Log Trust

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] Log가 보드와 같은 사건을 같은 순서로 보여주게 한다. | Done | D4, D5, D6 | 유지 |
| [x] phase/label/detail이 빠르게 훑어 읽히게 한다. | Done | D4, D5, D6 screenshots | 유지 |
| [x] success/warning/error severity가 직관적으로 구분되게 한다. | Done | D4, D5, D6 | 유지 |
| [x] 긴 detail과 row가 layout을 밀거나 깨지지 않게 한다. | Done | D5, D6 | 유지 |
| [x] raw data dump 없이 요약 중심으로 유지한다. | Done | D4, D5, D6 log detail summaries | 유지 |

### 8.7 Chat / Template Context

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] Chat prompt를 실행하면 보드 변화가 바로 연결되어 느껴지게 한다. | Done | D4, D5, D6 | 유지 |
| [x] Chat 결과 surface와 Flow Board의 마지막 state가 연결되어 보이게 한다. | Done | D4 | 유지 |
| [x] Template panel은 Registry/source 맥락을 제공하지만 중앙을 방해하지 않게 한다. | Done | D1, M1 | 유지 |
| [x] Quick prompt와 composer가 좁아 보이거나 깨지지 않게 한다. | Done | D4, D5, D6, M1 | 유지 |

### 8.8 Responsive / Robustness

| Todo | Status | Evidence | Next action |
| --- | --- | --- | --- |
| [x] Desktop에서 body 전체 가로 스크롤이 없게 한다. | Done | D1 body 1170/1170 | 유지 |
| [x] Mobile에서 Admin, Flow Board, Chat 순으로 stack되게 한다. | Done | M1 | 유지 |
| [x] Mobile에서 body 전체 가로 스크롤이 없게 한다. | Done | M1 body 390/390 | 유지 |
| [x] Mobile에서도 보드가 작은 이미지처럼 죽지 않고 내부 탐색 가능하게 한다. | Done | M1, M2 | 유지 |
| [x] text/button/card가 부모 밖으로 나가지 않게 한다. | Done | D1, D4, D5, D6, M1 screenshots | 유지 |
| [x] browser console에 반복 warning/error가 없게 한다. | Done | V1 | 유지 |
| [x] build/lint/python-agent test를 통과하게 한다. | Done | V2 | 유지 |

## 9. 검수 절차

TODO 상태는 아래 순서로만 갱신한다.

1. 브라우저를 새로고침한다.
2. 첫 화면 screenshot을 본다.
3. actor/step 박스가 깨졌는지 눈으로 판단한다.
4. canvas metric을 확인한다.
   - viewport width
   - canvas scrollWidth
   - scrollWidth / viewport width
5. 기본 100% zoom에서 좌우 drag를 한다.
6. scrollLeft가 실제로 충분히 움직이는지 확인한다.
7. 채팅 turn을 시작했을 때 camera zoom이 관찰용 focus zoom으로 자동 정렬되는지 확인한다.
8. active phase가 바뀔 때 focus target이 viewport 중앙 40% 영역에 들어오는지 확인한다.
9. `안녕`, `장비 상태 목록 보여줘`, `장비 목록 보여줘`, error scenario를 실행한다.
10. board, chat, log가 같은 이야기를 하는지 본다.
11. mobile `390 x 844`에서 다시 screenshot과 metric을 확인한다.
12. 마지막에 lint/build/test를 실행한다.

주의:

- DOM에 actor text가 있다는 이유로 통과시키지 않는다.
- 세로 drag만 됐다는 이유로 pan을 통과시키지 않는다.
- zoom-in 상태에서만 좌우 이동이 되는 것은 기본 canvas 탐색 통과가 아니다.
- active phase가 바뀌는데 camera가 움직이지 않으면 실행형 보드로 통과시키지 않는다.
- focus 대상이 작은 label 하나뿐이면 통과시키지 않는다.
- 화면이 이상하면 TODO를 `Done`으로 바꾸지 않는다.

## 10. 완료 기준

다음 항목이 모두 충족되어야 이 작업을 완료로 본다.

- 기본 100% zoom에서 큰 canvas로 느껴진다.
- 좌우 pan이 확실히 된다.
- 실행 중 camera가 active node/edge 묶음을 중앙으로 focus한다.
- 실행 중 zoom이 관찰에 적합한 크기로 자동 정렬된다.
- actor/step label이 깨지지 않는다.
- 매칭 성공, 매칭 불가, 오류가 분리되어 보인다.
- 실제 브라우저 screenshot 기준으로 사용자가 납득할 수 있다.

## 11. 최종 화면에 대한 보수적 판정

초기 실패 화면은 아래와 같았다.

```text
sequence viewport width: 567
sequence scrollWidth:    568
actor label width:       68
```

이 상태는 이전 점수와 무관하게 사용자 중심 기준으로 실패였다.

최종 확인된 화면 기준:

```text
desktop viewport width: 567
desktop scrollWidth:    1496
desktop ratio:          2.64
actor node width:       140
desktop drag delta:     400
mobile viewport width:  390
mobile scrollWidth:     1496
mobile ratio:           3.84
mobile drag delta:      300
```

최종 상태:

- 기본 100%에서 큰 보드처럼 탐색된다.
- actor label이 140px 노드 안에서 읽힌다.
- desktop/mobile 모두 page-level horizontal scroll 없이 내부 canvas만 움직인다.
- matched/no_template/error 결과 branch로 camera target이 이동한다.
- focus zoom은 95%로 자동 정렬된다.
- log는 board와 같은 사건을 같은 순서로 보여준다.

## 12. 다음 구현 방향

구현 완료:

1. `laneWidth`를 152px로 키웠다.
2. canvas width를 1496px로 키웠다.
3. actor box width를 140px로 키웠다.
4. branch block과 step y/x 좌표를 큰 캔버스 기준으로 재배치했다.
5. 기본 100% zoom에서 scrollWidth / viewportWidth가 2.64임을 확인했다.
6. desktop drag로 scrollLeft가 400px 움직임을 확인했다.
7. runtime phase별 focus target map을 만들었다.
8. 채팅 turn 시작 시 focus zoom 95%로 자동 정렬되게 했다.
9. active phase 변경 시 target node/edge 묶음으로 smooth pan/zoom하게 했다.
10. 사용자가 직접 drag 중일 때 auto-follow가 잠시 멈추게 했다.
11. 실제 브라우저 검수 후 TODO 상태를 `Done`으로 갱신했다.

## 13. 최종 기준

이 Flow Board의 성공 기준은 "구성요소가 DOM에 있다"가 아니다.

성공 기준은 사용자가 화면을 보고 이렇게 느끼는 것이다.

> "이건 챗봇 뒤에서 Agent가 데이터와 템플릿을 어떻게 판단하는지 직접 관측하는 큰 실행 보드다. 내가 캔버스를 움직이며 흐름을 따라갈 수 있고, 결과가 왜 나왔는지 이해된다."

추가로 실행 중에는 이렇게 느껴져야 한다.

> "채팅을 시작하니 카메라가 보드 위를 따라 움직이면서 지금 봐야 할 Agent/edge 묶음을 중앙에 잡아준다."
