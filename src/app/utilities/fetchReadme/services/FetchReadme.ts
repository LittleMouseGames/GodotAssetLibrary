import { logger } from 'core/utils/logger'
import { UpdateAssetReadme } from '../models/UPDATE/UpdateAssetReadme'
import fetch from 'node-fetch'
import AdmZip from 'adm-zip'

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
const MAX_README_BYTES = 2 * 1024 * 1024
const MAX_ZIP_ENTRIES = 10_000
const FETCH_TIMEOUT_MS = 30_000

export const FetchReadme = async function (assetId: string, url: string): Promise<void> {
  try {
    const response = await fetch(url, {
      timeout: FETCH_TIMEOUT_MS,
      size: MAX_ARCHIVE_BYTES,
      follow: 3
    })

    if (!response.ok) {
      response.body?.destroy()
      throw new Error(`Archive download returned HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
      response.body?.destroy()
      throw new Error(`Archive exceeds ${MAX_ARCHIVE_BYTES} byte limit`)
    }

    const archive = await response.buffer()
    const zip = new AdmZip(archive)
    const entries = zip.getEntries()

    if (entries.length > MAX_ZIP_ENTRIES) {
      throw new Error(`Archive contains more than ${MAX_ZIP_ENTRIES} entries`)
    }

    const readmeEntry = entries.find(entry => /(^|\/)readme(?:\.[^/]+)?$/i.test(entry.entryName))
    if (readmeEntry === undefined) {
      return
    }

    const uncompressedSize = Number((readmeEntry as any).header?.size)
    if (!Number.isFinite(uncompressedSize) || uncompressedSize < 0 || uncompressedSize > MAX_README_BYTES) {
      throw new Error(`README exceeds ${MAX_README_BYTES} byte limit`)
    }

    const readme = zip.readAsText(readmeEntry)
    if (Buffer.byteLength(readme, 'utf8') > MAX_README_BYTES) {
      throw new Error(`README actual content exceeds ${MAX_README_BYTES} byte limit`)
    }
    await UpdateAssetReadme(assetId, readme)
  } catch (error: any) {
    logger.log('error', `Failed to fetch README for asset ${assetId}: ${error?.message ?? error}`, [error])
  }
}
