import { NextRequest, NextResponse } from "next/server";
import { fixture } from "../../../fixtures";
export async function GET(request: NextRequest, context: {params: Promise<{path:string[]}>}) {
  const {path} = await context.params;
  const reply=fixture(path.join("/"), request.cookies.get("preview_scenario")?.value || "empty", request.nextUrl.searchParams);
  return NextResponse.json(reply.body,{status:reply.status});
}
function denied(){ return NextResponse.json({detail:{code:"PREVIEW_WRITE_BLOCKED",message:"Local preview only. No account, permission or data was changed."}},{status:405}); }
export const POST=denied, PUT=denied, PATCH=denied, DELETE=denied;
