---
title: How to Install Godot Assets
description: A step-by-step guide to installing Godot assets from the Asset Library, covering plugins, shaders, scripts, templates and complete projects.
slug: how-to-install-godot-assets
date: 2026-01-15
updated: 2026-08-01
order: 1
category: general
---

The Godot Asset Library is the official place to find free and open source assets for the Godot Engine. Assets come in several shapes — plugins, shaders, scripts, templates, demos and complete projects — and each one installs a little differently. This guide walks you through every type.

## Install directly from the editor (the easy way)

The fastest way to install any asset is straight from the Godot editor:

1. Open your project in Godot.
2. Click the **AssetLib** tab at the top of the editor window.
3. Search for the asset (or browse [our catalog](/search/) to find the exact name).
4. Click the asset, then click **Download**.
5. Review the file list and click **Install**.

Godot downloads the asset, extracts it into your project, and (for plugins) asks you whether to enable it. This works for every asset type.

## Install from a ZIP file (the manual way)

If you downloaded a ZIP directly from this site or a GitHub release:

1. Unzip the archive.
2. Copy the contents into your project folder. For most assets you will copy an `addons/` folder, a `scripts/` folder, or a `project.godot` file.
3. If the asset is a plugin, enable it in **Project → Project Settings → Plugins**.

> **Tip:** Keep the folder structure intact. Plugins almost always need to live under `addons/<plugin-name>/` exactly as shipped, or Godot will not find them.

## Plugins and add-ons

Plugins extend the editor itself — docks, panels, and new node types. After installing:

1. Open **Project → Project Settings → Plugins**.
2. Find the plugin in the list.
3. Toggle it **Enabled**.

Some plugins also need a global (autoload) or an exported node to be added to your scene. Read the plugin's README on its asset page for those details. Browse the [best Godot plugins](/category/2d%20tools) or see all [Godot tools and add-ons](/category/tools).

## Shaders and materials

Shaders are usually single `.gdshader` files or small add-ons. To use one:

1. Create a `ShaderMaterial` on the node you want to affect (sprite, material, or CanvasItem).
2. Assign the shader file to the material's **Shader** property.
3. If the shader ships with parameters or textures, wire them up in the inspector.

A good starting point is the [Shaders category](/category/shaders), and our [shader guide](/guides/how-to-use-shaders-in-godot) explains the concepts in depth.

## Scripts and utilities

Single scripts are copied into your project and attached to nodes, or loaded with `preload()`/`load()` from GDScript. Check the asset's README for the intended usage — some are editor tools, others are runtime libraries you `extends` or instantiate. Find more in the [Scripts category](/category/scripts).

## Templates, demos and projects

Templates and demos ship a full `project.godot`, so they are meant to be opened as their own project:

1. Extract the archive anywhere on disk.
2. In the Godot project manager, click **Import** and select the extracted `project.godot`.
3. Open it, and copy the parts you want into your real project.

Browse ready-to-study [demos](/category/demos), [projects](/category/projects) and [templates](/category/templates).

## Checking Godot version compatibility

Before installing, always confirm the asset supports **your** Godot version. Assets in this library list the exact version they were built for. If you are on Godot 4, filter the catalog by engine, e.g. [Godot 4 assets](/engine/4.0), or read [how to choose a Godot asset](/guides/how-to-choose-a-godot-asset) for the full checklist.

## Troubleshooting

- **Plugin does not appear in the list** — make sure it is inside `addons/` and that you restarted the editor.
- **Script errors on load** — the asset may target a different Godot version; double check the compatibility badge on the asset page.
- **Textures are missing** — re-extract the ZIP into the project root so relative paths resolve.

Still stuck? The asset's page links to its repository and issues tracker — maintainers usually answer quickly.
