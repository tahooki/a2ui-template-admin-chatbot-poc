# A2UI 선택 근거 라벨 및 팝업 기획

작성일: 2026-06-20

## 목적

이 문서는 POC 화면에서 A2UI의 핵심 로직이 고객에게 보이도록 만드는 표시 기획이다.

고객이 알아야 하는 것은 다음 3가지다.

1. 실제 API 데이터가 무엇이었는가.
2. 그 API 데이터가 A2UI 템플릿과 비교 가능한 형태로 어떻게 변환되었는가.
3. 어떤 비교값과 수치 때문에 특정 A2UI 템플릿이 선택되거나 제외되었고, 최종 화면 표시값은 원본 API 키값에서 어떻게 변환되었는가.

기존 시퀀스 다이어그램의 단계 라벨은 클릭 대상에서 제외한다. 대신 핵심 값이 준비되는 시점에 별도의 증거 라벨을 시퀀스 다이어그램 위에 등장시킨다. 이 증거 라벨은 "흐름 이름"이 아니라 "확인 가능한 근거"를 여는 진입점이다.

## 실제 로직 기준

현재 A2UI 판단 흐름은 아래 코드 경로를 기준으로 한다.

| 단계 | 코드 | 만들어지는 값 |
| --- | --- | --- |
| API preview 생성 | `src/server/a2ui-admin/schema-matcher/sample-data-preview.ts` | `shape`, `primaryArrayPath`, `rowCount`, `sampleSize`, `truncated`, `data` |
| 비교용 데이터 생성 | `src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts` | `fields`, `type`, `roles`, `format`, `capabilities` |
| 템플릿 후보 점수화 | `src/server/a2ui-admin/schema-matcher/template-schema-matcher.ts` | `score`, `breakdown`, `rejected`, `rejectionReason` |
| 화면 영역 매핑 | `src/server/a2ui-admin/schema-matcher/template-mapping-builder.ts` | `slot`, `sourcePath`, `transform`, `missingSlots` |
| 화면 표시값 렌더링 | `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx` | API path에서 값을 읽고 화면 라벨/ON/OFF로 변환 |

중요한 점은 A2UI가 원본 API JSON을 바로 화면 선택에 쓰지 않는다는 것이다. 먼저 preview와 비교용 데이터 설명을 만들고, 이 설명을 등록된 템플릿 조건과 비교한다.

## 시퀀스 다이어그램 변경 원칙

### 제거

- 기존 단계 라벨 클릭 제거
- 기존 단계 라벨에서 모달 열기 제거
- 단계 라벨을 정보 탐색 UI로 사용하는 방식 제거

### 추가

시퀀스 다이어그램에는 값이 준비되는 위치마다 별도 증거 라벨을 추가한다.

증거 라벨은 다음 조건을 따른다.

- 값이 준비되기 전에는 나타나지 않는다.
- 값이 준비되면 해당 시퀀스 위치 근처에 작게 등장한다.
- 라벨 텍스트는 고객이 이해할 수 있는 말로 표시한다.
- 라벨을 누르면 해당 근거 팝업이 열린다.
- 팝업은 내부 로그가 아니라, 실제 데이터와 비교 결과를 읽는 리포트처럼 보여준다.

## 증거 라벨 배치

### 1. 실제 API 데이터

위치:

- `Business DB/API -> Main Agent` 응답 화살표 근처
- 현재 단계 id 기준: `business-tool-result`
- 데이터 준비 이벤트 기준: `state:business_tool_result`

라벨 문구:

`실제 API 데이터`

라벨 보조 문구:

`44건 · items[]`

필요 데이터:

- `sourceToolName`
- `sourceToolResultId`
- `sourceDataHash`
- `sourceRowCount`
- `sourceDataShape`
- 원본 샘플 row

현재 payload에서 부족한 값:

- 원본 샘플 row가 없다.
- 고객이 "실제 데이터가 무엇이었는지" 보려면 최소 3개 row preview를 추가로 내려야 한다.

