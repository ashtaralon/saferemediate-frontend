"use client";
import { useEffect, useState } from "react";
import { Providers } from "@/components/providers";
export function CaptureSession({identity,children}: {identity:string;children:React.ReactNode}) {
  const [ready,setReady] = useState(false);
  useEffect(()=>{
    if (sessionStorage.getItem("preview_capture_identity") !== identity) {
      localStorage.clear(); sessionStorage.clear();
      sessionStorage.setItem("preview_capture_identity",identity);
    }
    setReady(true);
  },[identity]);
  return ready ? <Providers>{children}</Providers> : <p>Loading recorded responses…</p>;
}
