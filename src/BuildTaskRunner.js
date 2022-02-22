const minify = require('csso')
const fs = require('fs-extra')
const path = require('path')
const glob = require('glob')
const sass = require('sass')

/**
 * Goals:
 * - glob find SCSS, JS, TS, templates and static content
 * - watch for changes
 *   - if SCSS or TS, compile
 * - copy over to dist folder
 *
 */

/**
 * Make sure our folders exist
 */
function makeDistFolder () {
  fs.mkdirSync(path.join(__dirname, '../dist/templates'), { recursive: true })
  fs.mkdirSync(path.join(__dirname, '../dist/public/javascript'), { recursive: true })
  fs.mkdirSync(path.join(__dirname, '../dist/public/styles'), { recursive: true })
}

/**
 * Find our SCSS in the project
 */
function findScss () {
  glob(path.join(__dirname, '/**/*.scss'), {}, (_err, files) => {
    files.forEach(file => {
      compileAndMoveScss(file)

      // in case there is a path prefixed, lets lob it off
      file = file.split('src/')[1]

      watchFileOrFolder(file, 'scss', compileAndMoveScss, files)
    })
  })
}

/**
 * Find all ETA templates in projects
 */
function findTemplates () {
  glob(path.join(__dirname, '/**/*.eta'), {}, (_err, files) => {
    files.forEach(file => {
      // in case there is a path prefixed, lets lob it off
      file = file.split('src/')[1]

      watchFileOrFolder(file, 'template', moveTemplates)

      /** on first start */
      moveTemplates(file)
    })
  })
}

/**
 * Watch static files in public/ or their sub
 * directories (such as javascript/ or images/)
 */

function watchPublicFolders () {
  /** on first load */
  movePublicFolderFile('public')

  watchFileOrFolder('public/images', 'image', movePublicFolderFile, 'image')
  watchFileOrFolder('public/javascript', 'public javascript', movePublicFolderFile, 'javascript')
  watchFileOrFolder('public', 'public general', movePublicFolderFile)
}

/**
 * Watch file or folder for changes
 *
 * Watch and make a callback to a specified function
 * and (optionally) pass along a data object (mostly
 * just for SCSS usage, but may be handy in the future)
 *
 * @param {string} name the file or folder name
 * @param {string} type the file type (for error reporting)
 * @param {requestCallback} moveFunction the callback function when we find a change
 * @param {any} passAlongObject the optional data object to pass along to the function
 */
function watchFileOrFolder (name, type, moveFunction, passAlongObject = {}) {
  fs.watch(path.join(__dirname, name), function (eventType) {
    if (eventType === 'change') {
      try {
        if (passAlongObject !== {}) {
          moveFunction(name, passAlongObject)
        } else {
          moveFunction(name)
        }
      } catch (e) {
        console.log(`Error moving ${type}, please try again: ${e}`)
      }
    }
  })
}

function compileAndMoveScss (file, allScssFiles = []) {
  // if were a page type, just compile that file alone
  if (file.includes('backend/modules/pages')) {
    /**
     * We want to change from:
     * - src/backend/modules/pages/{module}/views/styles/{}.scss
     * To:
     * - (in dist/public) `styles/{page}/*.css
     * Because:
     * - its a nicer file path and makes things predictable
     */

    if (file.includes('src/')) {
      file = 'src/' + file.split('src/')[1]
    } else {
      file = 'src/' + file
    }

    const updatedFileName = file.replace('src/', '')
      .replace('pages/', '')
      .replace('backend/', '')
      .replace('views/', '')
      .replace('styles/', '')
      .replace('modules/', 'styles/')
      .replace('.scss', '.css')

    const exportPath = path.join(path.join(__dirname, '../dist/public/'), updatedFileName)
    const compiledCSS = sass.compile(path.join(file), { loadPaths: [path.join(__dirname, 'backend/')] })

    fs.mkdirSync(path.dirname(exportPath), { recursive: true })
    fs.writeFile(`${exportPath}`, minify.minify(compiledCSS.css).css)
  } else if (file.includes('backend/components') && allScssFiles.length > 0) {
    /**
     * If we're not a page we'll assume that we're instead a partial
     * or something, and since we don't really know what files are
     * using it (we *could* we just don't _now_) then we'll recompile
     * all found page SCSS files *just in case*
     */
    allScssFiles.forEach(file => {
      compileAndMoveScss(file)
    })
  }
}

/**
 * Move pages and component to better namespace in dist/
 *
 * If we were to use raw file path for namespace, it'd
 * start to feel a little repetitive. So instead when
 * we copy we adjust the name space so that its more
 * predictable and only includes the most relevant information
 *
 * Ex, from:
 * - backend/modules/pages/{module}/views/templates/{template}.eta
 * To:
 * - templates/pages/{module}/{template}.eta
 *
 * @param {string} file
 */
function moveTemplates (file) {
  if (file.includes('backend/modules/pages')) {
    const moduleName = file.split('backend/modules/pages')[1]
      .replace('views', '')
      .replace('templates', '')

    fs.copySync(path.join(__dirname, file), path.join(__dirname, '../dist/templates/pages/', moduleName))
  } else if (file.includes('backend/components')) {
    fs.copySync(path.join(__dirname, '/backend/components/templates'), path.join(__dirname, '../dist/templates/components/'))
  }
}

/**
 * Move new files over
 */
function movePublicFolderFile (file, type = '') {
  fs.copySync(path.join(__dirname, file), path.join(__dirname, `../dist/public/${type}`))
}

makeDistFolder()
findScss()
findTemplates()
watchPublicFolders()
