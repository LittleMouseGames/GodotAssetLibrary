import { MongoHelper } from 'core/MongoHelper'

interface SearchFacets {
  categoryFilters: Record<string, number>
  engineFilters: Record<string, number>
}

export async function GetSearchFacets (filter: Record<string, any>): Promise<SearchFacets> {
  const mongo = MongoHelper.getDatabase()

  const [result] = await mongo.collection('assets').aggregate([
    { $match: filter },
    {
      $facet: {
        categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
        engines: [{ $group: { _id: '$godot_version', count: { $sum: 1 } } }]
      }
    }
  ]).toArray()

  const categoryFilters: Record<string, number> = {}
  let engineFilters: Record<string, number> = {}

  for (const item of result?.categories ?? []) {
    if (item._id != null) {
      categoryFilters[item._id as string] = item.count as number
    }
  }

  for (const item of result?.engines ?? []) {
    if (item._id != null) {
      engineFilters[item._id as string] = item.count as number
    }
  }

  engineFilters = Object.keys(engineFilters).sort().reverse().reduce<Record<string, number>>(
    (obj, key) => {
      obj[key] = engineFilters[key]
      return obj
    },
    {}
  )

  return { categoryFilters, engineFilters }
}
