---
title: Godot Templates vs Demos vs Projects
description: The difference between Godot templates, demos and complete projects in the Asset Library — and how to pick the right one for learning or bootstrapping your game.
slug: godot-templates-vs-demos-vs-projects
date: 2026-02-25
updated: 2026-08-01
order: 8
category: general
---

The Asset Library organizes complete Godot projects into three overlapping categories — templates, demos and projects — and it is not always obvious which one you need. Here is the honest difference, and how to choose.

## Projects: complete, runnable games

A **project** is a finished or near-finished game you can open, run and play. These are the best way to study real architecture: how a developer structured scenes, scripts, UI and save systems. You generally do not ship a project as-is; you borrow from it.

- **Best for:** studying real code, stealing mechanics and patterns, reverse-engineering a polished game.
- **See:** [Projects](/category/projects)

## Demos: one idea, isolated

A **demo** showcases a single feature, effect or system in a small, focused project. Want to understand particles? State machines? Water shaders? A demo shows exactly that, with minimal noise around it. This makes demos the fastest way to learn one technique at a time.

- **Best for:** learning one technique, grabbing a single system to drop into your game.
- **See:** [Demos](/category/demos)

## Templates: a starting point to build on

A **template** is a project designed to be copied and extended — the scaffolding of a game type (platformer, top-down, card game) with the boring setup already done. Templates shine when you want to start a game but do not want to build the foundation from scratch.

- **Best for:** bootstrapping a new game, getting a genre's conventions for free.
- **See:** [Templates](/category/templates)

## How to install each type

All three ship a full `project.godot`, so they are opened as their own project rather than merged into an existing one:

1. Extract the archive anywhere on disk.
2. In the Godot project manager, click **Import** and select the extracted `project.godot`.
3. Open it, explore, and copy the parts you want into your real project.

For the full walkthrough see [how to install Godot assets](/guides/how-to-install-godot-assets).

## Which should you pick?

- **Learning a technique quickly** → a demo about that exact technique.
- **Studying a full game's architecture** → a project in your genre.
- **Starting a new game fast** → a template for that game type.
- **Not sure?** → start with a demo; they are the smallest and clearest.

## Choosing a good one

Regardless of type, check the **Godot version** badge — project files are version-sensitive and a Godot 3 project will not open cleanly in Godot 4 — then look at reviews and the last-updated date. The [choosing guide](/guides/how-to-choose-a-godot-asset) has the full checklist. Browse all three now: [Templates](/category/templates), [Demos](/category/demos) and [Projects](/category/projects).
