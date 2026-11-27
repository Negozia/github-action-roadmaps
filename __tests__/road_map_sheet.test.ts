/**
 * Unit tests for the event resolution and cell helpers in src/road_map_sheet.ts
 */

jest.mock('../src/google_sheets', () => ({
  __esModule: true,
  default: class {
    loadInfo = jest.fn()
  }
}))

import {
  appendUnique,
  buildConfigRoadMaps,
  SYNC_ACTIONS
} from '../src/road_map_sheet'

/** Returns the functions whose conditions all pass for a payload. */
const resolve = (payload: Record<string, unknown>): string[] =>
  buildConfigRoadMaps(payload)
    .filter(config => config.conditions.every(Boolean))
    .map(config => config.func)

describe('buildConfigRoadMaps', () => {
  it('adds the row when the PR is opened', () => {
    expect(resolve({ action: 'opened' })).toEqual(['addDataToRow'])
  })

  it.each(SYNC_ACTIONS)('adds the row if missing on %s', action => {
    expect(resolve({ action })).toEqual(['addDataToRow'])
  })

  it('adds the row with the documentation label', () => {
    expect(
      resolve({ action: 'labeled', label: { name: 'documentation' } })
    ).toEqual(['addDataToRow'])
  })

  it('does nothing with any other label', () => {
    expect(resolve({ action: 'labeled', label: { name: 'bug' } })).toEqual([])
  })

  it('updates PDN only when the PR is merged', () => {
    expect(
      resolve({ action: 'closed', pull_request: { merged: true } })
    ).toEqual(['updatePdnDeployment'])
    expect(
      resolve({ action: 'closed', pull_request: { merged: false } })
    ).toEqual([])
  })

  it('does nothing for unknown events', () => {
    expect(resolve({ action: 'edited' })).toEqual([])
    expect(resolve({})).toEqual([])
  })
})

describe('appendUnique', () => {
  const pr1 = 'https://github.com/Negozia/backend/pull/1'
  const pr2 = 'https://github.com/Negozia/front/pull/2'

  it('sets the value when the cell is empty', () => {
    expect(appendUnique('', pr1, '\n')).toBe(pr1)
    expect(appendUnique(undefined, 'backend', ',\n')).toBe('backend')
  })

  it('appends a new value with the separator', () => {
    expect(appendUnique(pr1, pr2, '\n')).toBe(`${pr1}\n${pr2}`)
    expect(appendUnique('backend', 'front', ',\n')).toBe('backend,\nfront')
  })

  it('returns undefined when the value is already present', () => {
    expect(appendUnique(`${pr1}\n${pr2}`, pr2, '\n')).toBeUndefined()
    expect(appendUnique('backend,\nfront', 'backend', ',\n')).toBeUndefined()
  })

  it('returns undefined for an empty value', () => {
    expect(appendUnique('backend', '', ',\n')).toBeUndefined()
  })
})
