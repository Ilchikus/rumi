import { describe, expect, it } from "vitest"
import { schema } from "../schema"
import { BLOCK_TYPE_ICONS, BLOCK_TYPE_OPTIONS } from "./blockTypePresentation"
import { createCommands } from "./slashCommands"

describe("canonical block-type presentation", () => {
  it("uses the regular Phosphor FlowArrow path for Mermaid", () => {
    expect(BLOCK_TYPE_ICONS.mermaid).toContain(
      "M245.66,74.34l-32-32a8,8,0,0,0-11.32,11.32"
    )
    expect(BLOCK_TYPE_ICONS.mermaid).toContain('aria-hidden="true"')
  })

  it("uses the handle menu icons in matching slash commands", () => {
    const slashIcons = Object.fromEntries(
      createCommands(schema).map((command) => [command.name, command.icon])
    )

    expect(slashIcons).toMatchObject({
      "Heading 1": BLOCK_TYPE_ICONS.heading1,
      "Heading 2": BLOCK_TYPE_ICONS.heading2,
      "Heading 3": BLOCK_TYPE_ICONS.heading3,
      "Bullet Item": BLOCK_TYPE_ICONS.bulletList,
      "Numbered Item": BLOCK_TYPE_ICONS.numberedList,
      "Task Item": BLOCK_TYPE_ICONS.checkbox,
      Quote: BLOCK_TYPE_ICONS.quote,
      "Code Block": BLOCK_TYPE_ICONS.codeBlock,
      "Mermaid Diagram": BLOCK_TYPE_ICONS.mermaid,
      Table: BLOCK_TYPE_ICONS.table,
      Divider: BLOCK_TYPE_ICONS.divider
    })
  })

  it("keeps the Change type menu backed by the canonical icon set", () => {
    expect(BLOCK_TYPE_OPTIONS.map(({ label, icon }) => [label, icon])).toEqual([
      ["Text", BLOCK_TYPE_ICONS.text],
      ["Heading 1", BLOCK_TYPE_ICONS.heading1],
      ["Heading 2", BLOCK_TYPE_ICONS.heading2],
      ["Heading 3", BLOCK_TYPE_ICONS.heading3],
      ["Bullet List", BLOCK_TYPE_ICONS.bulletList],
      ["Numbered List", BLOCK_TYPE_ICONS.numberedList],
      ["Checkbox", BLOCK_TYPE_ICONS.checkbox],
      ["Quote", BLOCK_TYPE_ICONS.quote],
      ["Code Block", BLOCK_TYPE_ICONS.codeBlock],
      ["Mermaid", BLOCK_TYPE_ICONS.mermaid],
      ["Table", BLOCK_TYPE_ICONS.table],
      ["Divider", BLOCK_TYPE_ICONS.divider]
    ])
  })
})
