# A2UI Data Boundary Lab Development TODO

Date: 2026-06-17

## 1. 전제

이 TODO는 레거시 agent에 테스트 코드를 심기 위한 목록이 아니다.

개발 대상은 현재 POC 안에 있는 Main Agent, A2UI render boundary, A2A handler, template matcher, Flow Board UI다.

목표는 다음이다.

```text
레거시 역할을 fixture/scenario로 재현한다.
business API tool result가 a2ui_render로 그대로 전달되는 흐름을 보여준다.
A2UI가 받은 raw data의 전달 무결성을 비교한다.
preview/schema/normalization/matcher 판단 과정을 trace로 보여준다.
그 결과를 Data Boundary Lab과 Flow Board detail panel에서 시연한다.
```

## 2. 개발 원칙

```text
legacy agent 수정 없음
legacy agent 내부 테스트 작성 없음
A2UI POC 내부 fixture/harness로 legacy business tool result를 재현
raw data 무결성 비교는 원본 전체 data 기준
UI 판단은 bounded preview, derivedSchema, normalization, matcher trace 기준
```

중요한 구분:

```text
자동 검증: POC 내부 테스트 또는 harness가 trace 값을 검증한다.
화면 시연: 같은 trace 값을 Flow Board와 Data Boundary Lab에서 사람이 확인한다.
```

## 3. 1차 개발 범위

1차 개발은 다음 네 가지를 먼저 끝낸다.

```text
standard scenario
alias scenario
wide columns scenario
mutated scenario
```

`nested` scenario는 adapter 필요성을 설명하는 확장 시연으로 뒤로 미룬다.

## 4. Milestone 0 - 문서와 용어 정리

- [ ] 두 기준 문서를 현재 개발 기준으로 커밋한다.
  - `docs/20260617_a2ui-data-integrity-and-matcher-stability-test-plan.md`
  - `docs/20260617_a2ui-data-boundary-lab-demo-spec.md`
- [ ] "레거시 테스트"처럼 보이는 표현이 있으면 "POC 내부 검증 하네스"로 바꾼다.
- [ ] "테스트 코드 작성"이라는 표현은 필요한 곳에서만 쓰고, 목적은 "시연 가능한 trace 생성"이라고 명확히 적는다.
- [ ] 구현 중 source of truth 문서는 위 두 문서와 이 TODO로 둔다.

완료 기준:

```text
문서만 읽어도 개발 대상이 legacy agent가 아니라 현재 POC임을 알 수 있다.
```

## 5. Milestone 1 - Scenario Fixture 추가

목표:

```text
business API tool result처럼 보이는 데이터를 POC 내부에서 재현한다.
```

작업:

- [ ] fixture builder를 추가한다.
- [ ] `standard_equipment_status` fixture를 만든다.
- [ ] `factory_alias_status` fixture를 만든다.
  - 예: `eqpId`, `eqpNm`, `opYn`, `runYn`, `alrmCnt`, `inspReqYn`, `lastDtm`
- [ ] `wide_columns_status` fixture를 만든다.
  - row당 80-150개 컬럼
- [ ] `large_rows_status` fixture를 만든다.
  - 1,000-10,000 rows
- [ ] `mutated_missing_row` fixture를 만든다.
- [ ] `mutated_changed_field` fixture를 만든다.
- [ ] 민감 필드가 포함된 fixture를 만든다.
  - 예: `email`, `phone`, `token`

관련 후보 파일:

```text
packages/a2ui-python-agent/app/business_tools.py
packages/a2ui-python-agent/tests/test_business_tools.py
```

완료 기준:

```text
각 scenario가 실제 business API tool result처럼 동일한 형태로 반환된다.
UI와 검증 하네스가 같은 fixture를 사용할 수 있다.
```

## 6. Milestone 2 - Source Fingerprint 생성

목표:

```text
Main Agent가 business API tool result를 받은 직후 source fingerprint를 만든다.
```

작업:

- [ ] raw tool result 전체 기준 canonical hash를 만든다.
- [ ] row count를 계산한다.
- [ ] byte length를 계산한다.
- [ ] data shape을 기록한다.
- [ ] top-level keys를 기록한다.
- [ ] key order만 바뀐 object는 같은 hash가 나오게 한다.
- [ ] array row 순서가 바뀌면 다른 hash가 나오게 한다.

관련 후보 파일:

```text
packages/a2ui-python-agent/app/data_integrity.py
packages/a2ui-python-agent/app/a2ui_render_tool.py
packages/a2ui-python-agent/tests/test_data_integrity.py
```