팝업 제목:

`실제 API 데이터`

팝업 목적:

화면 선택의 출발점이 된 실제 API 응답을 보여준다.

팝업 구성:

1. 요약 영역

| 항목 | 표시 예 |
| --- | --- |
| 조회 데이터 | 장비 상태 데이터 |
| 데이터 형태 | `object{items:array<object>}` |
| 전체 개수 | `44건` |
| 비교에 사용한 샘플 | `10건` |
| 데이터 식별값 | `sourceDataHash` 앞 12자리 |

2. 실제 row preview

| API key | 예시 값 |
| --- | --- |
| `id` | `eq-status-01` |
| `name` | `CNC 가공기 01` |
| `isOnline` | `false` |
| `isRunning` | `false` |
| `hasAlarm` | `true` |
| `needsInspection` | `true` |
| `isReserved` | `true` |

3. 고객이 알아야 하는 문장

`A2UI는 이 원본 데이터를 직접 화면에 꽂기 전에, 화면 조건과 비교할 수 있는 구조로 다시 읽습니다.`

## 2. 비교용 데이터로 변환

위치:

- `a2ui_render Tool -> A2UI Agent` 화살표 근처
- 현재 단계 id 기준: `profile`
- 데이터 준비 이벤트 기준: `state:profile`

라벨 문구:

`비교용 데이터로 변환`

라벨 보조 문구:

`title 1개 · boolean 5개`

필요 데이터:

- `sampleDataPreview`
- `derivedSchema.shape`
- `derivedSchema.rowCount`
- `derivedSchema.sampleSize`
- `derivedSchema.fields`
- `derivedSchema.capabilities`

현재 payload에서 부족한 값:

- `profile` 이벤트는 `rowCount`, `hasImageField`, `booleanFieldCount`, `previewRowCount`, `previewSampleSize`만 보낸다.
- 팝업을 제대로 만들려면 `derivedSchema.fields`와 field별 `examples`를 추가로 내려야 한다.

팝업 제목:

`API 데이터가 이렇게 해석되었습니다`

팝업 목적:

원본 API 키값이 A2UI 비교용 데이터 설명으로 어떻게 바뀌었는지 보여준다.

팝업 구성:

1. 변환 요약

| 항목 | 표시 예 |
| --- | --- |
| 원본 구조 | `items[]` |
| 비교 구조 | 목록형 데이터 |
| 전체 row | `44` |
| 비교 샘플 | `10` |
| 감지된 특징 | 제목값 있음, 상태값 있음, 이미지값 없음 |

2. API key 해석표

| API key | 예시 값 | 비교용 타입 | A2UI 역할 | 판단 |
| --- | --- | --- | --- | --- |
| `items[].name` | `CNC 가공기 01` | `string` | `title`, `label` | 화면 제목 후보 |
| `items[].isOnline` | `false` | `boolean` | `booleanFlag`, `status` | 상태 표시 후보 |
| `items[].isRunning` | `false` | `boolean` | `booleanFlag`, `status` | 상태 표시 후보 |
| `items[].hasAlarm` | `true` | `boolean` | `booleanFlag`, `status` | 상태 표시 후보 |
| `items[].needsInspection` | `true` | `boolean` | `booleanFlag`, `status` | 상태 표시 후보 |
| `items[].isReserved` | `true` | `boolean` | `booleanFlag`, `status` | 상태 표시 후보 |

3. 변환 규칙 설명

- key가 `name`, `title`, `equipmentName` 계열이면 제목 후보가 된다.
- 값이 boolean이면 상태 표시 후보가 된다.
- key나 값이 image/photo/thumbnail 또는 이미지 경로 형태면 이미지 후보가 된다.
- `items` 배열은 화면의 반복 row 후보가 된다.

고객이 알아야 하는 문장:

`이 단계에서 A2UI는 API key를 화면 후보와 비교할 수 있는 타입과 역할로 바꿉니다.`

## 3. 템플릿 조건 비교

