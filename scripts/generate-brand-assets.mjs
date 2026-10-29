import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { qrSvg, DEFAULT_QR_DESTINATION } from "../lib/qr.ts";

await mkdir("public/icons", {recursive:true});
await mkdir("public/qr", {recursive:true});
const square = (mobile=false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512"><rect width="64" height="64" rx="${mobile?0:15}" fill="#daf387"/><g transform="translate(14 14) rotate(-6 18 18)"><rect width="16" height="16" rx="3" fill="#27332b"/><path d="M23 0h8a5 5 0 0 1 5 5v8a3 3 0 0 1-3 3H23a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3" fill="#799a4f"/><rect y="20" width="16" height="16" rx="3" fill="#a8c775"/><rect x="20" y="20" width="16" height="16" rx="3" fill="#27332b"/></g></svg>`;
const desktop = square().replace('<rect width="64"', '<style>@media(prefers-color-scheme:dark){.tile{fill:#26351f}.ink{fill:#e5efcb}}</style><rect class="tile" width="64"').replaceAll('fill="#27332b"', 'class="ink" fill="#27332b"');
await writeFile('public/favicon.svg', desktop);
const sizes=[16,32,48]; const images=[];
for(const size of sizes){const image=await sharp(Buffer.from(square())).resize(size,size).png().toBuffer();images.push(image);await writeFile(`public/icons/favicon-${size}.png`,image);}
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
for(let i=0;i<sizes.length;i++){const start=6+i*16;header[start]=sizes[i];header[start+1]=sizes[i];header.writeUInt16LE(1,start+4);header.writeUInt16LE(32,start+6);header.writeUInt32LE(images[i].length,start+8);header.writeUInt32LE(offset,start+12);offset+=images[i].length;}
await writeFile('public/favicon.ico',Buffer.concat([header,...images]));
for(const [name,size] of [['apple-touch-icon',180],['android-chrome-192',192],['android-chrome-512',512]]) await sharp(Buffer.from(square(true))).resize(size,size).png().toFile(`public/icons/${name}.png`);
await writeFile('public/site.webmanifest', JSON.stringify({name:'Gary Customer Connect',short_name:'Gary',start_url:'/customer',display:'standalone',background_color:'#f7f8f2',theme_color:'#daf387',icons:[{src:'/icons/android-chrome-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/icons/android-chrome-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},null,2)+'\n');
const svg=qrSvg(DEFAULT_QR_DESTINATION);
await writeFile('public/qr/customer-connect.svg',svg);
await sharp(Buffer.from(svg),{density:144}).png().toFile('public/qr/customer-connect.png');
await mkdir('outputs',{recursive:true});
const favicon=await readFile('public/icons/android-chrome-512.png');
const qr=await readFile('public/qr/customer-connect.png');
await sharp({create:{width:1100,height:700,channels:4,background:'#f7f8f2'}}).composite([{input:await sharp(favicon).resize(170,170).toBuffer(),left:110,top:230},{input:await sharp(qr).resize(420,474,{fit:'contain',background:'#ffffff'}).toBuffer(),left:550,top:110}]).png().toFile('outputs/brand-assets-preview.png');
console.log('Generated branded QR (SVG/PNG), desktop favicons (ICO/SVG/16/32/48 PNG), Apple touch icon (180 PNG), and Android icons (192/512 PNG).');
