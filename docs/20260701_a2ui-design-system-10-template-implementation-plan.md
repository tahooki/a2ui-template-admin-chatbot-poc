# A2UI 디자인 시스템 10개 템플릿 구현 계획

작성일: 2026-07-01

## 1. 배경

현재 A2UI POC는 특정 장비 도메인의 상태 테이블/목록 예시에서 출발했다. 다음 단계에서는 장비, 이슈, 프로젝트, 문서처럼 특정 업무 명사에 묶인 화면이 아니라, 디자인 시스템의 surface pattern처럼 재사용 가능한 추상 템플릿 세트를 만들어야 한다.

이번 계획의 기준은 다음과 같다.

| 기준 | 내용 |
| --- | --- |
| 읽기 전용 surface | 데이터 표시가 목적이다. 승인, 실행, 입력 같은 action template은 제외한다. |
| 공간/지도 제외 | map, pin, region, route 같은 spatial template은 이번 범위에서 제외한다. |
| 도메인 독립 | 템플릿 이름과 slot은 장비/업무 도메인 명사를 피하고 데이터 구조 중심으로 정의한다. |
| 디자인 시스템 레벨 | list, card, table, timeline처럼 여러 도메인에 반복 적용되는 UI 문법으로 정리한다. |
| 선택 근거 명확화 | 각 템플릿은 data shape, required slots, field signals, query signals로 선택 가능해야 한다. |

## 2. 목표

10개의 A2UI surface template을 등록하고, 각 template이 서로 다른 데이터 구조를 표현하도록 만든다.

```text
collection.list
collection.cardGrid
record.detail
matrix.table
matrix.statusMatrix
metric.statCards
metric.progressList
time.timeline
process.queue
relation.tree
```

최종적으로 사용자는 같은 A2UI 렌더 요청 안에서도 API 응답 구조에 따라 서로 다른 surface가 선택되는 것을 확인할 수 있어야 한다.

```text
array<object> with title/content        -> collection.list
array<object> with image/rich metadata  -> collection.cardGrid
single object                           -> record.detail
array<object> with many scalar fields   -> matrix.table
array<object> with status booleans      -> matrix.statusMatrix
object/array with numeric summaries     -> metric.statCards
array<object> with percentage progress  -> metric.progressList
array<object> with time fields          -> time.timeline
array<object> with status/priority      -> process.queue
nested children or parentId relation    -> relation.tree
```

## 3. 기존 템플릿 정리 방침

기존 장비 도메인 템플릿은 새 디자인 시스템 템플릿으로 대체한다. 즉, 기존 템플릿을 active registry에 계속 남겨두지 않는다.

현재 등록된 템플릿 기준 정리 방침은 다음과 같다.

| 기존 템플릿 | 처리 | 대체 템플릿 | 비고 |
| --- | --- | --- | --- |
| `equipment.statusBooleanList` | 삭제 | `matrix.statusMatrix` | 장비 상태 예시는 status matrix fixture로 유지 |
| `equipment.telemetryStatusTable` | 삭제 | `matrix.metricTable` 또는 `matrix.table` | 수치/계측 예시는 table/metric table fixture로 유지 |

삭제의 의미는 다음과 같다.

| 대상 | 처리 |
| --- | --- |
| `INITIAL_TEMPLATES` | 장비 전용 registration 제거 후 generic 10개 registration으로 교체 |
| `data/a2ui-template-catalog.json` | reset/seed 후 generic 10개만 남도록 정리 |
| Admin template list | 장비 전용 템플릿이 보이지 않도록 정리 |
| Renderer 문구 | "장비 상태", "계측 상태 테이블" 같은 도메인 문구 제거 |
| 샘플 데이터 | 삭제하지 않고 generic template 선택 검증 fixture로 재사용 |
| 기존 테스트 | old component id 기대값을 generic component id 기대값으로 변경 |

단, 기존 템플릿의 목적 자체를 버리는 것은 아니다. 장비 상태 목록은 `matrix.statusMatrix`가 담당하고, 계측/수치 테이블은 `matrix.table` 또는 필요 시 `matrix.metricTable` 계열이 담당한다. 기존 템플릿은 "도메인 전용 등록물"에서 "generic surface를 검증하는 샘플 데이터"로 위치를 바꾼다.

