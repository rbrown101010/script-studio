// Excalidraw has no custom fill renderer API. Patch only the pinned 0.18.1 build, fail closed on drift.
// Shared TS helpers are compiled into both bundles; Canvas/PNG and SVG (including built-in exports) agree.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const pkg = new URL("node_modules/@excalidraw/excalidraw/", root);
if (JSON.parse(readFileSync(new URL("package.json", pkg))).version !== "0.18.1") throw new Error("Review the gradient renderer patch before upgrading Excalidraw.");
const runtime = ts.transpileModule(readFileSync(new URL("src/lib/boardGradient.ts", root), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, "");
const start = "/* Native Note gradient runtime start */";
const end = "/* Native Note gradient runtime end */";
const patches = [
  ["dev/chunk-4FTI6OG3.js", "3cfe278cb537fde73b42bbd4697b392946517d3dc02d3f3cf8487d8476f63ba2", [
    ['rc.draw(ShapeCache.get(element));', 'rc.draw(nnGradientCanvasShape(element, ShapeCache.get(element), context));'],
    ['if (element.type === "ellipse") {\n        options.curveFitting = 1;\n      }\n      return options;', 'if (element.type === "ellipse") {\n        options.curveFitting = 1;\n      }\n      return nnGradientRoughOptions(element, options);'],
    ['const shape = ShapeCache.generateElementShape(element, null);\n      const node = roughSVGDrawWithPrecision(\n        rsvg,\n        shape,\n        MAX_DECIMALS_FOR_SVG_EXPORT\n      );', 'const shape = ShapeCache.generateElementShape(element, null);\n      const node = roughSVGDrawWithPrecision(\n        rsvg,\n        shape,\n        MAX_DECIMALS_FOR_SVG_EXPORT\n      );\n      nnGradientSvg(element, node, svgRoot);'],
  ]],
  ["prod/chunk-K2UTITRG.js", "72b54e8e9b3c17c69f1dd5e40203bfaed62313bc611b86ecb8a1625a12562e51", [
    ['n.lineJoin="round",n.lineCap="round",t.draw(he.get(e));', 'n.lineJoin="round",n.lineCap="round",t.draw(nnGradientCanvasShape(e,he.get(e),n));'],
    ['e.type==="ellipse"&&(n.curveFitting=1),n;', 'e.type==="ellipse"&&(n.curveFitting=1),nnGradientRoughOptions(e,n);'],
    ['let y=he.generateElementShape(e,null),w=jr(n,y,qn);x!==1', 'let y=he.generateElementShape(e,null),w=jr(n,y,qn);nnGradientSvg(e,w,r);x!==1'],
  ]],
  ["dev/index.js", "e10e24df153077770849c7d68f9a8f5db3bb1eb1576d909d1e3c9a5b024d1882", [
    ['return /* @__PURE__ */ jsx21("div", { children: /* @__PURE__ */ jsxs11("div", { role: "dialog", "aria-modal": "true", className: "color-picker-container", children: [', 'return /* @__PURE__ */ jsx21("div", { "data-nn-color-picker": type, children: /* @__PURE__ */ jsxs11("div", { role: "dialog", "aria-modal": "true", className: "color-picker-container", children: ['],
    ['backgroundColor: value.currentItemBackgroundColor\n          })', 'backgroundColor: value.currentItemBackgroundColor,\n            ...nnGradientSolidData(el)\n          })'],
    ['fillStyle: value\n        })', 'fillStyle: value,\n          ...nnGradientSolidData(el)\n        })'],
  ]],
  ["prod/index.js", "7f651063487849c79a8cdedc3aa6bd04c6b0c717ee63959116f1f12dbc0a51b8", [
    ['appState:s})=>xo("div",{children:Lp("div",{role:"dialog","aria-modal":"true",className:"color-picker-container"', 'appState:s})=>xo("div",{"data-nn-color-picker":e,children:Lp("div",{role:"dialog","aria-modal":"true",className:"color-picker-container"'],
    ['q(r,{backgroundColor:t.currentItemBackgroundColor})', 'q(r,{backgroundColor:t.currentItemBackgroundColor,...nnGradientSolidData(r)})'],
    ['q(n,{fillStyle:t})', 'q(n,{fillStyle:t,...nnGradientSolidData(n)})'],
  ]],
];
// Validate every bundle before writing any of them. Re-running also refreshes the shared runtime.
const results = patches.map(([file, hash, replacements]) => {
  const path = new URL(`dist/${file}`, pkg);
  let source = readFileSync(path, "utf8");
  if (source.startsWith(start)) {
    source = source.slice(source.indexOf(end) + end.length + 1);
    for (const [before, after] of replacements) {
      if (source.split(after).length !== 2) throw new Error(`Gradient patch drift in ${file}`);
      source = source.replace(after, before);
    }
  }
  if (createHash("sha256").update(source).digest("hex") !== hash) throw new Error(`Unsupported Excalidraw bundle: ${file}`);
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw new Error(`Ambiguous gradient patch in ${file}`);
    source = source.replace(before, after);
  }
  return [path, `${start}\n${runtime}${end}\n${source}`];
});
if (!process.argv.includes("--check")) for (const [path, source] of results) writeFileSync(path, source);
console.log(`Excalidraw gradient renderer ${process.argv.includes("--check") ? "verified" : "patched"} (development + production).`);
