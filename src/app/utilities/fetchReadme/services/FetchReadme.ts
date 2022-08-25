import { logger } from 'core/utils/logger'
import { UpdateAssetReadme } from '../models/UPDATE/UpdateAssetReadme'
import fetch from 'node-fetch'
import AdmZip from 'adm-zip'

export const FetchReadme = async function (assetId: string, url: string): Promise<void> {
  await fetch(url)
    .then(async res => await res.buffer())
    .then(buffer => {
      const zip = new AdmZip(buffer)
      const zipEntries = zip.getEntries()

      let hasReadme = false

      zipEntries.forEach((entry) => {
        if (hasReadme) return

        if (entry.entryName.match(/readme/i) != null) {
          hasReadme = true
          const readme = zip.readAsText(entry)

          UpdateAssetReadme(assetId, readme).catch(err => {
            logger.error('error', err.message, ...[err])
          })
        }
      })
    })
}