이번 10개 구현 세트에는 `matrix.metricTable`을 별도 id로 넣지 않고 `matrix.table`에 흡수한다. 만약 수치 column 전용 렌더링이 꼭 필요해지면 2차 확장으로 `matrix.metricTable`을 추가한다.

## 4. 핵심 원칙

### 4.1 템플릿은 화면이 아니라 contract다

각 템플릿은 단순 React 컴포넌트가 아니라 다음 정보를 함께 가진 contract로 다룬다.

| Contract | 내용 |
| --- | --- |
| `componentId` | 디자인 시스템 surface id |
| `selectionGuide` | 어떤 데이터/질문에 적합한지 설명 |
| `schemaSpec` | coarse rule 기반 선택 조건 |
| `inputSchema` | required/optional slot 계약 |
| `surfaceConfig` | renderer가 사용할 binding 정보 |
| `renderer` | 최종 시각 표현 |

### 4.2 도메인 용어보다 정보 역할을 우선한다

예를 들어 `equipmentName`, `issueTitle`, `projectName`은 모두 `items[].title` slot 후보로 본다. `isOnline`, `isDone`, `enabled`, `blocked`는 모두 status/boolean slot 후보로 본다.

### 4.3 우선순위 충돌을 의도적으로 제어한다

서로 비슷한 템플릿은 선택 우선순위를 가져야 한다.

| 충돌 | 우선순위 |
| --- | --- |
| `matrix.statusMatrix` vs `matrix.table` | boolean/status field가 충분하면 statusMatrix 우선 |
| `metric.progressList` vs `metric.statCards` | row별 progress가 있으면 progressList 우선 |
| `time.timeline` vs `collection.list` | time field가 event 의미를 가지면 timeline 우선 |
| `relation.tree` vs `collection.list` | nested children 또는 parent relation이 있으면 tree 우선 |
| `record.detail` vs `collection.list` | 단일 객체면 detail 우선 |

### 4.4 폴백은 list/table로만 보내지 않는다

템플릿 선택 실패 시 무조건 텍스트 목록으로 보내지 않는다. source shape에 따라 가장 손실이 적은 기본 surface를 고른다.

| Source shape | 기본 fallback |
| --- | --- |
| object | `record.detail` |
| array<object> with many fields | `matrix.table` |
| array<object> with title/content | `collection.list` |
| nested object/tree | `relation.tree` 후보 검토 후 `record.detail` |

## 5. 10개 템플릿 정의

### 5.1 `collection.list`

반복 항목을 세로 목록으로 보여주는 가장 기본 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title` |
| Optional slots | `items[].description`, `items[].category`, `items[].status`, `items[].updatedAt` |
| Selection signals | title/label/name 필드가 있고, 본문/설명 필드가 있으며, 특정 table/metric/time/process 신호가 약함 |
| Bad for | numeric field가 압도적으로 많음, boolean status matrix가 필요함, tree/time 구조가 명확함 |
| Visual | title, one-line description, meta chips를 가진 조용한 리스트 |

### 5.2 `collection.cardGrid`

항목을 카드 단위로 비교하거나 훑어보는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title` |
| Optional slots | `items[].image`, `items[].description`, `items[].category`, `items[].status`, `items[].metric` |
| Selection signals | image/media 필드가 있거나, 항목마다 설명/카테고리/상태/수치가 섞여 카드 스캔이 적합함 |
| Bad for | 행 수가 많고 조밀한 비교가 필요함, 컬럼 값 비교가 핵심임 |
| Visual | 2-3 column card grid, optional thumbnail, title, summary, compact metadata |

### 5.3 `record.detail`

단일 객체 또는 선택된 하나의 record를 상세 표시하는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `object` 또는 `array<object>` with 1 row |
| Required slots | `record.title` 또는 `record.primaryLabel` |
| Optional slots | `record.description`, `record.fields`, `record.status`, `record.updatedAt`, `record.image` |
| Selection signals | primary array가 없거나 rowCount가 1이고, 여러 scalar field를 key-value로 읽는 것이 적합함 |
| Bad for | 여러 row 비교가 핵심임, timeline/tree/progress 구조가 명확함 |
| Visual | header 영역 + key-value sections + optional summary/status |

### 5.4 `matrix.table`

