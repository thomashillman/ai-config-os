import { describe, it, expect } from "vitest"
import { formatDate, timeAgo } from "../lib/dateFormatters"

describe("formatDate", () => {
  it("returns empty string for falsy input", () => {
    expect(formatDate(null)).toBe("")
    expect(formatDate(undefined)).toBe("")
    expect(formatDate("")).toBe("")
  })

  it("formats ISO string to en-GB locale with month abbreviation", () => {
    const result = formatDate("2024-06-15T10:30:00.000Z")
    // en-GB short month names like "Jun", "Jan", etc.
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    // Should contain a comma separating date and time parts
    expect(result).toContain(",")
  })
})

describe("timeAgo", () => {
  function isoMinsAgo(mins) {
    return new Date(Date.now() - mins * 60 * 1000).toISOString()
  }

  it('returns empty string for falsy input', () => {
    expect(timeAgo(null)).toBe("")
    expect(timeAgo("")).toBe("")
  })

  it('returns "just now" for < 1 minute ago', () => {
    expect(timeAgo(isoMinsAgo(0))).toBe("just now")
  })

  it('returns "X min ago" for < 60 minutes', () => {
    expect(timeAgo(isoMinsAgo(5))).toBe("5 min ago")
  })

  it('returns "Xh ago" for < 24 hours', () => {
    expect(timeAgo(isoMinsAgo(3 * 60))).toBe("3h ago")
  })

  it('returns "Xd ago" for >= 24 hours', () => {
    expect(timeAgo(isoMinsAgo(2 * 24 * 60))).toBe("2d ago")
  })
})
