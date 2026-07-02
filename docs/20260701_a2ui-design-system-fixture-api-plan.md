# A2UI API Fixture 및 사용자 표현 의도 기반 선택 계획

작성일: 2026-07-01

## 1. 정리

이 계획은 "10개 A2UI 템플릿을 검증하기 위해 API도 10개 만든다"는 방식이 아니다.

API는 화면 템플릿 수에 맞춰 늘리는 대상이 아니라, 의미 있는 데이터 소스 단위로 적게 유지한다. A2UI는 다음 세 가지를 함께 보고 어떤 surface로 보여줄지 판단해야 한다.

| 판단 재료 | 내용 |
| --- | --- |
| API 명칭 | 사용자가 어떤 데이터 소스를 말했는지 |
| API 응답 구조 | 실제 response shape, field role, sample data |
| 사용자 표현 의도 | "표로 보여줘", "진행률로 보여줘", "카드로 보여줘" 같은 멘트 |

즉, 같은 API라도 사용자가 어떻게 보여달라고 말했는지에 따라 다른 A2UI 템플릿이 선택될 수 있어야 한다.

```text
"work-items API를 리스트로 보여줘"   -> collection.list
"work-items API를 진행률로 보여줘"   -> metric.progressList
"work-items API를 처리 큐처럼 보여줘" -> process.queue
"work-items API를 표로 보여줘"       -> matrix.table
```

## 2. 목표

| 목표 | 내용 |
| --- | --- |
| API 폭발 방지 | 템플릿마다 API를 만들지 않고, 적은 수의 다목적 fixture API를 둔다. |
| 사용자 의도 반영 | 같은 API라도 표현 요청에 따라 surface가 달라진다. |
| 데이터 호환성 유지 | 사용자가 요청한 surface가 데이터와 맞지 않으면 가장 가까운 surface로 보정한다. |
| 템플릿 검증 유지 | 10개 템플릿은 API 개수가 아니라 API와 사용자 멘트 조합으로 검증한다. |
| 도메인 중립 | 장비 전용 API가 아니라 일반적인 데이터 소스 이름과 응답 구조를 사용한다. |

## 3. 핵심 원칙

### 3.1 API는 data source다

API 이름은 UI 모양을 직접 말하지 않는다.

좋은 예:

```text
/api/a2ui-fixtures/work-items
/api/a2ui-fixtures/resources
/api/a2ui-fixtures/status-checks
/api/a2ui-fixtures/summary
/api/a2ui-fixtures/hierarchy
```

피해야 할 예:

```text
/api/a2ui-fixtures/progress-list
/api/a2ui-fixtures/card-grid
/api/a2ui-fixtures/status-matrix
```

후자는 API가 템플릿 이름에 묶이기 때문에, A2UI가 판단한다는 느낌이 약해진다.

### 3.2 템플릿은 사용자의 표현 요청과 데이터 구조가 합의한 결과다

템플릿 선택은 다음 우선순위로 결정한다.

| 우선순위 | 기준 | 설명 |
| --- | --- | --- |
| 1 | 명시적 사용자 표현 의도 | "표로", "카드로", "트리로", "진행률로" 같은 요청 |
| 2 | 데이터 호환성 | 해당 surface가 필요한 field를 실제 응답에서 찾을 수 있는지 |
| 3 | 강한 데이터 구조 신호 | image, progress, parentId, children, time, boolean flags |
| 4 | API 기본 후보 | API registry에 선언된 preferred surface |
| 5 | fallback | object는 detail, array는 list/table 중심으로 보정 |

### 3.3 사용자의 요청이 항상 이길 수는 없다

사용자가 "summary API를 트리로 보여줘"라고 해도 parent-child 구조가 없으면 `relation.tree`를 선택하면 안 된다. 이 경우에는 다음처럼 보정한다.

| 사용자 요청 | 데이터 상태 | 선택 |
| --- | --- | --- |
| "트리로 보여줘" | hierarchy 없음 | `record.detail` 또는 `matrix.table` |
| "진행률로 보여줘" | progress/current/target 없음 | `collection.list` 또는 `matrix.table` |
| "카드로 보여줘" | image는 없지만 title/description 있음 | `collection.cardGrid` 가능 |
| "타임라인으로 보여줘" | time field 없음 | `collection.list` |

## 4. 최소 Fixture API 세트

처음부터 10개 API를 만들 필요는 없다. 1차로는 5개 정도면 충분하다.

### 4.1 `work-items`

