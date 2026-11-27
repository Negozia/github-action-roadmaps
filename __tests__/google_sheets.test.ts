/**
 * Unit tests for src/google_sheets.ts: row painting, year worksheet creation
 * and branch lookup across years.
 */

import type GoogleSheetsType from '../src/google_sheets'

type FakeCell = { backgroundColor: unknown }
type FakeSheet = {
  title: string
  index: number
  cells: FakeCell[]
  columnCount: number
  lastColumnLetter: string
  loadCells: jest.Mock
  getCell: jest.Mock
  saveUpdatedCells: jest.Mock
  getRows: jest.Mock
  duplicate: jest.Mock
  resize: jest.Mock
  clearRows: jest.Mock
  updateProperties: jest.Mock
  delete: jest.Mock
}
type FakeRow = { rowNumber: number; get: (key: string) => string }

let GoogleSheets: typeof GoogleSheetsType

beforeAll(async () => {
  // The module checks the credentials when it is loaded.
  process.env.GSHEET_CLIENT_EMAIL = 'gsheet@gserviceaccount.com'
  process.env.GSHEET_PRIVATE_KEY = '---'
  GoogleSheets = (await import('../src/google_sheets')).default
})

/** Builds a fake worksheet. */
const fakeSheet = (title = 'sheet', rows: FakeRow[] = []): FakeSheet => {
  const cells: FakeCell[] = Array.from({ length: 3 }, () => ({
    backgroundColor: undefined
  }))
  return {
    title,
    index: 0,
    cells,
    columnCount: 3,
    lastColumnLetter: 'C',
    loadCells: jest.fn(),
    getCell: jest.fn((_row: number, column: number) => cells[column]),
    saveUpdatedCells: jest.fn(),
    getRows: jest.fn(async () => rows),
    duplicate: jest.fn(),
    resize: jest.fn(),
    clearRows: jest.fn(),
    updateProperties: jest.fn(),
    delete: jest.fn(async () => undefined)
  }
}

/** Builds a fake row from its column values. */
const fakeRow = (
  rowNumber: number,
  values: Record<string, string>
): FakeRow => ({
  rowNumber,
  get: (key: string) => values[key] ?? ''
})

/** Creates GoogleSheets with a fake document holding the given worksheets. */
const withDoc = (
  sheetsByTitle: Record<string, FakeSheet>
): { sheets: GoogleSheetsType; doc: { loadInfo: jest.Mock } } => {
  const sheets = new GoogleSheets('id', 'Auto Merge Request -', 2027)
  const doc = { sheetsByTitle, loadInfo: jest.fn() }
  Object.assign(sheets, { doc })
  return { sheets, doc }
}

/** Reads a protected property of the instance. */
const prop = (sheets: GoogleSheetsType, key: string): unknown =>
  (sheets as unknown as Record<string, unknown>)[key]

const white = { red: 1, green: 1, blue: 1, alpha: 1 }

describe('setRowBackground', () => {
  it('loads only the row and paints every cell', async () => {
    const { sheets } = withDoc({})
    const sheet = fakeSheet()
    Object.assign(sheets, { currentSheet: sheet })

    await sheets.setRowBackground(42, white)

    expect(sheet.loadCells).toHaveBeenCalledWith('A42:C42')
    expect(sheet.getCell).toHaveBeenCalledWith(41, 0)
    expect(sheet.cells.every(cell => cell.backgroundColor === white)).toBe(true)
    expect(sheet.saveUpdatedCells).toHaveBeenCalledTimes(1)
  })

  it('paints the row of the given sheet', async () => {
    const { sheets } = withDoc({})
    const current = fakeSheet()
    const other = fakeSheet()
    Object.assign(sheets, { currentSheet: current })

    await sheets.setRowBackground(
      5,
      white,
      other as unknown as Parameters<GoogleSheetsType['setRowBackground']>[2]
    )

    expect(other.loadCells).toHaveBeenCalledWith('A5:C5')
    expect(current.loadCells).not.toHaveBeenCalled()
  })

  it('throws when the sheet is not loaded', async () => {
    const { sheets } = withDoc({})
    await expect(sheets.setRowBackground(2, white)).rejects.toThrow(
      'Sheet not found in setRowBackground'
    )
  })
})

