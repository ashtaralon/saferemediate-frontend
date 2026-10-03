import { Providers } from "@/components/providers";
import { PreviewBar } from "../preview-bar";
import "@/app/globals.css";
export const metadata = { title: "LOCAL PREVIEW · Cyntro" };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning><PreviewBar /><Providers>{children}</Providers></body></html>;
}
