const fs = require('fs-extra')
const path = require('path')

async function moveTemplates () {
  await moveComponents()
  await movePages()
}

/**
  * Moves pages to a 'nicer' namespace in dist/
*/
async function movePages () {
  const route = path.join(__dirname, '/backend/modules/pages')

  const directories = source => fs.readdirSync(source, {
    withFileTypes: true
  }).reduce((a, c) => {
    c.isDirectory() && a.push(c.name)
    return a
  }, [])

  const pageModules = directories(route)

  pageModules.forEach(async function (module) {
    if (fs.existsSync(path.join(route, module, 'views'))) {
      await fs.copy(path.join(route, module, 'views'), path.join(__dirname, '../dist/pages/', module))
    }
  })
}

/**
  * Moves all components to dist/ folder
*/
async function moveComponents () {
  console.log(__filename)
  await fs.copy(path.join(__dirname, '/backend/components'), path.join(__dirname, '../dist/components'))
}

moveTemplates()
