---
title: How to Install and Enable Godot Plugins
description: Everything you need to know about installing Godot editor plugins and add-ons, enabling them in Project Settings, and wiring up autoloads and nodes.
slug: how-to-install-godot-plugins
date: 2026-01-20
updated: 2026-08-01
order: 2
category: general
---

Godot plugins (also called add-ons) extend the editor with new docks, panels, node types, importers and tools. They are the most popular category of asset in the library, and installing them correctly is the difference between a working tool and a confusing error message.

## What a Godot plugin actually is

A plugin is a folder under `addons/<plugin-name>/` that contains at least:

- `plugin.cfg` — the manifest describing the plugin
- a `*.gd` script that extends `EditorPlugin`

Godot scans `addons/` at editor startup. If the folder is in the right place, the plugin appears in **Project Settings → Plugins**.

## Install via the AssetLib tab

1. Open your project and switch to the **AssetLib** tab.
2. Find the plugin (browse [2D Tools](/category/2d%20tools), [3D Tools](/category/3d%20tools) or [Tools](/category/tools)).
3. Click **Download** → **Install**.
4. When prompted, tick the plugin to enable it right away.

## Install from a ZIP

1. Extract the archive.
2. Copy the `addons/` folder into your project root so the path becomes `res://addons/<plugin-name>/`.
3. If the archive uses a different layout, read the README on the asset page.

## Enabling the plugin

1. Open **Project → Project Settings**.
2. Select the **Plugins** tab.
3. Find the plugin and set its status to **Enabled**.

Some plugins need one more step after enabling:

- **Autoloads (singletons):** the README will say so. Add it under **Project → Project Settings → Autoload**.
- **Editor docks:** appear automatically in the editor after you enable the plugin.
- **Node types:** become available in the **Add Node** dialog immediately.

> **Tip:** After enabling a plugin, restart the editor if you see a "class not found" error. Some plugins register global classes that only resolve after a reload.

## Keeping plugins updated

Check the asset page for the plugin's version and last-update date. Plugins are updated through the same install flow — Godot overwrites the `addons/` folder. If you made local edits to a plugin, back them up first, because an update replaces the whole folder.

## When plugins go wrong

- **"Cannot load script ... as it does not inherit from EditorPlugin"** — the `plugin.cfg` points at the wrong script, or the script has a syntax error for your Godot version.
- **Plugin missing from the list** — the folder is not under `res://addons/`, or the editor needs a restart.
- **Errors only in the console** — check the asset's GitHub issues via the repository link on its page.

## Choosing a good plugin

- Check the **Godot version** badge — a Godot 3 plugin will not work in a Godot 4 project.
- Look at the **support level** and review count on the asset page.
- Prefer plugins that are actively updated (see the "last updated" date).

Read [how to choose a Godot asset](/guides/how-to-choose-a-godot-asset) for a deeper checklist, and explore [all Godot add-ons](/category/tools) to find your next productivity boost.
