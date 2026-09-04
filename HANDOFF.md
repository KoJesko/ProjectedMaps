# Handoff: projection-switching navigation prototype

Context for anyone picking this up. Read this first, then open
`projection-switching-prototype.html`.

## Why this exists

The UN General Assembly adopted the "Correct the Map" resolution on 4 September
2026, 164 votes to 1 with 6 abstentions, sponsored by Togo for the African
Union. The text asks governments, schools, international organisations and
technology companies to use Equal Earth and other equal-area projections **where
the true scale of continents matters**. It does not ban Mercator and does not
ask for Equal Earth everywhere.

Togo is convening an implementation meeting in Lomé with UNESCO, the AU and
Google Maps. The risk being argued against is that Google reads the resolution
broadly and puts Equal Earth under the navigation layer, where an equal-area
projection is the wrong tool. If turn-by-turn gets worse, the resolution takes
the blame.

This prototype is the demonstration that goes with that argument. It is meant to
be opened on a laptop in that meeting.

## What it does

One self-contained HTML file. No network, no build step, no server. Open it.

Four task modes, each showing the projection that is correct for that task:

| Task | Projection | Why |
|---|---|---|
| Whole world | Equal Earth | The resolution, implemented |
| Regional corridor (Lomé–Ouagadougou–Niamey) | Lambert conformal conic, standard parallels fitted to the view | Conformal: road angles exact |
| Range from the port of Lomé | Azimuthal equidistant centred on the port | Distance rings true in every direction |
| Long haul Lomé–Bamako | Gnomonic centred on the route | Geodesic renders as a straight line |

Two toggles: render the same task in Web Mercator side by side, and overlay
Tissot indicatrices.

## The part that matters: the numbers are measured, not asserted

`distortion()` computes the Tissot parameters numerically from each
projection's own Jacobian by finite difference, then reports maximum angular
deformation ω and area scale relative to Lomé. Two task-specific measurements
are computed the same way: the distance scale from Lomé to Ouagadougou (the
range task's claim) and how far the projected shortest path bows off the
straight screen line (the route task's claim). Nothing is hard-coded, so if you
change a projection the readout follows.

The readout is one comparison table: a row per measurement, a column per
projection. Without the Mercator toggle, the second column is always "Equal
Earth if used here", so every task shows what the broad reading of the
resolution would cost.

Probes are deliberately **off the projection centres**. Any azimuthal
projection is undistorted at its own centre, so measuring there would make the
gnomonic look conformal. The range task measures at Ouagadougou and the route
task at Bamako, both real destinations.

Validated against known theory (`node test.js`):

```
Equal Earth      Lomé 6°N    ω = 16.676°   area ×1.0000
                 Ouaga 12°N  ω = 15.617°   area ×1.0000
                 Nuuk 64°N   ω = 43.730°   area ×1.0000
Web Mercator     Lomé        ω =  0.000°   area ×1.0000
                 Paris 49°N  ω =  0.000°   area ×2.2832
                 Nuuk 64°N   ω =  0.000°   area ×5.2192
Lambert conic    Lomé        ω =  0.000°   area ×1.0000
                 Ouaga       ω =  0.000°   area ×0.9952
Azimuthal eqd.   250/500/1000 km rings, north/east radius ratio 1.00000
Distance scale Lomé→Ouaga   azimuthal eqd. ×1.0000   Mercator ×1.0079   Equal Earth ×1.1108
Geodesic bow Lomé→Bamako    gnomonic 0.000%          Mercator 0.333%    Equal Earth 0.406%
```

Equal-area projections hold area at exactly 1.0 and deform angles. Conformal
projections hold angles at exactly 0.0 and deform area. That is Gauss's
*Theorema Egregium* showing up in a readout, and it is the whole argument in two
columns.

**The single most useful number in the meeting: Equal Earth deforms angles by
16.7° at Lomé.** That is what would land on road intersections if it were
applied to the navigation layer.

## How it was built

```
npm install      # d3-geo, d3-array, internmap, topojson-client, world-atlas
node build.js    # inlines the libraries, land-110m.json, app.css and app.js
                 # into projection-switching-prototype.html
node test.js     # validation table above
```

Sources: `shell.html`, `app.css`, `app.js`, `build.js`, `test.js`. The built
artifact is ~138 kB.

Vendor order in `build.js` matters. d3-geo v3's UMD build requires d3-array
(for `Adder`), and d3-array requires internmap. The first build omitted both, so
d3-geo threw at load and the page rendered empty.

## Verified on 4 September 2026

Rendered in headless Chrome at 1440×900, 1366×768 and 800px wide, in all four
modes with both toggles. No console errors. Fixed in that pass:

- Missing d3-array/internmap (page rendered nothing).
- Mercator pane always visible: `.pane{display:flex}` overrode the `hidden`
  attribute. Author sheet now has `[hidden]{display:none !important}`.
- Corridor mode fitted the whole sphere as a giant cone. The corridor polygon
  was wound counter-clockwise, which d3-geo reads as "everything except this
  rectangle". Exterior rings must run clockwise, north-up.
- Route label said 1,400 km. The great-circle figure is 1,250 km, and it is now
  computed from the coordinates at runtime.
- Readout was cut off below the fold on a 768px-high laptop. Restructured into
  the comparison table, footnote moved into the page footer, masthead trimmed.
- Narrow layout (under 900px) overlapped the two panes. It now scrolls.
- A stray `--grat:#243views;` line in the CSS.

## Not done yet

- Real road geometry. Routes are drawn as geodesics and rhumb lines between city
  coordinates, not as actual roads. Corridor road angles are the argument, so
  pulling the real Lomé–Ouagadougou alignment from OSM would make the corridor
  panel much stronger.
- Continuous zoom with automatic projection handover. Right now the modes are
  buttons. The real product claim is that the switch happens on zoom, and the
  hard part is the transition, which is where MapLibre's globe/Mercator
  interpolation work is worth reading.
- Tile pipeline. This renders vectors directly, which sidesteps the actual
  engineering obstacle: Google Maps serves pre-drawn square tiles indexed in Web
  Mercator. Any real version renders from vector tiles on the device. Worth
  checking the current state of MapLibre GL's non-Mercator projection support,
  which was moving fast and may have changed.
- French UI. The meeting is in Lomé and the mission's correspondence is in
  French. Strings are not extracted.

## Facts to re-verify before this is shown to anyone

- The vote count and resolution wording, from the UN's own record rather than
  news coverage. The masthead says "Resolution A/RES" with no number.
- Whether Google has actually agreed to attend the Lomé meeting, and in what
  capacity.
- Current MapLibre non-Mercator support status.
