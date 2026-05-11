import "server-only";

import Ably from "ably";
import { pgQuery } from "@/lib/postgres";

export type AppRealtimeEventType =
  | "chat.message.created"
  | "chat.message.deleted"
  | "chat.thread.read"
  | "directory.updated"
  | "workspace.updated"
  | "schedule.updated"
  | "learning.updated"
  | "approval.updated";

export type AppRealtimeEventAction =
  | "created"
  | "updated"
  | "deleted"
  | "assigned"
  | "reminder"
  | "requested"
  | "approved"
  | "rejected";

export type AppRealtimeEntityType =
  | "task"
  | "project"
  | "schedule"
  | "document"
  | "quiz"
  | "learning_progress"
  | "person"
  | "profile"
  | "approval";

export type AppRealtimeEvent = {
  type: AppRealtimeEventType;
  actorId: string;
  action?: AppRealtimeEventAction;
  entityType?: AppRealtimeEntityType;
  entityLabel?: string;
  threadId?: string;
  projectId?: string;
  scheduleId?: string;
  entityId?: string;
  messageId?: string;
  targetPersonIds?: string[];
  occurredAt: string;
};

type DbPersonNotification = {
  personId: string;
  type: AppRealtimeEventType;
  actorId: string;
  action?: AppRealtimeEventAction;
  entityType?: AppRealtimeEntityType;
  entityLabel?: string;
  threadId?: string;
  projectId?: string;
  scheduleId?: string;
  entityId?: string;
  messageId?: string;
  targetPersonIds?: string[];
  occurredAt: string;
  createdAt: string;
  readAt?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __fwfAblyRestClient__: InstanceType<typeof Ably.Rest> | undefined;
}

function getAblyApiKey() {
  return process.env.ABLY_API_KEY?.trim() ?? "";
}

export function isRealtimeConfigured() {
  return getAblyApiKey().length > 0;
}

function getAblyRestClient() {
  if (!isRealtimeConfigured()) {
    throw new Error("Realtime is not configured.");
  }

  if (!global.__fwfAblyRestClient__) {
    global.__fwfAblyRestClient__ = new Ably.Rest({
      key: getAblyApiKey(),
      queryTime: true
    });
  }

  return global.__fwfAblyRestClient__;
}

export async function createRealtimeTokenRequest(clientId: string) {
  const client = getAblyRestClient();
  return client.auth.createTokenRequest({
    clientId,
    capability: JSON.stringify({
      [`person:${clientId}`]: ["subscribe"]
    })
  });
}

export async function publishAppEventToPersons(personIds: string[], event: AppRealtimeEvent) {
  const uniquePersonIds = Array.from(
    new Set(personIds.filter((personId) => Boolean(personId) && personId !== event.actorId))
  );
  if (uniquePersonIds.length === 0) {
    return;
  }

  const createdAt = new Date().toISOString();
  try {
    for (const personId of uniquePersonIds) {
      await pgQuery(
        `insert into person_notifications (
          id, person_id, type, actor_id, action, entity_type, entity_label, thread_id, project_id, schedule_id,
          entity_id, message_id, target_person_ids, occurred_at, created_at, read_at, raw_json
        ) values (
          gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12::jsonb, $13::timestamptz, $14::timestamptz, null, $15::jsonb
        )`,
        [
          personId,
          event.type,
          event.actorId,
          event.action ?? null,
          event.entityType ?? null,
          event.entityLabel ?? null,
          event.threadId ?? null,
          event.projectId ?? null,
          event.scheduleId ?? null,
          event.entityId ?? null,
          event.messageId ?? null,
          JSON.stringify(event.targetPersonIds ?? []),
          event.occurredAt,
          createdAt,
          JSON.stringify({
            personId,
            ...event,
            createdAt,
            readAt: null
          })
        ]
      );
    }
  } catch {
    // Persisting notifications should not block the primary action.
  }

  if (!isRealtimeConfigured()) {
    return;
  }

  const client = getAblyRestClient();
  await Promise.allSettled(
    uniquePersonIds.map((participantId) => client.channels.get(`person:${participantId}`).publish("app.updated", event))
  );
}

export async function publishChatEvent(participantIds: string[], event: AppRealtimeEvent) {
  await publishAppEventToPersons(participantIds, event);
}
