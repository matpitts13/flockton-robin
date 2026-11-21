# ADR 0001: One canvas renderer for every output

**Date:** 2026-11-19
**Status:** Accepted

## Context

Robin shows a design in four places (the editor preview, the gallery thumbnails, the sheet preview and print, and the saved PDF) and exports a fifth form (a Cricut Print Then Cut PNG). If any of these drew the design differently, what the user saw would not be what printed. Designs mix text in bundled fonts, simple shapes, borders and user pictures (PNG, JPG, WebP, SVG).

## Options considered

1. **Canvas 2D at 300 dpi → PNG, reused everywhere.** Pros: one drawing routine, so every output matches; canvas handles fonts, clipping and user images natively; 300 dpi is the print standard for stickers. Cons: the PDF is raster, not vector; big cards make bigger PNGs (5 × 7 in ≈ 1.5 k × 2.1 k px).
2. **Vector PDF drawn with pdf-lib, plus a separate DOM/SVG preview.** Pros: sharp text at any printer resolution. Cons: two renderers to keep identical; embedding fonts and text fitting in pdf-lib is a lot of code; user SVG art would need its own path.
3. **SVG for everything.** Pros: vector. Cons: rasterising for print and Cricut still needs canvas; font loading inside SVG-as-image is unreliable.

## Decision

Option 1. One `drawDesign()` makes every picture, so preview, print, PDF and Cricut can't drift apart, and 300 dpi is plenty for stickers and cards.

## Consequences

- Positive: what you see is what prints. The PDF embeds the PNG once and places it in every slot, so files stay small. Crop marks and cut outlines are still vector.
- Negative: text in the PDF is not selectable or vector-sharp beyond 300 dpi.
- Follow-up: if users print large text-heavy cards on high-resolution printers and want vector text, add a pdf-lib text path for the plain designs only.
