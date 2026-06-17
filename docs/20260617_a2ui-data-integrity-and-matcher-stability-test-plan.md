# A2UI Data Integrity and Matcher Stability Test Plan

Date: 2026-06-17

## 1. 목적

이 문서는 현재 프로젝트에서 `a2ui_render`로 업무 API tool result를 넘길 때 검증해야 할 edge case 테스트를 정리한다.

이 테스트 묶음은 단순한 부하 테스트나 성능 스트레스 테스트가 아니다. 목적은 다음 두 가지다.

```text
1. Main Agent가 조회한 business API tool result가 A2UI Agent 경계까지 손실 없이 전달되는가?
2. A2UI Agent가 받은 데이터를 preview/schema/matcher로 판단할 때 큰 데이터, 많은 컬럼, 애매한 컬럼명에서도 안전하게 동작하는가?
```

따라서 이 문서에서는 테스트 묶음을 다음 이름으로 부른다.

```text
A2UI data boundary test
A2UI delivery integrity test
A2UI matcher stability test
```

`stress test`라는 이름은 피한다. 현재 필요한 것은 대량 트래픽이나 동시성 한계 측정이 아니라, 데이터 경계에서 손실/변형/오판단이 생기는지 검증하는 것이다.

## 2. 현재 Runtime 기준

현재 프로젝트의 data task 흐름은 다음과 같다.

```text
User message
  -> Chat UI
  -> Next /api/chat
  -> Main Agent /chat/stream
  -> Business API tool
  -> business tool result
  -> a2ui_render tool
  -> Render Boundary
  -> A2A A2UI Agent facade
  -> A2UI runtime / template matcher
  -> SurfaceEnvelope or text fallback
```

중요한 원칙:

```text
A2UI Agent가 업무 API를 먼저 호출하지 않는다.
Main Agent가 업무 API tool을 먼저 호출한다.
Main Agent는 business tool result를 a2ui_render로 넘긴다.
A2UI Agent는 받은 data를 검증하고 surface/fallback을 만든다.
```

## 3. 가장 중요한 구분

이 POC에서 데이터는 두 가지 목적으로 사용된다.

### 3.1 전달 무결성 검사는 원본 전체 data 기준

전달 무결성은 원본 전체 data를 기준으로 판단한다.

```text
Business API tool result 전체
  -> sourceDataHash
  -> sourceRowCount
  -> sourceDataByteLength
  -> sourceDataShape
  -> sourceTopLevelKeys
```

A2UI Agent 경계에서는 받은 data를 다시 계산한다.

```text
Received data 전체
  -> receivedHash
  -> receivedRowCount
  -> receivedByteLength
  -> receivedShape
  -> receivedTopLevelKeys
```

그리고 다음을 비교한다.

```text
sourceDataHash == receivedHash
sourceRowCount == receivedRowCount
sourceDataByteLength == receivedByteLength
```

즉, 전달 무결성은 preview나 schema가 아니라 원본 전체 data fingerprint 비교로 검증한다.

### 3.2 UI 판단은 bounded preview와 derived schema 기준

A2UI가 어떤 surface를 선택할지는 원본 전체 data를 그대로 읽어서 판단하지 않는다. 현재 구조에서는 다음 두 값을 사용한다.

```text
sampleDataPreview
  큰 data를 matcher가 안전하게 볼 수 있게 줄인 bounded preview다.
  현재 Python 경로의 기본값은 row_limit=10, byte_limit=20_000이다.

derivedSchema
  preview를 바탕으로 shape, field path, type, role, capabilities, rowCount를 정리한 schema다.
```

중요한 점:

```text
preview는 잘릴 수 있다.
하지만 rowCount는 원본 row count를 보존해야 한다.
matcher는 derivedSchema와 template inputSchema를 비교한다.
```

따라서 "1~2개 row만 보고 대충 그리는가?"가 아니라, 현재 목표는 다음에 가깝다.

```text
원본 전체 data는 fingerprint로 전달 손실을 검증한다.
UI 판단은 bounded preview와 derived schema로 한다.
판단 결과는 matcher trace로 남긴다.
```

## 4. 테스트로 답해야 하는 질문

이 테스트 묶음이 답해야 하는 질문은 다음이다.

