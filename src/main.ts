import { setFailed } from '@actions/core'
// import { RoadMapSheet } from './road_map_sheet'
import { context } from '@actions/github'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  console.log(context)
  const { GSHEET_WORKSHEET_NAME, GSHEET_SPREADSHEET_ID } = process.env
  if (
    GSHEET_SPREADSHEET_ID === undefined ||
    GSHEET_WORKSHEET_NAME === undefined
  )
    throw new Error(
      'GSHEET_SPREADSHEET_ID and GSHEET_WORKSHEET_NAME must be defined'
    )

  // const worksheetTitle: string = `${GSHEET_WORKSHEET_NAME} ${new Date().getFullYear()}`
  // const spreadsheetId: string = GSHEET_SPREADSHEET_ID

  try {
    // const roadMapSheet = new RoadMapSheet(spreadsheetId, worksheetTitle)
    // await roadMapSheet.loadInfo()
    // setOutput('results', JSON.stringify({ results }));
    // // eslint-disable-next-line i18n-text/no-en
    // debug(`Processed commands\n${JSON.stringify(results, null, 2)}`);
    // return { results };
  } catch (error) {
    const err = error as Error
    setFailed(err.message || err)
  }
}
