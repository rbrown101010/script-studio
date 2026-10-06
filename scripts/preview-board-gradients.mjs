// Isolated localhost fixture: real editor + controls + board SVG preview, localStorage only, no Convex.
import { mkdirSync, writeFileSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const dir = `${repo}output/playwright/preview`;
mkdirSync(`${dir}/app`, { recursive: true });
if (!existsSync(`${dir}/node_modules`)) symlinkSync(`${repo}node_modules`, `${dir}/node_modules`);
writeFileSync(`${dir}/package.json`, JSON.stringify({ private: true }));
writeFileSync(`${dir}/tsconfig.json`, JSON.stringify({ compilerOptions: { jsx: "react-jsx", moduleResolution: "bundler", paths: { "@/*": [`${repo}src/*`] } } }));
writeFileSync(`${dir}/next.config.mjs`, `export default { experimental: { externalDir: true }, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(`${repo}src`)}; return config; } };`);
writeFileSync(`${dir}/postcss.config.mjs`, `export default { plugins: { "@tailwindcss/postcss": {} } };`);
for (const file of ["layout", "page", "fixture"]) rmSync(`${dir}/app/${file}.tsx`, { force: true });
writeFileSync(`${dir}/app/layout.jsx`, `import "../../../../src/app/globals.css";
import "@excalidraw/excalidraw/index.css";
export default function Layout({children}) { return <html><body style={{margin:0}}>{children}</body></html>; }`);
writeFileSync(`${dir}/app/page.jsx`, `"use client";
import dynamic from "next/dynamic";
const Fixture = dynamic(() => import("./fixture"), {ssr:false});
export default function Page() {return <Fixture />;}`);
writeFileSync(`${dir}/app/fixture.jsx`, `"use client";
import "@excalidraw/excalidraw/index.css";
import {useRef,useState} from "react";
import {Excalidraw, convertToExcalidrawElements, exportToSvg, exportToCanvas, restoreElements, reconcileElements, CaptureUpdateAction} from "@excalidraw/excalidraw";
import {GradientControls,gradientSelection,setGradient} from "../../../../src/components/boardGradient";
import {BlurToggle,BlurLayer,blurView,setBlur,isBlur} from "../../../../src/components/boardBlur";
import {BoardDrawing} from "../../../../src/components/BoardBlock";
const seed = () => convertToExcalidrawElements([
  {type:"rectangle",id:"gradient-target",x:310,y:110,width:320,height:220,backgroundColor:"#a5d8ff",fillStyle:"solid",roughness:0,strokeWidth:2,customData:{fixture:true}},
  {type:"rectangle",id:"front-solid",x:570,y:255,width:150,height:95,backgroundColor:"#ffd8a8",fillStyle:"solid",roughness:0},
  {type:"rectangle",id:"rounded-target",x:790,y:120,width:270,height:180,backgroundColor:"#b2f2bb",fillStyle:"solid",roughness:0,roundness:{type:3},angle:0.22,opacity:65},
  {type:"ellipse",id:"ellipse-solid",x:850,y:350,width:160,height:100,backgroundColor:"#ffec99",fillStyle:"solid",roughness:0}
], {regenerateIds:false});
export default function Fixture(){
 const root=useRef(null), api=useRef(null);
 const [initial]=useState(()=>JSON.parse(localStorage.getItem("nn-gradient-fixture")||"null")||seed());
 const [selected,setSelected]=useState(null),[scene,setScene]=useState(null),[view,setView]=useState({boxes:[],width:0,height:0,zoom:1}),[blur,setBlurPicked]=useState(null),[dark,setDark]=useState(false);
 function change(elements,state){
  localStorage.setItem("nn-gradient-fixture",JSON.stringify(elements));
  const next=gradientSelection(elements,state.selectedElementIds);
  setSelected(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  const json=JSON.stringify(elements);
  setScene(old=>old?.elements===json?old:{title:"Local gradient fixture",elements:json,appState:JSON.stringify({viewBackgroundColor:"#ffffff"}),files:[],updatedAt:0});
  const nextView=blurView(elements,state);setView(old=>JSON.stringify(old)===JSON.stringify(nextView)?old:nextView);
  const rects=elements.filter(e=>state.selectedElementIds[e.id]&&e.type==="rectangle");setBlurPicked(rects.length?rects.every(isBlur):null);
 }
 async function exportAll(){
  const elements=api.current.getSceneElements(), files=api.current.getFiles();
  const appState={...api.current.getAppState(),exportBackground:true,exportWithDarkMode:dark,exportEmbedScene:false};
  const svg=await exportToSvg({elements,appState,files});
  const canvas=await exportToCanvas({elements,appState,files});
  window.nnExports={svg:new XMLSerializer().serializeToString(svg),png:canvas.toDataURL(),elements:JSON.stringify(elements)};
  document.getElementById("exports").replaceChildren(svg,canvas);
 }
 return <><div style={{padding:10,display:"flex",gap:10,fontFamily:"sans-serif"}}>
  <strong>Local gradient fixture</strong>
  <button onClick={()=>{setDark(d=>!d)}}>Toggle theme</button>
  <button onClick={()=>exportAll()}>Verify exports</button>
  <button onClick={()=>{api.current.updateScene({appState:{selectedElementIds:{"gradient-target":true,"rounded-target":true,"ellipse-solid":true}},captureUpdate:CaptureUpdateAction.NEVER})}}>Select mixed shapes</button>
  <span>LocalStorage only · no backend</span>
 </div><div ref={root} className="nn-board" style={{height:650,position:"relative"}}>
 <GradientControls root={root} selection={selected} onChange={g=>setGradient(api.current,g)}/>
 <BlurLayer root={root} view={view} dark={dark}/>
 {blur!==null&&<BlurToggle root={root} on={blur} onToggle={()=>setBlur(api.current,!blur)}/>}
 <Excalidraw theme={dark?"dark":"light"} excalidrawAPI={a=>{api.current=a;window.nnAPI=a;window.nnFixtureTools={restoreElements,reconcileElements,exportToSvg,exportToCanvas,convertToExcalidrawElements,CaptureUpdateAction}}}
 initialData={{elements:initial,appState:{scrollX:0,scrollY:0,zoom:{value:1},selectedElementIds:{"gradient-target":true}}}} onChange={change}/>
 </div><div style={{padding:20}}><h3>Native Note board SVG preview</h3>{scene&&<BoardDrawing scene={scene} maxHeight={260} dark={dark}/>}<div id="exports"/></div></>;
}`);
const production = process.argv.includes("--production");
const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [`${repo}node_modules/next/dist/bin/next`, ...args], { cwd: dir, stdio: "inherit" });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => resolve(code ?? 1));
});
if (production && await run(["build", "--webpack"]) !== 0) process.exit(1);
process.exit(await run([production ? "start" : "dev", ...(!production ? ["--webpack"] : []), "--hostname", "127.0.0.1", "--port", "3211"]));
