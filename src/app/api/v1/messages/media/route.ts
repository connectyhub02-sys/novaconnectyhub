import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateGatewayRequest,
  formatGatewayError,
  sendGatewayMediaMessage,
} from "@/lib/connectyhub-api/gateway";
import { asBoolean, asNumber, asString, asStringArray, readIdempotencyKey, readJson } from "@/lib/connectyhub-api/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendMediaBody = {
  instanceId?: unknown;
  number?: unknown;
  type?: unknown;
  file?: unknown;
  text?: unknown;
  docName?: unknown;
  thumbnail?: unknown;
  viewOnce?: unknown;
  delay?: unknown;
  readchat?: unknown;
  readmessages?: unknown;
  replyid?: unknown;
  mentions?: unknown;
  trackId?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateGatewayRequest(request, ["messages:send"]);
    const body = await readJson<SendMediaBody>(request);
    const result = await sendGatewayMediaMessage(auth, {
      instanceId: asString(body?.instanceId) ?? "",
      number: asString(body?.number) ?? "",
      type: asString(body?.type) ?? "",
      file: asString(body?.file) ?? "",
      text: asString(body?.text),
      docName: asString(body?.docName),
      thumbnail: asString(body?.thumbnail),
      viewOnce: asBoolean(body?.viewOnce),
      delay: asNumber(body?.delay),
      readchat: asBoolean(body?.readchat),
      readmessages: asBoolean(body?.readmessages),
      replyid: asString(body?.replyid),
      mentions: asStringArray(body?.mentions),
      trackId: asString(body?.trackId),
      idempotencyKey: readIdempotencyKey(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}