일반 행/열 데이터를 표로 보여주는 기본 matrix surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title` 또는 `items[].primaryColumn`, `items[].columns` |
| Optional slots | `items[].status`, `items[].updatedAt`, `items[].category` |
| Selection signals | 여러 scalar field가 있고, 컬럼 비교가 핵심이며, 특정 status/progress/time/tree 신호가 약함 |
| Bad for | 이미지 카드가 적합함, boolean/status 필드만 비교하면 됨, numeric summary 위주임 |
| Visual | compact table, 최대 표시 컬럼 제한, title/primary column 고정 느낌 |

### 5.5 `matrix.statusMatrix`

boolean 또는 상태 필드를 행별로 비교하는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title`, `items[].statusFlags` |
| Optional slots | `items[].description`, `items[].updatedAt`, `items[].category` |
| Selection signals | boolean field가 2개 이상이거나 status/code field가 여러 개 있음 |
| Bad for | numeric metric 비교가 핵심임, 단일 status만 있음, 진행률 필드가 명확함 |
| Visual | row title + ON/OFF, active/inactive, good/warn/bad status cells |

### 5.6 `metric.statCards`

숫자 요약값을 카드 묶음으로 보여주는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `object` 또는 small `array<object>` |
| Required slots | `metrics[].label`, `metrics[].value` |
| Optional slots | `metrics[].delta`, `metrics[].status`, `metrics[].description`, `metrics[].unit` |
| Selection signals | aggregate count, total, average, rate, score 같은 numeric summary가 핵심임 |
| Bad for | row별 상세 비교가 필요함, progress가 row마다 있음, time series chart가 필요함 |
| Visual | 2-4개 stat cards, value emphasis, unit/delta/status 표시 |

### 5.7 `metric.progressList`

리스트 항목마다 진행률/완료율을 progress bar로 보여주는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title`, `items[].progress` |
| Optional slots | `items[].description`, `items[].status`, `items[].updatedAt`, `items[].target`, `items[].current` |
| Selection signals | progress, percent, percentage, completionRate, doneRatio, completionPercent 같은 0-100 또는 0-1 numeric field가 있음 |
| Bad for | 단일 summary metric만 있음, 단계별 workflow가 핵심임, boolean checklist가 핵심임 |
| Visual | title + optional status + percentage label + horizontal progress bar |

### 5.8 `time.timeline`

시간순 이벤트나 이력을 보여주는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].time`, `items[].title` |
| Optional slots | `items[].description`, `items[].status`, `items[].actor`, `items[].category` |
| Selection signals | createdAt, updatedAt, timestamp, eventTime, occurredAt 같은 time field와 event/message/title field가 함께 있음 |
| Bad for | 시간 필드가 단순 업데이트 메타데이터일 뿐임, 행/열 비교가 핵심임 |
| Visual | vertical timeline, time label, event title, secondary metadata |

### 5.9 `process.queue`

상태, 우선순위, 담당자, 기한이 있는 처리 대기열을 읽기 전용으로 보여주는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | `array<object>` |
| Required slots | `items[].title`, `items[].status` |
| Optional slots | `items[].priority`, `items[].assignee`, `items[].dueAt`, `items[].description`, `items[].category` |
| Selection signals | status/stage/state와 priority/due/assignee/requester 같은 process metadata가 함께 있음 |
| Bad for | action 버튼/승인 처리가 핵심임, 단순 상태 boolean matrix가 더 적합함 |
| Visual | queue rows, status pill, priority marker, owner/due metadata |

### 5.10 `relation.tree`

계층 구조를 들여쓰기와 parent-child 관계로 보여주는 surface다.

| 항목 | 내용 |
| --- | --- |
| Data shape | nested `object`, nested `array<object>`, or flat `array<object>` with `id`/`parentId` |
| Required slots | `nodes[].title` |
| Optional slots | `nodes[].children`, `nodes[].id`, `nodes[].parentId`, `nodes[].status`, `nodes[].description`, `nodes[].metric` |
| Selection signals | children/items/nodes 하위 배열이 반복되거나, id/parentId relation이 명확함 |
| Bad for | 단순 flat list임, graph/network처럼 비계층 연결이 핵심임 |
| Visual | expandable 느낌의 nested outline, depth indentation, optional status/count |

## 6. 데이터 역할 확장 계획

현재 role 체계는 `title`, `content`, `description`, `image`, `status`, `booleanFlag`, `category`, `location`, `updatedAt`, `time`, `metric` 등을 포함한다. 10개 템플릿을 안정적으로 선택하려면 다음 역할을 추가 검토한다.