완료 기준:

```text
source fingerprint가 preview가 아니라 raw data 전체 기준으로 만들어진다.
```

## 7. Milestone 3 - Received Fingerprint 비교

목표:

```text
A2UI 경계에서 받은 data 기준으로 received fingerprint를 다시 만들고 source와 비교한다.
```

작업:

- [ ] a2ui_render payload에 source fingerprint metadata를 포함한다.
- [ ] A2UI 경계에서 received fingerprint를 계산한다.
- [ ] `hashMatched`를 계산한다.
- [ ] `rowCountMatched`를 계산한다.
- [ ] `byteLengthMatched`를 계산한다.
- [ ] 최종 `dataIntegrity.matched`를 계산한다.
- [ ] row 누락 mutation에서 mismatch가 보이게 한다.
- [ ] field 값 변경 mutation에서 mismatch가 보이게 한다.

관련 후보 파일:

```text
packages/a2ui-python-agent/app/a2a_client.py
packages/a2ui-python-agent/app/render_boundary.py
src/server/a2a/a2ui-message-handler.ts
packages/a2ui-python-agent/tests/test_a2a_client.py
packages/a2ui-python-agent/tests/test_render_boundary.py
```

완료 기준:

```text
정상 전달은 matched=true다.
row 누락, field 변경, array 순서 변경은 matched=false다.
key 순서 변경만으로는 false가 되지 않는다.
```

## 8. Milestone 4 - Preview / Derived Schema 안정화

목표:

```text
데이터가 크거나 컬럼이 많아도 matcher 입력이 안정적으로 만들어지게 한다.
```

작업:

- [ ] large rows fixture에서 preview sample size가 제한되는지 확인한다.
- [ ] wide columns fixture에서 derived schema 생성이 깨지지 않게 한다.
- [ ] preview가 잘려도 원본 rowCount가 유지되게 한다.
- [ ] preview byte limit을 넘을 때 `truncated=true`가 남게 한다.
- [ ] 민감 필드 preview masking을 적용한다.
- [ ] masking은 preview에만 적용하고 raw integrity hash에는 영향을 주지 않게 한다.

관련 후보 파일:

```text
packages/a2ui-python-agent/app/schema/derived_schema.py
packages/a2ui-python-agent/tests/test_derived_schema.py
src/server/a2ui-admin/schema-matcher/sample-data-preview.ts
src/server/a2ui-admin/schema-matcher/derived-schema-builder.ts
```

완료 기준:

```text
10,000 rows 또는 100 columns 같은 fixture에서도 preview/schema 생성이 안정적으로 끝난다.
원본 rowCount와 preview sampleSize가 구분되어 보인다.
```

## 9. Milestone 5 - Normalization Trace 추가

목표:

```text
컬럼명과 값 형식이 달라도 같은 의미로 해석되는 과정을 보여준다.
```

작업:

- [ ] alias field를 canonical display field로 변환한다.
  - `eqpNm -> name`
  - `opYn -> isOnline`
  - `runYn -> isRunning`
  - `alrmCnt > 0 -> hasAlarm`
  - `inspReqYn -> needsInspection`
- [ ] string-coded status를 boolean으로 변환한다.
  - `"Y" -> true`
  - `"N" -> false`
  - `"ON" -> true`
  - `"OFF" -> false`
- [ ] 변환 전 raw row를 trace에 남긴다.
- [ ] 변환 후 normalized row를 trace에 남긴다.
- [ ] 어떤 rule로 변환했는지 mapping rule을 trace에 남긴다.
- [ ] raw data integrity 비교는 normalized data가 아니라 원본 raw data 기준으로 유지한다.

관련 후보 파일:

```text
packages/a2ui-python-agent/app/render_boundary.py
packages/a2ui-python-agent/app/schema/derived_schema.py
src/server/a2ui-admin/schema-matcher/template-mapping-builder.ts
```

완료 기준:

```text
alias/string-coded scenario가 raw 상태에서는 애매하지만, normalization 이후 common template으로 안정적으로 렌더링된다.
Flow Board detail에서 변환 전/후를 볼 수 있다.
```

## 10. Milestone 6 - Common Template 추가

목표:

```text
서로 다른 API result가 같은 A2UI template으로 그려지는 것을 보여준다.
```

작업:

- [ ] `equipment.commonStatusTable` template을 추가한다.
- [ ] 새 renderer viewType을 만들지 않고 기존 `statusBooleanList` viewType을 재사용한다.
- [ ] template inputSchema는 현재 타입에 맞춰 작성한다.
  - `slot`
  - `acceptsTypes`
  - `acceptsRoles`
  - `required`