```text
Q1. row가 많아도 source/received fingerprint가 일치하는가?
Q2. column이 많아도 schema 생성이 터지지 않는가?
Q3. preview가 잘려도 원본 rowCount가 유지되는가?
Q4. 중간에서 data가 누락/변형되면 mismatch를 감지하는가?
Q5. key 순서만 달라진 경우 hash가 안정적으로 같은가?
Q6. array 순서나 row 내용이 달라지면 hash mismatch가 나는가?
Q7. field alias가 많을 때 matcher가 맞게 고르거나 안전하게 fallback하는가?
Q8. string-coded status가 boolean/status로 잘못 해석되어 틀린 surface가 선택되지 않는가?
Q9. nested response shape을 받았을 때 현재 한계가 명확히 드러나는가?
Q10. preview에는 민감 필드가 masking되는가?
```

## 5. 테스트 분류

### 5.1 Delivery Integrity Tests

전달 경계에서 source와 received가 같은지 확인한다.

검증 대상:

```text
packages/a2ui-python-agent/app/data_integrity.py
packages/a2ui-python-agent/app/business_tools.py
packages/a2ui-python-agent/app/a2a_client.py
src/server/a2a/a2ui-message-handler.ts
```

관찰값:

```text
sourceDataHash
receivedHash
hashMatched
sourceRowCount
receivedRowCount
rowCountMatched
sourceDataByteLength
receivedByteLength
byteLengthMatched
dataIntegrity.matched
```

### 5.2 Preview and Schema Stability Tests

큰 data를 preview/schema로 줄이는 과정이 안정적인지 확인한다.

검증 대상:

```text
packages/a2ui-python-agent/app/schema/derived_schema.py
src/server/a2ui-admin/schema-matcher/sample-data-preview.ts
src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts
```

관찰값:

```text
sampleDataPreview.rowCount
sampleDataPreview.sampleSize
sampleDataPreview.truncated
sampleDataPreview.byteLength
derivedSchema.rowCount
derivedSchema.sampleSize
derivedSchema.fields
derivedSchema.capabilities
```

### 5.3 Matcher Stability Tests

schema와 template inputSchema 비교가 안전하게 동작하는지 확인한다.

검증 대상:

```text
src/server/a2ui-admin/a2ui-runtime.ts
src/server/a2ui-admin/schema-matcher/template-schema-matcher.ts
src/server/a2ui-admin/schema-matcher/template-mapping-builder.ts
src/server/a2ui-admin/schema-matcher/template-mapping-validator.ts
```

관찰값:

```text
recommendation.mode
recommendation.strategy
recommendation.score
recommendation.templateId
recommendation.candidates
recommendation.mapping
recommendation.reason
```

### 5.4 Negative Mutation Tests

전달 중 data가 바뀌면 반드시 mismatch가 보이는지 확인한다.

검증 대상:

```text
A2A render request payload
A2A handler dataIntegrity result
surface artifact decision.dataIntegrity
trace artifact dataIntegrity
task metadata.dataIntegrity
```

관찰값:

```text
dataIntegrity.matched === false
hashMatched === false
rowCountMatched === false when row is removed
byteLengthMatched === false when payload size changes
```

## 6. P0 테스트 케이스

P0는 이 POC에서 반드시 보여줘야 하는 핵심 테스트다.

개발 기준 주의:

```text
alias field와 string-coded status는 현재 기본 matcher/renderer만으로 항상 성공 렌더링된다고 보면 안 된다.
eqpNm/opYn/alrmCnt 같은 field는 alias dictionary, fixture adapter, 또는 normalized display data 생성이 있어야 공용 template 성공 시연으로 고정할 수 있다.

따라서 P0-09/P0-10은 두 단계로 본다.
1. normalization 도입 전: 낮은 score/fallback/reason trace가 명확해야 한다.
2. normalization 도입 후: 같은 공용 template으로 렌더링되고 conversion trace가 남아야 한다.
```