위치:

- `A2UI Agent` self-loop의 `Compare data vs template` 근처
- 현재 단계 id 기준: `matcher`
- 데이터 준비 이벤트 기준: `state:matcher`

라벨 문구:

`화면 조건 비교`

라벨 보조 문구:

`선택 기준 0.72 · 후보 N개`

필요 데이터:

- `templateId`
- `score`
- `strategy`
- `reason`
- `candidates`
- `candidates[].breakdown`
- `candidates[].rejected`
- `candidates[].rejectionReason`
- `mapping`
- `dataIntegrity`

팝업 제목:

`등록된 화면들과 비교했습니다`

팝업 목적:

각 A2UI 템플릿이 왜 선택 가능하거나 제외되었는지 수치와 근거를 보여준다.

팝업 구성:

1. 비교 기준 요약

| 항목 | 표시 |
| --- | --- |
| 선택 통과 기준 | `0.72 이상` |
| 필수 영역 충족 | 모든 필수 영역이 채워져야 함 |
| 매핑 검증 | 연결된 API path가 실제 데이터 설명에 있어야 함 |

2. 후보 비교표

| 화면 후보 | 최종 수치 | 결과 | 제외 사유 |
| --- | ---: | --- | --- |
| 장비 상태 목록 | `0.95` | 선택 | - |
| 이미지 카드 목록 | `0.55` | 제외 | 이미지 역할 데이터 없음 |
| 간단 목록 | `0.70` | 제외 | 선택 기준 미달 |

3. 선택된 후보의 수치 breakdown

현재 코드의 계산식:

`최종 수치 = 데이터 형태 15% + 데이터 특징 15% + 필수 영역 충족 30% + 선택 영역 충족 10% + 타입 일치 10% + 역할 일치 10% + row 수 적합성 5% + 요청 문장 일치 5%`

| 비교 항목 | 코드값 | 가중치 | 고객용 설명 |
| --- | ---: | ---: | --- |
| 데이터 형태 | `shapeScore` | 15% | 목록형 데이터인지 |
| 데이터 특징 | `capabilityScore` | 15% | 상태값/이미지값 등 필요한 특징이 있는지 |
| 필수 영역 충족 | `requiredSlotCoverage` | 30% | 화면이 반드시 필요로 하는 영역을 채울 수 있는지 |
| 선택 영역 충족 | `optionalSlotCoverage` | 10% | 추가 표시 영역도 채울 수 있는지 |
| 타입 일치 | `typeCompatibility` | 10% | string/boolean/image 같은 타입이 맞는지 |
| 역할 일치 | `roleCompatibility` | 10% | 제목/상태/이미지 같은 역할이 맞는지 |
| row 수 적합성 | `rowCountSuitability` | 5% | 너무 적거나 많지 않은지 |
| 요청 문장 일치 | `intentAndQueryHint` | 5% | 사용자 요청과 화면 설명이 맞는지 |

4. 선택/제외 조건

템플릿은 다음 중 하나라도 해당하면 제외된다.

- 등록 상태가 아니다.
- 데이터 형태가 허용되지 않는다.
- 필요한 데이터 특징이 없다.
- row 수가 허용 범위를 벗어난다.
- 필수 화면 영역을 채울 수 없다.
- 최종 수치가 `0.72`보다 낮다.
- 연결된 API path가 실제 비교용 데이터에 없다.

고객이 알아야 하는 문장:

`이 화면은 느낌으로 고른 것이 아니라, 실제 데이터가 화면 조건을 얼마나 충족하는지 계산한 결과로 선택됩니다.`

## 4. 화면에 연결될 값

위치:

- `A2UI Agent -> Main Agent`의 `Decision: select template` 근처
- 또는 `Main Agent -> Chat UI`의 `Return selected template` 근처
- 현재 단계 id 기준: `a2ui-tool-result`, `surface`
- 데이터 준비 이벤트 기준: `state:a2ui_tool_result`, `surface`, `done`