- [ ] `statusBooleanList` renderer가 boolean field를 기준으로 안전하게 렌더링하는지 확인한다.
- [ ] raw string `"N"`이 truthy로 오렌더되지 않도록 normalized boolean만 renderer에 넘긴다.

관련 후보 파일:

```text
data/a2ui-template-catalog.json
src/features/a2ui-template-poc/template-types.ts
src/features/a2ui-template-poc/a2ui-demo-renderer.tsx
```

완료 기준:

```text
standard와 alias scenario가 같은 common template preview로 보인다.
```

## 11. Milestone 7 - Matcher Trace 추가

목표:

```text
A2UI가 어떤 값을 어떤 template slot과 비교했는지 설명 가능하게 한다.
```

작업:

- [ ] matcher candidate 목록을 trace에 포함한다.
- [ ] 선택된 template id를 trace에 포함한다.
- [ ] score를 trace에 포함한다.
- [ ] reason을 trace에 포함한다.
- [ ] field mapping 결과를 trace에 포함한다.
- [ ] fallback이 발생한 경우 fallback reason을 trace에 포함한다.
- [ ] alias scenario에서 normalization 전/후 판단 차이가 보이게 한다.

관련 후보 파일:

```text
src/server/a2ui-admin/a2ui-runtime.ts
src/server/a2ui-admin/schema-matcher/template-schema-matcher.ts
src/server/a2ui-admin/schema-matcher/template-mapping-builder.ts
src/server/a2ui-admin/schema-matcher/template-mapping-validator.ts
```

완료 기준:

```text
Data Boundary Lab 또는 Flow Board detail에서 "왜 이 template을 골랐는지"를 표로 설명할 수 있다.
```

## 12. Milestone 8 - Data Boundary Lab UI

목표:

```text
가운데 패널에서 API data와 A2UI preview를 비교해 본다.
```

작업:

- [ ] scenario tabs를 추가한다.
- [ ] API tabs를 추가한다.
- [ ] raw API data table을 추가한다.
- [ ] API마다 모든 컬럼을 보여준다.
- [ ] row가 많을 때 table은 화면에서 적절히 제한하거나 scroll 처리한다.
- [ ] 현재 scenario의 source fingerprint summary를 보여준다.
- [ ] A2UI common template preview를 보여준다.
- [ ] mutated scenario에서는 preview보다 mismatch 결과가 먼저 보이게 한다.

관련 후보 파일:

```text
src/features/a2ui-template-poc/poc-page.tsx
src/features/a2ui-template-poc/styles.module.css
src/features/a2ui-template-poc/a2ui-demo-renderer.tsx
```

완료 기준:

```text
사용자가 API별 raw table과 A2UI preview를 한 화면에서 비교할 수 있다.
```

## 13. Milestone 9 - Flow Board Sequence Detail

목표:

```text
시퀀스 다이어그램 label을 클릭하면 해당 단계의 data evidence가 Flow Board 안에서 보인다.
```

클릭 가능 label:

```text
Call business API tool
Business tool result
Run a2ui_render
Build profile / schema
Load template contracts
Match template / fields
a2ui_render result
Return SurfaceEnvelope
```

작업:

- [ ] Flow Board에 selected trace step state를 추가한다.
- [ ] 클릭 가능한 label에 hover/focus style을 추가한다.
- [ ] Sequence Trace Detail Panel을 Flow Board 안에 추가한다.
- [ ] `Business tool result` 클릭 시 raw tool result와 source fingerprint를 보여준다.
- [ ] `Run a2ui_render` 클릭 시 a2ui_render payload를 보여준다.
- [ ] `Build profile / schema` 클릭 시 변환 전/후와 derived schema를 보여준다.
- [ ] `Load template contracts` 클릭 시 template contract를 보여준다.
- [ ] `Match template / fields` 클릭 시 field mapping 비교표를 보여준다.
- [ ] `a2ui_render result` 클릭 시 source/received 비교 결과를 보여준다.
- [ ] `Return SurfaceEnvelope` 클릭 시 최종 SurfaceEnvelope를 보여준다.

관련 후보 파일:

```text
src/features/a2ui-template-poc/sequence-board.tsx
src/features/a2ui-template-poc/agent-flow-adapter.ts
src/features/a2ui-template-poc/agent-flow-types.ts
src/features/a2ui-template-poc/styles.module.css
```

완료 기준:

