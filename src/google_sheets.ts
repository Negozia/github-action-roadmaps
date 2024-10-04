import {
  GoogleSpreadsheet,
  GoogleSpreadsheetCell,
  GoogleSpreadsheetRow,
  GoogleSpreadsheetWorksheet
} from 'google-spreadsheet'
import { JWT } from 'google-auth-library'

const { GSHEET_CLIENT_EMAIL, GSHEET_PRIVATE_KEY } = process.env
if (!GSHEET_CLIENT_EMAIL || !GSHEET_PRIVATE_KEY)
  throw new Error('Google sheets credentials have to be supplied')

type SheetCells = {
  -readonly [K in keyof GoogleSpreadsheetCell]: K
}[keyof GoogleSpreadsheetCell]

export default class GoogleSheets {
  protected doc: GoogleSpreadsheet
  private worksheetTitle: string
  protected currentSheet?: GoogleSpreadsheetWorksheet

  private serviceAccountJwt = new JWT({
    email: GSHEET_CLIENT_EMAIL,
    key: GSHEET_PRIVATE_KEY?.split(String.raw`\n`).join('\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  constructor(spreadsheetId: string, worksheetTitle: string) {
    this.doc = new GoogleSpreadsheet(spreadsheetId, this.serviceAccountJwt)
    this.worksheetTitle = worksheetTitle
  }

  async loadInfo(): Promise<void> {
    await this.doc.loadInfo()
    const sheetIndex = this.doc.sheetsByIndex.findIndex(
      sheet => sheet.title === this.worksheetTitle
    )

    this.currentSheet = this.doc.sheetsByIndex[sheetIndex]
    if (!this.currentSheet) throw new Error('Sheet not found')
  }

  async getRows(): Promise<GoogleSpreadsheetRow[]> {
    if (!this.currentSheet) throw new Error('Sheet not found')

    return await this.currentSheet?.getRows()
  }

  async addRow(data: string[]): Promise<GoogleSpreadsheetRow> {
    if (!this.currentSheet) throw new Error('Sheet not found')

    return await this.currentSheet.addRow(data)
  }

  async modifyRowByIndex(
    index: number,
    data: Partial<GoogleSpreadsheetCell>[]
  ): Promise<void> {
    if (!this.currentSheet) throw new Error('Sheet not found')

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

  async getRowByBranch(
    branch: string
  ): Promise<GoogleSpreadsheetRow | undefined> {
    if (!this.currentSheet) throw new Error('Sheet not found')

    const rows = await this.currentSheet.getRows()
    // const header = await this.currentSheet.getHeaderRow();
    const rowBranch = rows?.find(row => row.get('BRANCH') === branch)
    return rowBranch
  }
}