| Role | 필요 템플릿 | 설명 |
| --- | --- | --- |
| `progress` | `metric.progressList` | 진행률/완료율/퍼센트 |
| `priority` | `process.queue` | 우선순위 |
| `assignee` | `process.queue` | 담당자/소유자 |
| `dueAt` | `process.queue` | 마감/기한 |
| `actor` | `time.timeline` | 이벤트 수행자 |
| `parentId` | `relation.tree` | flat tree 구성용 부모 id |
| `children` | `relation.tree` | nested tree 구성용 하위 노드 |
| `delta` | `metric.statCards` | 증감값 |
| `unit` | `metric.statCards` | 수치 단위 |

역할 추가는 matcher와 planner prompt, template inputSchema가 함께 이해할 수 있게 한 번에 반영한다.

## 7. 구현 단계

### Phase 1. 기존 템플릿 제거와 타입 contract 정리

1. `equipment.statusBooleanList`, `equipment.telemetryStatusTable` registration을 active template seed에서 제거한다.
2. 기존 장비 샘플 데이터는 fixture로 남겨 generic template 선택 검증에 재사용한다.
3. `A2UIViewType`을 10개 surface id 또는 별도 `surfacePattern` 체계로 확장한다.
4. `A2UIRole`에 progress/process/tree/stat 관련 역할을 추가한다.
5. `A2UIComponentSurfaceConfig`가 list/table/card 외 surface를 표현할 수 있도록 필요한 binding field를 추가한다.
6. `INITIAL_TEMPLATES`에 10개 템플릿 registration을 추가한다.
7. `data/a2ui-template-catalog.json` reset/seed 흐름과 동기화한다.

### Phase 2. schema profiler와 matcher signal 확장

1. `schema-profiler.ts`의 key 기반 role candidate를 확장한다.
2. `derived-schema-builder`에서 progress/time/process/tree signal을 비교 데이터에 포함한다.
3. `template-schema-matcher`의 scoring이 새 role과 capabilities를 반영하도록 조정한다.
4. 충돌 우선순위를 반영한다.
5. candidate trace에 왜 특정 surface가 선택/제외되었는지 표시한다.

### Phase 3. AI surface planner contract 업데이트

1. registered template summary에 새 10개 contract가 과도하게 길어지지 않도록 compact summary를 만든다.
2. 1차 template selection prompt에 action/spatial 제외 원칙을 명시한다.
3. 2차 slot mapping prompt에 각 surface별 required slot과 allowed transform을 명시한다.
4. progress normalization 규칙을 추가한다.
   - 0-1 값은 0-100으로 표시
   - 0-100 값은 그대로 표시
   - null/invalid 값은 unknown state로 표시
5. tree mapping 규칙을 추가한다.
   - nested children 우선
   - flat id/parentId는 서버 후처리에서 tree로 변환

### Phase 4. renderer 구현

`A2UIDemoRenderer`에 다음 render branch를 추가한다.

| Surface | Renderer 작업 |
| --- | --- |
| `collection.list` | title/description/meta list |
| `collection.cardGrid` | optional image/card metadata grid |
| `record.detail` | header + key-value fields |
| `matrix.table` | dynamic columns table |
| `matrix.statusMatrix` | boolean/status cells |
| `metric.statCards` | stat card grid |
| `metric.progressList` | progress bar rows |
| `time.timeline` | vertical event list |
| `process.queue` | status/priority/due queue rows |
| `relation.tree` | nested outline |

기존 장비 전용 label은 제거하거나 generic label로 바꾼다.

### Phase 5. 샘플 API와 데모 시나리오 추가

각 surface가 선택되는 fixture를 최소 1개씩 만든다.

| Surface | 샘플 데이터 예 |
| --- | --- |
| `collection.list` | 공지/문서/검색 결과 |
| `collection.cardGrid` | 이미지 있는 항목 목록 |
| `record.detail` | 단일 고객/프로젝트/리소스 상세 |
| `matrix.table` | 일반 데이터셋 |
| `matrix.statusMatrix` | 기능 flag/상태 flag 목록 |
| `metric.statCards` | summary object |
| `metric.progressList` | 프로젝트별 완료율 목록 |
| `time.timeline` | 이벤트/변경 이력 |
| `process.queue` | 요청/작업 대기열 |
| `relation.tree` | 조직/폴더/카테고리 계층 |

### Phase 6. 관리자 UI 표시 정리

