import { describe, expect, it } from "vitest"
import {
  computeSlashMenuPlacement,
  viewportPlacementToScrollCanvas
} from "./slashCommands"

describe("slash command menu placement", () => {
  it("opens below the active line when the menu fits", () => {
    expect(computeSlashMenuPlacement({
      anchor: { left: 120, top: 100, bottom: 120 },
      menuWidth: 280,
      menuHeight: 300,
      viewportWidth: 800,
      viewportHeight: 600
    })).toEqual({
      left: 120,
      top: 128,
      maxHeight: 340,
      side: "below"
    })
  })

  it("flips above the active line near the bottom of the viewport", () => {
    expect(computeSlashMenuPlacement({
      anchor: { left: 120, top: 560, bottom: 580 },
      menuWidth: 280,
      menuHeight: 300,
      viewportWidth: 800,
      viewportHeight: 600
    })).toEqual({
      left: 120,
      top: 252,
      maxHeight: 340,
      side: "above"
    })
  })

  it("uses the larger side and caps the menu height when neither side fits", () => {
    expect(computeSlashMenuPlacement({
      anchor: { left: 120, top: 260, bottom: 280 },
      menuWidth: 280,
      menuHeight: 500,
      viewportWidth: 800,
      viewportHeight: 400
    })).toEqual({
      left: 120,
      top: 8,
      maxHeight: 244,
      side: "above"
    })
  })

  it("keeps the menu inside the right viewport edge", () => {
    expect(computeSlashMenuPlacement({
      anchor: { left: 780, top: 100, bottom: 120 },
      menuWidth: 280,
      menuHeight: 300,
      viewportWidth: 800,
      viewportHeight: 600
    }).left).toBe(512)
  })

  it("keeps one content position while the editor canvas scrolls", () => {
    const beforeScroll = viewportPlacementToScrollCanvas(
      { left: 220, top: 300 },
      { left: 100, top: 40, scrollLeft: 0, scrollTop: 100 }
    )
    const afterScroll = viewportPlacementToScrollCanvas(
      { left: 220, top: 200 },
      { left: 100, top: 40, scrollLeft: 0, scrollTop: 200 }
    )

    expect(beforeScroll).toEqual({ left: 120, top: 360 })
    expect(afterScroll).toEqual(beforeScroll)
  })
})
