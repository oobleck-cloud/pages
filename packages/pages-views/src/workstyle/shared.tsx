import type { BlockEditing } from '../blocks'
import type { PickProps } from '../kit'
import type { CampaignImage } from '@oobleck/pages'
import type { CSSProperties } from 'react'

/** Workstyle 킷(블록 · 레이아웃 · 화면 v2)이 함께 쓰는 고르기 상자 · 그림. */

export const ink = (n: 1 | 2 | 3) => `var(--ink${String(n)})`

// ── 고르기 상자 · 그림 ──────────────────────────────────────────────────────

export function Pick({
  ctx,
  id,
  style,
  hidden,
  children,
}: PickProps<{ editing?: BlockEditing | undefined }>) {
  const editing = ctx.editing
  if (!editing) return <div style={style}>{children}</div>
  const picked = editing.selected === id
  return (
    <div
      data-pick={id}
      onClickCapture={() => editing.onSelect(id)}
      style={{
        ...style,
        outline: picked ? '2px solid var(--acc)' : '1px dashed transparent',
        outlineOffset: 2,
        borderRadius: 'var(--radius-md)',
        opacity: hidden ? 0.4 : undefined,
      }}
    >
      {children}
    </div>
  )
}

function imageStyle(image: CampaignImage): CSSProperties {
  return {
    display: 'block',
    width: image.width,
    maxWidth: '100%',
    height: 'auto',
    margin: '0 auto',
    borderRadius: 'var(--radius-md)',
  }
}

export function Picture({ image }: { image: CampaignImage }) {
  return image.src ? (
    <img src={image.src} alt={image.alt} style={imageStyle(image)} />
  ) : (
    <div
      style={{
        border: '1px dashed var(--line)',
        borderRadius: 'var(--radius-md)',
        padding: '40px 0',
        textAlign: 'center',
        color: ink(3),
      }}
    >
      그림을 올려 주세요
    </div>
  )
}
