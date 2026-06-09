# A2UI Template Admin + Chatbot UI Redesign Plan

Date: 2026-06-08

Related:

- Design guide: `/Users/tahooki/Documents/git/seminar/docs/20260608_a2ui_product_intro_design.md`
- Project: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc`
- Current page: `http://localhost:3100`
- GitHub repo: `https://github.com/tahooki/a2ui-template-admin-chatbot-poc`

## 1. 목적

현재 POC는 기능 흐름은 충분히 증명하지만, 화면 인상이 아직 "작동하는 개발자 데모"에 가깝다.

이번 작업의 목적은 기존 기능을 유지하면서, 화면을 세미나에서 바로 보여줄 수 있는 제품 콘솔처럼 다듬는 것이다.

핵심 메시지는 그대로 유지한다.

> Agent가 데이터를 받으면 임의로 UI를 만드는 것이 아니라, Admin에 등록된 A2UI 템플릿 스펙과 비교해 적합한 화면을 선택하고 챗봇 안에 렌더링한다.

## 2. 작업 범위와 제약

이번 문서는 리디자인 작업 문서다. 기능을 새로 확장하기보다, 이미 동작하는 POC의 정보 위계와 시각 품질을 개선한다.

수정 대상 파일:

- `src/features/a2ui-template-poc/poc-page.tsx`
- `src/features/a2ui-template-poc/admin-panel.tsx`
- `src/features/a2ui-template-poc/chatbot-panel.tsx`
- `src/features/a2ui-template-poc/a2ui-demo-renderer.tsx`
- `src/features/a2ui-template-poc/styles.module.css`
- 필요 시 `src/app/globals.css`

건드리지 않을 것:

- mock API route의 응답 구조
- fixture 데이터 의미
- template registry 저장 로직
- component selector의 핵심 scoring 정책
- render plan builder의 데이터 흐름
- GitHub repo/public 설정

작업 제약:

- AGENTS 지시에 따라 build/test command는 사용자가 명시적으로 요청할 때만 실행한다.
- 확인은 dev server, 브라우저 수동 확인, API curl 중심으로 한다.
- 기존 시연 흐름은 깨지면 안 된다.
- 기존 디자인 가이드 컬러 토큰을 유지한다.

## 3. 현재 UI 평가

현재 점수: `6.5 / 10`

잘 된 점:

- 좌측 Admin, 우측 Chatbot 구조가 명확하다.
- `status API -> statusBooleanList`, `catalog API -> fallback`, `imageCard 등록 -> imageCardList` 시연 흐름이 동작한다.
- 디자인 가이드의 밝은 콘솔 배경, 네이비, 청록 톤은 적용되어 있다.
- registry version과 update 상태가 보여서 Admin과 Chatbot이 연결되어 있다는 점은 드러난다.

아쉬운 점:

- Admin과 Chatbot의 시각 무게가 비슷해서 화면의 주인공이 명확하지 않다.
- JSON editor가 화면 중심을 많이 차지해 "A2UI 선택 결과"보다 "설정 파일 편집"처럼 보인다.
- 챗봇 결과 안에 debug 정보가 많아 최종 A2UI surface가 묻힌다.
- 뱃지와 작은 텍스트가 많아 촘촘하지만 고급스럽지는 않다.
- Reset 버튼이 top bar와 Admin 양쪽에 있어 의미가 중복된다.
- 결과 카드들이 모두 비슷한 border와 radius를 가져 리듬이 단조롭다.

## 4. 리디자인 방향

목표 화면 톤:

- 개발자 데모보다 제품 콘솔에 가까운 화면
- 마케팅 랜딩이 아니라 실제 업무 도구처럼 조용한 밀도
- 최종 A2UI 렌더링 결과가 화면의 주인공
- Admin은 스펙 등록 도구, Chatbot은 Agent 판단 결과를 보여주는 무대

디자인 원칙:

- 기능은 그대로 유지한다.
- 장식은 추가하지 않는다.
- 정보 위계를 먼저 만든다.
- JSON은 필요하지만 항상 화면의 주인공이 되지 않게 한다.
- debug 정보는 접거나 압축하고, 결과 UI를 더 크게 보여준다.
- `--a2ui-bg`, `--a2ui-primary`, `--a2ui-teal`, `--a2ui-code` 토큰을 적극 활용한다.
- 카드 안에 또 다른 카드가 끝없이 들어간 것처럼 보이지 않게 한다.
- 장식 요소를 늘리기보다 spacing, typography, contrast로 완성도를 만든다.

## 5. 목표 레이아웃

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Command Bar                                              │
│ A2UI Studio / registry version / reset                       │
├───────────────────────────────┬──────────────────────────────┤
│ Template Registry             │ A2UI Chat                    │
│                               │                              │
│ List screen                   │ Prompt chips                 │
│ title + description only      │                              │
│                               │ Focused chat transcript      │
│ Drill-in detail screen        │                              │
│ Fields + collapsed schema     │ A2UI result surface          │
└───────────────────────────────┴──────────────────────────────┘
```

## 6. 화면별 개선안

### 6.1 Top Command Bar

현재:

- 제품명, registered count, registry version, Reset이 있다.
- 정보는 있으나 화면 전체를 정리하는 command bar 느낌은 약하다.

개선:

- 좌측: `A2UI Studio`
- 우측: `v1`, `Reset demo`
- Reset은 top bar 하나만 핵심 action으로 두고, Admin 내부 reset은 제거한다.
- top bar에서는 설명 문장을 제거해 데모 문서 느낌을 줄인다.

### 6.2 Registry Studio

현재:

- Template card들이 모두 비슷한 카드로 쌓여 있다.
- 뱃지가 많아 리스트가 조금 산만하다.

개선:

- Template list는 제목과 설명만 보이는 조용한 목록으로 만든다.
- `componentId`, roles, viewType은 기본 목록에서 숨긴다.
- 항목을 누르면 좌측 패널 내부에서 상세 화면으로 drill-in 된다.
- 이미지 템플릿 등록 CTA는 리스트 하단의 `템플릿 추가`로 둔다.

### 6.3 Detail Editor

현재:

- 모든 편집 필드와 JSON editor가 한 화면에 펼쳐져 있다.
- JSON이 가장 큰 면적을 차지한다.

개선:

- 목록과 상세를 동시에 보여주지 않고, 상세는 좌측 패널 내부 drill-in 화면으로 전환한다.
- 기본 상세에는 `이름`, `설명`만 노출하고 판단 기준은 화면에서 숨긴다.
- `매칭 규칙`, `스키마`는 접힌 disclosure로 둔다.
- JSON editor는 필요할 때만 열리는 `--a2ui-code` dark code panel로 둔다.
- Save action은 상세 하단에 짧게 배치한다.

### 6.4 Agent Preview

현재:

- 챗봇 메시지 안에 API/Profile/Selected/Reason/debug가 모두 노출된다.
- 결과 surface가 많아질수록 메시지 로그가 길고 무겁다.

개선:

- Chatbot panel 상단에는 `상태 목록`, `장비 목록` prompt chip만 둔다.
- 메시지 로그는 Agent trace가 아니라 채팅 transcript처럼 읽히게 한다.
- API/Profile/Selected/Reason/debug는 기본 화면에서 제거한다.
- 최종 A2UI surface는 assistant message 안의 업무 화면처럼 삽입한다.
- transcript 폭을 제한해 대화와 결과가 한 줄기 안에서 읽히게 한다.
- 메시지가 누적되어도 최신 result가 바로 보이도록 scroll target을 직접 계산한다.

### 6.5 A2UI Result Surface

현재:

- fallback list, status list, image card list가 모두 비슷한 카드 스타일이다.

개선:

- 등록된 A2UI가 없을 때는 surface를 만들지 않고 assistant message의 markdown list로 보여준다.
- `statusBooleanList`: 테이블형 list로 변경해 업무 콘솔 느낌을 강화한다.
- `imageCardList`: 이미지가 더 커 보이게 하고, card grid를 더 정돈한다.
- surface header에는 `A2UI` label과 화면 제목만 남긴다.
- 샘플 행 수는 기본 6개로 제한해 시연 화면의 정보량을 줄인다.
- 결과 surface는 챗봇 메시지의 일부라기보다 "채팅 안에 삽입된 업무 화면"처럼 보여야 한다.

## 7. 시연 UX 개선

시연 순서:

1. Reset demo로 초기 상태를 만든다.
2. `장비 상태 목록 보여줘`를 눌러 이미 등록된 A2UI 결과를 보여준다.
3. `이미지 있는 장비 리스트 보여줘`를 눌러 fallback 결과를 보여준다.
4. `템플릿 추가`를 눌러 이미지 카드 템플릿 draft를 연다.
5. `저장`을 눌렀을 때 registry version만 올라가고, 기존 chat transcript는 그대로 유지되는 것을 보여준다.
6. `장비 목록`을 다시 눌렀을 때 이미지 카드 A2UI 결과가 표시되는 것을 보여준다.

개선 포인트:

- 시연 버튼은 기능 버튼이 아니라 scenario button처럼 보여야 한다.
- fallback과 imageCard 결과 차이가 한눈에 보여야 한다.
- Admin 등록 직후 Chatbot은 기존 transcript를 유지하고, 다음 사용자 요청에서 새 템플릿을 적용한다.

## 8. 구현 전략

작업은 기능 변경보다 UI 구조 변경 중심으로 진행한다.

유지할 것:

- mock API
- template registry state
- localStorage persistence
- component selector
- render plan builder
- status/fallback/image renderer 기능
- drag resize
- reset behavior

바꿀 것:

- layout hierarchy
- component copy
- CSS density
- admin list/detail drill-in structure
- chatbot result presentation
- result surface visual design

## 9. TODO List

### Phase 0. Preflight

- [x] 현재 dev server가 켜져 있으면 그대로 사용하고, 중복으로 새 서버를 띄우지 않는다.
- [x] 현재 화면에서 reset 후 초기 상태를 확인한다.
- [x] `status -> fallback -> image register -> image result` 흐름을 한 번 재현해 기준 상태를 잡는다.
- [x] 변경 전 화면에서 눈에 거슬리는 지점을 스크린샷 또는 메모로 기록한다.
- [x] build/test command는 실행하지 않는다.

### Phase 1. Visual Hierarchy

- [x] Top bar를 `A2UI Studio` 중심으로 재구성한다.
- [x] top bar의 product description을 제거해 정보량을 줄인다.
- [x] Reset label을 `Reset demo`로 바꾼다.
- [x] Admin 내부 Reset 버튼을 제거한다.
- [x] 전체 workspace padding, gap, panel border를 재정리한다.
- [x] Chatbot panel이 우측의 "chat workspace"처럼 보이도록 배경과 border를 정리한다.

### Phase 2. Registry Studio

- [x] Template list card를 title/description만 보이는 compact item으로 바꾼다.
- [x] componentId, viewType, roles, status를 기본 목록에서 제거한다.
- [x] 목록 항목을 누르면 좌측 패널 내부 상세 화면으로 drill-in되게 만든다.
- [x] `Add image card`를 `템플릿 추가`로 줄이고 리스트 하단에 배치한다.
- [x] 이미지 카드 등록 버튼을 시연 CTA로 유지하되 주변 설명은 줄인다.

### Phase 3. Detail Editor Drill-in

- [x] Detail editor를 목록 옆이 아니라 좌측 패널 내부 drill-in 화면으로 전환한다.
- [x] 기본 상세에는 이름/설명만 두고 판단 기준은 숨긴다.
- [x] 매칭 규칙과 스키마는 disclosure로 접어둔다.
- [x] schemaSpec/surfaceConfig JSON editor를 dark code panel 스타일로 유지한다.
- [x] JSON parse error를 상세 하단에 선명하게 표시한다.
- [x] Save action을 상세 하단에 안정적으로 배치한다.

### Phase 4. Agent Preview Redesign

- [x] Quick prompt 영역을 chat prompt chip으로 정리한다.
- [x] quick prompt button copy를 `상태 목록`, `장비 목록`으로 줄인다.
- [x] 메시지 list를 Agent run timeline이 아니라 chat transcript처럼 정리한다.
- [x] stage chip과 metadata panel을 제거한다.
- [x] API/Profile/Selected/Reason debug 정보는 기본 노출하지 않는다.
- [x] registry update notice를 제거하고 최신 결과만 조용히 추가한다.
- [x] 최신 result가 명확히 보이도록 message list scroll target을 직접 계산한다.

### Phase 5. A2UI Surface Polish

- [x] 등록된 A2UI가 없을 때 fallback surface 대신 markdown list 응답을 표시한다.
- [x] 텍스트 목록 fallback 템플릿은 Admin 등록 목록에서 제거한다.
- [x] `statusBooleanList`를 업무 테이블형 list로 개선한다.
- [x] boolean flag pill의 on/off 시각 차이를 더 명확히 한다.
- [x] `imageCardList`의 이미지 면적을 키운다.
- [x] image card grid gap, typography를 정리한다.
- [x] surface header에서 componentId, score, registry version을 제거한다.
- [x] 기본 표시 행 수를 6개로 줄여 시연 화면의 정보량을 낮춘다.

### Phase 6. Responsive QA

- [x] 1440px desktop에서 Admin/Chatbot 비율을 확인한다.
- [x] 1280px desktop에서 JSON editor와 chatbot이 겹치지 않는지 확인한다.
- [x] 980px 이하에서 Admin과 Chatbot이 상하로 자연스럽게 쌓이는지 확인한다.
- [x] 560px 이하에서 버튼 텍스트와 뱃지가 넘치지 않는지 확인한다.
- [x] chat resize handle이 desktop에서만 보이는지 확인한다.
- [x] 긴 Korean description이 카드 밖으로 나가지 않는지 확인한다.

### Phase 7. Demo Final Pass

- [x] Reset demo 후 registry v1, 1 template, 빈 챗봇 상태를 확인한다.
- [x] 상태 API가 `equipment.statusBooleanList`로 렌더링되는지 확인한다.
- [x] 이미지 API 등록 전 markdown list fallback이 표시되는지 확인한다.
- [x] 이미지 카드 등록 후 `장비 목록`을 다시 눌러 `equipment.imageCardList`가 렌더링되는지 확인한다.
- [x] 같은 질문을 다시 보내도 결과가 안정적으로 재현되는지 확인한다.
- [x] dev server에서 runtime error가 없는지 확인한다.
- [x] build/test command는 사용자가 명시적으로 요청할 때만 실행한다.

## 10. 디자인 QA 체크리스트

- [x] Top bar에서 제품명, registry version, reset action이 3초 안에 읽힌다.
- [x] Admin list에서 template title/description만 조용하게 보인다.
- [x] Detail editor는 drill-in 화면에서 기본 필드와 접힌 스키마의 역할이 겹치지 않는다.
- [x] JSON editor는 접혀 있어서 화면을 압도하지 않는다.
- [x] Chatbot panel에서 quick scenario buttons가 바로 눈에 들어온다.
- [x] API/Profile/Selected/Reason 정보는 기본 화면에 노출되지 않는다.
- [x] Fallback 결과와 image card 결과의 차이가 한눈에 보인다.
- [x] 상태 리스트는 업무 화면처럼 스캔하기 쉽다.
- [x] 이미지 카드 결과는 실제 A2UI 화면처럼 충분히 시각적이다.
- [x] 버튼, 뱃지, 카드 내부 텍스트가 모바일/데스크톱에서 넘치지 않는다.
- [x] 전체 화면이 보라색 gradient, 장식 orb, 마케팅 hero처럼 보이지 않는다.

## 11. 완료 기준

- 첫 화면이 개발자 데모가 아니라 제품 콘솔처럼 보인다.
- 사용자가 시연 순서를 몰라도 quick scenario 버튼만 보고 흐름을 이해할 수 있다.
- JSON editor가 필요한 도구로 보이되, 화면의 주인공이 되지 않는다.
- 챗봇 안 A2UI result surface가 명확히 주인공으로 보인다.
- fallback과 image card 등록 후 결과 차이가 한눈에 보인다.
- Admin 변경이 Chatbot에 반영되는 구조가 시각적으로도 설득된다.

## 12. 한 줄 요약

이번 리디자인은 기능을 더 넣는 작업이 아니라, "A2UI가 등록된 스펙으로 데이터를 안정적인 업무 화면으로 바꾼다"는 메시지가 한눈에 보이도록 화면의 위계와 결과 surface를 제품 콘솔 수준으로 다듬는 작업이다.

## 13. 구현 완료 기록

완료일: 2026-06-08

반영 내용:

- Top command bar를 `A2UI Template Console` 중심으로 재구성하고 Admin 내부 reset action을 제거했다.
- Registry Studio list를 compact selectable row로 바꾸고, 선택 상태를 left border/highlight로 표현했다.
- Detail Editor를 좌측 패널 내부 drill-in 화면으로 바꾸고 JSON editor는 접힌 dark code panel로 변경했다.
- Agent Preview의 quick prompt 영역을 scenario control로 재정리하고 metadata block을 압축했다.
- `statusBooleanList`, `imageCardList` surface를 업무 테이블과 이미지 카드 그리드로 차별화하고, fallback은 assistant markdown list로 분리했다.
- Registry 변경 후에는 chat transcript를 자동 변경하지 않고, 사용자가 같은 요청을 다시 보냈을 때 새 템플릿을 적용하도록 정리했다.
- 최신 result가 길어도 result header부터 보이도록 chat scroll 기준을 latest message 상단으로 조정했다.

검증 기록:

- `http://localhost:3100` dev server에서 reset 초기 상태가 `registry v1`, `1 template`, 빈 챗봇 상태로 돌아오는 것을 확인했다.
- 상태 API 호출이 `equipment.statusBooleanList`와 ON/OFF 테이블 surface로 렌더링되는 것을 확인했다.
- 이미지 API 등록 전에는 A2UI surface 없이 markdown list fallback이 표시되는 것을 확인했다.
- `템플릿 추가` 후 `저장`을 눌렀을 때 `registry v2`, `2 templates`가 되지만 기존 chat fallback은 그대로 유지되는 것을 확인했다.
- `장비 목록`을 다시 눌러 같은 image card 결과가 안정적으로 재현되는 것을 확인했다.
- 1440px, 1280px, 980px, 560px viewport에서 overflow와 버튼 텍스트 넘침이 없고, 980px 이하에서 Admin/Chatbot이 상하로 쌓이며 resize handle이 숨겨지는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 14. 검수 후 수정 기록