| ID | 이름 | 목적 | Fixture | 기대 결과 |
| --- | --- | --- | --- | --- |
| P0-01 | baseline status data | 정상 경로 기준선 | 현재 장비 상태 형태 | hash/row/byte match, `statusBooleanList` surface |
| P0-02 | large row count | row가 많은 경우 전달/preview 안정성 | `items` 1,000~10,000 rows | 원본 fingerprint match, preview sampleSize <= 10, rowCount 보존 |
| P0-03 | wide columns | 컬럼이 많은 경우 schema 안정성 | row당 80~150 fields | schema 생성 성공, 필요한 field mapping 또는 안전 fallback |
| P0-04 | large rows + wide columns | row와 column이 모두 큰 경우 | 1,000 rows x 100 fields | crash 없음, fingerprint match, preview bounded |
| P0-05 | mutation: row removed | 전달 중 row 누락 감지 | source metadata는 원본, received data는 1 row 삭제 | `matched=false`, hash/row/byte mismatch |
| P0-06 | mutation: field changed | 전달 중 값 변형 감지 | source metadata는 원본, received data는 field 값 변경 | `matched=false`, hash mismatch |
| P0-07 | canonical key order | key 순서 안정성 | 같은 object, key 순서만 변경 | hash match |
| P0-08 | array order sensitivity | row 순서 변형 감지 | 같은 rows, array 순서 변경 | hash mismatch, rowCount match |
| P0-09 | alias fields | 실제 공장 API식 축약 필드 | `eqpNm`, `opYn`, `alrmCnt` | normalization 전에는 fallback/reason, normalization 후에는 공용 template mapping |
| P0-10 | string-coded status | boolean이 문자열로 온 경우 | `"Y"`, `"N"`, `"ON"`, `"OFF"` | raw string을 boolean처럼 오렌더하지 않음, conversion 후에만 status surface |
| P0-11 | nested rows shape | nested response 구조 | `{ result: { rows: [...] } }` | 현재 한계 또는 adapter 필요성이 trace/fallback으로 드러남 |
| P0-12 | sensitive fields preview masking | preview masking 확인 | `email`, `phone`, `token` 포함 | preview에는 `[masked]`, 원본 integrity는 유지 |
| P0-13 | normalized display data | raw와 렌더용 canonical data 분리 | alias/string status data | raw integrity는 원본 기준, matcher/render는 normalized 기준, trace에 before/after 표시 |

## 7. P1 테스트 케이스

P1은 POC 안정성을 더 설득력 있게 만들기 위한 확장 테스트다.

| ID | 이름 | 목적 | Fixture | 기대 결과 |
| --- | --- | --- | --- | --- |
| P1-01 | null-heavy rows | null/missing field가 많은 경우 | row마다 field 일부 누락 | schema 생성 성공, examples가 null에 끌려가지 않음 |
| P1-02 | mixed type field | 같은 field에 타입이 섞인 경우 | `status`가 boolean/string/null 혼재 | unknown 또는 안전한 role 추론 |
| P1-03 | long text fields | 긴 문자열이 있는 경우 | description 5KB 이상 | preview byte limit 동작, crash 없음 |
| P1-04 | unicode and Korean hash | 한글/특수문자 hash 안정성 | 한글 장비명, 특수문자 포함 | source/received hash match |
| P1-05 | top-level huge metadata | rows 외 top-level payload가 큰 경우 | `debugPayload`, `rawMeta` 큰 문자열 | preview byte limit이 충분히 지켜지는지 확인 |
| P1-06 | non-object rows | primitive array | `[1,2,3]` 또는 `["a"]` | surface 대신 fallback |
| P1-07 | empty items | 빈 데이터 | `{ items: [], total: 0 }` | crash 없음, fallback 또는 empty surface 정책 확인 |
| P1-08 | total mismatch | `total`과 실제 items 길이가 다름 | `items.length=10`, `total=1000` | rowCount 기준이 `total`임을 명확히 확인 |
| P1-09 | image partial coverage | 일부 row만 image 있음 | imageUrl 일부 null | image template 오선택 여부 확인 |
| P1-10 | unknown extra columns | 관련 없는 column 다수 | 랜덤 metric/string fields | 핵심 mapping이 흔들리지 않음 |

## 8. 각 테스트의 Pass 기준

### 8.1 전달 무결성 Pass 기준

정상 데이터는 다음을 만족해야 한다.

```json
{
  "hashMatched": true,
  "rowCountMatched": true,
  "byteLengthMatched": true,
  "matched": true
}
```

변형 데이터는 다음 중 하나 이상이 반드시 false여야 한다.

```json
{
  "hashMatched": false,
  "rowCountMatched": false,
  "byteLengthMatched": false,
  "matched": false
}
```

정상 데이터인데 `matched=false`가 나오면 다음을 의심한다.

```text
Python canonical JSON과 Next stableStringify의 차이
undefined/null 처리 차이
전송 중 data wrapper가 바뀐 경우
source metadata가 원본이 아니라 preview 기준으로 계산된 경우
```

### 8.2 Preview/Schema Pass 기준

큰 row 데이터는 다음을 만족해야 한다.

```text
sampleDataPreview.sampleSize <= 10
sampleDataPreview.rowCount == original row count
derivedSchema.rowCount == original row count
derivedSchema.fields가 생성됨
preview byteLength가 제한 안쪽으로 들어오거나 truncated=true가 명확히 표시됨
```

주의:

