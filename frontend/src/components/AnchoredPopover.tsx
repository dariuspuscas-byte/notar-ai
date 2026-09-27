import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'

// Gap between the anchor and the popover, and minimum distance from the viewport edges.
const OFFSET = 4
const VIEWPORT_MARGIN = 8

interface AnchoredPopoverProps {
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  // Upper bound for the popover height in px; it shrinks further if the viewport is smaller.
  maxHeight?: number
  className?: string
}

interface Position {
  top: number
  left: number
  maxHeight: number
}

/**
 * Popover rendered in a portal on document.body with fixed positioning computed
 * from the anchor's bounding rect, so it is never clipped by an ancestor with
 * `overflow: hidden/auto`. Opens below the anchor and flips above it when there
 * is not enough room below. Follows the anchor on scroll/resize and closes on
 * click outside, Escape, or when focus is tabbed out.
 */
export function AnchoredPopover({
  anchorRef,
  onClose,
  children,
  align = 'left',
  maxHeight = 256,
  className = '',
}: AnchoredPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (!anchor || !popover) return

    const rect = anchor.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const width = popover.offsetWidth
    const contentHeight = Math.min(popover.scrollHeight, maxHeight)

    const spaceBelow = viewportHeight - rect.bottom - OFFSET - VIEWPORT_MARGIN
    const spaceAbove = rect.top - OFFSET - VIEWPORT_MARGIN
    const placeAbove = spaceBelow < contentHeight && spaceAbove > spaceBelow
    const available = Math.max(placeAbove ? spaceAbove : spaceBelow, 0)
    const height = Math.min(contentHeight, available)

    const top = placeAbove ? rect.top - OFFSET - height : rect.bottom + OFFSET
    const preferredLeft = align === 'right' ? rect.right - width : rect.left
    const left = Math.min(
      Math.max(preferredLeft, VIEWPORT_MARGIN),
      Math.max(viewportWidth - width - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
    )

    setPosition({ top, left, maxHeight: Math.min(maxHeight, available) })
  }, [anchorRef, align, maxHeight])

  // Measure before paint so the popover never flashes at the wrong spot.
  useLayoutEffect(() => {
    updatePosition()
  }, [updatePosition])

  // Keep aligned with the anchor while any scroll container scrolls or the window resizes.
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updatePosition)
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [updatePosition])

  // Click outside (ignoring the anchor, which toggles the popover itself) and Escape close it.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchorRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchorRef, onClose])

  // The portal sits at the end of <body>, so move focus into it on open.
  useEffect(() => {
    popoverRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], [tabindex]')?.focus()
  }, [])

  return createPortal(
    <div
      ref={popoverRef}
      onKeyDown={(e) => {
        // Tabbing away returns focus to the anchor so the browser continues from there.
        if (e.key === 'Tab') {
          anchorRef.current?.focus()
          onClose()
        }
      }}
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: position?.maxHeight ?? maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
      className={`z-50 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}
