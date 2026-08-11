---
title: How to Use Shaders in Godot
description: A practical introduction to using Godot shaders and materials in your project, from applying a shader to a node to tuning parameters and combining effects.
slug: how-to-use-shaders-in-godot
date: 2026-01-25
updated: 2026-08-01
order: 3
category: shaders
---

Shaders are small GPU programs that control exactly how a node is drawn. In Godot, the fastest way to get a dramatic visual upgrade is to apply a community shader from the library — no GPU programming required.

## Shader basics

A shader file (`.gdshader`) lives in your project and gets wrapped in a **ShaderMaterial**. You attach that material to a node (a `Sprite2D`, a `MeshInstance3D`, or a `CanvasItem`), and Godot renders the node through the shader.

Two types matter most for asset users:

- **CanvasItem shaders** — for 2D sprites, UI and particles.
- **Spatial shaders** — for 3D meshes and materials.

Most assets in the [Shaders category](/category/shaders) are CanvasItem shaders with a preview image and tunable parameters.

## Applying a shader step by step

1. Download and install the shader asset (see [how to install Godot assets](/guides/how-to-install-godot-assets)).
2. Select the node in your scene.
3. In the **Inspector**, find the **Material** property and choose **New ShaderMaterial**.
4. Set the material's **Shader** property to the `.gdshader` file you installed.
5. Use the material's **Shader Parameters** to tweak colors, speeds, strengths and textures.

The shader's README usually lists what each parameter does — that is where the real power is.

## Working with shader parameters

Good community shaders expose parameters instead of hardcoding values. Common ones include:

- **Strength / intensity** — how strong the effect is.
- **Speed / frequency** — animation timing.
- **Color** — palette and tint.
- **Texture** — input textures for masks or noise.

Adjust these in the inspector while the game is running; the effect updates live, which makes tuning fast.

## Combining shaders and materials

You can layer effects by chaining nodes (e.g. a `CanvasModulate` for color grading over a sprite with a water shader), or by writing a shader that samples a previous material's result. For 3D, you can mix shaders with the material's existing albedo/normal/roughness maps.

## Where to find good shaders

Start with the [Shaders category](/category/shaders) and look for assets with:

- Preview images that show the actual effect
- An active update history
- A `Support` level of community or better
- A README that documents the parameters

Retro and post-processing packs, water/grass systems, and outline shaders are all popular starting points. For materials specifically, see the [Materials category](/category/materials).

## Troubleshooting

- **Black or invisible node** — the shader may need a texture input you have not assigned; check the parameters.
- **"Parse error"** — the shader targets a different Godot version; verify the engine badge on the asset page.
- **Effect does not animate** — some shaders need a `TIME`-based variable which is automatic; others expose an `enabled` parameter — make sure it is on.

If you want to learn to write shaders from scratch, the shader assets you already installed are excellent study material — open them in the Shader Editor and read along.
