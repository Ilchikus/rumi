export const FIRST_LIST_INDENT_RATIO = 0.3;
export const DEEPER_LIST_INDENT_RATIO = 0.2;

export interface ListDropIndentGeometry {
  pointerX: number;
  editorLeft: number;
  editorWidth: number;
  targetBlockLeft: number;
  targetBlockWidth: number;
  targetBlockIndent: number;
  maxIndent: number;
}

export function listDropIndent({
  pointerX,
  editorLeft,
  editorWidth,
  targetBlockLeft,
  targetBlockWidth,
  targetBlockIndent,
  maxIndent
}: ListDropIndentGeometry): number {
  if (targetBlockIndent < 0 || maxIndent <= 0) return 0;

  const alignedIndent = Math.min(targetBlockIndent, maxIndent);
  const canIndentFurther = alignedIndent < maxIndent;
  if (!canIndentFurther) return alignedIndent;

  const isFirstIndent = alignedIndent === 0;
  const thresholdLeft = isFirstIndent ? editorLeft : targetBlockLeft;
  const thresholdWidth = isFirstIndent ? editorWidth : targetBlockWidth;
  const thresholdRatio = isFirstIndent ? FIRST_LIST_INDENT_RATIO : DEEPER_LIST_INDENT_RATIO;
  const threshold = thresholdLeft + Math.max(0, thresholdWidth) * thresholdRatio;

  return pointerX > threshold ? alignedIndent + 1 : alignedIndent;
}
