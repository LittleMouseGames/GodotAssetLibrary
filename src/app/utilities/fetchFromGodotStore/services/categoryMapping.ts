/**
 * Deterministic mapping from Store type + tags to the application's controlled
 * category vocabulary.
 *
 * The Store exposes only two coarse types (0 = addon, 1 = full project) plus a
 * large publisher-driven tag set. Tags are NOT a controlled taxonomy (synonyms,
 * misspellings and marketing labels abound), so we map to the app's stable
 * categories via an ordered ruleset evaluated against normalized tag slugs.
 *
 * The original tags are always preserved on the asset; this only derives the
 * single browseable `category`/`category_lowercase` used by facets and URLs.
 */

import { StoreTagData } from '../schema/storeApi'

export interface CategoryMapping {
  category: string
  category_lowercase: string
}

const CATEGORY_TOOL_2D = '2D Tools'
const CATEGORY_TOOL_3D = '3D Tools'
const CATEGORY_TOOLS = 'Tools'
const CATEGORY_SCRIPTS = 'Scripts'
const CATEGORY_SHADERS = 'Shaders'
const CATEGORY_MATERIALS = 'Materials'
const CATEGORY_ASSETS_2D = '2D Assets'
const CATEGORY_ASSETS_3D = '3D Assets'
const CATEGORY_AUDIO = 'Audio'
const CATEGORY_VFX = 'VFX'
const CATEGORY_UI = 'UI'
const CATEGORY_TEMPLATES = 'Templates'
const CATEGORY_DEMOS = 'Demos'
const CATEGORY_PROJECTS = 'Projects'
const CATEGORY_MISC = 'Misc'

const TOOL_INDICATORS = new Set([
  'plugin', 'tool', 'tooling', 'editor', 'editortool', 'dock', 'importer',
  'exporter', 'buildtool', 'debugger', 'profiler', 'workflow', 'addon'
])

const VFX_TAGS = new Set(['vfx', 'effects', 'particles', 'shaderfx'])
const SHADER_TAGS = new Set(['shader', 'shaders', 'visualshader', 'computeshader', 'skyshader', 'textshader'])
const MATERIAL_TAGS = new Set(['material', 'materials', 'pbr', 'texture', 'textures', 'normalmaps'])
const AUDIO_TAGS = new Set(['audio', 'music', 'sfx', 'soundfx', 'sounds', 'soundtrack'])
const PROJECT_TAGS = new Set(['template', 'templates', 'starterkit', 'boilerplate', 'game-template'])
const DEMO_TAGS = new Set(['demo', 'demos', 'example', 'examples', 'showcase', 'tutorial'])
const ASSET_2D_TAGS = new Set(['sprites', '2dsprites', 'pixelart', 'tileset', 'tilesets', 'fonts', 'icons'])
const ASSET_3D_TAGS = new Set(['models', 'mesh', 'meshes', 'props', 'environment', 'animation', 'rigged', 'glb'])
const UI_TAGS = new Set(['ui', 'gui', 'userinterface', 'theme', 'themes'])
const SCRIPT_TAGS = new Set(['script', 'scripts', 'gdscript', 'library', 'snippet'])

/** Extract normalized lowercase tag slugs, deduped. */
function tagSlugs (tags: StoreTagData[] | undefined): Set<string> {
  const slugs = new Set<string>()
  for (const tag of tags ?? []) {
    if (typeof tag?.slug !== 'string') continue
    const normalized = tag.slug.trim().toLocaleLowerCase()
    if (normalized !== '') slugs.add(normalized)
  }
  return slugs
}

function hasAny (slugs: Set<string>, candidates: Set<string>): boolean {
  for (const slug of slugs) {
    if (candidates.has(slug)) return true
  }
  return false
}

function isTool (slugs: Set<string>): boolean {
  return hasAny(slugs, TOOL_INDICATORS)
}

/**
 * Map a Store record (type + tags) to an app category.
 *
 * Priority:
 * 1. Full-project semantics (template/demo tags override type 1).
 * 2. Visual-specialized (vfx, shaders, materials).
 * 3. Audio.
 * 4. Tooling (+ dimension).
 * 5. Pure asset packs (+ dimension).
 * 6. UI, scripts.
 * 7. Fallback by type (Project) or Misc.
 */
export function mapStoreCategory (type: number | undefined, tags: StoreTagData[] | undefined): CategoryMapping {
  const slugs = tagSlugs(tags)
  let category = CATEGORY_MISC

  if (hasAny(slugs, PROJECT_TAGS)) {
    category = CATEGORY_TEMPLATES
  } else if (hasAny(slugs, DEMO_TAGS)) {
    category = CATEGORY_DEMOS
  } else if (type === 1) {
    category = CATEGORY_PROJECTS
  } else if (hasAny(slugs, VFX_TAGS)) {
    category = CATEGORY_VFX
  } else if (hasAny(slugs, SHADER_TAGS)) {
    category = CATEGORY_SHADERS
  } else if (hasAny(slugs, MATERIAL_TAGS)) {
    category = CATEGORY_MATERIALS
  } else if (hasAny(slugs, AUDIO_TAGS)) {
    category = CATEGORY_AUDIO
  } else if (isTool(slugs)) {
    if (slugs.has('2d')) category = CATEGORY_TOOL_2D
    else if (slugs.has('3d')) category = CATEGORY_TOOL_3D
    else category = CATEGORY_TOOLS
  } else if (hasAny(slugs, ASSET_2D_TAGS)) {
    category = CATEGORY_ASSETS_2D
  } else if (hasAny(slugs, ASSET_3D_TAGS)) {
    category = CATEGORY_ASSETS_3D
  } else if (hasAny(slugs, UI_TAGS)) {
    category = CATEGORY_UI
  } else if (hasAny(slugs, SCRIPT_TAGS)) {
    category = CATEGORY_SCRIPTS
  } else if (type === 1) {
    category = CATEGORY_PROJECTS
  }

  return {
    category,
    category_lowercase: category.toLocaleLowerCase()
  }
}

export const STORE_CATEGORY_VOCABULARY: string[] = [
  CATEGORY_TOOL_2D,
  CATEGORY_TOOL_3D,
  CATEGORY_TOOLS,
  CATEGORY_SCRIPTS,
  CATEGORY_SHADERS,
  CATEGORY_MATERIALS,
  CATEGORY_ASSETS_2D,
  CATEGORY_ASSETS_3D,
  CATEGORY_AUDIO,
  CATEGORY_VFX,
  CATEGORY_UI,
  CATEGORY_TEMPLATES,
  CATEGORY_DEMOS,
  CATEGORY_PROJECTS,
  CATEGORY_MISC
]
