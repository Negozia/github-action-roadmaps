/**
 * Unit tests for src/dates.ts
 */

import { formatRoadmapDate, roadmapDate } from '../src/dates'

describe('roadmapDate', () => {
  it('keeps the previous year until midnight in Bogotá', () => {
    // 2027-01-01 03:00 UTC = 2026-12-31 22:00 in Bogotá
    expect(roadmapDate(new Date('2027-01-01T03:00:00Z'))).toEqual({
      day: 31,
      month: 12,
      year: 2026
    })
  })

  it('changes year at midnight in Bogotá', () => {
    // 2027-01-01 05:00 UTC = 2027-01-01 00:00 in Bogotá
    expect(roadmapDate(new Date('2027-01-01T05:00:00Z')).year).toBe(2027)
  })
})

describe('formatRoadmapDate', () => {
  it('formats as d/m/yyyy in Bogotá', () => {
    expect(formatRoadmapDate(new Date('2026-11-27T02:00:00Z'))).toBe(
      '26/11/2026'
    )
  })
})
