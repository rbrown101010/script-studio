import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/boardGradient.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { nnReadGradient, nnGradientPoints, nnGradientCanvasShape, nnGradientSolidData, nnGradientRoughOptions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const gradient = { type: "linear", start: "#ff0000", end: "#0000ff", angle: 0 };
const rectangle = { type: "rectangle", width: 200, height: 100, fillStyle: "solid", customData: { backgroundGradient: gradient, other: "preserve" } };

test("saved scene roundtrip keeps gradients; invalid metadata, other shapes, patterns and blur fall back", () => {
  assert.deepEqual(nnReadGradient(JSON.parse(JSON.stringify(rectangle))), gradient);
  for (const element of [
    { ...rectangle, type: "ellipse" }, { ...rectangle, fillStyle: "hachure" },
    { ...rectangle, customData: { ...rectangle.customData, blur: true } },
    ...[null, "gradient", { ...gradient, start: "url(evil)" }, { ...gradient, end: "#fff" }, { ...gradient, angle: NaN }].map((backgroundGradient) => ({ ...rectangle, customData: { backgroundGradient } })),
  ]) assert.equal(nnReadGradient(element), null);
  assert.equal(nnReadGradient({ ...rectangle, customData: { backgroundGradient: { ...gradient, angle: -90 } } }).angle, 270);
});

test("gradient endpoints preserve physical direction on non-square shapes", () => {
  const near = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-9));
  near(nnGradientPoints(200, 100, 0), [0, 50, 200, 50]);
  near(nnGradientPoints(200, 100, 90), [100, 0, 100, 100]);
  near(nnGradientPoints(200, 100, 180), [200, 50, 0, 50]);
  near(nnGradientPoints(200, 100, 45), [25, -25, 175, 125]);
});

test("native canvas gradient leaves the cached path and stroke intact", () => {
  const shape = { sets: [{ type: "fillPath" }], options: { stroke: "#000000", fill: "#ff0000" } };
  const calls = [];
  const fill = { addColorStop: (...args) => calls.push(args) };
  const result = nnGradientCanvasShape(rectangle, shape, { createLinearGradient: (...args) => { assert.deepEqual(args, [0, 50, 200, 50]); return fill; } });
  assert.deepEqual(calls, [[0, "#ff0000"], [1, "#0000ff"]]);
  assert.equal(result.sets, shape.sets);
  assert.equal(result.options.stroke, shape.options.stroke);
  assert.equal(result.options.fill, fill);
  assert.equal(shape.options.fill, "#ff0000");
  assert.equal(nnGradientCanvasShape({ ...rectangle, type: "ellipse" }, shape, null), shape);
});

test("solid fallback and renderer generation preserve unrelated data", () => {
  assert.deepEqual(nnGradientSolidData(rectangle), { customData: { other: "preserve" } });
  assert.equal(rectangle.customData.backgroundGradient, gradient);
  assert.deepEqual(nnGradientSolidData({ ...rectangle, type: "ellipse" }), {});
  const options = { stroke: "#000", fillStyle: "hachure" };
  assert.deepEqual(nnGradientRoughOptions(rectangle, options), { stroke: "#000", fill: "#ff0000", fillStyle: "solid" });
  assert.equal(nnGradientRoughOptions({ type: "rectangle" }, options), options);
});

test("both installed renderer bundles match the pinned, reversible patch", () => {
  execFileSync(process.execPath, ["scripts/patch-excalidraw-gradients.mjs", "--check"], { cwd: new URL("../", import.meta.url) });
});