```text
preview가 잘리는 것은 실패가 아니다.
rowCount를 preview row 수로 착각하는 것이 실패다.
```

### 8.3 Matcher Pass 기준

매칭 가능한 데이터는 다음을 만족해야 한다.

```text
mode == "render_surface"
strategy == "derived_schema"
templateId가 기대 template과 일치
score가 threshold 이상
mapping이 required slot을 채움
```

매칭이 애매한 데이터는 다음을 만족해야 한다.

```text
mode == "text_fallback" 또는 낮은 score
reason이 trace에 남음
candidates에 reject reason이 남음
틀린 surface를 조용히 만들지 않음
```

## 9. 추천 Test File 구성

현재 Python unittest가 이미 있으므로 P0 일부는 Python 테스트로 먼저 고정한다.

추천 파일:

```text
packages/a2ui-python-agent/tests/test_data_boundary_edge_cases.py
packages/a2ui-python-agent/tests/test_a2ui_integrity_mutation.py
packages/a2ui-python-agent/tests/test_schema_preview_edge_cases.py
```

Next/A2A handler의 dataIntegrity까지 직접 검증하려면 TypeScript 테스트가 필요하다. 현재 프로젝트에 TS test runner가 없다면 두 가지 선택지가 있다.

```text
선택 A: Python side unit test로 먼저 고정
  장점: 현재 테스트 체계 유지
  단점: A2A handler 내부의 received fingerprint는 직접 검증하지 못함

선택 B: Node 기반 smoke script 또는 test runner 추가
  장점: Python source hash와 Next received hash의 cross-runtime 비교를 직접 검증
  단점: 테스트 도구 추가 필요
```

POC 설득력 기준으로는 `선택 B`가 더 좋다. 이 POC의 핵심 질문이 "Main Agent가 넘긴 data와 A2UI가 받은 data가 같은가?"이기 때문이다.

## 10. 추천 Fixture Builder

테스트 fixture는 손으로 길게 만들지 말고 builder로 만든다.

예시 fixture 종류:

```text
makeEquipmentStatusRows(count)
makeWideEquipmentRows(rowCount, columnCount)
makeAliasEquipmentRows(count)
makeStringStatusRows(count)
makeNestedRows(count)
makeSensitiveRows(count)
makeLongTextRows(count, textLength)
```

예시 데이터:

```json
{
  "items": [
    {
      "id": "eq-0001",
      "name": "CNC 가공기 01",
      "isOnline": true,
      "isRunning": false,
      "hasAlarm": true,
      "needsInspection": false,
      "updatedAt": "2026-06-17T10:00:00Z"
    }
  ],
  "total": 1000,
  "page": 1,
  "pageSize": 1000
}
```

alias 데이터:

```json
{
  "items": [
    {
      "eqpId": "EQ-0001",
      "eqpNm": "CNC 가공기 01",
      "opYn": "Y",
      "runYn": "N",
      "alrmCnt": 3,
      "inspReqYn": "Y"
    }
  ],
  "total": 100
}
```

nested 데이터:

```json
{
  "result": {
    "rows": [
      {
        "id": "eq-0001",
        "name": "CNC 가공기 01"
      }
    ],
    "totalCount": 100
  },
  "success": true
}
```

이 nested 데이터는 현재 `items` 중심 reader에서는 정상 equipment response로 읽히지 않을 수 있다. 테스트의 목적은 이 한계를 숨기지 않고 adapter 필요성을 드러내는 것이다.

## 11. 테스트별 구체 Assertion

### 11.1 Large Rows Integrity

입력:

```text
items 10,000 rows
total 10,000
pageSize 10,000
```

검증:

```text
sourceRowCount == 10,000
receivedRowCount == 10,000
hashMatched == true
rowCountMatched == true
byteLengthMatched == true
sampleDataPreview.sampleSize <= 10
derivedSchema.rowCount == 10,000
```

### 11.2 Wide Columns Matcher

입력:

```text
items 50 rows
each row has 100 fields
field 중 name/status/boolean 후보 포함
```

검증:

```text
derivedSchema.fields length >= expected important fields
capabilities.hasBooleans == true when boolean fields exist
matcher does not crash
recommendation includes candidates
mapping either succeeds or fallback reason is explicit
```

### 11.3 Mutation Detection

입력:

```text
source metadata는 원본 data 기준
render request data는 row 1개 삭제
```

검증:

```text
hashMatched == false
rowCountMatched == false
byteLengthMatched == false
matched == false
```

### 11.4 Field Value Mutation

입력:

```text
source metadata는 원본 data 기준
render request data는 특정 field 값만 변경
```

