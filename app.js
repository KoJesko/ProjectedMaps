(function () {
  "use strict";

  var land = topojson.feature(LAND, LAND.objects.land);
  var graticule = d3.geoGraticule().step([15, 15])();

  var LOME = [1.2833, 6.1167];      // port of Lome
  var BAMAKO = [-8.0029, 12.6392];
  var OUAGA = [-1.5197, 12.3714];
  var NIAMEY = [2.1098, 13.5116];

  // Corridor view: Gulf of Guinea coast up through the Sahel.
  // d3-geo needs exterior rings wound clockwise (north-up) to enclose the
  // small area; the opposite winding means "the whole sphere except this".
  var CORRIDOR = { type: "Polygon", coordinates: [[
    [-12, 3], [-12, 18], [8, 18], [8, 3], [-12, 3]
  ]]};

  var R_EARTH = 6371.0088; // km

  // ---- distortion, measured from the projection's own Jacobian -------------
  // Returns max angular deformation (degrees) and area scale at a point.
  function distortion(proj, lonlat) {
    var e = 0.02, lon = lonlat[0], lat = lonlat[1];
    var phi = lat * Math.PI / 180, cos = Math.cos(phi);
    var pE1 = proj([lon - e, lat]), pE2 = proj([lon + e, lat]);
    var pN1 = proj([lon, lat - e]), pN2 = proj([lon, lat + e]);
    if (!pE1 || !pE2 || !pN1 || !pN2) return null;
    var d = 2 * e * Math.PI / 180;
    // east basis (scaled to unit ground distance) and north basis
    var a1 = (pE2[0] - pE1[0]) / (d * cos), b1 = (pE2[1] - pE1[1]) / (d * cos);
    var a2 = (pN2[0] - pN1[0]) / d,         b2 = (pN2[1] - pN1[1]) / d;
    var det = Math.abs(a1 * b2 - a2 * b1);
    // singular values of [[a1,a2],[b1,b2]]
    var E = a1 * a1 + b1 * b1, G = a2 * a2 + b2 * b2, F = a1 * a2 + b1 * b2;
    var t = Math.sqrt(Math.max(0, (E - G) * (E - G) + 4 * F * F));
    var s1 = Math.sqrt(Math.max(0, (E + G + t) / 2));
    var s2 = Math.sqrt(Math.max(0, (E + G - t) / 2));
    var omega = (s1 + s2) > 0 ? 2 * Math.asin(Math.min(1, (s1 - s2) / (s1 + s2))) : 0;
    return { omega: omega * 180 / Math.PI, area: det };
  }

  // ---- geodesic helpers ---------------------------------------------------
  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function geodesic(a, b, n) {
    var f1 = toRad(a[1]), l1 = toRad(a[0]), f2 = toRad(b[1]), l2 = toRad(b[0]);
    var dd = d3.geoDistance(a, b), sd = Math.sin(dd), pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      if (sd < 1e-12) { pts.push(a); continue; }
      var A = Math.sin((1 - f) * dd) / sd, B = Math.sin(f * dd) / sd;
      var x = A * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2);
      var y = A * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2);
      var z = A * Math.sin(f1) + B * Math.sin(f2);
      pts.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
    }
    return { type: "LineString", coordinates: pts };
  }

  // Constant-bearing (rhumb) track, for the navigation contrast.
  function rhumb(a, b, n) {
    var f1 = toRad(a[1]), f2 = toRad(b[1]), l1 = toRad(a[0]), l2 = toRad(b[0]);
    var dl = ((l2 - l1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var f = i / n, ph = f1 + f * (f2 - f1), lm = l1 + f * dl;
      pts.push([toDeg(lm), toDeg(ph)]);
    }
    return { type: "LineString", coordinates: pts };
  }

  function kmLabel(a, b) {
    var km = Math.round(d3.geoDistance(a, b) * R_EARTH / 10) * 10;
    return km.toLocaleString("en") + " km";
  }

  // Task-specific measurements. Like distortion(), these are computed from
  // the projection itself and are scale-free, so they read the same on any
  // screen. distanceScale: on-screen distance from -> to, relative to the
  // nominal linear scale at "from". 1.000 means true-to-scale.
  function distanceScale(proj, from, to) {
    var a = proj(from), b = proj(to), s0 = distortion(proj, from);
    if (!a || !b || !s0) return null;
    var px = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return px / (d3.geoDistance(from, to) * Math.sqrt(s0.area));
  }

  // geodesicBow: how far the projected shortest path departs from the straight
  // screen line between its endpoints, as a fraction of that line's length.
  // 0 means "the straight line on screen is the shortest route on the ground".
  function geodesicBow(proj, from, to) {
    var a = proj(from), b = proj(to);
    if (!a || !b) return null;
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), worst = 0;
    geodesic(from, to, 200).coordinates.forEach(function (c) {
      var p = proj(c);
      if (p) worst = Math.max(worst, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len);
    });
    return worst / len;
  }

  function ringKm(center, km) {
    return d3.geoCircle().center(center).radius(km / R_EARTH * 180 / Math.PI).precision(1)();
  }

  // ---- projection builders ------------------------------------------------
  function fittedConic(bounds) {
    var lats = bounds.coordinates[0].map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, lats), hi = Math.max.apply(null, lats);
    var p1 = lo + (hi - lo) / 6, p2 = hi - (hi - lo) / 6;
    var lons = bounds.coordinates[0].map(function (p) { return p[0]; });
    var lon0 = (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2;
    var proj = d3.geoConicConformal().parallels([p1, p2]).rotate([-lon0, 0]);
    proj.__label = "Lambert conformal conic, standard parallels " +
      p1.toFixed(1) + "\u00B0N and " + p2.toFixed(1) + "\u00B0N";
    return proj;
  }

  var TASKS = [
    {
      id: "world",
      name: "Looking at the whole world",
      hint: "Zoomed all the way out, or a wall map",
      answer: "Equal Earth \u2014 this is the resolution",
      make: function () {
        var p = d3.geoEqualEarth();
        p.__label = "Equal Earth (K\u00F6ppen, \u0160avri\u010D & Patterson, 2018)";
        return p;
      },
      fit: { type: "Sphere" },
      probe: LOME,
      argument: "This is what the resolution asks for and Google should ship it. Equal Earth holds every country's area to true proportion, so Africa reads at its real size against Europe. <b>Angles are not preserved</b>, which does not matter on a world map nobody navigates by.",
      draw: drawWorld
    },
    {
      id: "corridor",
      name: "Driving a regional corridor",
      hint: "Lom\u00E9 to Ouagadougou and Niamey",
      answer: "Lambert conformal conic, fitted to the view",
      short: "Lambert conic",
      make: function () { return fittedConic(CORRIDOR); },
      fit: CORRIDOR,
      probe: OUAGA,
      argument: "Here the map has to keep road geometry exact, so the projection must be conformal: angular deformation is <b>zero everywhere</b>, which is why aeronautical charts and national surveys use this. Switch on Mercator to see that it is also conformal but at a scale that is wrong, and switch on Equal Earth thinking to see what the resolution would cost if applied here.",
      draw: drawCorridor
    },
    {
      id: "range",
      name: "Asking what is within reach",
      hint: "500 km from the port of Lom\u00E9",
      answer: "Azimuthal equidistant, centred on the port",
      make: function () {
        var p = d3.geoAzimuthalEquidistant().rotate([-LOME[0], -LOME[1]]);
        p.__label = "Azimuthal equidistant, centred on the port of Lom\u00E9";
        return p;
      },
      fit: ringKm(LOME, 1700),
      probe: OUAGA,
      extraLabel: "Distance to Ouagadougou",
      extra: function (proj) {
        var s = distanceScale(proj, LOME, OUAGA);
        return s == null ? null : { v: "\u00D7" + s.toFixed(3), good: Math.abs(s - 1) < 0.005 };
      },
      argument: "Every ring is a true circle at true scale, so a dispatcher reading catchment off this map reads real kilometres in every direction. On Mercator the same rings come out as ellipses that grow northward: the 500 km ring reaches further on screen than it does on the road.",
      draw: drawRange
    },
    {
      id: "route",
      name: "Planning a long haul",
      hint: "Lom\u00E9 to Bamako, " + kmLabel(LOME, BAMAKO) + " great-circle",
      answer: "Gnomonic, centred on the route",
      make: function () {
        var mid = geodesic(LOME, BAMAKO, 2).coordinates[1];
        var p = d3.geoGnomonic().rotate([-mid[0], -mid[1]]).clipAngle(60);
        p.__label = "Gnomonic, centred on the route";
        return p;
      },
      fit: ringKm([(LOME[0] + BAMAKO[0]) / 2, (LOME[1] + BAMAKO[1]) / 2], 1400),
      probe: BAMAKO,
      extraLabel: "Shortest path bows off straight line",
      extra: function (proj) {
        var b = geodesicBow(proj, LOME, BAMAKO);
        return b == null ? null : { v: (100 * b).toFixed(2) + "%", good: b < 0.0005 };
      },
      argument: "On a gnomonic projection every shortest path over the earth is a straight line, so the solid track is the true geodesic. The dashed track is the constant-compass rhumb line Mercator makes straight instead. <b>Neither projection is right for the whole app</b>, which is the point.",
      draw: drawRoute
    }
  ];

  // ---- drawing ------------------------------------------------------------
  function el(tag, attrs, cls) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (cls) n.setAttribute("class", cls);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function base(svg, path, isB) {
    svg.appendChild(el("path", { d: path({ type: "Sphere" }) || "" }, "sphere"));
    svg.appendChild(el("path", { d: path(graticule) || "" }, "grat"));
    svg.appendChild(el("path", { d: path(land) || "" }, "land" + (isB ? " land-b" : "")));
  }

  function marker(svg, path, proj, lonlat, label, isB) {
    var p = proj(lonlat);
    if (!p) return;
    svg.appendChild(el("circle", { cx: p[0], cy: p[1], r: 3.5 }, "dot" + (isB ? " dot-b" : "")));
    if (label) {
      var t = el("text", { x: p[0] + 8, y: p[1] + 4 }, "lbl");
      t.textContent = label;
      svg.appendChild(t);
    }
  }

  function drawWorld(svg, path, proj, isB) {
    base(svg, path, isB);
    marker(svg, path, proj, LOME, "Lom\u00E9", isB);
  }

  function drawCorridor(svg, path, proj, isB) {
    base(svg, path, isB);
    svg.appendChild(el("path", { d: path(geodesic(LOME, OUAGA, 60)) || "" }, "route" + (isB ? " route-b" : "")));
    svg.appendChild(el("path", { d: path(geodesic(LOME, NIAMEY, 60)) || "" }, "route" + (isB ? " route-b" : "")));
    marker(svg, path, proj, LOME, "Lom\u00E9", isB);
    marker(svg, path, proj, OUAGA, "Ouagadougou", isB);
    marker(svg, path, proj, NIAMEY, "Niamey", isB);
  }

  function drawRange(svg, path, proj, isB) {
    base(svg, path, isB);
    [250, 500, 750, 1000, 1250].forEach(function (km) {
      svg.appendChild(el("path", { d: path(ringKm(LOME, km)) || "" }, "ring" + (isB ? " ring-b" : "")));
      var p = proj([LOME[0], LOME[1] + km / R_EARTH * 180 / Math.PI]);
      if (p) {
        var t = el("text", { x: p[0] + 5, y: p[1] - 4 }, "lbl-dim");
        t.textContent = km + " km";
        svg.appendChild(t);
      }
    });
    marker(svg, path, proj, LOME, "Port of Lom\u00E9", isB);
  }

  function drawRoute(svg, path, proj, isB) {
    base(svg, path, isB);
    svg.appendChild(el("path", { d: path(rhumb(LOME, BAMAKO, 80)) || "" }, "rhumb"));
    svg.appendChild(el("path", { d: path(geodesic(LOME, BAMAKO, 80)) || "" }, "route" + (isB ? " route-b" : "")));
    marker(svg, path, proj, LOME, "Lom\u00E9", isB);
    marker(svg, path, proj, BAMAKO, "Bamako", isB);
  }

  function tissots(svg, path, proj, task) {
    var lats = task.id === "world" ? [-60, -30, 0, 30, 60] : null;
    var lons = task.id === "world" ? [-150, -90, -30, 30, 90, 150] : null;
    if (!lats) {
      var b = task.fit.type === "Sphere" ? null : d3.geoBounds(task.fit);
      lats = [b[0][1], (b[0][1] + b[1][1]) / 2, b[1][1]];
      lons = [b[0][0], (b[0][0] + b[1][0]) / 2, b[1][0]];
    }
    var rad = task.id === "world" ? 6 : 1.6;
    lats.forEach(function (la) {
      lons.forEach(function (lo) {
        var c = d3.geoCircle().center([lo, la]).radius(rad).precision(2)();
        var d = path(c);
        if (d) svg.appendChild(el("path", { d: d }, "tissot"));
      });
    });
  }

  // ---- render -------------------------------------------------------------
  var state = { task: TASKS[0], compare: false, tissot: false };

  function render() {
    var t = state.task;
    document.getElementById("stage").classList.toggle("split", state.compare);
    document.getElementById("paneB").hidden = !state.compare;

    var projA = t.make();
    var infoA = paint("mapA", projA, t, false);

    document.getElementById("titleA").textContent = t.answer;
    document.getElementById("subA").textContent = projA.__label || "";

    var infoB = null;
    if (state.compare) {
      var projB = d3.geoMercator();
      projB.__label = "Web Mercator (EPSG:3857)";
      infoB = paint("mapB", projB, t, true);
    }

    readout(t, infoA, infoB);
    document.getElementById("argument").innerHTML = t.argument;
    document.getElementById("mastNote").textContent =
      "measuring at " + fmtCoord(t.probe);
  }

  function paint(id, proj, task, isB) {
    var svg = document.getElementById(id);
    var r = svg.getBoundingClientRect();
    var w = Math.max(200, r.width), h = Math.max(200, r.height);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Mercator cannot fit a whole sphere; clamp its fit for the world task.
    var fitObj = task.fit;
    if (isB && fitObj.type === "Sphere") {
      fitObj = { type: "Polygon", coordinates: [[[-180, -82], [-180, 82], [180, 82], [180, -82], [-180, -82]]] };
    }
    proj.fitExtent([[14, 14], [w - 14, h - 14]], fitObj);

    var path = d3.geoPath(proj);
    task.draw(svg, path, proj, isB);
    if (state.tissot) tissots(svg, path, proj, task);

    return { proj: proj, d: distortion(proj, task.probe), ref: distortion(proj, LOME) };
  }

  function fmtCoord(c) {
    return Math.abs(c[1]).toFixed(2) + "\u00B0" + (c[1] < 0 ? "S" : "N") + " " +
           Math.abs(c[0]).toFixed(2) + "\u00B0" + (c[0] < 0 ? "W" : "E");
  }

  // One comparison table: a row per measurement, a column per projection.
  // Equal-area projections hold the area row at exactly 1 and lose angles;
  // conformal ones hold angles at exactly 0 and lose area (Theorema Egregium).
  function readout(t, a, b) {
    var cols = [{ name: t.short || shortName(a.proj.__label), info: a }];
    if (b) {
      cols.push({ name: "Web Mercator", info: b });
    } else if (t.id !== "world") {
      // Always show what Equal Earth would cost on this task, since that is the ask.
      var ee = d3.geoEqualEarth();
      ee.fitExtent([[0, 0], [800, 400]], { type: "Sphere" });
      cols.push({ name: "Equal Earth if used here",
                  info: { proj: ee, d: distortion(ee, t.probe), ref: distortion(ee, LOME) } });
    }
    var metrics = [
      { k: "Angles off by", f: function (i) {
          return { v: i.d.omega.toFixed(2) + "\u00B0", good: i.d.omega < 0.005 }; } },
      { k: "Area vs. Lom\u00E9", f: function (i) {
          var area = i.d.area / i.ref.area;
          return { v: "\u00D7" + area.toFixed(3), good: Math.abs(area - 1) < 0.005 }; } }
    ];
    if (t.extra) metrics.push({ k: t.extraLabel, f: function (i) { return t.extra(i.proj); } });

    var h = "<h3>Measured at " + fmtCoord(t.probe) + "</h3>";
    h += '<div class="rd" style="grid-template-columns:1fr repeat(' + cols.length + ',auto)">';
    h += '<span class="rd-h"></span>';
    cols.forEach(function (c) { h += '<span class="rd-h">' + c.name + "</span>"; });
    metrics.forEach(function (m) {
      h += '<span class="k">' + m.k + "</span>";
      cols.forEach(function (c) {
        var r = c.info && c.info.d ? m.f(c.info) : null;
        h += r ? '<span class="v ' + (r.good ? "good" : "bad") + '">' + r.v + "</span>"
               : '<span class="v">\u2014</span>';
      });
    });
    h += "</div>";
    document.getElementById("readout").innerHTML = h;
  }

  function shortName(l) { return (l || "").split(" (")[0].split(",")[0]; }

  // ---- wiring -------------------------------------------------------------
  var wrap = document.getElementById("tasks");
  TASKS.forEach(function (t) {
    var b = document.createElement("button");
    b.className = "task";
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", t === state.task ? "true" : "false");
    b.innerHTML = "<b>" + t.name + "</b><span>" + t.hint + "</span><em>" + t.answer + "</em>";
    b.addEventListener("click", function () {
      state.task = t;
      Array.prototype.forEach.call(wrap.children, function (c) {
        c.setAttribute("aria-checked", "false");
      });
      b.setAttribute("aria-checked", "true");
      render();
    });
    wrap.appendChild(b);
  });

  document.getElementById("cmp").addEventListener("change", function (e) {
    state.compare = e.target.checked;
    render();
  });
  document.getElementById("tissot").addEventListener("change", function (e) {
    state.tissot = e.target.checked;
    render();
  });

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(render, 120);
  });

  render();
})();
