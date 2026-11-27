/** Time zone of the team: the roadmap year and dates follow it. */
export const ROADMAP_TIME_ZONE = 'America/Bogota'

export type DateParts = { day: number; month: number; year: number }

/**
 * Returns the calendar date of an instant in the roadmap time zone.
 * The runner clock is UTC, which is already the next day after 7 p.m. in Bogotá.
 * @param date - Instant to convert.
 * @returns Day, month (1-12) and year in Bogotá.
 */
export function roadmapDate(date: Date = new Date()): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ROADMAP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(date)
  const get = (type: string): number =>
    Number(parts.find(part => part.type === type)?.value)
  return { day: get('day'), month: get('month'), year: get('year') }
}

/**
 * Formats an instant as the roadmap date (d/m/yyyy in Bogotá).
 * @param date - Instant to format.
 * @returns The date as "d/m/yyyy".
 */
export function formatRoadmapDate(date: Date = new Date()): string {
  const { day, month, year } = roadmapDate(date)
  return `${day}/${month}/${year}`
}
