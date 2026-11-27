import { info, setFailed } from '@actions/core'
import { context } from '@actions/github'
import { configRoadMaps, RoadMapSheet } from './road_map_sheet'
import { roadmapDate } from './dates'

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

  const spreadsheetId = `${GSHEET_SPREADSHEET_ID}`

  const toRun = configRoadMaps.filter(config =>
    config.conditions.every(condition => condition)
  )
  if (toRun.length === 0) {
    const label = context?.payload?.label?.name
    info(
      `No roadmap update for event "${context?.payload?.action}"${label ? ` (label "${label}")` : ''}`
    )
    return
  }

  try {
    const roadMapSheet = new RoadMapSheet(
      spreadsheetId,
      GSHEET_WORKSHEET_NAME,
      roadmapDate().year
    )
    await roadMapSheet.loadInfo()

    for (const config of toRun) {
      info(config.description)
      await roadMapSheet[config.func]()
    }
  } catch (error) {
    const err = error as Error
    setFailed(err.message || err)
  }
}
