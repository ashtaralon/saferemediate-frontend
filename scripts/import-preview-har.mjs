import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const [file,frontendCommit,backendCommit,sourceOrigin] = process.argv.slice(2);
if (!file || !/^[a-f0-9]{40}$/.test(frontendCommit || "") || !/^[a-f0-9]{40}$/.test(backendCommit || "") || !sourceOrigin?.startsWith("https://")) throw new Error("Usage: preview:import -- capture.har frontendCommit backendCommit https://source-origin");
const origin = new URL(sourceOrigin).origin;
const har = JSON.parse(await readFile(file,"utf8"));
const responses = {};
const times = [];
for (const entry of har.log?.entries || []) {
  const url = new URL(entry.request.url);
  if (entry.request.method !== "GET" || url.origin !== origin || !url.pathname.startsWith("/api/proxy/")) continue;
  if (!entry.response.content?.mimeType?.includes("json") || !entry.response.content.text || !Number.isFinite(Date.parse(entry.startedDateTime))) continue;
  if (!Number.isInteger(entry.response.status) || entry.response.status < 200 || entry.response.status > 599) continue;
  const text = entry.response.content.encoding === "base64" ? Buffer.from(entry.response.content.text,"base64").toString("utf8") : entry.response.content.text;
  const body = JSON.parse(text);
  url.searchParams.sort();
  responses[url.pathname + url.search] = {status:entry.response.status,body};
  times.push(entry.startedDateTime);
}
if (!times.length) throw new Error("No same-origin proxy GET JSON responses found; no capture written");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dir = path.join(root,"tools/local-preview/.local");
await mkdir(dir,{recursive:true,mode:0o700});
await writeFile(path.join(dir,"responses.json"),JSON.stringify({capturedAt:times.sort().at(-1),sourceOrigin:origin,frontendCommit,backendCommit,responses},null,2),{mode:0o600});
console.log(`Imported ${Object.keys(responses).length} real responses into the local ignored capture file. Reload the preview.`);