검수일: 2026-06-08

수정 내용:

- 이미지 카드 A2UI는 재실행 후 정상 렌더링되지만, 최신 `Result Surface`가 우측 패널 첫 화면 아래로 밀려 바로 보이지 않는 문제가 있었다. 최신 메시지/surface를 DOM marker로 찾고 message list scroll target을 직접 계산하도록 수정했다.
- 기본 480px Chatbot 폭에서 `statusBooleanList` 테이블이 가로스크롤을 만들 수 있어, boolean 컬럼 최소 폭과 padding을 줄이고 테이블이 컨테이너 폭에 맞춰 유연하게 줄어들도록 수정했다.

재검증 기록:

- 이미지 API fallback 후 `템플릿 추가`만 눌렀을 때는 registry와 chat이 바뀌지 않고, `저장`을 누른 뒤에도 기존 chat transcript가 유지되는 것을 확인했다.
- 상태 API result table은 기본 desktop, 1440px, 1280px, 980px, 560px viewport에서 horizontal overflow 없이 표시되는 것을 확인했다.
- 1440px, 1280px, 980px, 560px viewport에서 body overflow와 버튼 텍스트 넘침이 없고, 980px 이하에서 resize handle이 숨겨지는 것을 재확인했다.
- 브라우저 error log는 비어 있었다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 15. 제품형 UI 개선 기록

