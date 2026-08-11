import { Db } from 'mongodb'
import { logger } from 'core/utils/logger'

export const TEXT_INDEX_NAME = 'search_weighted_text'

/**
 * MongoDB allows only one text index per collection. We create exactly one
 * named, weighted text index for discovery and fail loudly if a conflicting
 * text index already exists so the operator can reconcile it manually.
 */
export async function createWeightedTextIndex (db: Db): Promise<void> {
  const assets = db.collection('assets')
  const indexes = await assets.indexes()

  const existingTextIndexes = indexes.filter(index =>
    index.key !== undefined && Object.values(index.key).some(value => value === 'text')
  )

  if (existingTextIndexes.length > 0) {
    const ours = existingTextIndexes.find(index => index.name === TEXT_INDEX_NAME)
    if (ours !== undefined) {
      logger.log('info', `Text index ${TEXT_INDEX_NAME} already present; nothing to do`)
      return
    }
    const names = existingTextIndexes.map(index => index.name).join(', ')
    throw new Error(
      `A conflicting text index already exists (${names}). MongoDB only permits one text index per collection. Drop it manually, then rerun this migration.`
    )
  }

  await assets.createIndex(
    {
      title: 'text',
      quick_description: 'text',
      author: 'text',
      description: 'text'
    },
    {
      name: TEXT_INDEX_NAME,
      weights: {
        title: 10,
        quick_description: 7,
        author: 7,
        description: 1
      },
      default_language: 'english'
    }
  )

  logger.log('info', `Created text index ${TEXT_INDEX_NAME}`)
}