작업, 요청, 태스크처럼 상태, 진행률, 담당자, 마감일이 섞인 목록이다.

| 항목 | 내용 |
| --- | --- |
| Endpoint | `GET /api/a2ui-fixtures/work-items` |
| Shape | `items: Array<object>` |
| 주요 field | `title`, `description`, `status`, `progress`, `priority`, `assignee`, `dueAt`, `updatedAt` |
| 검증 가능한 surface | `collection.list`, `matrix.table`, `metric.progressList`, `process.queue`, `time.timeline` |

사용자 멘트별 기대:

| 사용자 멘트 | Expected template |
| --- | --- |
| "work-items를 목록으로 보여줘" | `collection.list` |
| "work-items를 표로 보여줘" | `matrix.table` |
| "work-items를 진행률로 보여줘" | `metric.progressList` |
| "work-items를 처리 큐처럼 보여줘" | `process.queue` |
| "work-items를 최근 변경 순서로 보여줘" | `time.timeline` |

### 4.2 `resources`

이미지, 제목, 설명, 카테고리, 메타데이터가 있는 리소스 목록이다.

| 항목 | 내용 |
| --- | --- |
| Endpoint | `GET /api/a2ui-fixtures/resources` |
| Shape | `items: Array<object>` |
| 주요 field | `title`, `imageUrl`, `description`, `category`, `status`, `score` |
| 검증 가능한 surface | `collection.cardGrid`, `collection.list`, `matrix.table`, `record.detail` |

사용자 멘트별 기대:

| 사용자 멘트 | Expected template |
| --- | --- |
| "resources를 카드로 보여줘" | `collection.cardGrid` |
| "resources를 리스트로 보여줘" | `collection.list` |
| "resources를 표로 비교해줘" | `matrix.table` |
| "첫 번째 resource를 상세로 보여줘" | `record.detail` |

### 4.3 `status-checks`

여러 boolean/status flag를 가진 점검표형 목록이다.

| 항목 | 내용 |
| --- | --- |
| Endpoint | `GET /api/a2ui-fixtures/status-checks` |
| Shape | `items: Array<object>` |
| 주요 field | `title`, `isEnabled`, `isHealthy`, `hasWarning`, `isBlocked`, `lastCheckedAt` |
| 검증 가능한 surface | `matrix.statusMatrix`, `matrix.table`, `collection.list` |

사용자 멘트별 기대:

| 사용자 멘트 | Expected template |
| --- | --- |
| "status-checks를 상태표로 보여줘" | `matrix.statusMatrix` |
| "status-checks를 테이블로 보여줘" | `matrix.table` |
| "status-checks를 간단 목록으로 보여줘" | `collection.list` |

### 4.4 `summary`

숫자 요약값과 단일 summary object를 포함한 API다.

| 항목 | 내용 |
| --- | --- |
| Endpoint | `GET /api/a2ui-fixtures/summary` |
| Shape | `metrics: Array<object>` 또는 root summary object |
| 주요 field | `label`, `value`, `unit`, `delta`, `status`, `description` |
| 검증 가능한 surface | `metric.statCards`, `record.detail`, `matrix.table` |

사용자 멘트별 기대:

| 사용자 멘트 | Expected template |
| --- | --- |
| "summary를 숫자 카드로 보여줘" | `metric.statCards` |
| "summary를 상세로 보여줘" | `record.detail` |
| "summary를 표로 보여줘" | `matrix.table` |

### 4.5 `hierarchy`

부모-자식 관계를 가진 데이터다. nested children과 flat parentId variant를 모두 제공한다.

| 항목 | 내용 |
| --- | --- |
| Endpoint | `GET /api/a2ui-fixtures/hierarchy` |
| Shape | nested `children` 또는 flat `parentId` |
| 주요 field | `id`, `parentId`, `title`, `children`, `status`, `count` |
| 검증 가능한 surface | `relation.tree`, `collection.list`, `matrix.table`, `record.detail` |

사용자 멘트별 기대:

| 사용자 멘트 | Expected template |
| --- | --- |
| "hierarchy를 트리로 보여줘" | `relation.tree` |
| "hierarchy를 목록으로 보여줘" | `collection.list` |
| "hierarchy를 표로 보여줘" | `matrix.table` |

## 5. API Registry 설계

사용자가 API 명칭을 말하면 시스템은 먼저 API registry에서 대상 API를 찾아야 한다.

