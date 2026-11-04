// @oobleck/pages — 헤드리스 SPA 화면(장 · 시트 · 흐름) 문서 코어. React · 디자인 시스템 · 호스트(MVOS)를 모른다.
// v1(캠페인 랜딩 문서, 나간 설문)은 그대로 읽고, v2(화면 문서)는 호스트가 v1 을 옮겨 읽는다(MVOS: campaign-v2).
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
  ValueType,
  ValueField,
  ScreenTemplate,
} from './assets'
export { workstylePack, workstyleTheme } from './packs/workstyle'
// 캠페인 팩(테마 · 부품 · 보험료 값 종류 · 화면 틀)과 v1 → v2 옮기기는 MVOS 에 있다 — 파트너 캠페인의 뜻이다.

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

// ── 화면 문서 v2 — 부품 조합 · 배치 편집, 값 연결 · 동작 체인 ────────────────
export {
  COMPONENT_REF,
  ScreenNodeSchema,
  FieldSchema,
  ScreenSchema,
  ScreenDocumentSchema,
  parseScreenDocument,
  walkScreen,
  findNode,
  screenInstances,
  nodeIds,
  splitRef,
} from './v2/screen'
export type {
  PropValue,
  TextNode,
  ImageNode,
  InstanceNode,
  UnknownNode,
  FrameNode,
  PlacedNode,
  ScreenNode,
  FieldOption,
  Field,
  Screen,
  ScreenDocument,
} from './v2/screen'
export { ActionListSchema, TERMINAL, planActions, actionTargets, hostActionsOf } from './v2/actions'
export type { Action, ActionList, Step } from './v2/actions'
export { CORE_VALUE_TYPES, valueTypesOf } from './v2/values'
export {
  formOf,
  scopeOf,
  componentOf,
  propOf,
  fieldAnswered,
  fieldText,
  screenFields,
} from './v2/form'
export {
  PlacementError,
  instantiateTemplate,
  addScreen,
  removeScreen,
  moveScreen,
  updateScreen,
  placeNode,
  placeInstance,
  removeNode,
  moveNode,
  setProps,
  setBind,
  setOn,
  setVisibleWhen,
  updatePlaced,
} from './v2/ops'
export {
  startFlow,
  runChain,
  currentScreenId,
  missingFields,
  visiblePages,
  screenVisible,
  flowProgress,
} from './v2/runtime'
export type { FlowState, FlowHost, FlowStop, FlowResult, FlowInput, HostResult } from './v2/runtime'
export { validateScreenDocument } from './v2/validate'
export type { ScreenIssue, ValidateOptions } from './v2/validate'
export { MESSAGES_KO, CATALOGS, issueMessage } from './v2/messages'
export type { IssueCode, IssueParams } from './v2/messages'
