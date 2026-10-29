import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { themeBootstrap } from "../lib/preferences.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(path.join(root, "outputs"), { recursive: true });
const qr = `data:image/svg+xml;base64,${(await readFile(path.join(root,"public/qr/customer-connect.svg"))).toString("base64")}`;
const favicon = `data:image/svg+xml;base64,${(await readFile(path.join(root,"public/favicon.svg"))).toString("base64")}`;
const css = (await Promise.all(["app/globals.css", "shared/gary-apps/styles.css", "app/quick-feedback.css"].map((file) => readFile(path.join(root, file), "utf8")))).join("\n").replace(/^@import[^;]+;/gm, "");
for (const [component, props, name] of [["customer-intake",`previewOnly previewQrSrc={${JSON.stringify(qr)}}`,"customer-connect-preview"],["staff-qr-manager",`previewImage={${JSON.stringify(qr)}}`,"staff-preview"]]) {
  const result = await build({ stdin: { contents: `import React from "react"; import {createRoot} from "react-dom/client"; import Page from "./components/${component}"; createRoot(document.getElementById("root")).render(<Page ${props}/>);`, resolveDir: root, loader: "tsx" }, absWorkingDir: root, bundle: true, platform: "browser", format: "iife", write: false, minify: true, target: "es2022", define: { "process.env.NODE_ENV": '"production"' } });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gary · Offline preview</title><link rel="icon" href="${favicon}" type="image/svg+xml"><script>${themeBootstrap}</script><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
  const output = path.join(root, `outputs/${name}.html`); await writeFile(output, html); console.log(`Offline visual preview: ${output}`);
}
console.log("These files preview the interface; submissions and staff sign-in require the deployed application.");
