/**
 * Editorial copy for category landing pages. This is the differentiated,
 * first-party content that makes taxonomy pages worth indexing: it explains
 * what a category contains, how to choose from it, and points to relevant
 * guides. Written by hand; never generated from asset data.
 */

export interface CategoryContent {
  key: string
  intro: string
  bullets: string[]
  guides: Array<{ href: string, label: string }>
}

export const CATEGORY_CONTENT: Record<string, CategoryContent> = {
  '2d tools': {
    key: '2d tools',
    intro: '2D Tools are editor plugins and utilities built for 2D game development in Godot. Whether you need tilemap helpers, camera systems, parallax setups, UI components or animation tools, this category collects the add-ons that remove repetitive 2D work.',
    bullets: [
      'Tilemap, level and world-building helpers',
      'Camera, parallax and screen-shake utilities',
      'UI and HUD components and helpers',
      'Animation, spritesheet and atlas tools'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-plugins', label: 'How to install Godot plugins' },
      { href: '/guides/how-to-choose-a-godot-asset', label: 'How to choose a Godot asset' }
    ]
  },
  '3d tools': {
    key: '3d tools',
    intro: '3D Tools bring editor utilities, controllers, physics helpers and workflow add-ons for 3D games in Godot. From character controllers and targeting systems to skeleton and physics utilities, this is where 3D-focused add-ons live.',
    bullets: [
      'Character and first-person controllers',
      'Physics, skeleton and animation helpers',
      'Terrain, import and scene tools',
      'Camera and targeting systems'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-plugins', label: 'How to install Godot plugins' },
      { href: '/guides/how-to-choose-a-godot-asset', label: 'How to choose a Godot asset' }
    ]
  },
  tools: {
    key: 'tools',
    intro: 'The Tools category is the general home for Godot editor plugins and workflow add-ons: code analyzers, scene helpers, build utilities, AI and backend integrations, and anything else that makes the editor work better for you.',
    bullets: [
      'Editor workflow and productivity add-ons',
      'Code quality, analysis and automation tools',
      'AI, backend and service integrations',
      'Build, export and pipeline utilities'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-plugins', label: 'How to install and enable plugins' },
      { href: '/guides/best-godot-4-plugins', label: 'Best Godot 4 plugins' }
    ]
  },
  shaders: {
    key: 'shaders',
    intro: 'Shaders are small GPU programs that dramatically change how your game looks. This category collects post-processing packs, water and grass systems, retro effects, outline shaders and materials you can drop straight into your project — no shader programming required.',
    bullets: [
      'Post-processing and retro effect packs',
      'Water, fire, grass and environmental effects',
      'Outline, dissolve and UI shaders',
      'Materials and shader parameter packs'
    ],
    guides: [
      { href: '/guides/how-to-use-shaders-in-godot', label: 'How to use shaders in Godot' },
      { href: '/guides/how-to-install-godot-assets', label: 'How to install Godot assets' }
    ]
  },
  scripts: {
    key: 'scripts',
    intro: 'Scripts are reusable GDScript libraries and single-file utilities. Attach them to nodes, extend them from your own code, or use them as building blocks for gameplay systems without installing a full plugin.',
    bullets: [
      'Gameplay and system scripts',
      'Input, UI and audio helpers',
      'Networking and service libraries',
      'Single-file utilities and snippets'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-assets', label: 'How to install Godot assets' },
      { href: '/guides/how-to-choose-a-godot-asset', label: 'How to choose a Godot asset' }
    ]
  },
  materials: {
    key: 'materials',
    intro: 'Materials define how 3D surfaces look in Godot — colors, textures, roughness and lighting response. This category holds ready-made material packs that give your scenes a polished look without hand-building shader graphs.',
    bullets: [
      'Ready-made PBR material packs',
      'Surface textures and presets',
      'Environment and object materials'
    ],
    guides: [
      { href: '/guides/how-to-use-shaders-in-godot', label: 'How to use shaders and materials' }
    ]
  },
  templates: {
    key: 'templates',
    intro: 'Templates are complete Godot projects you can copy or adapt to bootstrap your own game. They ship with project files, scenes and assets that give you a working foundation to build on instead of starting from an empty project.',
    bullets: [
      'Complete project starters',
      'Genre and mechanic templates',
      'UI and tool templates'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-assets', label: 'How to install Godot assets' },
      { href: '/guides/how-to-choose-a-godot-asset', label: 'How to choose a Godot asset' }
    ]
  },
  projects: {
    key: 'projects',
    intro: 'Projects are complete, runnable Godot games and applications. They are the best way to study real Godot architecture, mechanics and polish — open them, play them, and borrow the parts that fit your own game.',
    bullets: [
      'Complete playable games',
      'Study-ready example projects',
      'Mechanics and feature showcases'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-assets', label: 'How to install Godot assets' }
    ]
  },
  demos: {
    key: 'demos',
    intro: 'Demos showcase a specific feature, effect or system in isolation. They are ideal for learning one technique at a time — from particle effects to state machines — and for grabbing a single system to drop into your project.',
    bullets: [
      'Single-feature showcase projects',
      'Effect, physics and UI demonstrations',
      'Small self-contained examples'
    ],
    guides: [
      { href: '/guides/how-to-install-godot-assets', label: 'How to install Godot assets' }
    ]
  },
  misc: {
    key: 'misc',
    intro: 'The Misc category is home to everything that does not fit neatly elsewhere: audio, icons, fonts, UI packs and other useful extras for your Godot projects.',
    bullets: [
      'Audio, sound and music packs',
      'Icons, fonts and UI assets',
      'Art and other project extras'
    ],
    guides: [
      { href: '/guides/how-to-choose-a-godot-asset', label: 'How to choose a Godot asset' }
    ]
  }
}

export function getCategoryContent (key: string): CategoryContent | undefined {
  return CATEGORY_CONTENT[normalizeKey(key)]
}

function normalizeKey (key: string): string {
  return String(key ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}