개선일: 2026-06-08

사용자 피드백:

- 기존 화면은 기능을 한 번에 나열한 POC UI처럼 보였다.
- Chatbot 영역은 채팅 자체에 더 집중해야 한다.
- Admin 영역은 템플릿 아이템 리스트를 보고, 아이템 안으로 들어가 상세 정보를 보는 제품 구조가 되어야 한다.

반영 내용:

- Top bar를 `A2UI Studio`로 줄이고 설명 문장을 제거해 제품 콘솔 톤으로 정리했다.
- Admin을 목록 화면과 상세 drill-in 화면으로 분리했다.
- 템플릿 목록에는 제목과 설명만 남기고, componentId/viewType/roles/status는 기본 목록에서 제거했다.
- 상세 화면에는 이름/설명만 기본 노출하고, 판단 기준은 숨겼으며 매칭 규칙과 스키마는 접힌 영역으로 이동했다.
- Chatbot을 `A2UI Chat` 중심으로 바꾸고, 추천 시나리오는 채팅용 prompt chip으로 정리했다.
- API/Profile/Selected/Reason debug 정보와 Agent trace UI는 기본 화면에서 제거했다.
- 최종 A2UI 결과는 assistant message의 attachment처럼 보이게 하고, 채팅 입력창은 하단에 유지했다.