describe('loadInfo', () => {
  it('uses the current year sheet when it exists', async () => {
    const current = fakeSheet('Auto Merge Request - 2027')
    const previous = fakeSheet('Auto Merge Request - 2026')
    const { sheets } = withDoc({
      [current.title]: current,
      [previous.title]: previous
    })

    await sheets.loadInfo()

    expect(prop(sheets, 'currentSheet')).toBe(current)
    expect(prop(sheets, 'previousSheet')).toBe(previous)
    expect(previous.duplicate).not.toHaveBeenCalled()
  })

  it('creates the year sheet from the previous one with only the header', async () => {
    const previous = fakeSheet('Auto Merge Request - 2026')
    previous.index = 1
    const created = fakeSheet('temp')
    previous.duplicate.mockResolvedValue(created)
    const { sheets } = withDoc({ [previous.title]: previous })

    await sheets.loadInfo()

    expect(previous.duplicate).toHaveBeenCalledWith({
      title: expect.stringContaining('Auto Merge Request - 2027 (creating'),
      index: 1
    })
    expect(created.resize).toHaveBeenNthCalledWith(1, {
      rowCount: 2,
      columnCount: 3
    })
    expect(created.clearRows).toHaveBeenCalledWith({ start: 2, end: 2 })
    expect(created.loadCells).toHaveBeenCalledWith('A2:C2')
    expect(created.resize).toHaveBeenNthCalledWith(2, {
      rowCount: 1000,
      columnCount: 3
    })
    expect(created.updateProperties).toHaveBeenCalledWith({
      title: 'Auto Merge Request - 2027'
    })
    expect(created.delete).not.toHaveBeenCalled()
    expect(prop(sheets, 'currentSheet')).toBe(created)
  })

  it('uses the sheet another run created at the same time', async () => {
    const previous = fakeSheet('Auto Merge Request - 2026')
    const created = fakeSheet('temp')
    created.updateProperties.mockRejectedValue(new Error('already exists'))
    previous.duplicate.mockResolvedValue(created)
    const byOtherRun = fakeSheet('Auto Merge Request - 2027')
    const sheetsByTitle: Record<string, FakeSheet> = {
      [previous.title]: previous
    }
    const { sheets, doc } = withDoc(sheetsByTitle)
    doc.loadInfo
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        sheetsByTitle[byOtherRun.title] = byOtherRun
      })

    await sheets.loadInfo()

    expect(created.delete).toHaveBeenCalled()
    expect(prop(sheets, 'currentSheet')).toBe(byOtherRun)
  })

  it('removes the temporary sheet and fails on any other error', async () => {
    const previous = fakeSheet('Auto Merge Request - 2026')
    const created = fakeSheet('temp')
    created.resize.mockRejectedValue(new Error('quota'))
    previous.duplicate.mockResolvedValue(created)
    const { sheets } = withDoc({ [previous.title]: previous })

    await expect(sheets.loadInfo()).rejects.toThrow('quota')
    expect(created.delete).toHaveBeenCalled()
  })

  it('fails when neither year sheet exists', async () => {
    const { sheets } = withDoc({})
    await expect(sheets.loadInfo()).rejects.toThrow(
      'Sheet "Auto Merge Request - 2027" not found and there is no "Auto Merge Request - 2026"'
    )
  })
})

describe('getRowByBranch', () => {
  const setup = (
    currentRows: FakeRow[],
    previousRows: FakeRow[]
  ): { sheets: GoogleSheetsType; current: FakeSheet; previous: FakeSheet } => {
    const current = fakeSheet('Auto Merge Request - 2027', currentRows)
    const previous = fakeSheet('Auto Merge Request - 2026', previousRows)
    const { sheets } = withDoc({})
    Object.assign(sheets, { currentSheet: current, previousSheet: previous })
    return { sheets, current, previous }
  }

  it('finds the branch in the current year', async () => {
    const row = fakeRow(3, { BRANCH: 'feature/a' })
    const { sheets, current, previous } = setup([row], [])

    expect(await sheets.getRowByBranch('feature/a')).toEqual({
      row,
      sheet: current
    })
    expect(previous.getRows).not.toHaveBeenCalled()
  })

  it('falls back to the previous year when the PR is not in PDN', async () => {
    const row = fakeRow(900, { BRANCH: 'feature/a' })
    const { sheets, previous } = setup([], [row])

    expect(await sheets.getRowByBranch('feature/a')).toEqual({
      row,
      sheet: previous
    })
  })

  it('ignores previous year rows already installed in PDN', async () => {
    const row = fakeRow(900, {
      BRANCH: 'feature/a',
      'INSTALLED PDN': '10/12/2026'
    })
    const { sheets } = setup([], [row])

    expect(await sheets.getRowByBranch('feature/a')).toBeUndefined()
  })
})
