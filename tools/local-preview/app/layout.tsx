import { CaptureSession } from "../capture-session";
import { PreviewBar } from "../preview-bar";
import { readCaptures } from "../captures";
import "@/app/globals.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "LOCAL PREVIEW · Cyntro" };
export default async function Layout({children}: {children: React.ReactNode}) {
  const capture = await readCaptures();
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>
    <PreviewBar capturedAt={capture?.capturedAt} sourceOrigin={capture?.sourceOrigin}/>
    {capture ? <CaptureSession key={capture.capturedAt} identity={`${capture.sourceOrigin}:${capture.capturedAt}:${capture.frontendCommit}`}>{children}</CaptureSession> : <main style={{padding:40}}><h1>Real response capture required</h1><p>No recorded backend responses are available. Product data is not being rendered.</p><p>Capture the authenticated test installation responses into the local, ignored capture file, then reload. See tools/local-preview/README.md.</p></main>}
  </body></html>;
}
