import { CronJob } from 'cron'
import { logger } from 'utility/logger'
import { nodeFetch } from 'utility/nodeFetch'
import { customAlphabet } from 'nanoid/non-secure'
import { MongoHelper } from 'MongoHelper'
import { Db } from 'mongodb'
import { assetSchema } from 'utility/schema/assets'

const host = 'godotengine.org'

/**
 * Fetch asset listings and mirror from old library
 *
 * Fetches the assets from godots old library
 * so that we can import / mirror them on our site
 *
 * While this isn't a very beefy (big) command,
 * its good to be good neighbours and try
 * to limit any potential impact by choosing very
 * off-hour times (as much as resonably possible)
 */
export const fetchAssetsFromGodot = new CronJob('0 1 * * *', function () {
  void importAssets()
})

/**
 * What this does:
 * - fetchs the links specified in `paths` variable
 * - checks each entry in JSON there against what we have in the DB
 *   - if we don't have it
 *     - pull in that asset
 *   - if we do have it
 *     - if ours is newer, skip
 *     - if theirs is newer, merge info
 */
async function importAssets (): Promise<void> {
  logger.log('info', 'Fetching data to mirror from Godot Asset Library')

  const [newAssetIDs, updateAssetIDs] = await fetchAssetListings()
  await fetchAssetInformationAndInsert(newAssetIDs)
  await fetchAssetInformationAndUpdate(updateAssetIDs)

  logger.log('info', 'All imported assets processed')
}

async function fetchAssetListings (): Promise<any[]> {
  const host = 'godotengine.org'
  const env = process?.env?.NODE_ENV ?? 'development'
  let paths = []

  if (env === 'production') {
    paths = [
      '/asset-library/api/asset?type=any&max_results=500&godot_version=2.2',
      '/asset-library/api/asset?type=any&max_results=500&godot_version=3.4&page=0',
      '/asset-library/api/asset?type=any&max_results=500&godot_version=3.4&page=1',
      '/asset-library/api/asset?type=any&max_results=500&godot_version=3.4&page=2',
      '/asset-library/api/asset?type=any&max_results=500&godot_version=4.0'
    ]
  } else {
    paths = [
      '/asset-library/api/asset?type=any&max_results=50&godot_version=3.4&page=0'
    ]
  }

  const newAssetIDs = []
  const updateAssetIDs = []

  for (const path of paths) {
    try {
    /**
     * We run these sequentially so as to
     * minimize any potential negative impact
     * to their servers
     */
      const response = await nodeFetch({
        host: host,
        path: path
      })

      const result = JSON.parse(response).result

      for (const asset of result) {
        if (asset.asset_id !== undefined) {
          if (!(await modelDoesAssetAlreadyExist(asset.asset_id))) {
            newAssetIDs.push(asset.asset_id)
          } else {
            const assetModifedDate = await modelGetAssetModifiedDate(asset.asset_id)
            if (new Date(asset.modify_date) > new Date(assetModifedDate)) {
              updateAssetIDs.push(asset.asset_id)
            }
          }
        }
      }
    } catch (e: any) {
      logger.log('error', e.message, ...[e])
    }
  }

  return [newAssetIDs, updateAssetIDs]
}

async function fetchAssetInformationAndInsert (assetIDs: any[]): Promise<void> {
  for (const assetID of assetIDs) {
    try {
    /**
     * We run these sequentially so as to
     * minimize any potential negative impact
     * to their servers
     */
      const response = await nodeFetch({
        host: host,
        path: `/asset-library/api/asset/${assetID}`
      })

      const result = JSON.parse(response) as assetSchema

      if (result.asset_id !== undefined) {
        await modelInsertAsset(result)
        void updateCategoryCountInfoObject(result.category)
      }
    } catch (e: any) {
      logger.log('error', e.message, ...[e])
    }
  }
}

async function fetchAssetInformationAndUpdate (assetIDs: any[]): Promise<void> {
  for (const assetID of assetIDs) {
    try {
    /**
     * We run these sequentially so as to
     * minimize any potential negative impact
     * to their servers
     */
      const response = await nodeFetch({
        host: host,
        path: `/asset-library/api/asset/${assetID}`
      })

      const result = JSON.parse(response) as assetSchema

      if (result.asset_id !== undefined) {
        const assetInformationWeHave = await modelGetAssetInformation(result.asset_id)
        const newAssetInformation = { ...result, ...assetInformationWeHave }

        result.legacy_asset_id = result.asset_id
        result.asset_id = assetInformationWeHave.asset_id
        result.title = result.title.trim()
        result.category_lowercase = result.category.toLocaleLowerCase()
        result.author_lowercase = result.author.toLocaleLowerCase()
        result.quick_description = result.description.trim().replace(/(\r\n|\n|\r|\t)/gm, '')

        if (assetInformationWeHave.category !== result.category) {
          void updateCategoryCountInfoObject(assetInformationWeHave.category, -1)
          void updateCategoryCountInfoObject(result.category)
        }

        await modelUpdateAssetObject(result.legacy_asset_id, newAssetInformation)
        // console.log('updated asset', newAssetInformation)
      }
    } catch (e: any) {
      logger.log('error', e.message, ...[e])
    }
  }
}

async function modelDoesAssetAlreadyExist (legacyAssetID: string): Promise<boolean> {
  const mongo: Db = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    legacy_asset_id: legacyAssetID
  }, {
    projection: {
      asset_id: 1
    }
  })

  if (operationObject === null || operationObject === undefined) {
    return false
  }

  return true
}

async function modelGetAssetModifiedDate (legacyAssetID: string): Promise<string> {
  const mongo: Db = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    legacy_asset_id: legacyAssetID
  }, {
    projection: {
      modify_date: 1
    }
  })

  return operationObject?.modify_date
}

async function updateCategoryCountInfoObject (name: string, increment: number = 1): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  const category = String(`category.${name}`)
  await mongo.collection('info').updateOne({
    type: 'category_count'
  }, {
    $inc: {
      [category]: increment
    }
  }, {
    upsert: true
  })
}

async function modelUpdateAssetObject (assetId: string, assetObject: object): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  await mongo.collection('assets').updateOne({
    legacy_asset_id: assetId
  }, {
    $set: assetObject
  })
}

async function modelInsertAsset (asset: assetSchema): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6)

  // TODO: Move out of model
  asset.legacy_asset_id = asset.asset_id
  asset.asset_id = nanoid()
  asset.quick_description = asset.description.trim().replace(/(\r\n|\n|\r|\t)/gm, '')
  asset.upvotes = 0
  asset.downvotes = 0
  asset.featured = false
  asset.title = asset.title.trim()
  asset.category_lowercase = asset.category.toLocaleLowerCase()
  asset.author_lowercase = asset.author.toLocaleLowerCase()
  asset.added_date = new Date()

  for (const preview of asset.previews) {
    if (preview !== undefined && (asset.card_banner === '' || asset.card_banner === undefined)) {
      asset.card_banner = preview.thumbnail
      break
    }
  }

  const insertObj = await mongo.collection('assets').insertOne(asset)

  return insertObj
}

async function modelGetAssetInformation (legacyAssetID: string): Promise<any> {
  const mongo: Db = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('assets').findOne({
    legacy_asset_id: legacyAssetID
  })

  return operationObject
}

void importAssets()
