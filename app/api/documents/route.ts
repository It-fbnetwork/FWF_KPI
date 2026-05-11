import { NextResponse } from "next/server";
import {
  createDocumentRecord,
  getAuthState,
  getDocumentRealtimeAudience,
  getDocumentsData,
  getStoreLearningAnnouncementTargets,
  sendStoreLearningAnnouncementEmails
} from "@/lib/server/data";
import { publishAppEventToPersons } from "@/lib/server/realtime";
import { getSessionUserId } from "@/lib/server/session";

function toFriendlyDocumentErrorMessage(message: string) {
  if (message.includes("unsupported Unicode escape sequence")) {
    return "Tài liệu chứa ký tự không hợp lệ. Vui lòng lưu lại file (PDF/PPTX chuẩn Unicode) rồi thử tải lên lại.";
  }
  if (message.includes("\\u0000") || message.toLowerCase().includes("invalid byte sequence")) {
    return "Nội dung tài liệu không hợp lệ để lưu hệ thống. Vui lòng làm sạch nội dung file và thử lại.";
  }
  if (message === "Unauthorized") return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (message.startsWith("Forbidden")) return "Bạn không có quyền tạo tài liệu ở phạm vi này.";
  return message;
}

export async function GET(request: Request) {
  const sessionUserId = await getSessionUserId();
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId") ?? undefined;
  const documents = await getDocumentsData(sessionUserId, folderId);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  try {
    const sessionUserId = await getSessionUserId();
    const body = await request.json();
    const document = await createDocumentRecord(sessionUserId, body);
    const [authState, audience, trainerTargets] = await Promise.all([
      getAuthState(sessionUserId),
      getDocumentRealtimeAudience(document.id),
      getStoreLearningAnnouncementTargets(sessionUserId, document.id)
    ]);
    const targetPersonIds = trainerTargets.personIds.length > 0 ? trainerTargets.personIds : audience.personIds;
    void publishAppEventToPersons(targetPersonIds, {
      type: "learning.updated",
      actorId: authState.user?.personId ?? document.ownerId,
      action: "created",
      entityType: "document",
      entityLabel: audience.documentName,
      entityId: document.id,
      occurredAt: new Date().toISOString()
    });
    void sendStoreLearningAnnouncementEmails({
      actorName: authState.user?.name ?? "Trainer",
      title: audience.documentName,
      kind: "document",
      targets: trainerTargets.emailTargets
    });
    return NextResponse.json({ ok: true, document });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Failed to create document.";
    const message = toFriendlyDocumentErrorMessage(rawMessage);
    const status = rawMessage === "Unauthorized"
      ? 401
      : rawMessage.startsWith("Forbidden")
        ? 403
        : 500;
    return NextResponse.json(
      { ok: false, message },
      { status }
    );
  }
}
