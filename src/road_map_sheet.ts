import GoogleSheets from './google_sheets'
import { context } from '@actions/github'
import { debug } from '@actions/core'

const date = new Date()

export const configRoadMaps = [
  {
    conditions: [
      context?.payload?.action === 'labeled',
      context?.payload?.label?.name === 'qa'
    ],
    func: 'updateQaDeployment',
    description: 'Update QA deployment'
  },
  {
    conditions: [
      context?.payload?.action === 'closed',
      context?.payload?.pull_request?.merged
    ],
    func: 'updatePdnDeployment',
    description: 'Update PDN deployment'
  },
  {
    conditions: [context?.payload?.action === 'opened'],
    func: 'addDataToRow',
    description: 'Add data to row'
  }
]

debug(JSON.stringify(configRoadMaps, null, 2))

export class RoadMapSheet extends GoogleSheets {
  private dateToUpdate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`
  private branch = context?.payload?.pull_request?.head?.ref
  private prUrl = context?.payload?.pull_request?.html_url

  async addDataToRow(): Promise<void> {
    if ((await this.updateExistingPRByBranch()) === true) return

    const prOwner = context?.payload?.pull_request?.user?.login
    const prRepository = context?.payload?.repository?.full_name || ''
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
    const repository = prRepository.replace('Negozia/', '')
    const description = descriptionExec ? descriptionExec[1].trim() : ''
    const typeFeat = typeFeatExec ? typeFeatExec[1].trim().toUpperCase() : ''
    const tester = testerExec ? testerExec[1].trim() : ''
    const taskAsana = taskAsanaExec ? taskAsanaExec[1].trim() : ''

    await this.addRow([
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
  }

  async updateQaDeployment(): Promise<void> {
    const rowBranch = await this.getRowByBranch(this.branch)
    if (!rowBranch) throw new Error('Branch not found')

    for (let i = 1; i <= 4; i++) {
      if (rowBranch.get('INSTALLED TEST ' + i) && i != 4) continue

      rowBranch.set('INSTALLED TEST ' + i, this.dateToUpdate)
      await rowBranch.save()
      break
    }
  }

  async updatePdnDeployment(): Promise<void> {
    const rowBranch = await this.getRowByBranch(this.branch)
    if (!rowBranch) throw new Error('Branch not found')

    rowBranch.set('INSTALLED PDN', this.dateToUpdate)
    const cellsPropsToUpdate = [
      {
        backgroundColor: {
          red: 20,
          green: 20,
          blue: 20,
          alpha: 10
        }
      }
    ]

    this.modifyRowByIndex(rowBranch.rowNumber - 1, cellsPropsToUpdate)

    await rowBranch.save()
  }

  private async updateExistingPRByBranch(): Promise<boolean> {
    const rowBranch = await this.getRowByBranch(this.branch)
    if (!rowBranch) return false

    const actualPR = rowBranch.get('MR LINK')
    rowBranch.set('MR LINK', `${actualPR}\n${this.prUrl}`)
    await rowBranch.save()
    return true
  }
}
