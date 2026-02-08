import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://saferemediate-backend-f.onrender.com";

export async function GET(req: NextRequest) {
  try {
    const url = `${BACKEND_URL}/api/infrastructure/ec2-instances`;
    console.log("[EC2-Instances Proxy] GET:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[EC2-Instances Proxy] Error:", response.status, errorText);
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    console.log("[EC2-Instances Proxy] Success, instances:", Array.isArray(data) ? data.length : 'object');
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[EC2-Instances Proxy] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