1. template list에서 category별로 surface를 묶어 보여준다.
2. template detail에 required slots, optional slots, selection hints를 쉽게 읽히게 표시한다.
3. A2UI 선택 trace에서 "데이터 구조 신호 -> 후보 비교 -> slot mapping" 흐름을 보여준다.
4. 기존 장비 전용 문구는 generic surface language로 바꾼다.

### Phase 7. 테스트와 검증

1. 각 fixture에 대해 선택되는 template id를 단위 테스트로 고정한다.
2. required slot 누락 시 fallback 또는 no-template 처리가 안정적인지 확인한다.
3. progress normalization 테스트를 추가한다.
4. tree nested/flat parentId 변환 테스트를 추가한다.
5. renderer smoke test 또는 e2e에서 10개 surface가 모두 blank 없이 렌더되는지 확인한다.

## 8. 우선순위

### 8.1 1차 구현

먼저 기존 구조와 가장 가까운 5개를 구현한다.

```text
collection.list
collection.cardGrid
matrix.table
matrix.statusMatrix
metric.progressList
```

이 단계의 목적은 기존 list/card/table/status 렌더러를 generic surface로 전환하고, progressList만 새로 추가하는 것이다.

### 8.2 2차 구현

그 다음 데이터 구조 차이가 분명한 3개를 추가한다.

```text
record.detail
metric.statCards
time.timeline
```

이 단계의 목적은 array 중심 POC에서 object/detail, numeric summary, temporal event까지 범위를 넓히는 것이다.

### 8.3 3차 구현

마지막으로 mapper와 후처리 난도가 있는 2개를 추가한다.

```text
process.queue
relation.tree
```

`process.queue`는 status/priority/due/assignee의 의미 판단이 필요하고, `relation.tree`는 nested children 또는 id/parentId 후처리가 필요하므로 뒤에 둔다.

## 9. 완료 기준

작업 완료 기준은 다음과 같다.

| 기준 | 완료 조건 |
| --- | --- |
| Template registry | 10개 template이 등록되어 admin UI에서 확인 가능 |
| Old templates | `equipment.*` active template이 registry에서 제거됨 |
| Selection | 각 fixture가 의도한 template으로 선택됨 |
| Slot mapping | 각 template의 required slot이 trace에 표시됨 |
| Rendering | 10개 surface가 모두 독립적인 UI 형태로 렌더됨 |
| Generic language | 장비 전용 문구 없이 디자인 시스템 surface로 설명됨 |
| Fallback | 애매한 데이터가 손실 적은 surface로 처리됨 |
| Tests | matcher/mapper/renderer 핵심 경로 테스트 통과 |

## 10. 위험 요소와 대응

| 위험 | 대응 |
| --- | --- |
| 템플릿이 많아져 planner prompt가 길어진다 | template summary를 compact하게 만들고 required slot 중심으로 전달 |
| table/list/card가 서로 과도하게 경쟁한다 | selection priority와 badFor를 명확히 설정 |
| progress field가 metric으로만 분류된다 | `progress` role과 normalization rule 추가 |
| tree 구조가 source마다 다르다 | nested children과 flat parentId를 별도 mapping path로 지원 |
| process.queue가 action UI처럼 보인다 | 버튼 없이 읽기 전용 queue metadata만 표시 |
| 기존 장비 demo와 충돌한다 | 기존 장비 템플릿을 generic status/table template의 fixture로 흡수 |
| 기존 component id를 참조하는 테스트가 깨진다 | 기대값을 새 generic id로 변경하고 old id 제거를 명시적으로 검증 |

## 11. 권장 최종 명명

템플릿 id는 dot notation으로 디자인 시스템 계층을 드러낸다.

```text
collection.list
collection.cardGrid
record.detail
matrix.table
matrix.statusMatrix
metric.statCards
metric.progressList
time.timeline
process.queue
relation.tree
```

표시명은 한국어 UI에서 다음처럼 노출한다.

| Template id | 표시명 |
| --- | --- |
| `collection.list` | 목록 |
| `collection.cardGrid` | 카드 그리드 |
| `record.detail` | 상세 |
| `matrix.table` | 데이터 테이블 |
| `matrix.statusMatrix` | 상태 매트릭스 |
| `metric.statCards` | 지표 카드 |
| `metric.progressList` | 진행률 목록 |
| `time.timeline` | 타임라인 |
| `process.queue` | 처리 대기열 |
| `relation.tree` | 계층 트리 |
