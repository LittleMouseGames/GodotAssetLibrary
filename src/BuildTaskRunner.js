const fs = require('fs-extra')
const path = require('path')
const glob = require('glob')
const sass = require('sass')

async function moveTemplates () {
  fs.mkdirSync(path.join(__dirname, '../dist/templates'), { recursive: true })

  await moveComponents()

  fs.watch(path.join(__dirname, '/backend/components'), (eventType) => {
    if (eventType === 'change') {
      moveComponents()
    }
  })

  const route = path.join(__dirname, '/backend/modules/pages')

  const directories = source => fs.readdirSync(source, {
    withFileTypes: true
  }).reduce((a, c) => {
    c.isDirectory() && a.push(c.name)
    return a
  }, [])

  const pageModules = directories(route)

  pageModules.forEach(async function (module) {
    if (fs.existsSync(path.join(route, module, 'views', 'templates'))) {
      await movePages(route, module)

      fs.watch(path.join(route, module, 'views', 'templates'), async function (eventType) {
        if (eventType === 'change') {
          try {
            await movePages(route, module)
          } catch (e) {
            console.log('Error moving page, please try again')
          }
        }
      })
    }
  })
}

/**
  * Moves pages to a 'nicer' namespace in dist/
*/
async function movePages (route, module) {
  return await fs.copy(path.join(route, module, 'views', 'templates'), path.join(__dirname, '../dist/templates/pages/', module))
}

/**
  * Moves all components to dist/ folder
*/
async function moveComponents () {
  return await fs.copy(path.join(__dirname, '/backend/components/templates'), path.join(__dirname, '../dist/templates/components'))
}

function findScss () {
  // eslint-disable-next-line new-cap
  glob(path.join(__dirname, '/**/*.scss'), {}, (_err, files) => {
    files.forEach(file => {
      // in case there is a path prefixed, lets lob it off
      file = 'src/' + file.split('src/')[1]

      // make sure we're only moving pages, components will be pulled in at compile
      if (file.includes('backend/modules/pages')) {
        compileScss(file)

        fs.watch(path.dirname(file), async function (eventType) {
          if (eventType === 'change') {
            try {
              await compileScss(file)
            } catch (e) {
              console.log('Error compiling, please try again')
            }
          }
        })
      }
    })
  })
}

function compileScss (file) {
  const exportPath = path.join(path.join(__dirname, '../dist/public/'), file.replace('src/', '').replace('pages/', '').replace('backend/', '').replace('views/', '').replace('styles/', '').replace('modules/', 'styles/').replace('.scss', '.css'))
  const result = sass.compile(path.join(file), { loadPaths: [path.join(__dirname, 'backend')] })

  fs.mkdirSync(path.dirname(exportPath), { recursive: true })
  fs.writeFile(`${exportPath}`, result.css)
}

moveTemplates()
findScss()
