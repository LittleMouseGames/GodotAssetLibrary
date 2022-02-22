import { CronJob } from 'cron'
import { logger } from 'utility/logger'
import { nodeFetch } from 'utility/nodeFetch'
import { customAlphabet } from 'nanoid/non-secure'
import { MongoHelper } from 'MongoHelper'
import { Db } from 'mongodb'
import { assetSchema } from 'utility/schema/assets'

const host = 'godotengine.org'

/**
 * Fetch asset listings from old library
 *
 * Fetches the assets from godots old library
 * so that we can import / mirror them on our site
 *
 * While this isn't a very beefy (big) command or
 * request, its good to be good neighbours and try
 * to limit any potential impact by choosing very
 * off-hour times (as much as resonably possible)
 */
export const fetchAssetsFromGodot = new CronJob('0 1 * * 2,4,6', function () {
  void importAssets()
})

async function importAssets (): Promise<void> {
  logger.log('info', 'Fetching data to mirror from Godot Asset Library')

  const assetIDs = await fetchAssetListings()
  await fetchAssetInformationAndInsert(assetIDs)

  logger.log('info', 'All imported assets processed')
}

async function fetchAssetListings (): Promise<any[]> {
  const host = 'godotengine.org'
  const paths = [
    // '/asset-library/api/asset?type=any&max_results=500&godot_version=2.2'
    '/asset-library/api/asset?type=any&max_results=50&godot_version=3.4&page=0'
    // '/asset-library/api/asset?type=any&max_results=500&godot_version=3.4&page=1',
    // '/asset-library/api/asset?type=any&max_results=500&godot_version=3.4&page=2',
    // '/asset-library/api/asset?type=any&max_results=500&godot_version=4.0'
  ]

  const assetIDs = []

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
        if (asset.asset_id !== undefined && !(await modelDoesAssetAlreadyExist(asset.asset_id))) {
          assetIDs.push(asset.asset_id)
        }
      }
    } catch (e: any) {
      logger.log('error', e.message, ...[e])
    }
  }

  return assetIDs
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
        if (!(await modelDoesAssetAlreadyExist(result.asset_id))) {
          await modelInsertAsset(result)
          void updateCategoryCountInfoObject(result.category)
        }
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

async function updateCategoryCountInfoObject (name: string): Promise<void> {
  const mongo: Db = MongoHelper.getDatabase()
  const category = String(`category.${name}`)
  await mongo.collection('info').updateOne({
    type: 'category_count'
  }, {
    $inc: {
      [category]: 1
    }
  }, {
    upsert: true
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

importAssets()
