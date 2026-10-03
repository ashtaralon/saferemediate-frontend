import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
// Do not inherit AWS credentials, backend URLs or the live deployment's environment.
const env=Object.fromEntries(["PATH","HOME","TMPDIR","LANG","TERM"].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
env.NEXT_TELEMETRY_DISABLED="1";
console.log("Local fixture preview: http://127.0.0.1:3210 · no live backend · writes blocked");
const child=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev",path.join(root,"tools/local-preview"),"--webpack","--hostname","127.0.0.1","--port","3210"],{cwd:root,env,stdio:"inherit"});
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>child.kill(signal));
child.on("exit",code=>process.exit(code??1));
