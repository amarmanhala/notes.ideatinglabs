export const SIDEBAR_WIDTH_KEY = 'notes.sidebar-width.v1'
export const DEFAULT_SIDEBAR_WIDTH = 440
export const MIN_SIDEBAR_WIDTH = 320
export const MAX_SIDEBAR_WIDTH = 760

export function sidebarWidthBounds(viewportWidth: number) {
  return { min: MIN_SIDEBAR_WIDTH, max: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - 320)) }
}

export function clampSidebarWidth(width: number, viewportWidth: number) {
  const { min, max } = sidebarWidthBounds(viewportWidth)
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(width) ? width : DEFAULT_SIDEBAR_WIDTH)))
}