```ts
type A2UIFixtureApiDefinition = {
  id: string;
  endpoint: string;
  aliases: string[];
  description: string;
  preferredSurfaces: string[];
  requiredSignals?: string[];
};
```

예시:

```ts
{
  id: "work-items",
  endpoint: "/api/a2ui-fixtures/work-items",
  aliases: ["work items", "작업", "작업목록", "태스크", "queue"],
  description: "상태, 진행률, 담당자, 마감일이 있는 작업 목록",
  preferredSurfaces: [
    "collection.list",
    "metric.progressList",
    "process.queue",
    "matrix.table",
    "time.timeline"
  ]
}
```

API registry는 UI template registry와 분리한다.

| Registry | 책임 |
| --- | --- |
| API registry | 사용자가 말한 데이터 소스가 어떤 endpoint인지 찾음 |
| Template registry | 어떤 surface template이 등록되어 있는지 알려줌 |
| Planner | API 응답, 사용자 의도, template registry를 합쳐 최종 surface 선택 |

## 6. 사용자 표현 의도 파싱

사용자 멘트에서 다음 표현을 surface hint로 추출한다.

| 표현 | Surface hint |
| --- | --- |
| "목록", "리스트", "간단히" | `collection.list` |
| "카드", "갤러리", "썸네일" | `collection.cardGrid` |
| "상세", "자세히", "프로필" | `record.detail` |
| "표", "테이블", "비교" | `matrix.table` |
| "상태표", "체크", "ON/OFF", "불리언" | `matrix.statusMatrix` |
| "숫자 카드", "요약", "KPI", "통계" | `metric.statCards` |
| "진행률", "완료율", "퍼센트", "progress" | `metric.progressList` |
| "타임라인", "이력", "로그", "시간순" | `time.timeline` |
| "큐", "대기열", "처리순서", "우선순위" | `process.queue` |
| "트리", "계층", "구조", "상하위" | `relation.tree` |

파싱 결과는 단일 값이 아니라 후보 배열로 둔다.

```ts
type PresentationIntent = {
  requestedSurfaces: string[];
  confidence: number;
  sourcePhrase?: string;
};
```

예:

```text
"work-items를 마감일 기준 처리 큐로 보여줘"
```

```json
{
  "requestedSurfaces": ["process.queue"],
  "confidence": 0.92,
  "sourcePhrase": "처리 큐"
}
```

## 7. 선택 알고리즘

최종 surface 선택은 다음 흐름으로 처리한다.

```text
1. 사용자 메시지에서 apiId 후보를 찾는다.
2. API registry에서 endpoint를 찾는다.
3. API를 호출하고 derived schema/sample preview를 만든다.
4. 사용자 메시지에서 presentation intent를 추출한다.
5. template registry에서 등록된 후보만 남긴다.
6. presentation intent와 데이터 호환성을 함께 scoring한다.
7. incompatible 요청이면 repair reason을 남기고 가까운 template으로 보정한다.
8. 최종 selectedTemplateId와 mapping을 만든다.
```

선택 점수는 다음처럼 구성한다.

| 점수 요소 | 의미 |
| --- | --- |
| User intent score | 사용자가 명시적으로 요청한 surface인지 |
| Data compatibility score | required slot을 채울 수 있는지 |
| Structure signal score | image, progress, time, hierarchy 같은 강한 field가 있는지 |
| API preferred score | API registry의 preferred surface인지 |
| Safety penalty | required field가 없거나 row shape가 맞지 않는 경우 감점 |

## 8. E2E 검증 방식

검증도 endpoint 개수 기준이 아니라 "API x 사용자 멘트" 조합으로 한다.

| API | 사용자 멘트 | Expected template |
| --- | --- | --- |
| `work-items` | "진행률로 보여줘" | `metric.progressList` |
| `work-items` | "처리 큐로 보여줘" | `process.queue` |
| `work-items` | "표로 보여줘" | `matrix.table` |
| `resources` | "카드로 보여줘" | `collection.cardGrid` |
| `resources` | "리스트로 보여줘" | `collection.list` |
| `status-checks` | "상태표로 보여줘" | `matrix.statusMatrix` |
| `summary` | "숫자 카드로 보여줘" | `metric.statCards` |
| `summary` | "상세로 보여줘" | `record.detail` |
| `hierarchy` | "트리로 보여줘" | `relation.tree` |
| `hierarchy` | "표로 보여줘" | `matrix.table` |

10개 템플릿 전체 검증이 필요할 때도 10개 API를 만드는 것이 아니라, 위 조합을 늘려서 커버한다.

