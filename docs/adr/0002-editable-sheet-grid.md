# ADR 0002: Pre-cut sheets use an editable grid, not named templates

**Date:** 2026-11-19
**Status:** Accepted

## Context

Sellers print on pre-cut sticker sheets from many brands (Avery, Online Labels, generic Amazon packs). Each brand's sheet has its own margins and spacing, and they change between product numbers. Printing even 1/16 in off a pre-cut sticker shows. We could not verify exact measurements for specific product numbers from public sources while building version 1.

## Options considered

1. **Named templates ("fits Avery 22807").** Pros: one click. Cons: needs exact, verified measurements per product; a wrong number misprints a whole pack; naming products invites trademark questions.
2. **Editable grid (across, down, left and top margin, spacing) with a centred default, plus a printer adjustment.** Pros: works with any brand; the user copies numbers from the pack or the maker's template; the printer adjustment fixes printer drift too. Cons: a little typing the first time (the grid is remembered per paper and size).

## Decision

Option 2, because it is correct for every sheet instead of a few, and nothing printed depends on numbers we could not check.

## Consequences

- Positive: any pre-cut sheet works; no product names in the app.
- Negative: no one-click presets.
- Follow-up: add named presets later only with measurements taken from a real sheet.