검증:

```text
hashMatched == false
rowCountMatched == true
byteLengthMatched는 변경값 길이에 따라 true 또는 false 가능
matched == false
```

### 11.5 Canonical Key Order

입력:

```text
같은 object
key 순서만 다름
```

검증:

```text
dataHash가 같음
```

주의:

```text
object key 순서는 hash에 영향을 주면 안 된다.
array row 순서는 hash에 영향을 줘야 한다.
```

### 11.6 Sensitive Preview Masking

입력:

```text
email, phone, token, authorization, cookie field 포함
```

검증:

```text
sampleDataPreview.maskedFields에 민감 path 포함
sampleDataPreview.data의 민감 값은 "[masked]"
sourceDataHash는 original data 기준으로 유지
```

## 12. 구현 순서

추천 구현 순서는 다음이다.

```text
1. Python fixture builder 추가
2. data_integrity edge case unit test 추가
3. sampleDataPreview / derivedSchema edge case unit test 추가
4. A2A render request payload에 large/wide data가 보존되는지 unit test 추가
5. Next A2A handler의 dataIntegrity를 직접 호출하는 Node/TS 테스트 추가 여부 결정
6. mutation negative test 추가
7. alias/string-coded status의 fallback trace 테스트 추가
8. normalized display data 도입 후 P0-09/P0-10/P0-13 성공 경로 테스트 추가
9. npm run main-agent:test, npm run lint, npm run build로 검증
```

최소 구현으로 시작한다면 다음 4개를 먼저 만든다.

```text
P0-02 large row count
P0-03 wide columns
P0-05 mutation row removed
P0-12 sensitive fields preview masking
```

그 다음에 cross-runtime hash 비교를 추가한다.

Data Boundary Lab 시연까지 이어가려면 다음 묶음을 두 번째로 추가한다.

```text
P0-09 alias fields
P0-10 string-coded status
P0-13 normalized display data
```

이 두 번째 묶음은 공용 A2UI template 시연과 직접 연결된다.

## 13. 성공 기준

이 테스트 묶음을 통과했을 때 말할 수 있는 결론은 다음이다.

```text
Main Agent가 받은 business API tool result는 A2UI Agent 경계에서 hash/row/byte 기준으로 비교된다.
정상 전달에서는 source와 received fingerprint가 일치한다.
전달 중 누락/변형이 있으면 mismatch가 감지된다.
큰 data는 preview로 줄여 matcher에 넘기되 원본 rowCount는 유지된다.
컬럼이 많아도 derivedSchema 생성이 실패하지 않는다.
matcher가 확신할 수 없는 데이터는 틀린 surface를 조용히 만들지 않고 fallback/trace로 남긴다.
```

이것이 현재 POC의 핵심 검증 문장이다.

## 14. 현재 우려 포인트와 테스트 매핑

| 우려 | 테스트 |
| --- | --- |
| A2UI에 data가 전달되는 중 손실되지 않을까? | P0-01, P0-02, P0-05, P0-06 |
| data가 너무 크면 preview/schema 생성이 깨지지 않을까? | P0-02, P0-04, P1-03, P1-05 |
| column이 너무 많으면 matcher가 이상하게 고르지 않을까? | P0-03, P0-04, P1-10 |
| field명이 `eqpNm`, `opYn`처럼 오면 못 알아보지 않을까? | P0-09 |
| boolean/status가 문자열이면 잘못 판단하지 않을까? | P0-10 |
| API response shape이 `items`가 아니면 어떡하지? | P0-11 |
| 일부 data가 바뀌었는데 모르고 그리면 어떡하지? | P0-05, P0-06, P0-08 |
| preview가 잘리면서 원본 row count를 잃지 않을까? | P0-02, P1-08 |
| 민감 정보가 preview에 그대로 들어가지 않을까? | P0-12 |

## 15. 문서 기준 결론

현재 우리가 검증하려는 것은 다음이다.

```text
업무 API tool result 전체가 A2UI 경계까지 같은 데이터로 전달되는지 확인한다.
그 확인은 원본 전체 data fingerprint로 한다.

A2UI의 화면 선택은 원본 전체를 그대로 훑는 방식이 아니라
bounded preview와 derived schema를 만들어 template inputSchema와 비교하는 방식으로 한다.

따라서 테스트도 "전달 무결성"과 "판단 안정성"을 분리해서 작성해야 한다.
```

이 문서를 기준으로 테스트를 작성하면 POC에서 가장 중요한 리스크를 직접 검증할 수 있다.