```text
시퀀스 흐름을 보다가 label을 클릭하면 같은 Flow Board 안에서 해당 단계의 증거를 확인할 수 있다.
가운데 Data Boundary Lab에는 단계별 detail을 넣지 않는다.
```

## 14. Milestone 10 - Demo Script 고정

목표:

```text
시연자가 어떤 순서로 클릭하고 어떤 메시지를 전달할지 고정한다.
```

작업:

- [ ] standard scenario demo script를 작성한다.
- [ ] alias scenario demo script를 작성한다.
- [ ] wide columns scenario demo script를 작성한다.
- [ ] mutated scenario demo script를 작성한다.
- [ ] 각 scenario에서 클릭할 Flow Board label 순서를 정한다.
- [ ] 각 scenario에서 보여줄 핵심 claim을 정한다.

시연 메시지:

```text
standard: 정상 전달과 정상 template 선택
alias: 컬럼명이 달라도 normalization 이후 같은 template 선택
wide columns: 컬럼이 많아도 schema/matcher가 깨지지 않음
mutated: 전달 중 row/value가 바뀌면 mismatch로 감지됨
```

완료 기준:

```text
데모를 보는 사람이 "데이터가 잘 전달됐는지"와 "A2UI 판단이 왜 그렇게 됐는지"를 화면에서 따라갈 수 있다.
```

## 15. Milestone 11 - 검증 명령

작업:

- [ ] Python agent 테스트를 실행한다.

```bash
npm run main-agent:test
```

- [ ] lint를 실행한다.

```bash
npm run lint
```

- [ ] build를 실행한다.

```bash
npm run build
```

- [ ] 브라우저에서 `http://localhost:3001/` 시연을 확인한다.
- [ ] standard/alias/wide/mutated scenario를 한 번씩 클릭해본다.
- [ ] Flow Board label 클릭 detail이 깨지지 않는지 확인한다.
- [ ] large/wide data table에서 layout overflow가 없는지 확인한다.

완료 기준:

```text
테스트와 브라우저 시연이 모두 통과한다.
```

## 16. 추천 개발 배치

첫 번째 배치:

```text
fixture builder
source/received fingerprint
mutation mismatch
preview/schema bounded behavior
```

두 번째 배치:

```text
normalization trace
common template
matcher trace
```

세 번째 배치:

```text
Data Boundary Lab UI
Flow Board clickable detail panel
demo script
browser verification
```

## 17. 최종 완료 조건

최종적으로 다음을 말할 수 있어야 한다.

```text
Main Agent가 business API tool result를 a2ui_render로 그대로 넘기는 흐름을 POC에서 재현했다.
A2UI 경계에서 raw data source/received fingerprint 비교가 가능하다.
row 누락, field 변경, array 순서 변경은 mismatch로 감지된다.
key 순서 변경은 오탐하지 않는다.
large/wide data도 preview/schema 생성이 안정적으로 동작한다.
alias/string-coded API data는 normalization trace를 거쳐 같은 common template으로 렌더링된다.
사용자는 Flow Board label 클릭으로 각 단계의 raw, converted, compared, matched 결과를 볼 수 있다.
```

## 18. 구현 완료 상태

2026-06-17 현재 이 TODO를 기준으로 다음 구현을 완료했다.

```text
POC 내부 fixture builder 추가
source/received fingerprint 비교 helper 추가
large/wide/sensitive preview/schema 테스트 추가
alias/string-coded status normalization trace 추가
raw data와 displayData를 분리한 A2A render payload 추가
A2A handler에서 raw data integrity와 displayData matcher 입력 분리
equipment.commonStatusTable 공용 template 추가
Data Boundary Lab UI 추가
Flow Board clickable label detail panel 추가
standard/alias/wide/mutated scenario 시연 추가
```

검증 결과:

```text
npm run main-agent:test: pass
npm run lint: pass with existing no-img-element warning
npm run build: pass
Browser check on http://localhost:3001/: pass
```

브라우저에서 확인한 시나리오:

```text
Standard: raw table, common template preview, source fingerprint 표시
Alias: eqpId/eqpNm/opYn/runYn/alrmCnt raw columns 표시, normalization detail 표시
Mutated: integrity mismatch badge 표시, source rows 6 / received rows 5 mismatch 표시
Flow Board: Business tool result, Build profile / schema, a2ui_render result label click detail 전환
```

아직 확장으로 남겨둔 항목:

```text
nested response adapter 시연
별도 Node/TS unit test harness
기존 imageCard renderer의 next/no-img-element lint warning 정리
```