라벨 문구:

`화면 값 연결`

라벨 보조 문구:

`name -> 제목 · boolean -> 상태`

필요 데이터:

- `mapping.mappings`
- `mapping.missingSlots`
- `renderPlan.fieldMapping`
- `surface.payload.data`
- `surface.payload.renderPlan`

팝업 제목:

`API 값이 화면 값으로 바뀌는 방식`

팝업 목적:

원본 API key와 실제 화면 표시값이 어떻게 연결되고 변환되는지 보여준다.

팝업 구성:

1. 연결 결과표

| 화면 영역 | 연결된 API path | 원본 예시 | 화면 표시 예 |
| --- | --- | --- | --- |
| 장비명 | `items[].name` | `CNC 가공기 01` | `CNC 가공기 01` |
| 온라인 상태 | `items[].isOnline` | `false` | `온라인 OFF` |
| 가동 상태 | `items[].isRunning` | `false` | `가동 OFF` |
| 알람 상태 | `items[].hasAlarm` | `true` | `알람 ON` |
| 점검 상태 | `items[].needsInspection` | `true` | `점검 ON` |
| 예약 상태 | `items[].isReserved` | `true` | `예약 ON` |

2. 표시값 변환 규칙

현재 렌더러 기준:

- `items[].name`은 row의 `name` 값을 읽어서 장비명으로 보여준다.
- `items[].isOnline`은 key `isOnline`을 `온라인` 라벨로 바꾼다.
- `items[].isRunning`은 key `isRunning`을 `가동` 라벨로 바꾼다.
- `items[].hasAlarm`은 key `hasAlarm`을 `알람` 라벨로 바꾼다.
- `items[].needsInspection`은 key `needsInspection`을 `점검` 라벨로 바꾼다.
- `items[].isReserved`은 key `isReserved`을 `예약` 라벨로 바꾼다.
- boolean 값은 `true -> ON`, `false -> OFF`로 보여준다.

3. path 변환 설명

비교용 데이터에서는 path가 `items.name`처럼 만들어질 수 있다. 렌더러가 읽을 수 있도록 `items[].name` 형태로 바뀐다.

| 비교용 path | 렌더러 path |
| --- | --- |
| `items.name` | `items[].name` |
| `items.isOnline` | `items[].isOnline` |

고객이 알아야 하는 문장:

`선택된 화면의 각 영역은 실제 API key와 연결되어 있고, 화면에서는 고객이 읽기 쉬운 라벨과 상태값으로 바뀝니다.`

## 5. 최종 선택 결과

위치:

- `Main Agent -> Chat UI`의 `Return selected template` 근처
- 현재 단계 id 기준: `surface`
- 데이터 준비 이벤트 기준: `surface`

라벨 문구:

`선택된 화면`

라벨 보조 문구:

`장비 상태 목록`

필요 데이터:

- `surface.templateId`
- `surface.payload.renderPlan.selectedComponentId`
- `surface.payload.renderPlan.viewType`
- `surface.payload.renderPlan.score`
- `surface.payload.renderPlan.reason`
- `surface.payload.renderPlan.maxItems`

팝업 제목:

`최종 선택 결과`

팝업 목적:

고객이 최종적으로 왜 이 화면을 보게 되었는지 한 문장과 핵심 수치로 확인한다.

팝업 구성:

1. 결론 문장

`장비 상태 목록 화면이 선택되었습니다. API 데이터에 장비명과 5개의 상태값이 있고, 필수 화면 영역이 모두 채워졌으며, 최종 수치가 선택 기준 0.72를 넘었습니다.`

2. 선택 요약

| 항목 | 표시 예 |
| --- | --- |
| 선택된 화면 | 장비 상태 목록 |
| 선택 수치 | `0.95` |
| 선택 기준 | `0.72` |
| 화면 방식 | 상태 목록 |
| 표시 row | 최대 6건 |

3. 최종 화면 preview 연결

팝업 하단에는 작은 preview table을 둔다.

