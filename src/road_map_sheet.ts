import GoogleSheets from './google_sheets'
import { context } from '@actions/github'
import { debug, info, warning } from '@actions/core'
import { formatRoadmapDate } from './dates'

/**
 * Pull request events that can be the first one the action receives for a PR
 * (GitHub skips `opened` while the PR has merge conflicts). They add the row
 * if the branch is missing and are a no-op when it is already registered.
 */
export const SYNC_ACTIONS = ['synchronize', 'reopened', 'ready_for_review']

/** Background of a row whose PR is merged (installed in PDN). */
export const MERGED_ROW_COLOR = { red: 0.94, green: 0.94, blue: 0.94, alpha: 1 }

/** Background of a row whose PR is still open. */
export const OPEN_ROW_COLOR = { red: 1, green: 1, blue: 1, alpha: 1 }

export type RoadMapConfig = {
  conditions: boolean[]
  func: 'addDataToRow' | 'updatePdnDeployment'
  description: string
}

/**
 * Builds the roadmap operations for a pull_request event payload.
 * @param payload - GitHub event payload.
 * @returns The operations with their conditions evaluated.
 */
export function buildConfigRoadMaps(
  payload: typeof context.payload
): RoadMapConfig[] {
  return [
    {
      conditions: [payload?.action === 'opened'],
      func: 'addDataToRow',
      description: 'Add data to row'
    },
    {
      conditions: [SYNC_ACTIONS.includes(payload?.action || '')],
      func: 'addDataToRow',
      description: 'Add data to row if the branch is missing'
    },
    {
      conditions: [
        payload?.action === 'labeled',
        payload?.label?.name === 'documentation'
      ],
      func: 'addDataToRow',
      description: 'Update documentation deployment'
    },
    {
      conditions: [
        payload?.action === 'closed',
        Boolean(payload?.pull_request?.merged)
      ],
      func: 'updatePdnDeployment',
      description: 'Update PDN deployment'
    }
  ]
}

/**
 * Appends a value to a multi-value cell unless it is already there.
 * @param current - Current cell value.
 * @param value - Value to add.
 * @param separator - Separator used between values.
 * @returns The new cell value, or undefined when no change is needed.
 */
export function appendUnique(
  current: string | undefined,
  value: string,
  separator: string
): string | undefined {
  if (!value) return undefined
  const existing = (current || '')
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
  if (existing.includes(value.trim())) return undefined
  return existing.length > 0 ? `${current}${separator}${value}` : value
}

export const configRoadMaps = buildConfigRoadMaps(context?.payload)

debug(JSON.stringify(configRoadMaps, null, 2))
debug(JSON.stringify(context, null, 2))

export class RoadMapSheet extends GoogleSheets {
  private dateToUpdate = formatRoadmapDate()
  private branch = context?.payload?.pull_request?.head?.ref
  private prUrl = context?.payload?.pull_request?.html_url

  async addDataToRow(): Promise<void> {
    if ((await this.updateExistingPRByBranch()) === true) return

    const prOwner = context?.payload?.pull_request?.user?.login
    const prRepository = context?.payload?.repository?.name || ''
    // const prTitle = context?.payload?.pull_request?.title;
    const prBody = context?.payload?.pull_request?.body || ''

    const allyRegex = /-\s*\[X\]\s*([^\n]+)/gi
    const typeFeatRegex =
      /-\s*\[X\]\s*(Feature|Bugfix|Hotfix|Refactor|Documentation)/i
    const testerRegex = /- Encargad@s:\s*(.*)/i
    const taskAsanaRegex = /\[Enlace Asana\]\((.*)\)/i
    const descriptionRegex =
      /# Descripción Breve\s*(?:_[\s\S]*?_\s*)?([\s\S]*?)\n##/i

    const descriptionExec = descriptionRegex.exec(prBody)
    const typeFeatExec = typeFeatRegex.exec(prBody)
    const testerExec = testerRegex.exec(prBody)
    const taskAsanaExec = taskAsanaRegex.exec(prBody)

    // Procesamos los aliados afectados
    let allyMatches
    const alliesArr = []
    while ((allyMatches = allyRegex.exec(prBody)) !== null) {
      alliesArr.push(allyMatches[1].trim())
    }
    alliesArr.pop() // Quitamos el último elemento, ya que hace referencia a typeFeat
    const allies = alliesArr.length > 0 ? alliesArr.join(', ') : ''

    // const title = prTitle;
    const owner = prOwner
    const repository = prRepository
    const description = descriptionExec ? descriptionExec[1].trim() : ''
    const typeFeat = typeFeatExec ? typeFeatExec[1].trim().toUpperCase() : ''
    const tester = testerExec ? testerExec[1].trim() : ''
    const taskAsana = taskAsanaExec ? taskAsanaExec[1].trim() : ''

    if (!description || !typeFeat)
      warning(
        'PR body does not match the template: NAME or TYPE will be empty in the roadmap'
      )

    const row = await this.addRow([
      description,
      allies,
      owner,
      typeFeat,
      repository,
      this.branch,
      this.prUrl,
      tester,
      '',
      taskAsana
    ])
    // Google copies the format of the row above on append: a merged (grey)
    // last row would make the new one grey too.
    await this.setRowBackground(row.rowNumber, OPEN_ROW_COLOR)
    info(`Row ${row.rowNumber} added for branch "${this.branch}"`)
  }

  async updateQaDeployment(): Promise<void> {
    const found = await this.getRowByBranch(this.branch)
    if (!found) throw new Error('Branch not found')
    const rowBranch = found.row

    for (let i = 1; i <= 4; i++) {
      const currentDate = rowBranch.get('INSTALLED TEST ' + i)
      if (currentDate && currentDate !== '' && i != 4) continue

      rowBranch.set('INSTALLED TEST ' + i, this.dateToUpdate)
      await rowBranch.save()
      break
    }
  }

  /**
   * Sets the PDN date and greys out the branch row, in the current year or in
   * the previous one when the PR was opened before the new year.
   * @throws When the branch has no row.
   */
  async updatePdnDeployment(): Promise<void> {
    const found = await this.getRowByBranch(this.branch)
    if (!found) throw new Error('Branch not found')
    const { row: rowBranch, sheet } = found

    rowBranch.set('INSTALLED PDN', this.dateToUpdate)
    await rowBranch.save()
    await this.setRowBackground(rowBranch.rowNumber, MERGED_ROW_COLOR, sheet)
    info(`Row ${rowBranch.rowNumber} marked as installed in PDN`)
  }

  /**
   * Adds the PR link and repository to the branch row when it already exists.
   * Skips values already present so repeated events do not duplicate them.
   * @returns True when the branch row exists (updated or unchanged).
   */
  private async updateExistingPRByBranch(): Promise<boolean> {
    const found = await this.getRowByBranch(this.branch)
    if (!found) return false
    const rowBranch = found.row

    const repository = context?.payload?.repository?.name || ''
    const newPR = appendUnique(rowBranch.get('MR LINK'), this.prUrl || '', '\n')
    const newProject = appendUnique(rowBranch.get('PROJECT'), repository, ',\n')

    if (newPR === undefined && newProject === undefined) {
      info(
        `Branch "${this.branch}" already registered in row ${rowBranch.rowNumber}, nothing to update`
      )
      return true
    }

    if (newPR !== undefined) rowBranch.set('MR LINK', newPR)
    if (newProject !== undefined) rowBranch.set('PROJECT', newProject)

    await rowBranch.save()
    info(
      `Branch "${this.branch}" already registered, row ${rowBranch.rowNumber} updated`
    )
    return true
  }
}
