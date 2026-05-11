import { MongoClient, type Db } from "mongodb";
import { isSupabaseOnlyMode } from "@/lib/postgres";

const connectionUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;
const databaseName = process.env.MONGODB_DB ?? "fwf_kpi";

declare global {
  // eslint-disable-next-line no-var
  var __fwfMongoClientPromise__: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __fwfMongoIndexPromise__: Promise<void> | undefined;
}

let clientPromise: Promise<MongoClient> | null = null;
let mongoDisabledReason: string | null = null;

if (isSupabaseOnlyMode()) {
  mongoDisabledReason =
    "MongoDB is disabled in Supabase mode. Set DATA_PROVIDER=mongodb (or hybrid) if you need Mongo fallback.";
}

export async function getMongoClient() {
  if (mongoDisabledReason) {
    throw new Error(mongoDisabledReason);
  }
  if (!connectionUri) {
    throw new Error("Missing MONGODB_URI or MONGO_URI environment variable.");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global.__fwfMongoClientPromise__) {
      const client = new MongoClient(connectionUri);
      global.__fwfMongoClientPromise__ = client.connect();
    }
    return global.__fwfMongoClientPromise__;
  }

  if (!clientPromise) {
    const client = new MongoClient(connectionUri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

async function ensureMongoIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }),
    db.collection("users").createIndex({ createdAt: 1 }),
    db.collection("people").createIndex({ teamId: 1, name: 1 }),
    db.collection("people").createIndex({ email: 1 }),
    db.collection("workspace_teams").createIndex({ memberIds: 1 }),
    db.collection("workspace_tasks").createIndex({ workspaceTeamId: 1, timePeriod: 1 }),
    db.collection("workspace_tasks").createIndex({ assigneeId: 1, updatedAt: -1 }),
    db.collection("schedules").createIndex({ workspaceTeamId: 1, dateKey: 1, startTime: 1 }),
    db.collection("schedules").createIndex({ attendeeIds: 1, dateKey: 1 }),
    db.collection("tests").createIndex({ createdAt: -1 }),
    db.collection("tests").createIndex({ createdByPersonId: 1, createdAt: -1 }),
    db.collection("documents").createIndex({ ownerId: 1, modifiedAt: -1 }),
    db.collection("learning_quizzes").createIndex({ documentId: 1 }, { unique: true }),
    db.collection("quiz_attempts").createIndex({ documentId: 1, personId: 1 }, { unique: true }),
    db.collection("quiz_attempts").createIndex({ documentId: 1, submittedAt: -1 }),
    db.collection("learning_progress").createIndex({ personId: 1, documentId: 1 }, { unique: true }),
    db.collection("learning_progress").createIndex({ documentId: 1, personId: 1 }),
    db.collection("learning_progress").createIndex({ personId: 1, updatedAt: -1 }),
    db.collection("chat_threads").createIndex({ participantIds: 1, updatedAt: -1 }),
    db.collection("chat_messages").createIndex({ threadId: 1, createdAt: -1 }),
    db.collection("person_notifications").createIndex({ personId: 1, createdAt: -1 }),
    db.collection("person_notifications").createIndex({ personId: 1, readAt: 1, createdAt: -1 }),
    db.collection("pending_registrations").createIndex({ email: 1 }),
    db.collection("pending_registrations").createIndex({ expiresAt: 1 }),
    db.collection("role_approval_requests").createIndex({ email: 1, status: 1 }),
    db.collection("role_approval_requests").createIndex({ status: 1, updatedAt: -1 })
  ]);
}

export async function getMongoDb(): Promise<Db> {
  if (mongoDisabledReason) {
    throw new Error(mongoDisabledReason);
  }
  const client = await getMongoClient();
  const db = client.db(databaseName);

  if (!global.__fwfMongoIndexPromise__) {
    global.__fwfMongoIndexPromise__ = ensureMongoIndexes(db);
  }

  await global.__fwfMongoIndexPromise__;
  return db;
}
