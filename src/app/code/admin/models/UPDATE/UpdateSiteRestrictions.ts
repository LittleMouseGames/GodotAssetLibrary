import { MongoHelper } from 'core/MongoHelper'

export async function UpdateSiteRestrictions (disableNewAccounts: boolean, disableNewComments: boolean): Promise<void> {
  const mongo = MongoHelper.getDatabase()
  const operationObject = await mongo.collection('info').updateOne({
    type: 'site_restrictions'
  }, {
    $set: {
      disable_new_accounts: disableNewAccounts,
      disable_new_comments: disableNewComments
    }
  }, {
    upsert: true
  })

  if (operationObject === null || operationObject === undefined) {
    throw new Error('Failed to update (or upsert) site settings')
  }
}
