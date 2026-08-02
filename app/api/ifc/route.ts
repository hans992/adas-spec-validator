import { NextResponse } from "next/server";

import { parseIfcBytes } from "@/domain/ifcParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An IFC file is required." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".ifc")) {
      return NextResponse.json({ error: "Only .ifc files are accepted." }, { status: 415 });
    }

    const result = await parseIfcBytes(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IFC parsing failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
