// Decode the shipped version-7/H QR from its rendered PNG, including format
// information and Reed-Solomon parity. This reads image pixels, not encoder data.
import assert from "node:assert/strict";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

export async function decodeShippedQr(file) {
  const n=45, quiet=4;
  const {data,info}=await sharp(file instanceof URL ? fileURLToPath(file) : file).flatten({background:"#ffffff"}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const scale=info.width/(n+quiet*2);assert.ok(Number.isInteger(scale));
  const sample=(x,y)=>data[(Math.floor((y+.5)*scale)*info.width+Math.floor((x+.5)*scale))*info.channels]<128;
  for(let y=0;y<n+8;y++)for(let x=0;x<n+8;x++)if(x<4||y<4||x>=n+4||y>=n+4)assert.equal(sample(x,y),false,"The quiet zone must be clear");
  const matrix=Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>sample(x+4,y+4)));
  for(const [left,top]of[[0,0],[n-7,0],[0,n-7]])for(let y=0;y<7;y++)for(let x=0;x<7;x++)assert.equal(matrix[top+y][left+x],x===0||x===6||y===0||y===6||(x>=2&&x<=4&&y>=2&&y<=4),"Finder pattern");
  let format=0;for(let i=0;i<15;i++){const x=i<8?n-i-1:i===8?7:14-i;if(matrix[8][x])format|=1<<i;}
  let formatData=-1;for(let value=0;value<32;value++){let remainder=value<<10;for(let bit=14;bit>=10;bit--)if(remainder&(1<<bit))remainder^=0x537<<(bit-10);if((((value<<10)|remainder)^0x5412)===format)formatData=value;}
  assert.notEqual(formatData,-1,"QR format BCH check");assert.equal(formatData>>3,2,"High error correction");const mask=formatData&7;
  const reserved=Array.from({length:n},()=>Array(n).fill(false));
  const mark=(left,top,width,height)=>{for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++)reserved[y][x]=true;};
  mark(0,0,9,9);mark(n-8,0,8,9);mark(0,n-8,9,8);mark(0,6,n,1);mark(6,0,1,n);
  for(const y of[6,22,38])for(const x of[6,22,38])if(!((x===6&&y===6)||(x===38&&y===6)||(x===6&&y===38)))mark(x-2,y-2,5,5);
  mark(n-11,0,3,6);mark(0,n-11,6,3);
  const masked=(row,col)=>[()=>((row+col)%2)===0,()=>row%2===0,()=>col%3===0,()=>((row+col)%3)===0,()=>((Math.floor(row/2)+Math.floor(col/3))%2)===0,()=>((row*col)%2+(row*col)%3)===0,()=>(((row*col)%2+(row*col)%3)%2)===0,()=>(((row*col)%3+(row+col)%2)%2)===0][mask]();
  const bits=[];let up=true;for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let vertical=0;vertical<n;vertical++){const y=up?n-1-vertical:vertical;for(let offset=0;offset<2;offset++){const x=right-offset;if(!reserved[y][x])bits.push(Number(matrix[y][x]!==masked(y,x)));}}up=!up;}
  const words=[];for(let i=0;i+7<bits.length;i+=8)words.push(bits.slice(i,i+8).reduce((value,bit)=>(value<<1)|bit,0));
  assert.equal(words.length,196,"Version-7 codeword count");
  const counts=[13,13,13,13,14], blocks=counts.map(()=>[]);let offset=0;
  for(let index=0;index<14;index++)for(let block=0;block<5;block++)if(index<counts[block])blocks[block].push(words[offset++]);
  const content=blocks.flat();for(let index=0;index<26;index++)for(let block=0;block<5;block++)blocks[block].push(words[offset++]);
  const multiply=(a,b)=>{let result=0;for(let bit=0;bit<8;bit++){if(b&1)result^=a;b>>=1;a<<=1;if(a&256)a^=0x11d;}return result;};
  for(const block of blocks){let x=1;for(let syndrome=0;syndrome<26;syndrome++){let check=0;for(const word of block)check=multiply(check,x)^word;assert.equal(check,0,"Reed-Solomon parity");x=multiply(x,2);}}
  const payloadBits=content.flatMap(word=>Array.from({length:8},(_,i)=>(word>>(7-i))&1));let cursor=0;const read=count=>{let value=0;for(let i=0;i<count;i++)value=(value<<1)|payloadBits[cursor++];return value;};
  assert.equal(read(4),4,"Byte encoding mode");const length=read(8);const payload=Uint8Array.from({length},()=>read(8));return new TextDecoder().decode(payload);
}
