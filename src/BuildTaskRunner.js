const minify = require('csso')
const fs = require('fs-extra')
const path = require('path')
const glob = require('glob')
const sass = require('sass')
const spawn = require('child_process').spawn
const argv = require('minimist')(process.argv.slice(2))
let appRunning = false
const watchedPaths = new Set()

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
  fs.mkdirSync(path.join(__dirname, '../dist/content'), { recursive: true })
}

/**
 * Find our SCSS in the project
 */
function findScss () {
  const files = glob.sync(path.join(__dirname, '/**/*.scss'))
  files.forEach(file => {
    compileAndMoveScss(file)

    // in case there is a path prefixed, lets lob it off
    file = file.split('src/')[1]

    watchFileOrFolder(file, 'scss', compileAndMoveScss, files)
  })
}

/**
 * Find all ETA templates in projects
 */
function findTemplates () {
  const files = glob.sync(path.join(__dirname, '/**/*.eta'))
  files.forEach(file => {
    // in case there is a path prefixed, lets lob it off
    file = file.split('src/')[1]

    watchFileOrFolder(file, 'template', moveTemplates)

    /** on first start */
    moveTemplates(file)
  })
}

/**
 * Copy first-party markdown content (e.g. guides) into dist/content so the
 * runtime bundle can read it from disk. Content is git-managed and read at
 * runtime (with a short TTL cache), not bundled into the JS.
 */
function findMarkdown () {
  const files = glob.sync(path.join(__dirname, '/content/**/*.md'))
  files.forEach(file => {
    const relative = file.split(path.join(__dirname, 'content'))[1]
    const dest = path.join(__dirname, '../dist/content', relative)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(file, dest)
  })
}

/**
 * Watch static files in public/ or their sub
 * directories (such as javascript/ or images/)
 */

function watchPublicFolders () {
  /** on first load */
  movePublicFolderFile('static')

  watchFileOrFolder('static/images', 'static image', movePublicFolderFile, 'image')
  watchFileOrFolder('static/javascript', 'static javascript', movePublicFolderFile, 'javascript')
  watchFileOrFolder('static', 'static general', movePublicFolderFile)
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
  if (!argv?.watch) {
    return
  }

  const watchPath = path.join(__dirname, name)
  if (watchedPaths.has(watchPath)) {
    return
  }
  watchedPaths.add(watchPath)

  fs.watch(watchPath, function (eventType) {
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
  if (file.includes('components/') && allScssFiles.length > 0) {
    /**
     * If we're not a page we'll assume that we're instead a partial
     * or something, and since we don't really know what files are
     * using it (we *could* we just don't _now_) then we'll recompile
     * all found page SCSS files *just in case*
     */
    allScssFiles.forEach(file => {
      compileAndMoveScss(file)
    })
  } else if (file.includes('code/')) { // if were a page type, just compile that file alone
    /**
     * We want to change from:
     * - src/core/code/{module}/views/styles/{}.scss
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
      .replace('core/', '')
      .replace('views/', '')
      .replace('styles/', '')
      .replace('app/code/', 'styles/')
      .replace('.scss', '.css')

    const exportPath = path.join(path.join(__dirname, '../dist/public/'), updatedFileName)
    const compiledCSS = sass.compile(path.join(file), { loadPaths: [path.join(__dirname, 'app')] })

    fs.mkdirSync(path.dirname(exportPath), { recursive: true })
    fs.writeFile(`${exportPath}`, minify.minify(compiledCSS.css).css)
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
 * - core/code/{module}/views/templates/{template}.eta
 * To:
 * - templates/pages/{module}/{template}.eta
 *
 * @param {string} file
 */
function moveTemplates (file) {
  if (file.includes('app/code')) {
    const moduleName = file.split('app/code')[1]
      .replace('views', '')
      .replace('templates', '')

    fs.copySync(path.join(__dirname, file), path.join(__dirname, '../dist/templates/pages/', moduleName))
  } else if (file.includes('components/')) {
    fs.copySync(path.join(__dirname, '/app/components'), path.join(__dirname, '../dist/templates/components/'))
  }
}

/**
 * Move new files over
 */
function movePublicFolderFile (file, type = '') {
  fs.copySync(path.join(__dirname, file), path.join(__dirname, `../dist/public/${type}`))
}

if (argv?.production && argv?.['build-only']) {
  fs.emptyDirSync(path.join(__dirname, '../dist'))
}
makeDistFolder()
findScss()
findTemplates()
findMarkdown()
watchFileOrFolder('content', 'markdown', findMarkdown)
watchPublicFolders()

const webpackArgs = ['node_modules/webpack/bin/webpack.js']
if (argv?.watch) {
  webpackArgs.push('--watch')
}

const webpack = spawn('node', webpackArgs, {
  env: argv?.production ? { ...process.env, NODE_ENV: 'production' } : process.env
})
webpack.stdout.on('data', function (data) {
  process.stdout.write(data)
  if (!argv?.['build-only'] && data.includes('successfully')) {
    if (!appRunning) {
      runApp()
    }
  }
})

webpack.stderr.on('data', function (data) {
  process.stderr.write(data)
})

webpack.on('close', function (code, signal) {
  if (argv?.['build-only'] && (code !== 0 || signal != null)) {
    console.error(`Webpack build failed${signal != null ? ` with signal ${signal}` : ` with exit code ${code}`}`)
    process.exitCode = code ?? 1
  }
})

function runApp () {
  const options = argv?.production ? { env: { ...process.env, NODE_ENV: 'production' } } : {}
  const bundle = spawn(`${argv?.production ? 'node' : 'nodemon'}`, ['dist/bundle.js'], options)

  appRunning = true

  bundle.stdout.on('data', function (data) {
    process.stdout.write(data)
  })

  bundle.stderr.on('data', function (data) {
    process.stderr.write(data)
  })
}
