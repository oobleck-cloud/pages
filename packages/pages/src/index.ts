// @oobleck/pages — 헤드리스 SPA 화면(장 · 시트 · 흐름) 문서 코어. React · 디자인 시스템 · 호스트(MVOS)를 모른다.
// 지금은 캠페인 랜딩 문서 모델을 동작 그대로 옮긴 판이다(이름 일반화 · 스키마 v2 는 다음 조각).
// 공개 API 배럴 — 내보내는 이름을 하나씩 적는다. 패키지 안 파일끼리는 상대경로로만 import 한다.

export {
  NODE_ID,
  QUESTION_KEY,
  OPTION_VALUE,
  DOCUMENT_MAX,
  IMAGE_MAX_WIDTH,
  CampaignDocumentSchema,
  parseDocument,
  blankDocument,
  isPageVisible,
  isBlockVisible,
  pageQuestionBlocks,
  questionBlockOf,
  pageQuestions,
  indexOf,
  deckOf,
  pageNumber,
  numberedCount,
  nextStepOf,
  emphasisParts,
  validateDocument,
  hasBlockingIssue,
  questionsOfDocument,
  nextId,
  nextQuestionKey,
  newBlock,
  newQuestion,
  changeQuestionKind,
  newPage,
  insertPage,
  updatePage,
  removePage,
  movePage,
  duplicatePage,
  insertBlock,
  findBlock,
  updateBlock,
  removeBlock,
  moveBlock,
  answerIsCondition,
  answerIsNotCondition,
  readSimpleCondition,
  imageDisplaySize,
} from './campaign-document'
export type {
  CampaignImage,
  DocumentQuestion,
  QuestionKind,
  ButtonAction,
  CampaignBlock,
  BlockType,
  CampaignTransition,
  CampaignPage,
  CampaignDocument,
  NextStep,
  DocumentIssue,
  BlockHome,
} from './campaign-document'

export {
  CAMPAIGN_COLORS,
  CAMPAIGN_TEXT_STYLES,
  LayoutNodeSchema,
  walkLayout,
  layoutQuestions,
  mapLayout,
  layoutImages,
  findLayoutNode,
  colorOf,
  fontOf,
  kindsForPart,
} from './campaign-layout'
export type {
  CampaignColorToken,
  CampaignTextStyle,
  LayoutStack,
  LayoutImage,
  LayoutText,
  LayoutPart,
  LayoutQuestionPart,
  LayoutUnknown,
  LayoutNode,
} from './campaign-layout'

export {
  isPremiumAnswer,
  visibleSections,
  visibleQuestions,
  isAnswered,
  progressOf,
  answerText,
  allQuestions,
  cleanAnswers,
  sectionOf,
} from './campaign-form'
export type {
  ChoiceOption,
  CampaignQuestion,
  CampaignSection,
  CampaignForm,
  CampaignAnswers,
  PremiumAnswer,
  CampaignProgress,
} from './campaign-form'

export { EditOpSchema, EditOpError, applyEditOps } from './campaign-edit-ops'
export type { EditOp } from './campaign-edit-ops'

export { seedToPages, applySeed, questionStubFor, defineQuestionFor } from './seed-import'
export type { SeedImportPage, SeedImport } from './seed-import'

// ── 에셋 — 테마 · 바탕 · 부품(Seed 컴포넌트 속성 형식) · 팩 ──────────────────
export {
  defineTheme,
  definePack,
  resolveColor,
  resolveFont,
  findComponent,
  defaultProps,
  checkProps,
} from './assets'
export type {
  FontAsset,
  ThemeAsset,
  SurfaceAsset,
  PropDef,
  ValueDef,
  ComponentAsset,
  Asset,
  AssetPack,
} from './assets'
export { workstylePack, workstyleTheme } from './packs/workstyle'
export { campaignPack, campaignTheme } from './packs/campaign'

// ── 저장소 포트 — 빌더가 읽고 · 저장하고 · 발행하는 자리(어댑터는 호스트) ────────
export { memoryStore } from './store'
export type { DocumentStore, StoreSnapshot, StoreFailure, UploadedImage } from './store'

// ── 조건식 — 장 · 블록의 보이는 조건(JSONLogic 서브셋) ──────────────────────
export {
  ExprSchema,
  ExprError,
  evaluate,
  evaluateCondition,
  collectVarPaths,
  readPath,
} from './expr'
export type { Expr, ExprScope } from './expr'