검증 기록:

- Reset 후 상태 시나리오를 실행해 `equipment.statusBooleanList` result surface가 채팅 안에 표시되는 것을 확인했다.
- 이미지 API fallback 후 image card 템플릿 등록 시 `equipment.imageCardList` result surface가 정상 표시되는 것을 확인했다.
- 1440px, 1280px, 980px, 560px viewport에서 body overflow와 버튼 텍스트 넘침이 없고, 980px 이하에서 resize handle이 숨겨지는 것을 확인했다.
- 브라우저 error log는 비어 있었다.
- 최종 스크린샷: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc/docs/a2ui-template-studio-final-reduced-status-20260608.png`
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 16. 정보 축소형 제품 UI 재정리 기록

개선일: 2026-06-08

사용자 피드백:

- 여전히 근본 없는 디자인처럼 보인다.
- 어디서 본 제품 UI인지 감이 오지 않는다.
- 정보가 너무 많고 난잡하다.

반영 방향:

- 익숙한 설정 콘솔 + 채팅 제품 패턴으로 재정리했다.
- 첫 화면에서는 Admin 목록과 Chat transcript만 보이게 하고, 상세 편집은 좌측 패널 내부 drill-in으로 이동했다.
- Chat은 넓은 빈 화면에 메시지가 흩어지지 않도록 transcript 폭을 제한했다.
- role label, score, componentId, registry debug, trace, footer row count를 화면에서 제거했다.
- status/image/fallback 결과는 최대 6개 항목만 보여 시연 화면의 밀도를 낮췄다.
- 이미지 카드 등록 후 최신 result가 바로 보이도록 message list scroll target을 직접 계산한다.

최종 검증 기록:

- 상태 목록 시나리오에서 `statusBooleanList`가 헤더 포함 7줄로 표시되고 가로 overflow가 없는 것을 확인했다.
- `장비 목록보여줘` 시나리오에서 등록 전 fallback이 보이고, `템플릿 추가` 후 `저장`만으로는 기존 chat이 바뀌지 않는 것을 확인했다.
- `장비 목록`을 다시 누른 후 최신 이미지 카드 surface가 viewport 안에 보이는 것을 DOM 좌표와 새 viewport screenshot으로 확인했다.
- 최신 상태 화면 스크린샷: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc/docs/a2ui-template-studio-final-reduced-status-20260608.png`
- 이미지 카드 전환 스크린샷: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc/docs/a2ui-template-studio-image-card-visible-unique-20260608-01.png`
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 17. 커밋 전 최종 버튼 배치 수정

수정일: 2026-06-09

사용자 피드백:

- Admin 목록의 `템플릿` 중간 헤더와 `이미지 카드 추가` 버튼 줄이 불필요하게 보인다.
- 추가 버튼은 템플릿 리스트 하단에 배치하는 편이 낫다.

반영 내용:

- 목록 상단의 `템플릿` 중간 헤더 줄을 제거했다.
- `이미지 카드 추가` 버튼을 `템플릿 추가`로 바꾸고 리스트 하단 dashed action으로 이동했다.
- 첫 화면의 Admin 목록은 등록된 A2UI 템플릿 카드와 하단 추가 버튼만 보이도록 정리했다.

검증 기록:

- `http://localhost:3100`에서 reset 후 Admin 목록에 중간 헤더가 사라진 것을 확인했다.
- `템플릿 추가` 버튼이 리스트 하단에 표시되는 것을 확인했다.
- 템플릿 상세 drill-in 화면 진입과 가로 overflow 없음도 확인했다.
- 목록 버튼 배치 스크린샷: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc/docs/a2ui-template-list-add-button-bottom-20260609.png`
- 템플릿 상세 스크린샷: `/Users/tahooki/Documents/git/a2ui-template-admin-chatbot-poc/docs/a2ui-template-detail-status-20260609.png`
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 18. 저장 복귀와 Fallback 응답 수정

수정일: 2026-06-09

사용자 피드백:

- 템플릿 상세에서 `저장`하면 리스트로 돌아가야 한다.
- A2UI가 없는 fallback 상황에서는 A2UI surface가 아니라 에이전트가 마크다운처럼 작성한 리스트가 보여야 한다.

반영 내용:

- 템플릿 상세 저장 성공 후 좌측 Admin이 템플릿 목록 화면으로 돌아가도록 수정했다.
- `renderPlan.isFallback`일 때는 `A2UIDemoRenderer`를 붙이지 않는다.
- fallback 응답은 assistant가 직접 장비 카탈로그를 읽고 정리한 것처럼 `- 장비명: 라인/위치/설명` 형태의 자연스러운 글 목록으로 표시한다.
- 채팅 본문은 줄바꿈을 유지하도록 `white-space: pre-line`을 적용했다.

검증 기록:

- `장비 목록보여줘` 시나리오에서 템플릿 등록 전 fallback이 A2UI surface 없이 마크다운식 bullet list로 표시되는 것을 확인했다.
- `템플릿 추가` 후 상세에서 `저장`하면 Admin이 리스트 화면으로 복귀하는 것을 확인했다.
- 이미지 카드 A2UI 등록 후 `장비 목록`을 다시 누르면 image card surface가 정상 동작하는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 19. 텍스트 템플릿 제거와 저장 전 미반영 수정

수정일: 2026-06-09

사용자 피드백:

- `텍스트 목록`은 Admin 템플릿 목록에 없어도 된다.
- `템플릿 추가`를 누르는 순간 이미지 A2UI가 chat에 바로 나오면 안 된다.
- `템플릿 추가`는 저장이 아니라 draft 상세를 여는 동작이어야 한다.

반영 내용:

- 초기 등록 템플릿에서 `텍스트 목록(simpleTextList)`를 제거했다.
- 기존 localStorage registry에 남아 있을 수 있는 `simpleTextList`도 로드 시 제거한다.
- fallback은 등록된 템플릿이 아니라 내부 `agent.markdownList` 흐름으로 처리한다.
- `템플릿 추가` 클릭 시 `IMAGE_CARD_REGISTRATION_PRESET`을 draft로만 열고, registry에는 저장하지 않는다.
- `저장`을 눌렀을 때 registry version만 올라가고 chat은 기존 fallback transcript를 유지한다.

검증 기록:

- Reset 후 Admin에는 `장비 상태 목록`만 남고 `텍스트 목록`은 보이지 않는 것을 확인했다.
- `장비 목록` 클릭 후 fallback은 에이전트가 직접 정리한 글 목록으로 표시되는 것을 확인했다.
- fallback 상태에서 `템플릿 추가`만 누르면 chat은 image card A2UI로 바뀌지 않는 것을 확인했다.
- draft 상세에서 `저장`을 눌러도 기존 chat에는 image card A2UI가 즉시 추가되지 않는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 20. 저장 후 기존 chat 자동 전환 제거

수정일: 2026-06-09

사용자 피드백:

- 이미 `장비 목록보여줘` fallback 응답이 있는 상태에서 이미지 템플릿을 저장하면 A2UI 장비 목록이 chat에 바로 추가되면 안 된다.

반영 내용:

- `registryVersion` 변경 시 마지막 질문을 자동 재실행하던 Chatbot effect를 제거했다.
- 템플릿 저장은 Admin registry와 version만 갱신한다.
- 저장 후 기존 chat transcript는 fallback 응답 그대로 유지한다.
- 새 템플릿은 `장비 목록`을 다시 누르거나 입력창에 같은 요청을 다시 보냈을 때만 적용된다.

검증 기록:

- `장비 목록` fallback 후 이미지 템플릿을 저장해도 chat에 image card A2UI가 즉시 추가되지 않는 것을 확인했다.
- 저장 후 registry는 `v2`, 2 templates가 되지만 기존 fallback message는 유지되는 것을 확인했다.
- `장비 목록`을 다시 눌렀을 때 image card 6개가 렌더링되는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 21. 다시 실행 버튼 제거

수정일: 2026-06-09

사용자 피드백:

- Chatbot 상단의 `다시 실행` 버튼은 제거한다.

반영 내용:

- scenario controls에서 `다시 실행` 버튼을 제거했다.
- 버튼 활성화를 위해 남아 있던 `lastQuery` 상태를 제거했다.
- 관련 CSS의 `rerunButton` 스타일을 제거했다.
- 새 템플릿 적용은 `장비 목록` prompt를 다시 누르거나 입력창에 직접 요청을 다시 보낼 때만 일어난다.

검증 기록:

- Chatbot 상단에 `상태 목록`, `장비 목록` 버튼만 남는 것을 확인했다.
- `다시 실행` 버튼이 DOM에 렌더링되지 않는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 22. 템플릿 추가 버튼 활성 유지

수정일: 2026-06-09

사용자 피드백:

- 이미지 템플릿을 등록한 뒤에도 `템플릿 추가` 버튼이 disabled 되면 안 된다.

반영 내용:

- 이미지 카드 템플릿 등록 여부를 기준으로 `템플릿 추가` 버튼을 disabled 처리하던 guard를 제거했다.
- 등록 후에도 `템플릿 추가` 버튼은 계속 활성 상태를 유지한다.

검증 기록:

- 이미지 카드 템플릿 저장 후 Admin 목록으로 돌아와도 `템플릿 추가` 버튼이 enabled 상태인 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.

## 23. 장비 목록 fallback 문체 개선

수정일: 2026-06-09

사용자 피드백:

- A2UI가 없을 때 나오는 장비 목록 fallback이 더미 데이터 목록처럼 보이면 안 된다.
- `장비 목록 보여줘` 요청에는 mock API 데이터를 기반으로 Agent가 직접 정리한 bullet point 답변처럼 보여야 한다.

반영 내용:

- fallback 응답 시작 문구를 `장비 카탈로그를 확인했어요. 현재 등록된 장비는 총 44대입니다.` 형태로 변경했다.
- 대표 장비 6개를 bullet point로 보여주되, 각 항목은 장비명, 위치, 카테고리, 역할 설명을 조합해 작성한다.
- 카테고리별로 가공, 이송, 유틸리티, 검사 장비의 역할 문장을 다르게 만든다.
- 이미지 템플릿 부재 설명을 길게 붙이지 않고, 사용자가 요청한 장비 목록 자체에 집중한다.

검증 기록:

- `장비 목록` 요청 시 `CNC 가공기 01`, `로봇 이송암 02`, `순환 펌프 03`, `비전 검사기 04`가 자연스러운 bullet point로 표시되는 것을 확인했다.
- AGENTS 제약에 따라 build/test command는 실행하지 않았다.
