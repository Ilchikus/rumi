export interface BlockTypeOption {
  label: string
  icon: string
  type: string
  attrs?: Record<string, unknown>
}

export const BLOCK_TYPE_ICONS = {
  text: "Aa",
  heading1: "H1",
  heading2: "H2",
  heading3: "H3",
  bulletList: "•",
  numberedList: "1.",
  checkbox: "☑",
  quote: "❝",
  codeBlock: "{ }",
  mermaid: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M245.66,74.34l-32-32a8,8,0,0,0-11.32,11.32L220.69,72H208c-49.33,0-61.05,28.12-71.38,52.92-9.38,22.51-16.92,40.59-49.48,42.84a40,40,0,1,0,.1,16c43.26-2.65,54.34-29.15,64.14-52.69C161.41,107,169.33,88,208,88h12.69l-18.35,18.34a8,8,0,0,0,11.32,11.32l32-32A8,8,0,0,0,245.66,74.34ZM48,200a24,24,0,1,1,24-24A24,24,0,0,1,48,200Z"></path></svg>`,
  table: "⊞",
  divider: "—"
} as const

// The handle's Change type menu is the canonical ordering, naming, and icon
// source for block-type presentation throughout the editor.
export const BLOCK_TYPE_OPTIONS: BlockTypeOption[] = [
  { label: "Text", icon: BLOCK_TYPE_ICONS.text, type: "paragraph" },
  { label: "Heading 1", icon: BLOCK_TYPE_ICONS.heading1, type: "heading", attrs: { level: 1 } },
  { label: "Heading 2", icon: BLOCK_TYPE_ICONS.heading2, type: "heading", attrs: { level: 2 } },
  { label: "Heading 3", icon: BLOCK_TYPE_ICONS.heading3, type: "heading", attrs: { level: 3 } },
  { label: "Bullet List", icon: BLOCK_TYPE_ICONS.bulletList, type: "bullet_item" },
  { label: "Numbered List", icon: BLOCK_TYPE_ICONS.numberedList, type: "numbered_item" },
  { label: "Checkbox", icon: BLOCK_TYPE_ICONS.checkbox, type: "task_item" },
  { label: "Quote", icon: BLOCK_TYPE_ICONS.quote, type: "blockquote" },
  { label: "Code Block", icon: BLOCK_TYPE_ICONS.codeBlock, type: "code_block" },
  { label: "Mermaid", icon: BLOCK_TYPE_ICONS.mermaid, type: "mermaid" },
  { label: "Table", icon: BLOCK_TYPE_ICONS.table, type: "table" },
  { label: "Divider", icon: BLOCK_TYPE_ICONS.divider, type: "horizontal_rule" }
]
