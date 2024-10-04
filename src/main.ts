import { setFailed } from '@actions/core'
import { configRoadMaps, RoadMapSheet } from './road_map_sheet'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const { GSHEET_WORKSHEET_NAME, GSHEET_SPREADSHEET_ID } = process.env
  if (!GSHEET_SPREADSHEET_ID || !GSHEET_WORKSHEET_NAME)
    throw new Error(
      'GSHEET_SPREADSHEET_ID and GSHEET_WORKSHEET_NAME must be defined'
    )

  const worksheetTitle = `${GSHEET_WORKSHEET_NAME} ${new Date().getFullYear()}`
  const spreadsheetId = `${GSHEET_SPREADSHEET_ID}`

  try {
    const roadMapSheet = new RoadMapSheet(spreadsheetId, worksheetTitle)
    await roadMapSheet.loadInfo()

    for await (const config of configRoadMaps) {
      if (config.conditions.every(condition => condition)) {
        // @ts-expect-error @TODO create a type for the function
        await roadMapSheet[config.func]()
      }
    }
  } catch (error) {
    const err = error as Error
    setFailed(err.message || err)
  }
}
