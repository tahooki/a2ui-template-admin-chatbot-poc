# A2UI Admin Design System

## Goal

- A2UI Template Catalog를 빠르고 안전하게 조회, 편집, 검증, 저장하는 운영 화면을 만든다.
- Admin, Chatbot, Agent Flow Lab이 각자 독립적으로 실행되는 구조를 시각적으로도 분명하게 보여준다.
- 장식보다 반복 작업의 가독성, 정렬, 상태 인지, 오류 방지를 우선한다.

## Color

```text
Canvas         #F4F4F0
Surface        #FBFBF8
Surface strong #FFFFFF
Ink            #18181B
Muted          #666A73
Line           rgba(24, 24, 27, 0.14)
Line strong    rgba(24, 24, 27, 0.34)
Accent         #2F6FED
Accent soft    #EAF0FF
Success        #147A55
Warning        #A15C00
Danger         #B42318
Code           #17191E
```

- Accent는 현재 위치, 선택 상태, 주요 저장 액션에만 사용한다.
- 한 화면에서 Accent가 넓은 면적으로 반복되지 않게 한다.
- 상태 색상은 의미 전달이 필요한 배지와 검증 결과에만 사용한다.

## Typography

- UI: Geist, Apple SD Gothic Neo, Pretendard, sans-serif
- Code/metadata: Geist Mono, ui-monospace, monospace
- Page title: 24px / 720
- Panel title: 17px / 700
- Section title: 14px / 750
- Body: 13px / 450
- Metadata: 11px / 650
- 두 자리 섹션 번호는 Mono 11px로 표시하고 제목보다 낮은 대비를 사용한다.

## Layout

- Desktop은 12열 그리드를 사용한다.
- 전역 간격 단위는 4px이며 주요 간격은 8, 12, 16, 24px이다.
- Admin Workspace는 Catalog 35%, Editor 65% 비율의 분할 구조를 사용한다.
- 모든 주요 패널은 동일한 1px 경계선과 12px 외부 간격을 사용한다.
- 화면 높이 안에서 Header는 고정하고 Catalog와 Editor가 각각 독립적으로 스크롤한다.
- 880px 이하에서는 Catalog와 Editor를 동시에 표시하지 않고 화면 전환 방식으로 사용한다.
- 의도하지 않은 카드 중첩, 랜덤한 여백, 서로 다른 테두리 두께를 사용하지 않는다.

## Components

### Frame

- 1px Line 경계
- 4px 이하의 작은 radius
- Heavy shadow 없음
- Corner bracket은 주요 패널에만 낮은 대비로 사용

### Button

- Primary는 Accent 배경과 흰색 텍스트
- Secondary는 Surface 배경과 Line 경계
- Danger는 텍스트 또는 경계에서만 제한적으로 사용
- 높이 32–36px, pill 형태 금지

### Input

- 흰색 또는 Surface strong 배경
- 1px Line 경계
- Focus 시 Accent 경계와 2px soft ring
- 오류는 Danger 경계와 필드 하단 설명으로 표시

### Catalog Row

- 카드가 아니라 전체 폭 행 형태
- Title, Component ID, View Type, Status 순서
- 선택된 행만 Accent soft 배경과 왼쪽 Accent rule 사용

### Editor Section

- `01`, `02`, `03`, `04`의 일관된 번호 사용
- 제목, 설명, 입력 영역 순으로 구성
- 섹션은 선과 간격으로 구분하고 별도 카드 안에 다시 넣지 않는다.

### Code Editor

- Code 배경, 밝은 코드 텍스트
- Mono 12px
- JSON 문법 오류를 Editor 아래와 Validation 영역에 동시에 표시

### Status

- Loading, Saved, Unsaved, Error 상태를 텍스트와 작은 점으로 표시
- 색상만으로 상태를 전달하지 않는다.

## Constraints

- 템플릿 미리보기 기능을 추가하지 않는다.
- Admin에 Chatbot UI 또는 Agent Flow Board를 넣지 않는다.
- Chatbot에 Admin 편집 기능을 넣지 않는다.
- Gradient, glass, glow, WebGL, 3D 장식을 사용하지 않는다.
- 마케팅 페이지용 히어로, KPI 카드, 차트를 억지로 추가하지 않는다.
- 기존 Admin API와 Template Catalog 데이터 형식을 UI 스타일 때문에 변경하지 않는다.
