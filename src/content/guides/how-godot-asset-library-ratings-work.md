---
title: How Godot Asset Library Ratings Work
description: How the approval ratings on Godot Asset Library are calculated, why small samples are treated carefully, and how to read a rating honestly.
slug: how-godot-asset-library-ratings-work
date: 2026-02-15
updated: 2026-08-01
order: 6
category: general
---

Ratings on Godot Asset Library are deliberately simple and honest: every review records a **positive** or **negative** verdict, and an optional short text and headline. There are no half stars and no synthetic scores. Here is what the numbers actually mean.

## What you see

On every asset page you see two things:

- An **approval percentage**, e.g. "100% approval"
- A **sample size**, e.g. "2 ratings" or "2 positive, 0 negative"

The approval percentage is the share of positive reviews: `positive / (positive + negative)`. The sample size tells you how much to trust that percentage.

## Why a 100% from 2 reviews is not the same as 100% from 50

A percentage alone can mislead. A brand-new asset with two positive reviews shows 100%, but there is no evidence yet that it will hold up. Our catalog sorts "Highest rated" using a **confidence-adjusted score** (the 95% Wilson lower bound) which mathematically discounts small samples. An asset with 40 positive and 0 negative reviews ranks above an asset with 2 positive and 0 negative — even though both show 100% approval.

## How to read a rating honestly

- Look at the **sample size** before the percentage.
- Read the **text reviews** — they explain *why* people rate an asset positively or negatively, and often mention Godot version quirks.
- Prefer assets with recent reviews — an asset praised a year ago may not have been tested on your Godot version.

## Your reviews matter

Reviews are the only signal other developers get before installing. A good review is specific:

- Which Godot version you used
- What you were trying to do
- Whether it worked, and what to watch out for

A bad review without detail helps nobody — mention the version and the exact error if something broke. That is the difference between "broken" and "breaks on Godot 4.2 when exporting to Android", which is actionable for both the author and the next user.

## Why we do not show synthetic scores

Some libraries show 4.5-star averages. Averages hide small samples behind a false sense of precision. Approval percentages with explicit sample sizes, plus a confidence-adjusted sort, let you judge an asset with your eyes open.

## Reading the sort orders

- **Highest rated** uses the confidence-adjusted score, so quality assets with enough reviews float to the top.
- **Recently updated** is useful for finding assets that keep pace with the engine.

Read more about evaluating assets in [how to choose a Godot asset](/guides/how-to-choose-a-godot-asset), or start browsing the [highest rated assets](/search/?sort=asset_rating).
