# pages

oobleck 공용 SPA 화면 빌더. 장 · 시트 · 흐름으로 된 화면을 문서로 짓고, 같은 문서를 어떤 디자인으로든 그린다.

| 패키지                 | 하는 일                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@oobleck/pages`       | 헤드리스. 문서 모델 · 편집 연산 · 조건식 · Seed 옮기기 · 에셋 계약 · 저장소 포트. React와 디자인 시스템을 모른다. |
| `@oobleck/pages-views` | 뷰. 레이아웃 장 · 블록 장을 그리고 부품은 킷 자리로 받는다. **기본 킷은 Workstyle** (`./workstyle`).              |

```json
{
  "@oobleck/pages": "github:oobleck-cloud/pages#path:packages/pages",
  "@oobleck/pages-views": "github:oobleck-cloud/pages#path:packages/pages-views"
}
```

`pages-views` 는 `@oobleck/workstyle` 을 형제 레포(`../../../workstyle`)로 받는다. 이 레포를 쓰는 쪽은 `workstyle` 을 옆에 둔다
(MVOS: `vendor/pages` · `vendor/workstyle` 서브모듈).

## 에셋

화면을 짓는 재료는 모두 에셋이다 — 팩 하나가 디자인 시스템 하나다.

- **테마**: 색 토큰 · 글자 스타일. 테마를 바꾸면 같은 문서가 다른 색으로 그려진다.
- **바탕**: 화면 배경. 팩마다 `screen` 바탕이 있고, 장의 맨 바깥 틀에 건 색이 바탕보다 앞선다.
- **부품**: canvas(Seed) 컴포넌트 속성 형식 그대로 — VARIANT · TEXT · BOOLEAN · INSTANCE_SWAP. 빌더가 더하는 것은 값(`value`)과 일으키는 일(`events`)뿐.

팩은 `workstylePack`(Seed Studio · Workstyle 다크 토큰)과 `campaignPack`(campaign-ds, MVOS 파트너 설문 v1 호환)이 있다.

## 킷

뷰 본체는 레이아웃(스택 · 글 · 간격 · 바탕)과 무엇을 보일지(조건)만 정한다. 부품 · 그림 · 고르기 테두리는 킷이 그린다.

```tsx
import '@oobleck/workstyle/react.css'
import { BlockList, LayoutScreen } from '@oobleck/pages-views'
import { workstyleBlockKit, workstyleKit } from '@oobleck/pages-views/workstyle'

;<div className="ws-scope">
  <LayoutScreen root={page.layout} kit={workstyleKit} ctx={ctx} fit />
  <BlockList blocks={page.blocks} kit={workstyleBlockKit} ctx={ctx} align={page.align} />
</div>
```

다른 디자인은 같은 자리를 제 부품으로 채운 킷을 만든다(`defineKit` · `defineBlockKit`). MVOS 파트너 설문은 MVOS 디자인
구현 킷(`campaignKit` · `campaignBlockKit`)을 앱에 두고 끼운다 — 헤드리스 문서와 뷰 본체는 그대로.

## 저장소 포트

빌더는 `DocumentStore`(읽기 · 저장 · 발행 · 미리보기 · 그림 올리기)만 안다. 어디에 두는지는 호스트가 어댑터로 채운다.
테스트 · 스토리는 `memoryStore`.

## 확인

```sh
npm install   # ../workstyle 이 있어야 한다
npm run type-check && npm test
```
