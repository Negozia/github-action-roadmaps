import {
  GoogleSpreadsheet,
  GoogleSpreadsheetCell,
  GoogleSpreadsheetRow,
  GoogleSpreadsheetWorksheet
} from 'google-spreadsheet'
import { JWT } from 'google-auth-library'
import { info } from '@actions/core'

const { GSHEET_CLIENT_EMAIL, GSHEET_PRIVATE_KEY } = process.env
if (!GSHEET_CLIENT_EMAIL || !GSHEET_PRIVATE_KEY)
  throw new Error('Google sheets credentials have to be supplied')

type SheetCells = {
  -readonly [K in keyof GoogleSpreadsheetCell]: K
}[keyof GoogleSpreadsheetCell]

/** A row found by branch and the worksheet (year) it belongs to. */
export type BranchRow = {
  row: GoogleSpreadsheetRow
  sheet: GoogleSpreadsheetWorksheet
}

/** Rows a new year worksheet starts with (header included). */
export const NEW_SHEET_ROW_COUNT = 1000

/** Background of the first empty row of a new year worksheet. */
const WHITE = { red: 1, green: 1, blue: 1, alpha: 1 }

export default class GoogleSheets {
  protected doc: GoogleSpreadsheet
  private worksheetTitle: string
  private previousWorksheetTitle: string
  protected currentSheet?: GoogleSpreadsheetWorksheet
  protected previousSheet?: GoogleSpreadsheetWorksheet

  private serviceAccountJwt = new JWT({
    email: GSHEET_CLIENT_EMAIL,
    key: GSHEET_PRIVATE_KEY?.split(String.raw`\n`).join('\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  /**
   * @param spreadsheetId - Google spreadsheet id.
   * @param worksheetName - Worksheet name without the year (e.g. "Auto Merge Request -").
   * @param year - Current year; the worksheet title is "<name> <year>".
   */
  constructor(spreadsheetId: string, worksheetName: string, year: number) {
    this.doc = new GoogleSpreadsheet(spreadsheetId, this.serviceAccountJwt)
    this.worksheetTitle = `${worksheetName} ${year}`
    this.previousWorksheetTitle = `${worksheetName} ${year - 1}`
  }

  /**
   * Loads the current and previous year worksheets, creating the current one
   * from the previous year when it does not exist yet.
   * @throws When neither worksheet exists.
   */
  async loadInfo(): Promise<void> {
    await this.doc.loadInfo()
    this.previousSheet = this.doc.sheetsByTitle[this.previousWorksheetTitle]
    this.currentSheet =
      this.doc.sheetsByTitle[this.worksheetTitle] ??
      (await this.createYearSheet())
    info(`Sheet: ${this.worksheetTitle}`)
  }

  /**
   * Creates the current year worksheet as a copy of the previous year with only
   * its header (same columns, widths and header format). It is built under a
   * temporary title and renamed at the end, so a failed run never leaves a
   * half-copied worksheet with the final title.
   * @returns The new worksheet, or the one another run created meanwhile.
   * @throws When there is no previous year worksheet to copy.
   */
  private async createYearSheet(): Promise<GoogleSpreadsheetWorksheet> {
    const previous = this.previousSheet
    if (!previous)
      throw new Error(
        `Sheet "${this.worksheetTitle}" not found and there is no "${this.previousWorksheetTitle}" to create it from`
      )

    info(
      `Creating sheet "${this.worksheetTitle}" from "${this.previousWorksheetTitle}"`
    )
    const sheet = await previous.duplicate({
      title: `${this.worksheetTitle} (creating ${Date.now()})`,
      index: previous.index
    })
    try {
      const { columnCount } = sheet
      await sheet.resize({ rowCount: 2, columnCount })
      await sheet.clearRows({ start: 2, end: 2 })
      await this.setRowBackground(2, WHITE, sheet)
      await sheet.resize({ rowCount: NEW_SHEET_ROW_COUNT, columnCount })
      await sheet.updateProperties({ title: this.worksheetTitle })
      return sheet
    } catch (error) {
      // Another run may have created the worksheet at the same time.
      await sheet.delete().catch(() => undefined)
      await this.doc.loadInfo()
      const existing = this.doc.sheetsByTitle[this.worksheetTitle]
      if (!existing) throw error
      return existing
    }
  }

  async getRows(): Promise<GoogleSpreadsheetRow[]> {
    if (!this.currentSheet) throw new Error('Sheet not found in getRows')

    return await this.currentSheet.getRows()
  }

  async addRow(data: string[]): Promise<GoogleSpreadsheetRow> {
    if (!this.currentSheet) throw new Error('Sheet not found in addRow')

    return await this.currentSheet.addRow(data)
  }

  async modifyRowByIndex(
    index: number,
    data: Partial<GoogleSpreadsheetCell>[]
  ): Promise<void> {
    if (!this.currentSheet)
      throw new Error('Sheet not found in modifyRowByIndex')

    await this.currentSheet.loadCells()
    for (let i = 0; i < this.currentSheet.columnCount; i++) {
      const cells = this.currentSheet?.getCell(index, i)
      for (const toChange of data) {
        const keys = Object.keys(toChange) as SheetCells[]
        for (let j = 0; j < keys.length; j++) {
          const key = keys[j]
          //@ts-expect-error With the data type of the cells is enough
          cells[key] = toChange[key]
        }
      }
    }

    await this.currentSheet?.saveUpdatedCells()
  }

  /**
   * Sets the background color of every cell in one row, loading only that row.
   * @param rowNumber - 1-based row number (as in GoogleSpreadsheetRow.rowNumber).
   * @param color - Background color to apply.
   * @param sheet - Worksheet of the row; the current year by default.
   */
  async setRowBackground(
    rowNumber: number,
    color: GoogleSpreadsheetCell['backgroundColor'],
    sheet: GoogleSpreadsheetWorksheet | undefined = this.currentSheet
  ): Promise<void> {
    if (!sheet) throw new Error('Sheet not found in setRowBackground')

    await sheet.loadCells(`A${rowNumber}:${sheet.lastColumnLetter}${rowNumber}`)
    for (let column = 0; column < sheet.columnCount; column++) {
      sheet.getCell(rowNumber - 1, column).backgroundColor = color
    }
    await sheet.saveUpdatedCells()
  }

  /**
   * Finds the row of a branch in the current year, or in the previous year
   * when that row is not installed in PDN yet (PR opened before the new year).
   * @param branch - Branch name (BRANCH column).
   * @returns The row and its worksheet, or undefined when not found.
   */
  async getRowByBranch(branch: string): Promise<BranchRow | undefined> {
    if (!this.currentSheet) throw new Error('Sheet not found in getRowByBranch')

    const rows = await this.currentSheet.getRows()
    const row = rows?.find(item => item.get('BRANCH') === branch)
    if (row) return { row, sheet: this.currentSheet }

    if (!this.previousSheet) return undefined
    const previousRows = await this.previousSheet.getRows()
    const previousRow = previousRows?.find(
      item => item.get('BRANCH') === branch && !item.get('INSTALLED PDN')
    )
    if (!previousRow) return undefined
    info(
      `Branch "${branch}" found in "${this.previousWorksheetTitle}", row ${previousRow.rowNumber}`
    )
    return { row: previousRow, sheet: this.previousSheet }
  }
}
