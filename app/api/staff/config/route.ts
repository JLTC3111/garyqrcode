import { staffPublicConfig, staffErrorResponse } from "@/lib/staff-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(staffPublicConfig(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return staffErrorResponse(error); }
}
