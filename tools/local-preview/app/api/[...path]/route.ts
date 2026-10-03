import { NextRequest, NextResponse } from "next/server";
import { readCaptures, replay } from "../../../captures";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const reply = replay(await readCaptures(), request.nextUrl);
  return NextResponse.json(reply.body,{status:reply.status,headers:{"Cache-Control":"no-store"}});
}
function denied(){ return NextResponse.json({detail:{code:"PREVIEW_WRITE_BLOCKED",message:"Local preview only. No account, permission or data was changed."}},{status:405}); }
export const POST=denied, PUT=denied, PATCH=denied, DELETE=denied;
