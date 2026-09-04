// Inlines vendor libraries, the land topology, app.css and app.js into one
// self-contained HTML file. No network, no server needed to open the result.
//
//   npm install
//   node build.js
//
// Vendor order matters: d3-geo's UMD build requires d3-array (for Adder),
// and d3-array requires internmap. Each must be defined before the next.
"use strict";
const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
const vendor = [
  "node_modules/internmap/dist/internmap.min.js",
  "node_modules/d3-array/dist/d3-array.min.js",
  "node_modules/d3-geo/dist/d3-geo.min.js",
  "node_modules/topojson-client/dist/topojson-client.min.js",
].map(read).join("\n");

const land = "window.LAND = " + read("node_modules/world-atlas/land-110m.json") + ";";

// Replace with functions so "$" sequences in the replacement text are literal.
const html = read("shell.html")
  .replace("/*CSS*/", () => read("app.css"))
  .replace("<script>/*VENDOR*/</script>", () => "<script>\n" + vendor + "\n</script>")
  .replace("<script>/*LAND*/</script>", () => "<script>\n" + land + "\n</script>")
  .replace("<script>/*APP*/</script>", () => "<script>\n" + read("app.js") + "\n</script>");

const out = path.join(__dirname, "projection-switching-prototype.html");
fs.writeFileSync(out, html);
console.log("wrote " + path.basename(out) + " (" + (html.length / 1024).toFixed(0) + " kB)");