| 장비 | 온라인 | 가동 | 알람 | 점검 | 예약 |
| --- | --- | --- | --- | --- | --- |
| CNC 가공기 01 | OFF | OFF | ON | ON | ON |
| 로봇 이송암 02 | ON | ON | OFF | OFF | OFF |

## 라벨 등장 순서

채팅 실행 후 라벨은 다음 순서로 등장한다.

1. `실제 API 데이터`
2. `비교용 데이터로 변환`
3. `화면 조건 비교`
4. `화면 값 연결`
5. `선택된 화면`

각 라벨은 자신과 연결된 이벤트가 도착했을 때만 보인다.

| 라벨 | 등장 조건 |
| --- | --- |
| 실제 API 데이터 | `business_tool_result` 이벤트 수신 |
| 비교용 데이터로 변환 | `profile` 이벤트 수신 및 `derivedSchema` 확보 |
| 화면 조건 비교 | `matcher` 이벤트 수신 |
| 화면 값 연결 | `mapping` 또는 `renderPlan.fieldMapping` 확보 |
| 선택된 화면 | `surface` 이벤트 수신 |

## 구현 시 필요한 payload 보강

현재 UI에 이미 들어오는 값만으로는 고객이 요구한 "실제 데이터와 변환 결과"를 충분히 보여주기 어렵다. 다음 값을 SSE trace에 추가해야 한다.

### business_tool_result 이벤트

추가 필요:

- `sourceDataPreview`
- `sourceDataPreview.items[0..2]`
- `sourceDataTopLevelKeys`

용도:

- 실제 API 데이터 팝업의 row preview 표시

### profile 이벤트

추가 필요:

- `sampleDataPreview`
- `derivedSchema.shape`
- `derivedSchema.primaryArrayPath`
- `derivedSchema.rowCount`
- `derivedSchema.sampleSize`
- `derivedSchema.fields`
- `derivedSchema.capabilities`

용도:

- API key가 비교용 타입/역할로 어떻게 변환되었는지 표시

### matcher 이벤트

현재 이미 필요한 핵심값이 대부분 들어온다.

유지해야 할 값:

- `templateId`
- `reason`
- `strategy`
- `score`
- `candidates`
- `candidateCount`
- `mapping`
- `dataIntegrity`

추가하면 좋은 값:

- `threshold: 0.72`
- `selectedCandidateId`
- `selectedCandidateBreakdown`

용도:

- 후보별 선택/제외 수치와 이유 표시

### surface 이벤트

현재 `surface` 안에 `payload.data`, `payload.renderPlan`, `payload.profile`이 들어온다.

유지해야 할 값:

- `surface.templateId`
- `surface.payload.data`
- `surface.payload.renderPlan`
- `surface.payload.profile`
- `surface.meta`

용도:

- API key와 화면 표시값의 실제 변환 결과 표시

## 팝업 UI 공통 구조

모든 팝업은 같은 레이아웃을 쓴다.

1. 상단 결론
   - 한 문장으로 무엇을 확인하는 팝업인지 설명한다.
2. 왼쪽 원본/입력
   - API 데이터, 비교용 데이터, 템플릿 조건 등 입력값을 보여준다.
3. 오른쪽 판단/결과
   - 수치, 통과/탈락, 선택 이유를 보여준다.
4. 하단 실제 예시
   - 원본 API key와 실제 화면 표시값을 나란히 보여준다.

팝업은 개발 로그처럼 보이면 안 된다. 고객이 "무엇을 근거로 선택했는지"를 검증하는 리포트처럼 보여야 한다.

## 최종 화면 메시지

이 변경 후 POC 화면이 전달해야 하는 메시지는 다음이다.

`A2UI는 API 데이터를 먼저 비교 가능한 구조로 바꾸고, 등록된 화면 조건과 수치로 비교한 뒤, 통과한 화면에 실제 API 값을 연결해서 보여준다.`

이 메시지가 보이면 POC의 핵심 기능이 드러난다.