## 9. Boundary Fixture

경계 상황도 별도 API를 많이 만들기보다 query variant로 처리한다.

| Query | 예 | 목적 |
| --- | --- | --- |
| `variant` | `default`, `minimal`, `localized`, `ambiguous` | field naming과 신호 강도 변경 |
| `wrap` | `none`, `items`, `resultRows`, `deep` | response envelope 변경 |
| `page` | `1` | pagination 검증 |
| `pageSize` | `20` | row 수 제한 |
| `count` | `1000` | large rows 검증 |
| `nulls` | `some` | nullable field 검증 |

예:

```text
/api/a2ui-fixtures/work-items?variant=ambiguous
/api/a2ui-fixtures/work-items?wrap=deep
/api/a2ui-fixtures/status-checks?variant=localized
/api/a2ui-fixtures/resources?nulls=some
/api/a2ui-fixtures/work-items?count=1000&pageSize=50
```

## 10. 기존 장비 API 처리

기존 장비 API는 삭제하지 않고 legacy data source로 둔다.

| 기존 API | 처리 |
| --- | --- |
| `/api/equipment-status` | `status-checks`와 비슷한 legacy source로 유지 |
| `/api/equipment-catalog` | `resources`와 비슷한 legacy source로 유지 |
| `/api/equipment-status-wide-columns` | `work-items?variant=wide` 또는 별도 boundary로 흡수 검토 |
| `/api/equipment-status-large-rows` | `work-items?count=1000` 계열로 흡수 검토 |

장기적으로는 장비 API도 API registry에 등록해서 다음처럼 사용할 수 있게 한다.

```text
"equipment-status API를 상태표로 보여줘" -> matrix.statusMatrix
"equipment-status API를 표로 보여줘"     -> matrix.table
"equipment-catalog API를 카드로 보여줘"  -> collection.cardGrid
```

## 11. 구현 단계

### Phase 1. API registry와 최소 fixture API

| 작업 | 내용 |
| --- | --- |
| API registry 추가 | api id, alias, endpoint, preferred surfaces 정의 |
| 최소 fixture API 5개 추가 | `work-items`, `resources`, `status-checks`, `summary`, `hierarchy` |
| 공통 variant helper 추가 | `variant`, `wrap`, `page`, `pageSize`, `count`, `nulls` |
| 기존 장비 API registry 등록 | legacy API도 같은 흐름으로 찾을 수 있게 함 |

완료 조건:

```text
사용자 메시지에서 apiId를 찾고 해당 API 응답을 가져올 수 있다.
```

### Phase 2. 사용자 표현 의도 반영

| 작업 | 내용 |
| --- | --- |
| presentation intent parser 추가 | "표로", "카드로", "진행률로" 같은 표현을 surface hint로 변환 |
| AI planner prompt 수정 | API 명칭과 표현 의도를 분리해서 reasoning하게 함 |
| mock planner 수정 | OpenAI 없이도 apiId + 표현 의도로 template을 고름 |
| matcher scoring 수정 | user intent score와 data compatibility score를 함께 반영 |

완료 조건:

```text
같은 API에 다른 사용자 멘트를 넣으면 다른 template이 선택된다.
```

### Phase 3. Demo UI와 e2e

| 작업 | 내용 |
| --- | --- |
| Data Boundary Lab scenario 변경 | surface별 API 목록이 아니라 API + 사용자 멘트 조합으로 구성 |
| e2e matrix 추가 | API x utterance expected template 검증 |
| 선택 근거 표시 | "사용자 표현 의도", "데이터 호환성", "보정 이유"를 sequence에 표시 |

완료 조건:

```text
work-items API 하나로 list/table/progress/queue/timeline 선택을 확인할 수 있다.
```

## 12. 1차 구현 체크리스트

- [ ] `src/server/a2ui-fixtures`에 최소 fixture builder 추가
- [ ] `/api/a2ui-fixtures/work-items` 추가
- [ ] `/api/a2ui-fixtures/resources` 추가
- [ ] `/api/a2ui-fixtures/status-checks` 추가
- [ ] `/api/a2ui-fixtures/summary` 추가
- [ ] `/api/a2ui-fixtures/hierarchy` 추가
- [ ] API registry 추가
- [ ] API alias matching 추가
- [ ] presentation intent parser 추가
- [ ] planner scoring에 user intent score 반영
- [ ] Data Boundary Lab을 API x 사용자 멘트 방식으로 수정
- [ ] e2e expected matrix 추가
- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
