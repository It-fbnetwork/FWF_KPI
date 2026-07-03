import "server-only";

import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import { pgQuery, shouldUseSupabasePhaseA } from "@/lib/postgres";
import {
  canManageStoreRole,
  isAdminLikeRole,
  isStoreRole,
  requiresApprovalRole,
  type Department,
  type UserAccount,
  type UserRole
} from "@/lib/auth";
import { STORE_BRANCHES, STORE_BRANCH_ID_SET, STORE_REGIONS, type StoreRegion } from "@/lib/store-branches";
import type { Document, Folder } from "@/lib/documents";
import { personDisplayRoles, teams as companyTeams, type Person } from "@/lib/people";
import type { Project, Task, TaskAttachment, TaskGroups, TimePeriod } from "@/components/workspace-context";
import {
  isOtpEmailConfigured,
  sendLearningAnnouncementEmail,
  sendOtpEmail,
  sendRoleApprovalGrantedEmail,
  sendRoleApprovalRejectedEmail,
  sendRoleApprovalRequestEmail
} from "@/lib/server/mailer";
import type { AppRealtimeEntityType, AppRealtimeEventAction, AppRealtimeEventType } from "@/lib/server/realtime";

type DbUser = {
  _id: string;
  name: string;
  email: string;
  password: string;
  personId?: string | null;
  role: StoredUserRole;
  department: Department;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
  verified: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type StoredUserRole = UserRole | "boss" | "manager";

type DbPerson = {
  _id: string;
  name: string;
  role: string;
  email: string;
  imageURL: string;
  teamId: string;
  workingHours: Person["workingHours"];
};

type DbCompanyTeam = {
  _id: string;
  name: string;
  color: string;
  memberIds?: string[];
};

type DbWorkspaceTeam = {
  _id: string;
  name: string;
  slug?: string;
  color: string;
  memberIds: string[];
  ownerId?: string;
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DbTask = {
  _id: string;
  taskNumber: number;
  workspaceTeamId: string;
  timePeriod: TimePeriod;
  name: string;
  comments: number;
  likes: number;
  assigneeId: string;
  status: Task["status"];
  statusColor: string;
  executionPeriod: string;
  audience: string;
  weight: string;
  resultMethod: string;
  target?: string;
  progress?: number;
  kpis: string[];
  childGoal: string;
  parentGoal: string;
  description: string;
  attachments: TaskAttachment[];
  createdAt?: string;
  updatedAt?: string;
};

type DbDocument = {
  _id: string;
  name: string;
  type: Document["type"];
  size: number;
  ownerId: string;
  createdAt: string;
  modifiedAt: string;
  folder?: string | null;
  folderId?: string | null;
  tags: string[];
  isStarred: boolean;
  thumbnail?: string | null;
  description?: string;
  url?: string;
  visibility?: "team" | "office" | "store" | "specific";
  visibleToPersonIds?: string[];
  isLearningMaterial?: boolean;
  learningPlan?: Document["learningPlan"];
  deadlineAt?: string;
  isLocked?: boolean;
  lockedAt?: string;
  lockedByUserId?: string;
};

type DocumentPatch = Omit<Partial<Document>, "folder" | "folderId"> & {
  folder?: string | null;
  folderId?: string | null;
};

type DbFolder = {
  _id: string;
  name: string;
  parentId?: string;
  ownerId: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
};

type DbChatThread = {
  _id: string;
  type: "individual";
  participantIds: string[];
  teamId: string;
  lastMessage: string;
  lastMessageAt: string;
  createdAt?: string;
  updatedAt?: string;
};

type DbChatMessage = {
  _id: string;
  threadId: string;
  senderId: string;
  type: "text" | "image" | "file";
  content: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  status: "sent" | "delivered" | "read";
  createdAt: string;
};

type DbSchedule = {
  _id: string;
  workspaceTeamId: string;
  dateKey: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendeeIds: string[];
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

type DbTest = {
  _id: string;
  title: string;
  description: string;
  questions: string[];
  durationMinutes: number;
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

type DbQuizQuestion = {
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

type DbLearningQuiz = {
  _id: string;
  documentId: string;
  title: string;
  description?: string;
  questions: DbQuizQuestion[];
  durationMinutes: number;
  timePerQuestionSeconds?: number;
  deadlineAt?: string;
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

type DbQuizAttempt = {
  _id: string;
  quizId: string;
  documentId: string;
  personId: string;
  answers: number[];
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  startedAt: string;
  submittedAt: string;
};

type DbQuizAttemptReset = {
  _id: string;
  documentId: string;
  personId: string;
  resetByPersonId: string;
  resetAt: string;
};

type DbLearningProgress = {
  _id: string;
  personId: string;
  documentId: string;
  startedAt?: string;
  completedAt?: string;
  activeStepIndex?: number;
  completedStepIds?: string[];
  startedAtByStepId?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type DbPersonNotification = {
  _id?: ObjectId;
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

type PendingRegistration = {
  _id?: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  department: Department;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
  otp: string;
  expiresAt: string;
  createdAt: string;
};

type PendingLoginOtp = {
  _id?: ObjectId;
  email: string;
  otp: string;
  expiresAt: string;
  createdAt: string;
};

type DbRoleApprovalRequest = {
  _id?: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  department: Department;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
  status: "pending" | "approved" | "rejected";
  approverUserId?: string;
  otpVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
};

type SessionActor = {
  user: UserAccount;
  person: Person;
  teamMembers: Person[];
  isLeader: boolean;
  isAdmin: boolean;
};

function getManagedPersonIdsByHierarchy(
  actorUser: UserAccount,
  actorPerson: Person,
  allPeople: Person[],
  userByPersonId: Map<string, UserAccount>
) {
  const managed = new Set<string>();
  managed.add(actorPerson.id);

  if (isAdminLikeRole(actorUser.role)) {
    allPeople.forEach((person) => managed.add(person.id));
    return managed;
  }

  const actorRole = actorUser.role;
  const actorIsStoreRole = isStoreRole(actorRole);
  const actorBranches = new Set(actorUser.storeBranchIds ?? []);
  const userById = new Map(Array.from(userByPersonId.values()).map((user) => [user.id, user]));
  const isStoreLeadManagedByActor = (user: UserAccount | undefined) => {
    if (!user || user.role !== "store_lead" || user.department !== "Cửa hàng") return false;
    return (user.storeBranchIds ?? []).some((branchId) => actorBranches.has(branchId));
  };

  for (const candidate of allPeople) {
    const candidateUser = userByPersonId.get(candidate.id);
    if (!candidateUser) continue;
    if (candidate.id === actorPerson.id) continue;

    if (actorUser.role === "leader") {
      if (candidate.team === actorPerson.team) managed.add(candidate.id);
      if (actorPerson.team === "product" && candidate.team === "store") managed.add(candidate.id);
      continue;
    }

    if (!actorIsStoreRole) {
      if (candidate.team === actorPerson.team) managed.add(candidate.id);
      continue;
    }

    if (candidateUser.department !== "Cửa hàng") continue;
    if (!isStoreRole(candidateUser.role)) continue;

    if (!canManageStoreRole(actorRole, candidateUser.role)) continue;

    if (actorRole === "store_trainer") {
      managed.add(candidate.id);
      continue;
    }

    if (actorRole === "store_manager") {
      if (isStoreLeadManagedByActor(candidateUser)) {
        managed.add(candidate.id);
        continue;
      }

      if (
        candidateUser.role === "store_technician" &&
        isStoreLeadManagedByActor(candidateUser.storeLeadUserId ? userById.get(candidateUser.storeLeadUserId) : undefined)
      ) {
        managed.add(candidate.id);
      }
      continue;
    }

    if (actorRole === "store_lead") {
      if (candidateUser.role === "store_technician" && candidateUser.storeLeadUserId === actorUser.id) {
        managed.add(candidate.id);
      }
    }
  }

  return managed;
}

export type CompanyTeamRecord = {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
};

export type DirectoryPayload = {
  people: Person[];
  teams: CompanyTeamRecord[];
};

export type ChatMessageRecord = {
  id: string;
  senderId: string;
  content: string;
  type: "text" | "image" | "file";
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  timestamp: string;
  status: "sent" | "delivered" | "read";
};

export type ChatThreadRecord = {
  id: string;
  type: "individual";
  participantIds: string[];
  teamId: string;
  lastMessage: string;
  lastMessageAt: string;
  messages: ChatMessageRecord[];
};

export type ScheduleRecord = {
  id: string;
  projectId: string;
  dateKey: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendeeIds: string[];
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountHistoryRecord = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: Department;
  status: "otp_pending" | "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  otpVerifiedAt?: string;
  expiresAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
};

export type UserNotificationRecord = {
  id: string;
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
  unread: boolean;
};

export type TestRecord = {
  id: string;
  title: string;
  description: string;
  questions: string[];
  durationMinutes: number;
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

export type QuizQuestion = {
  text: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
};

export type LearningQuizRecord = {
  id: string;
  documentId: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  durationMinutes: number;
  timePerQuestionSeconds?: number;
  deadlineAt?: string;
  createdByPersonId: string;
  createdAt: string;
  updatedAt: string;
};

export type QuizAttemptRecord = {
  id: string;
  quizId: string;
  documentId: string;
  personId: string;
  personName?: string;
  personRole?: string;
  answers: number[];
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  startedAt: string;
  submittedAt: string;
  attemptRound?: number;
  retakeCount?: number;
  isActiveAttempt?: boolean;
  reviewQuestions?: QuizQuestion[];
};

export type QuizAttemptResetRecord = {
  id: string;
  documentId: string;
  personId: string;
  personName?: string;
  resetByPersonId: string;
  resetByPersonName?: string;
  resetAt: string;
};

export type LearningProgressRecord = {
  id: string;
  personId: string;
  documentId: string;
  startedAt?: string;
  completedAt?: string;
  activeStepIndex: number;
  completedStepIds: string[];
  startedAtByStepId: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type TeamLearningStatusRow = {
  personId: string;
  personName: string;
  personEmail?: string;
  personRole?: string;
  team: string;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeBranchNames?: string[];
  supervisorUserId?: string;
  supervisorName?: string;
  supervisorRole?: UserRole;
  status: "completed" | "in_progress" | "not_started";
};

const supportedTeamIds = companyTeams.map((team) => team.id);
const supportedTeamIdSet = new Set(supportedTeamIds);
const supportedPersonRoleSet = new Set<string>(personDisplayRoles);
const DIRECTORY_SYNC_TTL_MS = 5 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __fwfDirectorySyncState__:
    | {
        lastSyncedAt: number;
        inFlight?: Promise<void>;
      }
    | undefined;
  // eslint-disable-next-line no-var
  var __fwfQuizAttemptResetSchemaReady__:
    | {
        checkedAt: number;
      }
    | undefined;
}

async function ensureQuizAttemptResetSchemaReady() {
  if (!shouldUseSupabasePhaseA()) return;
  const state = globalThis.__fwfQuizAttemptResetSchemaReady__;
  if (state && Date.now() - state.checkedAt < 5 * 60 * 1000) return;

  await pgQuery(`
    create table if not exists quiz_attempt_resets (
      id text primary key,
      document_id text not null,
      person_id text not null,
      reset_by_person_id text not null,
      reset_at timestamptz not null,
      raw_json jsonb
    )
  `);
  await pgQuery("create index if not exists idx_quiz_attempt_resets_doc_person on quiz_attempt_resets(document_id, person_id, reset_at desc)");
  globalThis.__fwfQuizAttemptResetSchemaReady__ = { checkedAt: Date.now() };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeIdentityValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeOptionalIsoDate(value: string | undefined | null) {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function getEmailLocalPart(email: string) {
  return normalizeIdentityValue(email).split("@")[0] ?? "";
}

function normalizePersonDisplayRole(role: string) {
  const normalizedRole = normalizeIdentityValue(role);

  switch (normalizedRole) {
    case "nhan vien":
    case "nhân viên":
    case "employee":
    case "member":
    case "staff":
      return "Nhân viên";
    case "store_staff":
    case "nhan vien cua hang":
    case "nhân viên cửa hàng":
      return "Nhân viên cửa hàng";
    case "ky thuat vien":
    case "kỹ thuật viên":
    case "store_technician":
    case "technician":
      return "Kỹ thuật viên";
    case "cua hang truong":
    case "cửa hàng trưởng":
    case "store_lead":
      return "Cửa hàng trưởng";
    case "quan li cua hang":
    case "quản lí cửa hàng":
    case "quan ly cua hang":
    case "quản lý cửa hàng":
    case "store_manager":
      return "Quản lí cửa hàng";
    case "trainer":
    case "store_trainer":
      return "Trainer";
    case "leader":
    case "lead":
    case "manager":
      return "Leader";
    case "admin":
    case "administrator":
      return "Admin";
    case "ceo":
    case "boss":
      return "CEO";
    default:
      return role.trim();
  }
}

function mapStoreDisplayRoleToAuthRole(role: string): UserRole | undefined {
  switch (normalizePersonDisplayRole(role)) {
    case "Nhân viên cửa hàng":
      return "store_staff";
    case "Kỹ thuật viên":
      return "store_technician";
    case "Cửa hàng trưởng":
      return "store_lead";
    case "Quản lí cửa hàng":
      return "store_manager";
    case "Trainer":
      return "store_trainer";
    default:
      return undefined;
  }
}

function isStoreTrainerActor(actor: SessionActor) {
  return actor.user.role === "store_trainer" && actor.user.department === "Cửa hàng";
}

function isStoreManagerActor(actor: SessionActor) {
  return actor.user.role === "store_manager" && actor.user.department === "Cửa hàng";
}

function canStoreTrainerManageDisplayRole(role: string) {
  const normalized = normalizePersonDisplayRole(role);
  return normalized === "Quản lí cửa hàng" || normalized === "Cửa hàng trưởng" || normalized === "Kỹ thuật viên" || normalized === "Nhân viên cửa hàng";
}

function canStoreManagerManageDisplayRole(role: string) {
  const normalized = normalizePersonDisplayRole(role);
  return normalized === "Cửa hàng trưởng" || normalized === "Kỹ thuật viên" || normalized === "Nhân viên cửa hàng";
}

function normalizeTeamId(teamId: string) {
  const normalizedTeamId = normalizeIdentityValue(teamId);

  if (supportedTeamIdSet.has(normalizedTeamId)) {
    return normalizedTeamId;
  }

  switch (normalizedTeamId) {
    case "it":
    case "development":
    case "dev":
      return "dev";
    case "marketing":
      return "marketing";
    case "hanh chinh - nhan su":
    case "hành chính - nhân sự":
    case "hr":
    case "design":
      return "design";
    case "ke toan":
    case "kế toán":
    case "accounting":
    case "qa":
    case "quality assurance":
      return "qa";
    case "van hanh":
    case "vận hành":
    case "operations":
    case "operation":
    case "product":
      return "product";
    case "sales":
      return "sales";
    default:
      return "product";
  }
}

async function syncCompanyDirectory(db: Awaited<ReturnType<typeof getMongoDb>>) {
  const [peopleDocuments, userDocuments] = await Promise.all([
    db.collection<DbPerson>("people").find({}).toArray(),
    db.collection<DbUser>("users").find({}).toArray()
  ]);

  const usersByPersonId = new Map<string, DbUser[]>();
  const usersByEmail = new Map<string, DbUser[]>();

  for (const user of userDocuments) {
    if (user.personId) {
      const matches = usersByPersonId.get(user.personId) ?? [];
      matches.push(user);
      usersByPersonId.set(user.personId, matches);
    }

    const normalizedEmail = normalizeEmail(user.email);
    const matches = usersByEmail.get(normalizedEmail) ?? [];
    matches.push(user);
    usersByEmail.set(normalizedEmail, matches);
  }

  const normalizedPeople = await Promise.all(
    peopleDocuments.map(async (person) => {
      const matchedUsers = usersByPersonId.get(person._id) ?? usersByEmail.get(normalizeEmail(person.email)) ?? [];
      const departmentDrivenTeamId =
        matchedUsers[0] ? mapDepartmentToTeamId(matchedUsers[0].department) : null;
      const nextTeamId = departmentDrivenTeamId ?? normalizeTeamId(person.teamId);
      const roleDrivenByUser = matchedUsers[0] ? normalizePersonDisplayRole(matchedUsers[0].role) : null;
      const nextRole = roleDrivenByUser ?? normalizePersonDisplayRole(person.role);

      if (nextTeamId !== person.teamId || nextRole !== person.role) {
        await db.collection<DbPerson>("people").updateOne(
          { _id: person._id },
          { $set: { teamId: nextTeamId, role: nextRole } }
        );
      }

      if (matchedUsers.length > 0) {
        const nextDepartment = mapTeamIdToDepartment(nextTeamId);
        await db.collection<DbUser>("users").updateMany(
          {
            $or: [{ personId: person._id }, { email: person.email }]
          },
          {
            $set: {
              department: nextDepartment,
              updatedAt: new Date().toISOString()
            }
          }
        );
      }

      return {
        ...person,
        teamId: nextTeamId,
        role: nextRole
      };
    })
  );

  const memberIdsByTeam = new Map(companyTeams.map((team) => [team.id, [] as string[]]));
  for (const person of normalizedPeople) {
    const memberIds = memberIdsByTeam.get(person.teamId);
    if (memberIds) {
      memberIds.push(person._id);
    }
  }

  await Promise.all(
    companyTeams.map((team) =>
      db.collection<DbCompanyTeam>("company_teams").updateOne(
        { _id: team.id },
        {
          $set: {
            name: team.name,
            color: team.color,
            memberIds: memberIdsByTeam.get(team.id) ?? []
          }
        },
        { upsert: true }
      )
    )
  );
}

async function ensureCompanyDirectorySynced(
  db: Awaited<ReturnType<typeof getMongoDb>>,
  options?: { force?: boolean }
) {
  const now = Date.now();
  const state =
    global.__fwfDirectorySyncState__ ??
    (global.__fwfDirectorySyncState__ = { lastSyncedAt: 0 });

  if (!options?.force && state.lastSyncedAt && now - state.lastSyncedAt < DIRECTORY_SYNC_TTL_MS) {
    return;
  }

  if (!options?.force && state.inFlight) {
    await state.inFlight;
    return;
  }

  const syncPromise = syncCompanyDirectory(db)
    .then(() => {
      state.lastSyncedAt = Date.now();
    })
    .finally(() => {
      if (state.inFlight === syncPromise) {
        state.inFlight = undefined;
      }
    });

  state.inFlight = syncPromise;
  await syncPromise;
}

function findPersonForUser(user: UserAccount, people: Person[]) {
  if (user.personId) {
    const matchedById = people.find((person) => person.id === user.personId);
    if (matchedById) {
      return matchedById;
    }
  }

  const normalizedName = normalizeIdentityValue(user.name);
  const emailLocalPart = getEmailLocalPart(user.email);

  return (
    people.find(
      (person) =>
        normalizeIdentityValue(person.name) === normalizedName ||
        getEmailLocalPart(person.email) === emailLocalPart
    ) ?? null
  );
}

function getStatusColor(status: Task["status"]) {
  if (status === "Completed") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
  }

  if (status === "In Progress") {
    return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
  }

  return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300";
}

function mapDepartmentToTeamId(department: Department) {
  switch (department) {
    case "Marketing":
      return "marketing";
    case "IT":
      return "dev";
    case "Vận hành":
      return "product";
    case "Kế toán":
      return "qa";
    case "Sales":
      return "sales";
    case "Hành chính - Nhân sự":
      return "design";
    case "Cửa hàng":
      return "store";
    default:
      return "product";
  }
}

function mapTeamIdToDepartment(teamId: string): Department {
  switch (teamId) {
    case "marketing":
      return "Marketing";
    case "dev":
      return "IT";
    case "qa":
      return "Kế toán";
    case "design":
      return "Hành chính - Nhân sự";
    case "product":
      return "Vận hành";
    case "sales":
      return "Sales";
    case "store":
      return "Cửa hàng";
    default:
      return "Vận hành";
  }
}

function mapDbUser(user: DbUser): UserAccount {
  const normalizedRole = normalizeUserRole(user.role);
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    password: user.password,
    personId: user.personId ?? undefined,
    role: normalizedRole,
    department: user.department,
    storeRegion: user.storeRegion,
    storeBranchIds: user.storeBranchIds ?? [],
    storeLeadUserId: user.storeLeadUserId,
    verified: user.verified
  };
}

function mapRequestedRoleToDisplayRole(role: UserRole) {
  if (role === "leader") {
    return "Leader";
  }

  if (role === "ceo") {
    return "CEO";
  }

  if (role === "admin") {
    return "Admin";
  }

  if (role === "store_trainer") {
    return "Trainer";
  }

  if (role === "store_manager") {
    return "Quản lí cửa hàng";
  }

  if (role === "store_lead") {
    return "Cửa hàng trưởng";
  }

  if (role === "store_technician" || role === "store_staff") {
    return "Kỹ thuật viên";
  }

  return "Nhân viên";
}

function mapRoleApprovalRequest(request: DbRoleApprovalRequest): AccountHistoryRecord {
  return {
    id: String(request._id),
    email: request.email,
    name: request.name,
    role: request.role,
    department: request.department,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    otpVerifiedAt: request.otpVerifiedAt,
    approvedAt: request.approvedAt,
    rejectedAt: request.rejectedAt
  };
}

function mapPendingRegistration(record: PendingRegistration): AccountHistoryRecord {
  return {
    id: String(record._id ?? record.email),
    email: record.email,
    name: record.name,
    role: record.role,
    department: record.department,
    status: "otp_pending",
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
    expiresAt: record.expiresAt
  };
}

function mapDbNotification(record: DbPersonNotification): UserNotificationRecord {
  return {
    id: String(record._id),
    personId: record.personId,
    type: record.type,
    actorId: record.actorId,
    action: record.action,
    entityType: record.entityType,
    entityLabel: record.entityLabel,
    threadId: record.threadId,
    projectId: record.projectId,
    scheduleId: record.scheduleId,
    entityId: record.entityId,
    messageId: record.messageId,
    targetPersonIds: record.targetPersonIds ?? [],
    occurredAt: record.occurredAt,
    createdAt: record.createdAt,
    readAt: record.readAt ?? null,
    unread: !record.readAt
  };
}

async function getRootApprover(db: Awaited<ReturnType<typeof getMongoDb>>) {
  const primaryAdmin = await db.collection<DbUser>("users").findOne(
    { role: "admin", verified: true },
    { sort: { createdAt: 1, _id: 1 } }
  );

  if (primaryAdmin) {
    return primaryAdmin;
  }

  return db.collection<DbUser>("users").findOne(
    { role: { $in: ["admin", "ceo", "boss"] }, verified: true },
    { sort: { createdAt: 1, _id: 1 } }
  );
}

async function createApprovedUserFromRequest(
  db: Awaited<ReturnType<typeof getMongoDb>>,
  request: Pick<DbRoleApprovalRequest, "name" | "email" | "role" | "department" | "storeRegion" | "storeBranchIds" | "storeLeadUserId">
) {
  const now = new Date().toISOString();
  const normalizedEmail = normalizeEmail(request.email);
  const nextUserId = await generateUniqueUserId(db);
  const existingPerson = await db.collection<DbPerson>("people").findOne({ email: normalizedEmail });
  let personId = existingPerson?._id ?? null;

  if (!existingPerson) {
    personId = `people_generated_${Date.now()}`;
    const teamId = mapDepartmentToTeamId(request.department);
    await db.collection<DbPerson>("people").insertOne({
      _id: personId,
      name: request.name,
      role: mapRequestedRoleToDisplayRole(request.role),
      email: normalizedEmail,
      imageURL: "/placeholder.svg",
      teamId,
      workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" }
    });
  }

  let resolvedStoreRegion = request.storeRegion;
  let resolvedStoreBranchIds = request.storeBranchIds ?? [];

  if (request.department === "Cửa hàng" && request.role === "store_technician" && request.storeLeadUserId) {
    const leadUser = await db.collection<DbUser>("users").findOne({ _id: request.storeLeadUserId, verified: true });
    if (leadUser?.storeRegion && (leadUser.storeBranchIds?.length ?? 0) > 0) {
      resolvedStoreRegion = leadUser.storeRegion;
      resolvedStoreBranchIds = leadUser.storeBranchIds ?? [];
    }
  }

  const newUser: DbUser = {
    _id: nextUserId,
    name: request.name,
    email: normalizedEmail,
    password: "",
    personId,
    role: request.role,
    department: request.department,
    storeRegion: resolvedStoreRegion,
    storeBranchIds: resolvedStoreBranchIds,
    storeLeadUserId: request.storeLeadUserId,
    verified: true,
    createdAt: now,
    updatedAt: now
  };

  await db.collection<DbUser>("users").insertOne(newUser);
  return newUser;
}

async function generateUniqueUserId(db: Awaited<ReturnType<typeof getMongoDb>>) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidateId = `u-generated-${Date.now()}-${randomInt(1000, 9999)}`;
    const exists = await db.collection<DbUser>("users").findOne(
      { _id: candidateId },
      { projection: { _id: 1 } }
    );
    if (!exists) return candidateId;
  }

  throw new Error("Không thể tạo ID người dùng duy nhất. Vui lòng thử lại.");
}

function normalizeUserRole(role: StoredUserRole): UserRole {
  const rawRole = String(role ?? "").trim();
  const normalized = rawRole
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "manager") {
    return "leader";
  }

  if (normalized === "boss") {
    return "ceo";
  }

  if (normalized === "admin") return "admin";
  if (normalized === "ceo") return "ceo";
  if (normalized === "leader") return "leader";
  if (normalized === "employee" || normalized === "nhan vien") return "employee";

  if (normalized === "store_trainer" || normalized === "trainer") return "store_trainer";
  if (
    normalized === "store_manager" ||
    normalized === "quan li cua hang" ||
    normalized === "quan ly cua hang"
  ) {
    return "store_manager";
  }
  if (normalized === "store_lead" || normalized === "cua hang truong") return "store_lead";
  if (
    normalized === "store_technician" ||
    normalized === "store_staff" ||
    normalized === "ky thuat vien" ||
    normalized === "nhan vien cua hang"
  ) {
    return "store_technician";
  }

  return "employee";
}

function sanitizeUnicodeText(value: string) {
  // PostgreSQL jsonb rejects NUL (\u0000) and malformed surrogate pairs.
  return value
    .replace(/\u0000/g, "")
    .replace(/\\u0000/gi, "")
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      ""
    );
}

function sanitizeForJson<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeUnicodeText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item)) as T;
  }
  if (value && typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      sanitizeForJson(entryValue),
    ]);
    return Object.fromEntries(sanitizedEntries) as T;
  }
  return value;
}

function mapDbPerson(person: DbPerson): Person {
  return {
    id: person._id,
    name: person.name,
    role: normalizePersonDisplayRole(person.role),
    imageURL: person.imageURL,
    email: person.email,
    workingHours: person.workingHours,
    team: normalizeTeamId(person.teamId)
  };
}

function attachUserProfileToPeople(people: Person[], users: UserAccount[]) {
  const userByPersonId = new Map(
    users
      .filter((user) => Boolean(user.personId))
      .map((user) => [user.personId as string, user])
  );

  return people.map((person) => {
    const user = userByPersonId.get(person.id);
    if (!user) return person;

    return {
      ...person,
      userId: user.id,
      authRole: user.role,
      department: user.department,
      storeRegion: user.storeRegion,
      storeBranchIds: user.storeBranchIds ?? [],
      storeLeadUserId: user.storeLeadUserId,
    };
  });
}

function mapDbCompanyTeam(team: DbCompanyTeam): CompanyTeamRecord {
  return {
    id: team._id,
    name: team.name,
    color: team.color,
    memberIds: team.memberIds ?? []
  };
}

function mapDbWorkspaceTeam(team: DbWorkspaceTeam): Project {
  return {
    id: team._id,
    name: team.name,
    color: team.color,
    memberIds: team.memberIds ?? []
  };
}

function mapDbTask(task: DbTask): Task {
  return {
    id: task.taskNumber,
    projectId: task.workspaceTeamId,
    name: task.name,
    comments: task.comments,
    likes: task.likes,
    assigneeId: task.assigneeId,
    status: task.status,
    statusColor: task.statusColor || getStatusColor(task.status),
    executionPeriod: task.executionPeriod,
    audience: task.audience,
    weight: task.weight,
    resultMethod: task.resultMethod,
    target: task.target ?? "",
    progress: task.progress ?? 0,
    kpis: task.kpis ?? [],
    childGoal: task.childGoal,
    parentGoal: task.parentGoal,
    description: task.description,
    attachments: task.attachments ?? []
  };
}

function mapDbDocument(document: DbDocument): Document {
  return {
    id: document._id,
    name: document.name,
    type: document.type,
    size: document.size,
    ownerId: document.ownerId,
    createdAt: document.createdAt,
    modifiedAt: document.modifiedAt,
    folder: document.folder ?? undefined,
    folderId: document.folderId ?? undefined,
    tags: document.tags ?? [],
    isStarred: document.isStarred,
    thumbnail: document.thumbnail ?? undefined,
    description: document.description,
    url: document.url,
    visibility: document.visibility ?? "team",
    visibleToPersonIds: document.visibleToPersonIds ?? [],
    isLearningMaterial: document.isLearningMaterial ?? false,
    learningPlan: document.learningPlan,
    deadlineAt: document.deadlineAt,
    isLocked: document.isLocked ?? false,
    lockedAt: document.lockedAt,
    lockedByUserId: document.lockedByUserId
  };
}

function mapDbLearningQuiz(quiz: DbLearningQuiz, sanitize: boolean): LearningQuizRecord {
  return {
    id: quiz._id,
    documentId: quiz.documentId,
    title: quiz.title,
    description: quiz.description ?? "",
    questions: quiz.questions.map((q) => ({
      text: q.text,
      options: q.options,
      ...(sanitize ? {} : { correctIndex: q.correctIndex }),
      ...(sanitize ? {} : { explanation: q.explanation }),
    })),
    durationMinutes: quiz.durationMinutes,
    ...(quiz.timePerQuestionSeconds ? { timePerQuestionSeconds: quiz.timePerQuestionSeconds } : {}),
    ...(quiz.deadlineAt ? { deadlineAt: quiz.deadlineAt } : {}),
    createdByPersonId: quiz.createdByPersonId,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}

function mapDbQuizAttempt(
  attempt: DbQuizAttempt,
  personName?: string,
  personRole?: string,
  reviewQuestions?: QuizQuestion[],
  attemptRound?: number,
  isActiveAttempt?: boolean
): QuizAttemptRecord {
  return {
    id: attempt._id,
    quizId: attempt.quizId,
    documentId: attempt.documentId,
    personId: attempt.personId,
    personName,
    personRole,
    answers: attempt.answers,
    score: attempt.score,
    correctAnswers: attempt.correctAnswers,
    totalQuestions: attempt.totalQuestions,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    attemptRound,
    retakeCount: Math.max(0, (attemptRound ?? 1) - 1),
    isActiveAttempt,
    reviewQuestions,
  };
}

function buildQuizReviewQuestions(quiz?: Pick<DbLearningQuiz, "questions"> | null): QuizQuestion[] | undefined {
  if (!quiz) return undefined;
  return quiz.questions.map((q) => ({
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));
}

function mapDbLearningProgress(progress: DbLearningProgress): LearningProgressRecord {
  return {
    id: progress._id,
    personId: progress.personId,
    documentId: progress.documentId,
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
    activeStepIndex: progress.activeStepIndex ?? 0,
    completedStepIds: progress.completedStepIds ?? [],
    startedAtByStepId: progress.startedAtByStepId ?? {},
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

function hasCompletedAllLearningSteps(progress: DbLearningProgress | undefined, document: Pick<DbDocument, "learningPlan">) {
  const steps = document.learningPlan?.steps ?? [];
  if (!progress || steps.length === 0) return false;
  const completedStepIds = new Set(progress.completedStepIds ?? []);
  return steps.every((step) => completedStepIds.has(step.id));
}

function isLearningProgressCompleted(progress: DbLearningProgress | undefined, document: Pick<DbDocument, "learningPlan">) {
  return Boolean(progress?.completedAt) || hasCompletedAllLearningSteps(progress, document);
}

function mapDbFolder(folder: DbFolder): Folder {
  return {
    id: folder._id,
    name: folder.name,
    parentId: folder.parentId,
    ownerId: folder.ownerId,
    teamId: folder.teamId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt
  };
}

function formatChatTimestamp(dateValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(new Date(dateValue));
}

function mapDbChatMessage(message: DbChatMessage): ChatMessageRecord {
  return {
    id: message._id,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    fileName: message.fileName,
    mimeType: message.mimeType,
    fileSize: message.fileSize,
    timestamp: formatChatTimestamp(message.createdAt),
    status: message.status
  };
}

function mapDbSchedule(schedule: DbSchedule): ScheduleRecord {
  return {
    id: schedule._id,
    projectId: schedule.workspaceTeamId,
    dateKey: schedule.dateKey,
    title: schedule.title,
    description: schedule.description,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    attendeeIds: schedule.attendeeIds,
    createdByPersonId: schedule.createdByPersonId,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

function mapDbTest(record: DbTest): TestRecord {
  return {
    id: record._id,
    title: record.title,
    description: record.description,
    questions: record.questions ?? [],
    durationMinutes: record.durationMinutes,
    createdByPersonId: record.createdByPersonId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function mapPgPersonRow(row: Record<string, unknown>): DbPerson {
  return {
    _id: String(row.id),
    name: String(row.name ?? ""),
    role: String(row.role ?? ""),
    email: String(row.email ?? ""),
    imageURL: String(row.image_url ?? "/placeholder.svg"),
    teamId: String(row.team_id ?? "product"),
    workingHours: (row.working_hours as Person["workingHours"]) ?? { start: "09:00", end: "17:00", timezone: "UTC+7" }
  };
}

function mapPgUserRow(row: Record<string, unknown>): DbUser {
  return {
    _id: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    password: String(row.password ?? ""),
    personId: (row.person_id as string | null | undefined) ?? undefined,
    role: String(row.role ?? "employee") as StoredUserRole,
    department: String(row.department ?? "Vận hành") as Department,
    storeRegion: row.store_region as StoreRegion | undefined,
    storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]) : [],
    storeLeadUserId: row.store_lead_user_id as string | undefined,
    verified: Boolean(row.verified),
    createdAt: toIsoStringOrUndefined(row.created_at),
    updatedAt: toIsoStringOrUndefined(row.updated_at),
  };
}

function mapPgDocumentRow(row: Record<string, unknown>): DbDocument {
  const raw = row.raw_json && typeof row.raw_json === "object"
    ? (row.raw_json as Record<string, unknown>)
    : {};
  return {
    _id: String(row.id),
    name: String(row.name ?? ""),
    type: (String(row.type ?? "pdf") as Document["type"]),
    size: Number(row.size ?? 0),
    ownerId: String(row.owner_id ?? ""),
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    modifiedAt: toIsoStringOrUndefined(row.modified_at) ?? new Date().toISOString(),
    folder: (row.folder as string | undefined) ?? undefined,
    folderId: (row.folder_id as string | undefined) ?? undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    isStarred: Boolean(row.is_starred),
    thumbnail: (row.thumbnail as string | null | undefined) ?? null,
    description: (row.description as string | undefined) ?? undefined,
    url: (row.url as string | undefined) ?? undefined,
    visibility: ((row.visibility as DbDocument["visibility"]) ?? "team"),
    visibleToPersonIds: Array.isArray(row.visible_to_person_ids) ? (row.visible_to_person_ids as string[]) : [],
    isLearningMaterial: Boolean(row.is_learning_material),
    learningPlan: (row.learning_plan as Document["learningPlan"] | undefined) ?? undefined,
    deadlineAt: toIsoStringOrUndefined(row.deadline_at),
    isLocked: Boolean(row.is_locked ?? raw.isLocked ?? false),
    lockedAt: toIsoStringOrUndefined(row.locked_at ?? raw.lockedAt),
    lockedByUserId: (row.locked_by_user_id as string | undefined) ?? (raw.lockedByUserId as string | undefined),
  };
}

function canBypassDocumentLock(actor: SessionActor, document: Pick<DbDocument, "ownerId">) {
  if (actor.isAdmin) return true;
  if (canManageLearningContent(actor)) return true;
  return actor.person.id === document.ownerId;
}

function isDocumentLockedForActor(actor: SessionActor, document: DbDocument) {
  if (!document.isLocked) return false;
  return !canBypassDocumentLock(actor, document);
}

function canActorViewDocument(
  actor: SessionActor,
  document: DbDocument,
  personTeamMap: Map<string, string>,
  personRolesMap: Map<string, Set<UserRole>>,
  ownerUserByPersonId?: Map<string, UserAccount>
) {
  if (actor.isAdmin) return true;

  // Technician can always view documents created by their direct manager (store lead or trainer),
  // even if legacy team mapping data is inconsistent.
  if (actor.user.role === "store_technician" && actor.user.storeLeadUserId && ownerUserByPersonId) {
    const ownerUser = ownerUserByPersonId.get(document.ownerId);
    if (ownerUser && ownerUser.id === actor.user.storeLeadUserId) {
      return true;
    }
  }

  const visibility = document.visibility ?? "team";
  const ownerTeam = personTeamMap.get(document.ownerId);
  const isSameOwnerTeam = !ownerTeam || actor.person.team === ownerTeam;

  const ownerRoles = personRolesMap.get(document.ownerId);
  const ownerIsLeaderCreator =
    Boolean(ownerRoles?.has("leader")) &&
    !Boolean(ownerRoles?.has("admin") || ownerRoles?.has("ceo"));
  const isVanHanhLeader = actor.isLeader && !actor.isAdmin && actor.person.team === "product";
  const isStoreLearningForTechnician =
    document.isLearningMaterial === true &&
    actor.user.role === "store_technician" &&
    (ownerTeam === "store" || Boolean(ownerRoles?.has("store_trainer")));

  if (ownerIsLeaderCreator) {
    if (!isSameOwnerTeam) return false;
    if (visibility === "specific") {
      return (
        document.ownerId === actor.person.id ||
        (actor.person.team === ownerTeam && (document.visibleToPersonIds ?? []).includes(actor.person.id))
      );
    }
    return actor.person.team === ownerTeam || document.ownerId === actor.person.id;
  }

  if (isStoreLearningForTechnician) return true;
  if (visibility === "team") return isSameOwnerTeam || document.ownerId === actor.person.id;
  if (visibility === "office") return actor.person.team !== "store";
  if (visibility === "store") return actor.person.team === "store" || isVanHanhLeader;
  if (!isSameOwnerTeam) return document.ownerId === actor.person.id;
  return document.ownerId === actor.person.id || actor.isLeader || (document.visibleToPersonIds ?? []).includes(actor.person.id);
}

function buildOwnerUserByPersonId(rows: Array<Record<string, unknown>>) {
  const ownerUserByPersonId = new Map<string, UserAccount>();
  for (const row of rows) {
    const personId = row.person_id ? String(row.person_id) : "";
    if (!personId) continue;
    ownerUserByPersonId.set(personId, {
      id: String(row.id ?? row._id ?? ""),
      name: String(row.name ?? ""),
      email: String(row.email ?? ""),
      password: "",
      personId,
      role: normalizeUserRole(String(row.role ?? "employee") as StoredUserRole),
      department: (row.department as Department | undefined) ?? "Vận hành",
      storeRegion: undefined,
      storeBranchIds: [],
      storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
      verified: Boolean(row.verified ?? true),
    });
  }
  return ownerUserByPersonId;
}

function buildPersonRolesMap(rows: Array<Record<string, unknown>>) {
  const personRolesMap = new Map<string, Set<UserRole>>();
  for (const row of rows) {
    const personId = row.person_id ? String(row.person_id) : "";
    if (!personId) continue;
    const roles = personRolesMap.get(personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(String(row.role ?? "employee") as StoredUserRole));
    personRolesMap.set(personId, roles);
  }
  return personRolesMap;
}

const storeBranchNameById = new Map(STORE_BRANCHES.map((branch) => [branch.id, branch.name]));

function getStoreBranchNames(storeBranchIds: number[] | undefined) {
  return (storeBranchIds ?? []).map((branchId) => storeBranchNameById.get(branchId) ?? `Cửa hàng ${branchId}`);
}

function getTechnicianSupervisorProfile(
  user: UserAccount | undefined,
  users: UserAccount[]
): Pick<TeamLearningStatusRow, "supervisorUserId" | "supervisorName" | "supervisorRole"> {
  if (!user || user.role !== "store_technician") return {};

  const directSupervisor = user.storeLeadUserId
    ? users.find((candidate) => candidate.id === user.storeLeadUserId)
    : undefined;
  if (directSupervisor) {
    return {
      supervisorUserId: directSupervisor.id,
      supervisorName: directSupervisor.name,
      supervisorRole: directSupervisor.role,
    };
  }

  const branchIds = new Set(user.storeBranchIds ?? []);
  const manager = users.find((candidate) =>
    candidate.department === "Cửa hàng" &&
    candidate.role === "store_manager" &&
    (candidate.storeBranchIds ?? []).some((branchId) => branchIds.has(branchId))
  );
  if (manager) {
    return {
      supervisorUserId: manager.id,
      supervisorName: manager.name,
      supervisorRole: manager.role,
    };
  }

  return {};
}

function documentContainsFileId(document: DbDocument, fileId: string) {
  const pickFileId = (url?: string) => url?.match(/\/api\/files\/([^/?#]+)/)?.[1];
  if (pickFileId(document.url) === fileId) return true;
  if (pickFileId(document.learningPlan?.previewUrl) === fileId) return true;
  for (const step of document.learningPlan?.steps ?? []) {
    for (const media of step.media ?? []) {
      if (pickFileId(media.url) === fileId) return true;
    }
  }
  return false;
}

export async function canAccessFileById(
  sessionUserId: string | null | undefined,
  fileId: string
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) return false;

  if (shouldUseSupabasePhaseA()) {
    const [docsRes, peopleRes, usersRes] = await Promise.all([
      pgQuery("select * from documents"),
      pgQuery("select id, team_id from people"),
      pgQuery("select id, name, email, person_id, role, department, store_lead_user_id, verified from users where person_id is not null"),
    ]);
    const documents = docsRes.rows.map((row) => mapPgDocumentRow(row));
    const target = documents.find((document) => documentContainsFileId(document, fileId));
    if (!target) return true;
    const personTeamMap = new Map(peopleRes.rows.map((row) => [String(row.id), String(row.team_id)]));
    const personRolesMap = buildPersonRolesMap(usersRes.rows);
    const ownerUserByPersonId = buildOwnerUserByPersonId(usersRes.rows);
    if (!canActorViewDocument(actor, target, personTeamMap, personRolesMap, ownerUserByPersonId)) return false;
    return !isDocumentLockedForActor(actor, target);
  }

  const db = await getMongoDb();
  const [docs, allPeople, allUsers] = await Promise.all([
    db.collection<DbDocument>("documents").find().toArray(),
    db.collection<DbPerson>("people").find({}, { projection: { _id: 1, teamId: 1 } }).toArray(),
    db.collection<DbUser>("users").find({}, { projection: { _id: 1, name: 1, email: 1, personId: 1, role: 1, department: 1, storeLeadUserId: 1, verified: 1 } }).toArray(),
  ]);
  const target = docs.find((document) => documentContainsFileId(document, fileId));
  if (!target) return true;
  const personTeamMap = new Map(allPeople.map((person) => [person._id, person.teamId]));
  const personRolesMap = new Map<string, Set<UserRole>>();
  const ownerUserByPersonId = new Map<string, UserAccount>();
  for (const user of allUsers) {
    if (!user.personId) continue;
    const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesMap.set(user.personId, roles);
    ownerUserByPersonId.set(user.personId, mapDbUser(user));
  }
  if (!canActorViewDocument(actor, target, personTeamMap, personRolesMap, ownerUserByPersonId)) return false;
  return !isDocumentLockedForActor(actor, target);
}

function mapPgFolderRow(row: Record<string, unknown>): DbFolder {
  const raw = row.raw_json && typeof row.raw_json === "object"
    ? (row.raw_json as Record<string, unknown>)
    : {};
  return {
    _id: String(row.id),
    name: String(row.name ?? ""),
    parentId: row.parent_id ? String(row.parent_id) : (raw.parentId ? String(raw.parentId) : undefined),
    ownerId: String(row.owner_id ?? ""),
    teamId: String(row.team_id ?? "product"),
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPgLearningQuizRow(row: Record<string, unknown>): DbLearningQuiz {
  return {
    _id: String(row.id),
    documentId: String(row.document_id ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    questions: Array.isArray(row.questions) ? (row.questions as DbQuizQuestion[]) : [],
    durationMinutes: Number(row.duration_minutes ?? 0),
    timePerQuestionSeconds: row.time_per_question_seconds ? Number(row.time_per_question_seconds) : undefined,
    deadlineAt: toIsoStringOrUndefined(row.deadline_at),
    createdByPersonId: String(row.created_by_person_id ?? ""),
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPgQuizAttemptRow(row: Record<string, unknown>): DbQuizAttempt {
  return {
    _id: String(row.id),
    quizId: String(row.quiz_id ?? ""),
    documentId: String(row.document_id ?? ""),
    personId: String(row.person_id ?? ""),
    answers: Array.isArray(row.answers) ? (row.answers as number[]) : [],
    score: Number(row.score ?? 0),
    correctAnswers: Number(row.correct_answers ?? 0),
    totalQuestions: Number(row.total_questions ?? 0),
    startedAt: toIsoStringOrUndefined(row.started_at) ?? new Date().toISOString(),
    submittedAt: toIsoStringOrUndefined(row.submitted_at) ?? new Date().toISOString(),
  };
}

function mapPgQuizAttemptResetRow(row: Record<string, unknown>): DbQuizAttemptReset {
  return {
    _id: String(row.id),
    documentId: String(row.document_id ?? ""),
    personId: String(row.person_id ?? ""),
    resetByPersonId: String(row.reset_by_person_id ?? ""),
    resetAt: toIsoStringOrUndefined(row.reset_at) ?? new Date().toISOString(),
  };
}

function mapDbQuizAttemptReset(
  row: DbQuizAttemptReset,
  personName?: string,
  resetByPersonName?: string
): QuizAttemptResetRecord {
  return {
    id: row._id,
    documentId: row.documentId,
    personId: row.personId,
    personName,
    resetByPersonId: row.resetByPersonId,
    resetByPersonName,
    resetAt: row.resetAt,
  };
}

function computeAttemptRoundByPerson(attempts: DbQuizAttempt[], resets: DbQuizAttemptReset[]) {
  const rounds = new Map<string, number>();
  const personAttemptCounts = new Map<string, number>();
  const ordered = [...attempts].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );
  for (const attempt of ordered) {
    const nextRound = (personAttemptCounts.get(attempt.personId) ?? 0) + 1;
    personAttemptCounts.set(attempt.personId, nextRound);
    rounds.set(attempt._id, nextRound);
  }
  return rounds;
}

function computeAttemptRoundByPersonAndDocument(attempts: DbQuizAttempt[]) {
  const rounds = new Map<string, number>();
  const counts = new Map<string, number>();
  const ordered = [...attempts].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );
  for (const attempt of ordered) {
    const key = `${attempt.personId}:${attempt.documentId}`;
    const nextRound = (counts.get(key) ?? 0) + 1;
    counts.set(key, nextRound);
    rounds.set(attempt._id, nextRound);
  }
  return rounds;
}

function mapPgLearningProgressRow(row: Record<string, unknown>): DbLearningProgress {
  return {
    _id: String(row.id),
    personId: String(row.person_id ?? ""),
    documentId: String(row.document_id ?? ""),
    startedAt: toIsoStringOrUndefined(row.started_at),
    completedAt: toIsoStringOrUndefined(row.completed_at),
    activeStepIndex: Number(row.active_step_index ?? 0),
    completedStepIds: Array.isArray(row.completed_step_ids) ? (row.completed_step_ids as string[]) : [],
    startedAtByStepId: (row.started_at_by_step_id as Record<string, string>) ?? {},
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPgWorkspaceTeamRow(row: Record<string, unknown>): DbWorkspaceTeam {
  return {
    _id: String(row.id),
    name: String(row.name ?? ""),
    slug: row.slug ? String(row.slug) : undefined,
    color: String(row.color ?? ""),
    memberIds: Array.isArray(row.member_ids) ? (row.member_ids as string[]) : [],
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    visibility: row.visibility ? String(row.visibility) : undefined,
    createdAt: toIsoStringOrUndefined(row.created_at),
    updatedAt: toIsoStringOrUndefined(row.updated_at),
  };
}

function mapPgTaskRow(row: Record<string, unknown>): DbTask {
  return {
    _id: String(row.id),
    taskNumber: Number(row.task_number ?? 0),
    workspaceTeamId: String(row.workspace_team_id ?? ""),
    timePeriod: String(row.time_period ?? "This Week") as TimePeriod,
    name: String(row.name ?? ""),
    comments: Number(row.comments ?? 0),
    likes: Number(row.likes ?? 0),
    assigneeId: String(row.assignee_id ?? ""),
    status: String(row.status ?? "In Progress") as Task["status"],
    statusColor: String(row.status_color ?? ""),
    executionPeriod: String(row.execution_period ?? ""),
    audience: String(row.audience ?? ""),
    weight: String(row.weight ?? ""),
    resultMethod: String(row.result_method ?? ""),
    target: row.target ? String(row.target) : "",
    progress: Number(row.progress ?? 0),
    kpis: Array.isArray(row.kpis) ? (row.kpis as string[]) : [],
    childGoal: String(row.child_goal ?? ""),
    parentGoal: String(row.parent_goal ?? ""),
    description: String(row.description ?? ""),
    attachments: Array.isArray(row.attachments) ? (row.attachments as TaskAttachment[]) : [],
    createdAt: toIsoStringOrUndefined(row.created_at),
    updatedAt: toIsoStringOrUndefined(row.updated_at),
  };
}

function mapPgScheduleRow(row: Record<string, unknown>): DbSchedule {
  return {
    _id: String(row.id),
    workspaceTeamId: String(row.workspace_team_id ?? "general"),
    dateKey: String(row.date_key ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    startTime: String(row.start_time ?? ""),
    endTime: String(row.end_time ?? ""),
    attendeeIds: Array.isArray(row.attendee_ids) ? (row.attendee_ids as string[]) : [],
    createdByPersonId: String(row.created_by_person_id ?? ""),
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPgTestRow(row: Record<string, unknown>): DbTest {
  return {
    _id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    questions: Array.isArray(row.questions) ? (row.questions as string[]) : [],
    durationMinutes: Number(row.duration_minutes ?? 0),
    createdByPersonId: String(row.created_by_person_id ?? ""),
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapPgChatThreadRow(row: Record<string, unknown>): DbChatThread {
  return {
    _id: String(row.id),
    type: "individual",
    participantIds: Array.isArray(row.participant_ids) ? (row.participant_ids as string[]) : [],
    teamId: String(row.team_id ?? "product"),
    lastMessage: String(row.last_message ?? ""),
    lastMessageAt: toIsoStringOrUndefined(row.last_message_at) ?? new Date().toISOString(),
    createdAt: toIsoStringOrUndefined(row.created_at),
    updatedAt: toIsoStringOrUndefined(row.updated_at),
  };
}

function mapPgChatMessageRow(row: Record<string, unknown>): DbChatMessage {
  return {
    _id: String(row.id),
    threadId: String(row.thread_id ?? ""),
    senderId: String(row.sender_id ?? ""),
    type: String(row.type ?? "text") as DbChatMessage["type"],
    content: String(row.content ?? ""),
    fileName: row.file_name ? String(row.file_name) : undefined,
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    fileSize: row.file_size ? Number(row.file_size) : undefined,
    status: String(row.status ?? "sent") as DbChatMessage["status"],
    createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
  };
}

function createEmptyTaskGroups(): TaskGroups {
  return {
    "This Week": [],
    "Last Week": [],
    "This Month": []
  };
}

export async function getAuthState(userId?: string | null) {
  if (shouldUseSupabasePhaseA()) {
    const [usersResult, userResult] = await Promise.all([
      pgQuery("select * from users order by created_at asc nulls last"),
      userId ? pgQuery("select * from users where id = $1 limit 1", [userId]) : Promise.resolve({ rows: [] }),
    ]);
    return {
      users: usersResult.rows.map((row) => mapDbUser(mapPgUserRow(row))),
      user: userResult.rows[0] ? mapDbUser(mapPgUserRow(userResult.rows[0])) : null,
    };
  }

  const db = await getMongoDb();
  const usersCollection = db.collection<DbUser>("users");

  const [users, user] = await Promise.all([
    usersCollection.find({}, { sort: { createdAt: 1 } }).toArray(),
    userId ? usersCollection.findOne({ _id: userId }) : Promise.resolve(null)
  ]);

  return {
    users: users.map(mapDbUser),
    user: user ? mapDbUser(user) : null
  };
}

export async function getAllRealtimePersonIds() {
  if (shouldUseSupabasePhaseA()) {
    const users = await pgQuery("select person_id from users where person_id is not null and person_id <> ''");
    return Array.from(new Set(users.rows.map((user) => String(user.person_id)).filter(Boolean)));
  }

  const db = await getMongoDb();
  const users = await db.collection<DbUser>("users").find(
    { personId: { $type: "string", $ne: "" } },
    { projection: { personId: 1 } }
  ).toArray();

  return Array.from(
    new Set(users.map((user) => user.personId).filter((personId): personId is string => Boolean(personId)))
  );
}

export async function getAdminRealtimePersonIds() {
  if (shouldUseSupabasePhaseA()) {
    const users = await pgQuery("select person_id, role from users where person_id is not null and person_id <> ''");
    return Array.from(
      new Set(
        users.rows
          .filter((row) => isAdminLikeRole(normalizeUserRole(String(row.role ?? "employee") as StoredUserRole)))
          .map((row) => String(row.person_id))
          .filter((personId): personId is string => Boolean(personId))
      )
    );
  }

  const db = await getMongoDb();
  const users = await db.collection<DbUser>("users").find(
    { personId: { $type: "string", $ne: "" } }
  ).toArray();

  return Array.from(
    new Set(
      users
        .map(mapDbUser)
        .filter((user) => isAdminLikeRole(user.role))
        .map((user) => user.personId)
        .filter((personId): personId is string => Boolean(personId))
    )
  );
}

export async function getWorkspaceRealtimePersonIds(projectId: string) {
  if (shouldUseSupabasePhaseA()) {
    const [projectRes, adminPersonIds] = await Promise.all([
      pgQuery("select member_ids from workspace_teams where id = $1 limit 1", [projectId]),
      getAdminRealtimePersonIds()
    ]);
    const memberIds = Array.isArray(projectRes.rows[0]?.member_ids) ? (projectRes.rows[0].member_ids as string[]) : [];
    return Array.from(new Set([...memberIds, ...adminPersonIds]));
  }

  const db = await getMongoDb();
  const [project, adminPersonIds] = await Promise.all([
    db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: projectId }),
    getAdminRealtimePersonIds()
  ]);

  return Array.from(new Set([...(project?.memberIds ?? []), ...adminPersonIds]));
}

export async function getDocumentRealtimeAudience(documentId: string) {
  if (shouldUseSupabasePhaseA()) {
    const [documentRes, peopleRes, usersRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [documentId]),
      pgQuery("select id, team_id, role, name, email, image_url, working_hours from people"),
      pgQuery("select * from users"),
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow) return { personIds: [] as string[], documentName: documentId };
    const document = mapPgDocumentRow(documentRow);
    const allPeople = peopleRes.rows.map((row) => mapPgPersonRow(row));
    const allUsers = usersRes.rows.map((row) => mapPgUserRow(row));

    const mappedPeople = allPeople.map(mapDbPerson);
    const personById = new Map(mappedPeople.map((person) => [person.id, person]));
    const personTeamMap = new Map(allPeople.map((person) => [person._id, person.teamId]));
    const personRolesMap = new Map<string, Set<UserRole>>();
    for (const user of allUsers) {
      if (!user.personId) continue;
      const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
      roles.add(normalizeUserRole(user.role));
      personRolesMap.set(user.personId, roles);
    }
    const ownerTeam = personTeamMap.get(document.ownerId);
    const ownerRoles = personRolesMap.get(document.ownerId);
    const ownerIsLeaderCreator = Boolean(ownerRoles?.has("leader")) && !Boolean(ownerRoles?.has("admin") || ownerRoles?.has("ceo"));
    const visibility = document.visibility ?? "team";
    const visibleToPersonIds = document.visibleToPersonIds ?? [];

    const personIds = allUsers
      .map(mapDbUser)
      .filter((user) => Boolean(user.personId))
      .filter((user) => {
        const personId = user.personId!;
        const person = personById.get(personId);
        if (!person) return false;
        if (isAdminLikeRole(user.role)) return true;
        if (ownerTeam && person.team !== ownerTeam) return false;
        const isLeader = user.role === "leader";
        const isVanHanhLeader = isLeader && person.team === "product";
        if (ownerIsLeaderCreator) {
          if (visibility === "specific") return document.ownerId === person.id || (person.team === ownerTeam && visibleToPersonIds.includes(person.id));
          return person.team === ownerTeam || document.ownerId === person.id;
        }
        if (visibility === "team") return person.team === ownerTeam || document.ownerId === person.id;
        if (visibility === "office") return person.team !== "store";
        if (visibility === "store") return person.team === "store" || isVanHanhLeader;
        return document.ownerId === person.id || isLeader || visibleToPersonIds.includes(person.id);
      })
      .map((user) => user.personId as string);

    return {
      personIds: Array.from(new Set(personIds)),
      documentName: document.name,
    };
  }

  const db = await getMongoDb();
  const [document, allPeople, allUsers] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db.collection<DbPerson>("people").find().toArray(),
    db.collection<DbUser>("users").find({}, { projection: { personId: 1, role: 1 } }).toArray(),
  ]);

  if (!document) {
    return { personIds: [] as string[], documentName: documentId };
  }

  const mappedPeople = allPeople.map(mapDbPerson);
  const personById = new Map(mappedPeople.map((person) => [person.id, person]));
  const personTeamMap = new Map(allPeople.map((person) => [person._id, person.teamId]));
  const personRolesMap = new Map<string, Set<UserRole>>();
  for (const user of allUsers) {
    if (!user.personId) continue;
    const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesMap.set(user.personId, roles);
  }

  const ownerTeam = personTeamMap.get(document.ownerId);
  const ownerRoles = personRolesMap.get(document.ownerId);
  const ownerIsLeaderCreator =
    Boolean(ownerRoles?.has("leader")) &&
    !Boolean(ownerRoles?.has("admin") || ownerRoles?.has("ceo"));
  const visibility = document.visibility ?? "team";
  const visibleToPersonIds = document.visibleToPersonIds ?? [];

  const personIds = allUsers
    .map(mapDbUser)
    .filter((user) => Boolean(user.personId))
    .filter((user) => {
      const personId = user.personId!;
      const person = personById.get(personId);
      if (!person) return false;
      if (isAdminLikeRole(user.role)) return true;
      if (ownerTeam && person.team !== ownerTeam) return false;

      const isLeader = user.role === "leader";
      const isVanHanhLeader = isLeader && person.team === "product";

      if (ownerIsLeaderCreator) {
        if (visibility === "specific") {
          return (
            document.ownerId === person.id ||
            (person.team === ownerTeam && visibleToPersonIds.includes(person.id))
          );
        }
        return person.team === ownerTeam || document.ownerId === person.id;
      }

      if (visibility === "team") {
        return person.team === ownerTeam || document.ownerId === person.id;
      }
      if (visibility === "office") {
        return person.team !== "store";
      }
      if (visibility === "store") {
        return person.team === "store" || isVanHanhLeader;
      }
      return document.ownerId === person.id || isLeader || visibleToPersonIds.includes(person.id);
    })
    .map((user) => user.personId as string);

  return {
    personIds: Array.from(new Set(personIds)),
    documentName: document.name,
  };
}

export async function getStoreLearningAnnouncementTargets(
  sessionUserId: string | null | undefined,
  documentId: string
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!(actor.user.role === "store_trainer" && actor.user.department === "Cửa hàng")) {
    return { personIds: [] as string[], emailTargets: [] as Array<{ email: string; name: string }>, documentName: "" };
  }

  if (shouldUseSupabasePhaseA()) {
    const [documentRes, peopleRes, usersRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [documentId]),
      pgQuery("select * from people"),
      pgQuery("select * from users where verified = true")
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow) return { personIds: [] as string[], emailTargets: [] as Array<{ email: string; name: string }>, documentName: "" };
    const document = mapPgDocumentRow(documentRow);
    const allPeople = peopleRes.rows.map((row) => mapPgPersonRow(row));
    const allUsers = usersRes.rows.map((row) => mapPgUserRow(row));
    const mappedPeople = allPeople.map(mapDbPerson);
    const ownerTeamByPersonId = new Map(mappedPeople.map((person) => [person.id, person.team]));
    const allowedRoles = new Set<UserRole>(["store_manager", "store_lead", "store_technician", "store_staff"]);
    const recipients = allUsers
      .map(mapDbUser)
      .filter((user) => Boolean(user.personId))
      .filter((user) => user.department === "Cửa hàng" && allowedRoles.has(user.role))
      .filter((user) => {
        const person = mappedPeople.find((candidate) => candidate.id === user.personId);
        if (!person) return false;
        return canPersonAccessDocument(person, document, ownerTeamByPersonId);
      });
    const personIds = recipients.map((user) => user.personId as string).filter((personId) => personId !== actor.person.id);
    const emailTargets = recipients
      .filter((user) => normalizeEmail(user.email) !== normalizeEmail(actor.user.email))
      .map((user) => ({ email: user.email, name: user.name }));
    return { personIds: Array.from(new Set(personIds)), emailTargets, documentName: document.name };
  }

  const db = await getMongoDb();
  const [document, allPeople, allUsers] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db.collection<DbPerson>("people").find({}).toArray(),
    db.collection<DbUser>("users").find({ verified: true }).toArray()
  ]);
  if (!document) {
    return { personIds: [] as string[], emailTargets: [] as Array<{ email: string; name: string }>, documentName: "" };
  }

  const mappedPeople = allPeople.map(mapDbPerson);
  const ownerTeamByPersonId = new Map(mappedPeople.map((person) => [person.id, person.team]));
  const allowedRoles = new Set<UserRole>(["store_manager", "store_lead", "store_technician", "store_staff"]);

  const recipients = allUsers
    .map(mapDbUser)
    .filter((user) => Boolean(user.personId))
    .filter((user) => user.department === "Cửa hàng" && allowedRoles.has(user.role))
    .filter((user) => {
      const person = mappedPeople.find((candidate) => candidate.id === user.personId);
      if (!person) return false;
      return canPersonAccessDocument(person, document, ownerTeamByPersonId);
    });

  const personIds = recipients
    .map((user) => user.personId as string)
    .filter((personId) => personId !== actor.person.id);

  const emailTargets = recipients
    .filter((user) => normalizeEmail(user.email) !== normalizeEmail(actor.user.email))
    .map((user) => ({ email: user.email, name: user.name }));

  return {
    personIds: Array.from(new Set(personIds)),
    emailTargets,
    documentName: document.name
  };
}

export async function sendStoreLearningAnnouncementEmails(input: {
  actorName: string;
  title: string;
  kind: "document" | "quiz";
  targets: Array<{ email: string; name: string }>;
}) {
  if (!isOtpEmailConfigured() || input.targets.length === 0) {
    return;
  }

  await Promise.allSettled(
    input.targets.map((target) =>
      sendLearningAnnouncementEmail({
        to: target.email,
        recipientName: target.name,
        actorName: input.actorName,
        title: input.title,
        kind: input.kind
      })
    )
  );
}

async function getSessionActor(sessionUserId?: string | null): Promise<SessionActor | null> {
  if (!sessionUserId) {
    return null;
  }

  if (shouldUseSupabasePhaseA()) {
    const [userRows, peopleRows, allUserRows] = await Promise.all([
      pgQuery("select * from users where id = $1 limit 1", [sessionUserId]),
      pgQuery("select * from people"),
      pgQuery("select * from users"),
    ]);
    const userDocument = userRows.rows[0];
    if (!userDocument) return null;
    const user = mapDbUser(mapPgUserRow(userDocument));
    const people = peopleRows.rows.map((row) => mapDbPerson(mapPgPersonRow(row)));
    const mappedUsers = allUserRows.rows.map((row) => mapDbUser(mapPgUserRow(row)));
    const usersByEmail = new Map(mappedUsers.map((candidate) => [normalizeEmail(candidate.email), candidate]));
    const person = findPersonForUser(user, people);
    const isAdmin = isAdminLikeRole(user.role) || isAdminLikePersonRole(person?.role);
    const adminVisiblePersonIds = new Set(
      people
        .filter((candidate) => {
          const matchedUser = usersByEmail.get(normalizeEmail(candidate.email));
          return matchedUser ? isAdminLikeRole(matchedUser.role) : false;
        })
        .map((candidate) => candidate.id)
    );

    if (!person && !isAdmin) return null;

    const actorPerson: Person =
      person ?? {
        id: user.personId ?? `admin-${user.id}`,
        name: user.name,
        role: "Admin",
        email: user.email,
        imageURL: "/placeholder.svg",
        workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" },
        team: "all",
      };

    const isLeader =
      isAdmin ||
      user.role === "leader" ||
      user.role === "store_trainer" ||
      user.role === "store_manager" ||
      user.role === "store_lead" ||
      actorPerson.role.toLowerCase() === "leader";

    const userByPersonId = new Map<string, UserAccount>(
      mappedUsers
        .filter((candidate) => Boolean(candidate.personId))
        .map((candidate) => [candidate.personId as string, candidate])
    );
    const managedPersonIds = getManagedPersonIdsByHierarchy(user, actorPerson, people, userByPersonId);
    const teamMembers = people.filter((candidate) => managedPersonIds.has(candidate.id) || adminVisiblePersonIds.has(candidate.id));

    return { user, person: actorPerson, teamMembers, isLeader, isAdmin };
  }

  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);
  const [userDocument, peopleDocuments, userDocuments] = await Promise.all([
    db.collection<DbUser>("users").findOne({ _id: sessionUserId }),
    db.collection<DbPerson>("people").find({}).toArray(),
    db.collection<DbUser>("users").find({}).toArray()
  ]);

  if (!userDocument) {
    return null;
  }

  const user = mapDbUser(userDocument);
  const people = peopleDocuments.map(mapDbPerson);
  const mappedUsers = userDocuments.map(mapDbUser);
  const usersByEmail = new Map(mappedUsers.map((candidate) => [normalizeEmail(candidate.email), candidate]));
  const person = findPersonForUser(user, people);
  const isAdmin = isAdminLikeRole(user.role) || isAdminLikePersonRole(person?.role);
  const adminVisiblePersonIds = new Set(
    people
      .filter((candidate) => {
        const matchedUser = usersByEmail.get(normalizeEmail(candidate.email));
        return matchedUser ? isAdminLikeRole(matchedUser.role) : false;
      })
      .map((candidate) => candidate.id)
  );

  if (!person && !isAdmin) {
    return null;
  }

  const actorPerson: Person =
    person ?? {
      id: user.personId ?? `admin-${user.id}`,
      name: user.name,
      role: "Admin",
      email: user.email,
      imageURL: "/placeholder.svg",
      workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" },
      team: "all",
    };

  const isLeader =
    isAdmin ||
    user.role === "leader" ||
    user.role === "store_trainer" ||
    user.role === "store_manager" ||
    user.role === "store_lead" ||
    actorPerson.role.toLowerCase() === "leader";

  const userByPersonId = new Map<string, UserAccount>(
    mappedUsers
      .filter((candidate) => Boolean(candidate.personId))
      .map((candidate) => [candidate.personId as string, candidate])
  );
  const managedPersonIds = getManagedPersonIdsByHierarchy(user, actorPerson, people, userByPersonId);
  const teamMembers = people.filter((candidate) => managedPersonIds.has(candidate.id) || adminVisiblePersonIds.has(candidate.id));

  return {
    user,
    person: actorPerson,
    teamMembers,
    isLeader,
    isAdmin
  };
}

function canAccessPerson(actor: SessionActor, personId: string) {
  if (actor.isAdmin) {
    return true;
  }

  return actor.teamMembers.some((member) => member.id === personId);
}

function canManageTask(actor: SessionActor, task: DbTask) {
  if (actor.isAdmin) {
    return true;
  }

  if (actor.isLeader) {
    return canAccessPerson(actor, task.assigneeId);
  }

  return task.assigneeId === actor.person.id;
}

function canManageSchedules(actor: SessionActor) {
  return actor.isAdmin || actor.isLeader;
}

function canManageTests(actor: SessionActor) {
  if (actor.isAdmin) return true;
  if (actor.user.role === "leader" && actor.user.department === "Vận hành") return true;
  return actor.user.role === "store_trainer" && actor.user.department === "Cửa hàng";
}

function canManageLearningContent(actor: SessionActor) {
  if (actor.isAdmin) return true;
  if (actor.user.role === "leader" && actor.user.department === "Vận hành") return true;
  return actor.user.role === "store_trainer" && actor.user.department === "Cửa hàng";
}

function canViewTeamLearningReports(actor: SessionActor) {
  if (canManageLearningContent(actor)) return true;
  return (
    actor.user.department === "Cửa hàng" &&
    (actor.user.role === "store_manager" || actor.user.role === "store_lead")
  );
}

function canCreateDocuments(actor: SessionActor) {
  if (actor.isAdmin) return true;
  if (actor.user.role === "leader") return true;
  return actor.user.role === "store_trainer" && actor.user.department === "Cửa hàng";
}

function isAdminLikePersonRole(role: string | null | undefined) {
  const normalizedRole = normalizeIdentityValue(role ?? "");
  return normalizedRole.includes("admin") || normalizedRole.includes("ceo");
}

function isStorePerson(person: Person) {
  const normalizedRole = normalizeIdentityValue(person.role);
  return (
    person.team === "store" ||
    normalizedRole.includes("cửa hàng") ||
    normalizedRole.includes("cua hang")
  );
}

function isStoreTechnicianPerson(person: Person, roles?: Set<UserRole>) {
  if (roles?.has("store_technician")) return true;
  const normalizedRole = normalizeIdentityValue(person.role);
  return normalizedRole.includes("ky thuat vien") || normalizedRole.includes("kỹ thuật viên");
}

function isEmployeePerson(person: Person) {
  const normalizedRole = normalizeIdentityValue(person.role);
  return (
    !normalizedRole.includes("leader") &&
    !normalizedRole.includes("admin") &&
    !normalizedRole.includes("ceo") &&
    !normalizedRole.includes("trainer")
  );
}

function canPersonAccessDocument(
  person: Person,
  document: DbDocument,
  ownerTeamByPersonId: Map<string, string>,
  personRolesByPersonId?: Map<string, Set<UserRole>>
) {
  const ownerTeam = ownerTeamByPersonId.get(document.ownerId);
  if (
    document.isLearningMaterial === true &&
    isStoreTechnicianPerson(person, personRolesByPersonId?.get(person.id)) &&
    ownerTeam === "store"
  ) {
    return true;
  }

  if (ownerTeam && person.team !== ownerTeam) {
    return false;
  }

  if (document.visibility === "specific") {
    return (document.visibleToPersonIds ?? []).includes(person.id);
  }
  if (document.visibility === "store") {
    return isStorePerson(person);
  }
  if (document.visibility === "office") {
    return !isStorePerson(person);
  }
  if (!ownerTeam) return true;
  return person.team === ownerTeam;
}

function canManageScheduleAttendees(actor: SessionActor, attendeeIds: string[]) {
  if (actor.isAdmin) {
    return true;
  }

  return attendeeIds.every((attendeeId) => canAccessPerson(actor, attendeeId));
}

function canViewSchedule(actor: SessionActor, schedule: DbSchedule) {
  if (actor.isAdmin) {
    return true;
  }

  if (actor.isLeader) {
    return canManageScheduleAttendees(actor, schedule.attendeeIds);
  }

  return schedule.attendeeIds.includes(actor.person.id);
}

export async function createLoginOtp(email: string) {
  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(email);

    const userRes = await pgQuery("select * from users where email = $1 limit 1", [normalizedEmail]);
    const userRow = userRes.rows[0];
    if (!userRow) {
      const pendingApprovalRes = await pgQuery(
        "select id from role_approval_requests where email = $1 and status = 'pending' limit 1",
        [normalizedEmail]
      );
      if (pendingApprovalRes.rows[0]) {
        return { ok: false, message: "Tài khoản đã xác thực OTP và đang chờ admin gốc duyệt." };
      }
      return { ok: false, message: "Không tìm thấy tài khoản phù hợp." };
    }

    const user = mapDbUser(mapPgUserRow(userRow));
    if (!user.verified) {
      return { ok: false, message: "Tài khoản chưa xác minh email bằng OTP." };
    }

    const otp = `${randomInt(100000, 1000000)}`;
    const now = new Date();
    const payload: PendingLoginOtp = {
      _id: normalizedEmail as unknown as ObjectId,
      email: normalizedEmail,
      otp,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      createdAt: now.toISOString()
    };

    await pgQuery(
      `insert into pending_login_otps (id, email, otp, expires_at, created_at, raw_json)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::jsonb)
       on conflict (id) do update
       set email = excluded.email,
           otp = excluded.otp,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at,
           raw_json = excluded.raw_json`,
      [
        normalizedEmail,
        normalizedEmail,
        otp,
        payload.expiresAt,
        payload.createdAt,
        JSON.stringify({
          email: payload.email,
          otp: payload.otp,
          expiresAt: payload.expiresAt,
          createdAt: payload.createdAt
        })
      ]
    );

    try {
      if (!isOtpEmailConfigured()) {
        if (process.env.OTP_DEBUG === "true") {
          return { ok: true, message: "OTP đăng nhập đã được tạo ở chế độ debug.", otp };
        }

        await pgQuery("delete from pending_login_otps where id = $1", [normalizedEmail]);
        return { ok: false, message: "Chưa cấu hình SMTP để gửi OTP thật." };
      }

      await sendOtpEmail({
        email: normalizedEmail,
        name: user.name.trim(),
        otp
      });

      return { ok: true, message: "OTP đăng nhập đã được gửi tới email công ty." };
    } catch {
      await pgQuery("delete from pending_login_otps where id = $1", [normalizedEmail]);
      return { ok: false, message: "Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình SMTP." };
    }
  }

  const db = await getMongoDb();
  const normalizedEmail = normalizeEmail(email);

  const user = await db.collection<DbUser>("users").findOne({ email: normalizedEmail });
  if (!user) {
    const pendingApproval = await db.collection<DbRoleApprovalRequest>("role_approval_requests").findOne({
      email: normalizedEmail,
      status: "pending"
    });
    if (pendingApproval) {
      return { ok: false, message: "Tài khoản đã xác thực OTP và đang chờ admin gốc duyệt." };
    }

    return { ok: false, message: "Không tìm thấy tài khoản phù hợp." };
  }

  if (!user.verified) {
    return { ok: false, message: "Tài khoản chưa xác minh email bằng OTP." };
  }

  const otp = `${randomInt(100000, 1000000)}`;
  const now = new Date();
  const payload: PendingLoginOtp = {
    email: normalizedEmail,
    otp,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    createdAt: now.toISOString()
  };

  await db.collection<PendingLoginOtp>("pending_login_otps").updateOne(
    { email: normalizedEmail },
    { $set: payload },
    { upsert: true }
  );

  try {
    if (!isOtpEmailConfigured()) {
      if (process.env.OTP_DEBUG === "true") {
        return { ok: true, message: "OTP đăng nhập đã được tạo ở chế độ debug.", otp };
      }

      await db.collection<PendingLoginOtp>("pending_login_otps").deleteOne({ email: normalizedEmail });
      return { ok: false, message: "Chưa cấu hình SMTP để gửi OTP thật." };
    }

    await sendOtpEmail({
      email: normalizedEmail,
      name: user.name.trim(),
      otp
    });

    return { ok: true, message: "OTP đăng nhập đã được gửi tới email công ty." };
  } catch {
    await db.collection<PendingLoginOtp>("pending_login_otps").deleteOne({ email: normalizedEmail });
    return { ok: false, message: "Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình SMTP." };
  }
}

export async function createRegistrationOtp(input: {
  name: string;
  email: string;
  role: UserRole;
  department: Department;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
}) {
  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(input.email);

    const existingUserRes = await pgQuery("select id from users where email = $1 limit 1", [normalizedEmail]);
    if (existingUserRes.rows[0]) {
      return { ok: false, message: "Email này đã tồn tại." };
    }

    const existingApprovalRequestRes = await pgQuery(
      "select id from role_approval_requests where email = $1 and status = 'pending' limit 1",
      [normalizedEmail]
    );
    if (existingApprovalRequestRes.rows[0]) {
      return { ok: false, message: "Tài khoản này đang chờ admin gốc duyệt." };
    }

    const normalizedStoreRegion = input.storeRegion as StoreRegion | undefined;
    const normalizedStoreBranchIds = Array.from(
      new Set((input.storeBranchIds ?? []).map((value) => Number(value)).filter(Number.isFinite))
    );
    const normalizedStoreLeadUserId = input.storeLeadUserId?.trim() ?? "";

    if (input.department === "Cửa hàng") {
      const allowedStoreRoles = new Set<UserRole>(["store_trainer", "store_manager", "store_lead", "store_technician"]);
      if (!allowedStoreRoles.has(input.role)) {
        return { ok: false, message: "Phòng ban Cửa hàng chỉ cho phép 4 role: Trainer, Quản lí cửa hàng, Cửa hàng trưởng, Kỹ thuật viên." };
      }
      if (input.role === "store_technician") {
        if (!normalizedStoreLeadUserId) {
          return { ok: false, message: "Vui lòng chọn người quản lý (Cửa hàng trưởng hoặc Trainer)." };
        }
        const leadUserRes = await pgQuery("select * from users where id = $1 and verified = true limit 1", [normalizedStoreLeadUserId]);
        const leadRow = leadUserRes.rows[0];
        const leadUser = leadRow ? mapDbUser(mapPgUserRow(leadRow)) : null;
        const normalizedLeadRole = leadUser ? normalizeUserRole(leadUser.role) : null;
        if (!leadUser || (normalizedLeadRole !== "store_lead" && normalizedLeadRole !== "store_trainer") || leadUser.department !== "Cửa hàng") {
          return { ok: false, message: "Người quản lý đã chọn không hợp lệ." };
        }
        if (normalizedLeadRole === "store_lead" && (!leadUser.storeRegion || !leadUser.storeBranchIds || leadUser.storeBranchIds.length === 0)) {
          return { ok: false, message: "Cửa hàng trưởng chưa có cấu hình khu vực/chi nhánh." };
        }
      } else if (input.role !== "store_trainer") {
        if (!normalizedStoreRegion || !(STORE_REGIONS as readonly string[]).includes(normalizedStoreRegion)) {
          return { ok: false, message: "Vui lòng chọn khu vực hợp lệ." };
        }
        if (normalizedStoreBranchIds.length === 0) {
          return { ok: false, message: "Vui lòng chọn ít nhất 1 chi nhánh." };
        }
        if (!normalizedStoreBranchIds.every((branchId) => STORE_BRANCH_ID_SET.has(branchId))) {
          return { ok: false, message: "Danh sách chi nhánh không hợp lệ." };
        }
        if (input.role !== "store_manager" && normalizedStoreBranchIds.length !== 1) {
          return { ok: false, message: "Role này chỉ được chọn đúng 1 chi nhánh." };
        }
      }
    } else if (
      input.role === "store_trainer" ||
      input.role === "store_manager" ||
      input.role === "store_lead" ||
      input.role === "store_technician"
    ) {
      return { ok: false, message: "Role cửa hàng chỉ áp dụng cho phòng ban Cửa hàng." };
    }

    const otp = `${randomInt(100000, 1000000)}`;
    const now = new Date();
    const payload: PendingRegistration = {
      _id: normalizedEmail as unknown as ObjectId,
      email: normalizedEmail,
      name: input.name.trim(),
      role: input.role,
      department: input.department,
      storeRegion:
        input.department === "Cửa hàng" && input.role !== "store_technician" && input.role !== "store_trainer"
          ? normalizedStoreRegion
          : undefined,
      storeBranchIds:
        input.department === "Cửa hàng" && input.role !== "store_technician" && input.role !== "store_trainer"
          ? normalizedStoreBranchIds
          : undefined,
      storeLeadUserId: input.department === "Cửa hàng" && input.role === "store_technician" ? normalizedStoreLeadUserId : undefined,
      otp,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
      createdAt: now.toISOString()
    };

    await pgQuery(
      `insert into pending_registrations (
        id, email, name, role, department, store_region, store_branch_ids, store_lead_user_id, otp, expires_at, created_at, raw_json
      ) values (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::timestamptz, $11::timestamptz, $12::jsonb
      )
      on conflict (id) do update set
        email = excluded.email,
        name = excluded.name,
        role = excluded.role,
        department = excluded.department,
        store_region = excluded.store_region,
        store_branch_ids = excluded.store_branch_ids,
        store_lead_user_id = excluded.store_lead_user_id,
        otp = excluded.otp,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at,
        raw_json = excluded.raw_json`,
      [
        normalizedEmail,
        normalizedEmail,
        payload.name,
        payload.role,
        payload.department,
        payload.storeRegion ?? null,
        JSON.stringify(payload.storeBranchIds ?? []),
        payload.storeLeadUserId ?? null,
        payload.otp,
        payload.expiresAt,
        payload.createdAt,
        JSON.stringify({
          email: payload.email,
          name: payload.name,
          role: payload.role,
          department: payload.department,
          storeRegion: payload.storeRegion,
          storeBranchIds: payload.storeBranchIds,
          storeLeadUserId: payload.storeLeadUserId,
          otp: payload.otp,
          expiresAt: payload.expiresAt,
          createdAt: payload.createdAt
        })
      ]
    );

    try {
      if (!isOtpEmailConfigured()) {
        if (process.env.OTP_DEBUG === "true") {
          return { ok: true, message: "OTP đã được tạo ở chế độ debug.", otp };
        }

        await pgQuery("delete from pending_registrations where id = $1", [normalizedEmail]);
        return { ok: false, message: "Chưa cấu hình SMTP để gửi OTP thật." };
      }

      await sendOtpEmail({
        email: normalizedEmail,
        name: input.name.trim(),
        otp
      });

      return { ok: true, message: "OTP đã được gửi tới email công ty." };
    } catch {
      await pgQuery("delete from pending_registrations where id = $1", [normalizedEmail]);
      return { ok: false, message: "Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình SMTP." };
    }
  }

  const db = await getMongoDb();
  const normalizedEmail = normalizeEmail(input.email);

  const existingUser = await db.collection<DbUser>("users").findOne({ email: normalizedEmail });
  if (existingUser) {
    return { ok: false, message: "Email này đã tồn tại." };
  }

  const existingApprovalRequest = await db.collection<DbRoleApprovalRequest>("role_approval_requests").findOne({
    email: normalizedEmail,
    status: "pending"
  });
  if (existingApprovalRequest) {
    return { ok: false, message: "Tài khoản này đang chờ admin gốc duyệt." };
  }

  const normalizedStoreRegion = input.storeRegion as StoreRegion | undefined;
  const normalizedStoreBranchIds = Array.from(
    new Set((input.storeBranchIds ?? []).map((value) => Number(value)).filter(Number.isFinite))
  );
  const normalizedStoreLeadUserId = input.storeLeadUserId?.trim() ?? "";

  if (input.department === "Cửa hàng") {
    const allowedStoreRoles = new Set<UserRole>(["store_trainer", "store_manager", "store_lead", "store_technician"]);
    if (!allowedStoreRoles.has(input.role)) {
      return { ok: false, message: "Phòng ban Cửa hàng chỉ cho phép 4 role: Trainer, Quản lí cửa hàng, Cửa hàng trưởng, Kỹ thuật viên." };
    }
    if (input.role === "store_technician") {
      if (!normalizedStoreLeadUserId) {
        return { ok: false, message: "Vui lòng chọn người quản lý (Cửa hàng trưởng hoặc Trainer)." };
      }
      const leadUser = await db.collection<DbUser>("users").findOne({ _id: normalizedStoreLeadUserId, verified: true });
      const normalizedLeadRole = leadUser ? normalizeUserRole(leadUser.role) : null;
      if (!leadUser || (normalizedLeadRole !== "store_lead" && normalizedLeadRole !== "store_trainer") || leadUser.department !== "Cửa hàng") {
        return { ok: false, message: "Người quản lý đã chọn không hợp lệ." };
      }
      if (normalizedLeadRole === "store_lead" && (!leadUser.storeRegion || !leadUser.storeBranchIds || leadUser.storeBranchIds.length === 0)) {
        return { ok: false, message: "Cửa hàng trưởng chưa có cấu hình khu vực/chi nhánh." };
      }
    } else if (input.role !== "store_trainer") {
      if (!normalizedStoreRegion || !(STORE_REGIONS as readonly string[]).includes(normalizedStoreRegion)) {
        return { ok: false, message: "Vui lòng chọn khu vực hợp lệ." };
      }
      if (normalizedStoreBranchIds.length === 0) {
        return { ok: false, message: "Vui lòng chọn ít nhất 1 chi nhánh." };
      }
      if (!normalizedStoreBranchIds.every((branchId) => STORE_BRANCH_ID_SET.has(branchId))) {
        return { ok: false, message: "Danh sách chi nhánh không hợp lệ." };
      }
      if (input.role !== "store_manager" && normalizedStoreBranchIds.length !== 1) {
        return { ok: false, message: "Role này chỉ được chọn đúng 1 chi nhánh." };
      }
    } else {
      // Trainer manages all store hierarchy across all branches/regions, no branch/region selection required.
    }
  } else if (
    input.role === "store_trainer" ||
    input.role === "store_manager" ||
    input.role === "store_lead" ||
    input.role === "store_technician"
  ) {
    return { ok: false, message: "Role cửa hàng chỉ áp dụng cho phòng ban Cửa hàng." };
  }

  const otp = `${randomInt(100000, 1000000)}`;
  const now = new Date();
  const payload: PendingRegistration = {
    email: normalizedEmail,
    name: input.name.trim(),
    role: input.role,
    department: input.department,
    storeRegion:
      input.department === "Cửa hàng" && input.role !== "store_technician" && input.role !== "store_trainer"
        ? normalizedStoreRegion
        : undefined,
    storeBranchIds:
      input.department === "Cửa hàng" && input.role !== "store_technician" && input.role !== "store_trainer"
        ? normalizedStoreBranchIds
        : undefined,
    storeLeadUserId: input.department === "Cửa hàng" && input.role === "store_technician" ? normalizedStoreLeadUserId : undefined,
    otp,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    createdAt: now.toISOString()
  };

  await db.collection<PendingRegistration>("pending_registrations").updateOne(
    { email: normalizedEmail },
    { $set: payload },
    { upsert: true }
  );

  try {
    if (!isOtpEmailConfigured()) {
      if (process.env.OTP_DEBUG === "true") {
        return { ok: true, message: "OTP đã được tạo ở chế độ debug.", otp };
      }

      await db.collection<PendingRegistration>("pending_registrations").deleteOne({ email: normalizedEmail });
      return { ok: false, message: "Chưa cấu hình SMTP để gửi OTP thật." };
    }

    await sendOtpEmail({
      email: normalizedEmail,
      name: input.name.trim(),
      otp
    });

    return { ok: true, message: "OTP đã được gửi tới email công ty." };
  } catch {
    await db.collection<PendingRegistration>("pending_registrations").deleteOne({ email: normalizedEmail });
    return { ok: false, message: "Không thể gửi OTP qua email. Vui lòng kiểm tra cấu hình SMTP." };
  }
}

export async function verifyRegistrationOtp(email: string, otp: string) {
  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(email);
    const pendingRes = await pgQuery("select * from pending_registrations where id = $1 limit 1", [normalizedEmail]);
    const pendingRow = pendingRes.rows[0];
    if (!pendingRow) {
      return { ok: false, message: "Không tìm thấy yêu cầu xác minh phù hợp." };
    }

    const pending: PendingRegistration = {
      _id: String(pendingRow.id) as unknown as ObjectId,
      email: String(pendingRow.email ?? normalizedEmail),
      name: String(pendingRow.name ?? ""),
      role: String(pendingRow.role ?? "employee") as UserRole,
      department: String(pendingRow.department ?? "Vận hành") as Department,
      storeRegion: pendingRow.store_region ? (String(pendingRow.store_region) as StoreRegion) : undefined,
      storeBranchIds: Array.isArray(pendingRow.store_branch_ids) ? (pendingRow.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
      storeLeadUserId: pendingRow.store_lead_user_id ? String(pendingRow.store_lead_user_id) : undefined,
      otp: String(pendingRow.otp ?? ""),
      expiresAt: toIsoStringOrUndefined(pendingRow.expires_at) ?? new Date(0).toISOString(),
      createdAt: toIsoStringOrUndefined(pendingRow.created_at) ?? new Date().toISOString()
    };

    if (Date.now() > new Date(pending.expiresAt).getTime()) {
      await pgQuery("delete from pending_registrations where id = $1", [normalizedEmail]);
      return { ok: false, message: "OTP đã hết hạn. Vui lòng gửi lại OTP." };
    }

    if (pending.otp !== otp.trim()) {
      return { ok: false, message: "OTP không chính xác." };
    }

    const now = new Date().toISOString();

    if (requiresApprovalRole(pending.role)) {
      const rootApproverRes = await pgQuery(
        `select * from users
         where verified = true and role in ('admin', 'ceo', 'boss')
         order by case when role = 'admin' then 0 else 1 end, created_at asc nulls last, id asc
         limit 1`
      );
      const rootApprover = rootApproverRes.rows[0] ? mapDbUser(mapPgUserRow(rootApproverRes.rows[0])) : null;

      const requestId = `approval_${normalizedEmail}`;
      await pgQuery(
        `insert into role_approval_requests (
          id, email, name, role, department, store_region, store_branch_ids, store_lead_user_id,
          status, approver_user_id, otp_verified_at, created_at, updated_at, raw_json
        ) values (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'pending', $9, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13::jsonb
        )
        on conflict (id) do update set
          email = excluded.email,
          name = excluded.name,
          role = excluded.role,
          department = excluded.department,
          store_region = excluded.store_region,
          store_branch_ids = excluded.store_branch_ids,
          store_lead_user_id = excluded.store_lead_user_id,
          status = excluded.status,
          approver_user_id = excluded.approver_user_id,
          otp_verified_at = excluded.otp_verified_at,
          updated_at = excluded.updated_at,
          raw_json = excluded.raw_json`,
        [
          requestId,
          normalizedEmail,
          pending.name,
          pending.role,
          pending.department,
          pending.storeRegion ?? null,
          JSON.stringify(pending.storeBranchIds ?? []),
          pending.storeLeadUserId ?? null,
          rootApprover?.id ?? null,
          now,
          now,
          now,
          JSON.stringify({
            email: normalizedEmail,
            name: pending.name,
            role: pending.role,
            department: pending.department,
            storeRegion: pending.storeRegion,
            storeBranchIds: pending.storeBranchIds,
            storeLeadUserId: pending.storeLeadUserId,
            status: "pending",
            approverUserId: rootApprover?.id,
            otpVerifiedAt: now,
            createdAt: now,
            updatedAt: now
          })
        ]
      );

      await pgQuery("delete from pending_registrations where id = $1", [normalizedEmail]);

      if (rootApprover && isOtpEmailConfigured()) {
        try {
          await sendRoleApprovalRequestEmail({
            to: rootApprover.email,
            requesterName: pending.name,
            requesterEmail: normalizedEmail,
            role: pending.role.toUpperCase(),
            department: pending.department
          });
        } catch {
          // Keep the approval request even if notification email fails.
        }
      }

      return {
        ok: true,
        requiresApproval: true,
        message: "OTP hợp lệ. Tài khoản đang chờ admin/CEO duyệt. Bạn sẽ nhận email khi được phê duyệt."
      };
    }

    const existingUserByEmail = await pgQuery("select id from users where email = $1 limit 1", [normalizedEmail]);
    if (existingUserByEmail.rows[0]) {
      return { ok: false, message: "Email này đã tồn tại." };
    }

    const nextUserId = `u-generated-${Date.now()}-${randomInt(1000, 9999)}`;
    const existingPersonRes = await pgQuery("select * from people where email = $1 limit 1", [normalizedEmail]);
    const existingPersonRow = existingPersonRes.rows[0];
    const teamId = mapDepartmentToTeamId(pending.department);
    const personId = existingPersonRow ? String(existingPersonRow.id) : `people_generated_${Date.now()}`;

    if (!existingPersonRow) {
      await pgQuery(
        `insert into people (id, name, role, email, image_url, team_id, working_hours, created_at, updated_at, raw_json)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, null, null, $8::jsonb)`,
        [
          personId,
          pending.name,
          mapRequestedRoleToDisplayRole(pending.role),
          normalizedEmail,
          "/placeholder.svg",
          teamId,
          JSON.stringify({ start: "09:00", end: "17:00", timezone: "UTC+7" }),
          JSON.stringify({
            name: pending.name,
            role: mapRequestedRoleToDisplayRole(pending.role),
            email: normalizedEmail,
            imageURL: "/placeholder.svg",
            teamId,
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" }
          })
        ]
      );
    }

    let resolvedStoreRegion = pending.storeRegion;
    let resolvedStoreBranchIds = pending.storeBranchIds ?? [];
    if (pending.department === "Cửa hàng" && pending.role === "store_technician" && pending.storeLeadUserId) {
      const leadUserRes = await pgQuery("select store_region, store_branch_ids from users where id = $1 and verified = true limit 1", [
        pending.storeLeadUserId
      ]);
      const lead = leadUserRes.rows[0];
      const leadBranchIds = Array.isArray(lead?.store_branch_ids) ? (lead.store_branch_ids as number[]).map((v) => Number(v)) : [];
      if (lead?.store_region && leadBranchIds.length > 0) {
        resolvedStoreRegion = String(lead.store_region) as StoreRegion;
        resolvedStoreBranchIds = leadBranchIds;
      }
    }

    await pgQuery(
      `insert into users (
        id, name, email, password, person_id, role, department, store_region, store_branch_ids, store_lead_user_id,
        verified, created_at, updated_at, raw_json
      ) values (
        $1, $2, $3, '', $4, $5, $6, $7, $8::jsonb, $9, true, $10::timestamptz, $11::timestamptz, $12::jsonb
      )`,
      [
        nextUserId,
        pending.name,
        normalizedEmail,
        personId,
        pending.role,
        pending.department,
        resolvedStoreRegion ?? null,
        JSON.stringify(resolvedStoreBranchIds),
        pending.storeLeadUserId ?? null,
        now,
        now,
        JSON.stringify({
          name: pending.name,
          email: normalizedEmail,
          password: "",
          personId,
          role: pending.role,
          department: pending.department,
          storeRegion: resolvedStoreRegion,
          storeBranchIds: resolvedStoreBranchIds,
          storeLeadUserId: pending.storeLeadUserId,
          verified: true,
          createdAt: now,
          updatedAt: now
        })
      ]
    );
    await pgQuery("delete from pending_registrations where id = $1", [normalizedEmail]);

    return {
      ok: true,
      user: mapDbUser({
        _id: nextUserId,
        name: pending.name,
        email: normalizedEmail,
        password: "",
        personId,
        role: pending.role,
        department: pending.department,
        storeRegion: resolvedStoreRegion,
        storeBranchIds: resolvedStoreBranchIds,
        storeLeadUserId: pending.storeLeadUserId,
        verified: true,
        createdAt: now,
        updatedAt: now
      })
    };
  }

  const db = await getMongoDb();
  const normalizedEmail = normalizeEmail(email);
  const pending = await db.collection<PendingRegistration>("pending_registrations").findOne({ email: normalizedEmail });

  if (!pending) {
    return { ok: false, message: "Không tìm thấy yêu cầu xác minh phù hợp." };
  }

  if (Date.now() > new Date(pending.expiresAt).getTime()) {
    await db.collection<PendingRegistration>("pending_registrations").deleteOne({ email: normalizedEmail });
    return { ok: false, message: "OTP đã hết hạn. Vui lòng gửi lại OTP." };
  }

  if (pending.otp !== otp.trim()) {
    return { ok: false, message: "OTP không chính xác." };
  }

  const now = new Date().toISOString();

  if (requiresApprovalRole(pending.role)) {
    const rootApprover = await getRootApprover(db);
    const approvalPayload: DbRoleApprovalRequest = {
      email: normalizedEmail,
      name: pending.name,
      role: pending.role,
      department: pending.department,
      storeRegion: pending.storeRegion,
      storeBranchIds: pending.storeBranchIds,
      storeLeadUserId: pending.storeLeadUserId,
      status: "pending",
      approverUserId: rootApprover?._id,
      otpVerifiedAt: now,
      createdAt: now,
      updatedAt: now
    };

    await db.collection<DbRoleApprovalRequest>("role_approval_requests").updateOne(
      { email: normalizedEmail, status: "pending" },
      { $set: approvalPayload },
      { upsert: true }
    );

    await db.collection<PendingRegistration>("pending_registrations").deleteOne({ email: normalizedEmail });

    if (rootApprover && isOtpEmailConfigured()) {
      try {
        await sendRoleApprovalRequestEmail({
          to: rootApprover.email,
          requesterName: pending.name,
          requesterEmail: normalizedEmail,
          role: pending.role.toUpperCase(),
          department: pending.department
        });
      } catch {
        // Keep the approval request even if notification email fails.
      }
    }

    return {
      ok: true,
      requiresApproval: true,
      message: "OTP hợp lệ. Tài khoản đang chờ admin/CEO duyệt. Bạn sẽ nhận email khi được phê duyệt."
    };
  }

  const newUser = await createApprovedUserFromRequest(db, pending);
  await db.collection<PendingRegistration>("pending_registrations").deleteOne({ email: normalizedEmail });

  return { ok: true, user: mapDbUser(newUser) };
}

export async function verifyLoginOtp(email: string, otp: string) {
  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(email);
    const pendingRes = await pgQuery("select * from pending_login_otps where id = $1 limit 1", [normalizedEmail]);
    const pendingRow = pendingRes.rows[0];
    if (!pendingRow) {
      return { ok: false, message: "Không tìm thấy yêu cầu đăng nhập phù hợp." };
    }

    const pending: PendingLoginOtp = {
      _id: String(pendingRow.id) as unknown as ObjectId,
      email: String(pendingRow.email ?? normalizedEmail),
      otp: String(pendingRow.otp ?? ""),
      expiresAt: toIsoStringOrUndefined(pendingRow.expires_at) ?? new Date(0).toISOString(),
      createdAt: toIsoStringOrUndefined(pendingRow.created_at) ?? new Date().toISOString()
    };

    if (Date.now() > new Date(pending.expiresAt).getTime()) {
      await pgQuery("delete from pending_login_otps where id = $1", [normalizedEmail]);
      return { ok: false, message: "OTP đã hết hạn. Vui lòng gửi lại OTP." };
    }

    if (pending.otp !== otp.trim()) {
      return { ok: false, message: "OTP không chính xác." };
    }

    const userRes = await pgQuery("select * from users where email = $1 and verified = true limit 1", [normalizedEmail]);
    await pgQuery("delete from pending_login_otps where id = $1", [normalizedEmail]);

    const userRow = userRes.rows[0];
    if (!userRow) {
      return { ok: false, message: "Tài khoản không còn khả dụng." };
    }

    return { ok: true, user: mapDbUser(mapPgUserRow(userRow)) };
  }

  const db = await getMongoDb();
  const normalizedEmail = normalizeEmail(email);
  const pending = await db.collection<PendingLoginOtp>("pending_login_otps").findOne({ email: normalizedEmail });

  if (!pending) {
    return { ok: false, message: "Không tìm thấy yêu cầu đăng nhập phù hợp." };
  }

  if (Date.now() > new Date(pending.expiresAt).getTime()) {
    await db.collection<PendingLoginOtp>("pending_login_otps").deleteOne({ email: normalizedEmail });
    return { ok: false, message: "OTP đã hết hạn. Vui lòng gửi lại OTP." };
  }

  if (pending.otp !== otp.trim()) {
    return { ok: false, message: "OTP không chính xác." };
  }

  const user = await db.collection<DbUser>("users").findOne({
    email: normalizedEmail,
    verified: true
  });

  await db.collection<PendingLoginOtp>("pending_login_otps").deleteOne({ email: normalizedEmail });

  if (!user) {
    return { ok: false, message: "Tài khoản không còn khả dụng." };
  }

  return { ok: true, user: mapDbUser(user) };
}

export async function getDirectory() {
  if (shouldUseSupabasePhaseA()) {
    const [peopleRows, teamsRows, userRows] = await Promise.all([
      pgQuery("select * from people order by name asc"),
      pgQuery("select * from company_teams where id = any($1::text[]) order by name asc", [supportedTeamIds]),
      pgQuery("select id, name, email, person_id, role, department, store_region, store_branch_ids, store_lead_user_id, verified from users where person_id is not null")
    ]);
    const mappedPeople = peopleRows.rows.map((row) => mapDbPerson(mapPgPersonRow(row)));
    const mappedUsers = userRows.rows.map((row) => mapDbUser(mapPgUserRow(row)));
    return {
      people: attachUserProfileToPeople(mappedPeople, mappedUsers),
      teams: teamsRows.rows.map((row) =>
        mapDbCompanyTeam({
          _id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          color: String(row.color ?? "#94a3b8"),
          memberIds: Array.isArray(row.member_ids) ? (row.member_ids as string[]) : []
        })
      )
    };
  }

  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);
  const [people, teams, users] = await Promise.all([
    db.collection<DbPerson>("people").find({}, { sort: { name: 1 } }).toArray(),
    db.collection<DbCompanyTeam>("company_teams").find(
      { _id: { $in: supportedTeamIds } },
      { sort: { name: 1 } }
    ).toArray(),
    db.collection<DbUser>("users").find({ personId: { $exists: true } }).toArray()
  ]);

  const mappedPeople = people.map(mapDbPerson);
  const mappedUsers = users.map(mapDbUser);
  return {
    people: attachUserProfileToPeople(mappedPeople, mappedUsers),
    teams: teams.map(mapDbCompanyTeam)
  };
}

type PersonMutationInput = {
  name: string;
  role: string;
  email: string;
  imageURL?: string;
  team: string;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
  storeManagerUserId?: string;
  workingHours: Person["workingHours"];
};

type SelfProfileMutationInput = {
  name: string;
  email: string;
  imageURL?: string;
  workingHours: Person["workingHours"];
};

async function requireAdminActor(sessionUserId?: string | null) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!actor.isAdmin) {
    throw new Error("Forbidden");
  }

  return actor;
}

async function requirePeopleManagerActor(sessionUserId?: string | null) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (actor.isAdmin || isStoreTrainerActor(actor) || isStoreManagerActor(actor)) {
    return actor;
  }

  throw new Error("Forbidden");
}

function canActorAssignStoreLead(actor: SessionActor, leadUser: UserAccount) {
  if (actor.isAdmin || isStoreTrainerActor(actor)) return true;
  if (!isStoreManagerActor(actor)) return false;

  const actorBranches = new Set(actor.user.storeBranchIds ?? []);
  return (leadUser.storeBranchIds ?? []).some((branchId) => actorBranches.has(branchId));
}

function assertCanAssignTechnicianStoreLead(actor: SessionActor, leadUser: UserAccount | null | undefined) {
  if (!leadUser || leadUser.role !== "store_lead" || leadUser.department !== "Cửa hàng" || !leadUser.verified) {
    throw new Error("Cửa hàng trưởng quản lí không hợp lệ.");
  }

  if (!canActorAssignStoreLead(actor, leadUser)) {
    throw new Error("Bạn không có quyền gán kỹ thuật viên cho cửa hàng trưởng này.");
  }
}

function canActorAssignStoreManager(actor: SessionActor, managerUser: UserAccount) {
  if (actor.isAdmin || isStoreTrainerActor(actor)) return true;
  return isStoreManagerActor(actor) && managerUser.id === actor.user.id;
}

function assertCanAssignStoreLeadManager(actor: SessionActor, managerUser: UserAccount | null | undefined) {
  if (!managerUser || managerUser.role !== "store_manager" || managerUser.department !== "Cửa hàng" || !managerUser.verified) {
    throw new Error("Quản lí cửa hàng phụ trách không hợp lệ.");
  }

  if (!canActorAssignStoreManager(actor, managerUser)) {
    throw new Error("Bạn không có quyền gán cửa hàng trưởng cho quản lí cửa hàng này.");
  }
}

function normalizeStoreLeadLocationInput(actor: SessionActor, input: Pick<PersonMutationInput, "storeRegion" | "storeBranchIds">) {
  const region = input.storeRegion?.trim() as StoreRegion | undefined;
  if (!region || !STORE_REGIONS.includes(region)) {
    throw new Error("Khu vực cửa hàng không hợp lệ.");
  }

  const branchIds = [...new Set(
    (input.storeBranchIds ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id))
  )];
  if (branchIds.length !== 1) {
    throw new Error("Vui lòng chọn 1 chi nhánh cho Cửa hàng trưởng.");
  }

  const branch = STORE_BRANCHES.find((item) => item.id === branchIds[0]);
  if (!branch || !STORE_BRANCH_ID_SET.has(branch.id) || branch.city !== region) {
    throw new Error("Chi nhánh không thuộc khu vực đã chọn.");
  }

  if (isStoreManagerActor(actor) && !branchIds.every((id) => (actor.user.storeBranchIds ?? []).includes(id))) {
    throw new Error("Bạn không có quyền gán Cửa hàng trưởng cho chi nhánh này.");
  }

  return { storeRegion: region, storeBranchIds: branchIds };
}

export async function createPersonRecord(
  sessionUserId: string | null | undefined,
  input: PersonMutationInput
) {
  const actor = await requirePeopleManagerActor(sessionUserId);

  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedRole = normalizePersonDisplayRole(input.role);

    if (!supportedPersonRoleSet.has(normalizedRole)) {
      throw new Error("Role hiển thị không hợp lệ.");
    }

    const [existingRes, teamRes] = await Promise.all([
      pgQuery("select id from people where email = $1 limit 1", [normalizedEmail]),
      pgQuery("select id from company_teams where id = $1 limit 1", [input.team]),
    ]);
    if (existingRes.rows[0]) throw new Error("Email nhân sự đã tồn tại.");
    if (!teamRes.rows[0]) throw new Error("Phòng ban không tồn tại.");

    if (isStoreTrainerActor(actor)) {
      if (input.team !== "store") throw new Error("Trainer chỉ được thêm nhân sự phòng ban Cửa hàng.");
      if (!canStoreTrainerManageDisplayRole(normalizedRole)) {
        throw new Error("Trainer chỉ được thêm Quản lí cửa hàng, Cửa hàng trưởng hoặc Kỹ thuật viên.");
      }
    }
    if (isStoreManagerActor(actor)) {
      if (input.team !== "store") throw new Error("Quản lí cửa hàng chỉ được thêm nhân sự phòng ban Cửa hàng.");
      if (!canStoreManagerManageDisplayRole(normalizedRole)) {
        throw new Error("Quản lí cửa hàng chỉ được thêm Cửa hàng trưởng hoặc Kỹ thuật viên.");
      }
    }
    const storeLeadLocation = input.team === "store" && normalizedRole === "Cửa hàng trưởng"
      ? normalizeStoreLeadLocationInput(actor, input)
      : null;
    const nextAuthRole = input.team === "store" ? mapStoreDisplayRoleToAuthRole(normalizedRole) : undefined;

    const now = new Date().toISOString();
    const personId = `people_generated_${Date.now()}`;
    const personDocument: DbPerson = {
      _id: personId,
      name: input.name.trim(),
      role: normalizedRole,
      email: normalizedEmail,
      imageURL: input.imageURL?.trim() || "/placeholder.svg",
      teamId: input.team,
      workingHours: input.workingHours
    };

    await pgQuery(
      `insert into people (id,name,role,email,image_url,team_id,working_hours,created_at,updated_at,raw_json)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9::timestamptz,$10::jsonb)`,
      [
        personDocument._id,
        personDocument.name,
        personDocument.role,
        personDocument.email,
        personDocument.imageURL,
        personDocument.teamId,
        JSON.stringify(personDocument.workingHours),
        now,
        now,
        JSON.stringify(personDocument)
      ]
    );
    await pgQuery(
      "update company_teams set member_ids = coalesce(member_ids,'[]'::jsonb) || to_jsonb($1::text) where id = $2 and not (coalesce(member_ids,'[]'::jsonb) @> to_jsonb(array[$1]::text[]))",
      [personId, input.team]
    );
    await pgQuery(
      `update users
       set person_id = $1,
           name = $2,
           department = $3,
           role = coalesce($8, role),
           store_region = coalesce($6, store_region),
           store_branch_ids = coalesce($7::jsonb, store_branch_ids),
           updated_at = $4::timestamptz
       where email = $5`,
      [
        personId,
        personDocument.name,
        mapTeamIdToDepartment(input.team),
        now,
        normalizedEmail,
        storeLeadLocation?.storeRegion ?? null,
        storeLeadLocation ? JSON.stringify(storeLeadLocation.storeBranchIds) : null,
        nextAuthRole ?? null
      ]
    );

    return mapDbPerson(personDocument);
  }

  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedRole = normalizePersonDisplayRole(input.role);

  if (!supportedPersonRoleSet.has(normalizedRole)) {
    throw new Error("Role hiển thị không hợp lệ.");
  }

  const existingPerson = await db.collection<DbPerson>("people").findOne({ email: normalizedEmail });
  if (existingPerson) {
    throw new Error("Email nhân sự đã tồn tại.");
  }

  const team = await db.collection<DbCompanyTeam>("company_teams").findOne({ _id: input.team });
  if (!team) {
    throw new Error("Phòng ban không tồn tại.");
  }

  if (isStoreTrainerActor(actor)) {
    if (input.team !== "store") {
      throw new Error("Trainer chỉ được thêm nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreTrainerManageDisplayRole(normalizedRole)) {
      throw new Error("Trainer chỉ được thêm Quản lí cửa hàng, Cửa hàng trưởng hoặc Kỹ thuật viên.");
    }
  }
  if (isStoreManagerActor(actor)) {
    if (input.team !== "store") {
      throw new Error("Quản lí cửa hàng chỉ được thêm nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreManagerManageDisplayRole(normalizedRole)) {
      throw new Error("Quản lí cửa hàng chỉ được thêm Cửa hàng trưởng hoặc Kỹ thuật viên.");
    }
  }
  const storeLeadLocation = input.team === "store" && normalizedRole === "Cửa hàng trưởng"
    ? normalizeStoreLeadLocationInput(actor, input)
    : null;
  const nextAuthRole = input.team === "store" ? mapStoreDisplayRoleToAuthRole(normalizedRole) : undefined;

  const personId = `people_generated_${Date.now()}`;
  const personDocument: DbPerson = {
    _id: personId,
    name: input.name.trim(),
    role: normalizedRole,
    email: normalizedEmail,
    imageURL: input.imageURL?.trim() || "/placeholder.svg",
    teamId: input.team,
    workingHours: input.workingHours
  };

  await db.collection<DbPerson>("people").insertOne(personDocument);
  await db.collection<DbCompanyTeam>("company_teams").updateOne(
    { _id: input.team },
    { $addToSet: { memberIds: personId } }
  );

  await db.collection<DbUser>("users").updateMany(
    { email: normalizedEmail },
    {
      $set: {
        personId,
        name: personDocument.name,
        department: mapTeamIdToDepartment(input.team),
        ...(nextAuthRole ? { role: nextAuthRole } : {}),
        ...(storeLeadLocation ? {
          storeRegion: storeLeadLocation.storeRegion,
          storeBranchIds: storeLeadLocation.storeBranchIds,
        } : {}),
        updatedAt: new Date().toISOString()
      }
    }
  );

  return mapDbPerson(personDocument);
}

export async function updatePersonRecord(
  sessionUserId: string | null | undefined,
  personId: string,
  updates: PersonMutationInput
) {
  const actor = await requirePeopleManagerActor(sessionUserId);

  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from people where id = $1 limit 1", [personId]);
    const existingRow = existingRes.rows[0];
    if (!existingRow) return null;
    const existingPerson = mapPgPersonRow(existingRow);

    const normalizedEmail = normalizeEmail(updates.email);
    const normalizedRole = normalizePersonDisplayRole(updates.role);
    if (!supportedPersonRoleSet.has(normalizedRole)) throw new Error("Role hiển thị không hợp lệ.");

    const [duplicateRes, teamRes] = await Promise.all([
      pgQuery("select id from people where email = $1 and id <> $2 limit 1", [normalizedEmail, personId]),
      pgQuery("select id from company_teams where id = $1 limit 1", [updates.team])
    ]);
    if (duplicateRes.rows[0]) throw new Error("Email nhân sự đã tồn tại.");
    if (!teamRes.rows[0]) throw new Error("Phòng ban không tồn tại.");

    if (isStoreTrainerActor(actor)) {
      if (!canAccessPerson(actor, personId)) throw new Error("Forbidden");
      if (existingPerson.teamId !== "store" || updates.team !== "store") throw new Error("Trainer chỉ được chỉnh nhân sự phòng ban Cửa hàng.");
      if (!canStoreTrainerManageDisplayRole(normalizedRole)) {
        throw new Error("Trainer chỉ được chỉnh role Quản lí cửa hàng, Cửa hàng trưởng hoặc Kỹ thuật viên.");
      }
    }
    if (isStoreManagerActor(actor)) {
      if (!canAccessPerson(actor, personId)) throw new Error("Forbidden");
      if (existingPerson.teamId !== "store" || updates.team !== "store") throw new Error("Quản lí cửa hàng chỉ được chỉnh nhân sự phòng ban Cửa hàng.");
      if (!canStoreManagerManageDisplayRole(normalizedRole)) {
        throw new Error("Quản lí cửa hàng chỉ được chỉnh role Cửa hàng trưởng hoặc Kỹ thuật viên.");
      }
    }
    const directStoreLeadLocation = updates.team === "store" && normalizedRole === "Cửa hàng trưởng" && updates.storeBranchIds !== undefined
      ? normalizeStoreLeadLocationInput(actor, updates)
      : null;
    const nextAuthRole = updates.team === "store" ? mapStoreDisplayRoleToAuthRole(normalizedRole) : undefined;
    let nextStoreLeadUser: UserAccount | null = null;
    if (updates.storeLeadUserId !== undefined) {
      const [targetUsersRes, leadUserRes] = await Promise.all([
        pgQuery("select * from users where person_id = $1 or email = $2", [personId, existingPerson.email]),
        pgQuery("select * from users where id = $1 limit 1", [updates.storeLeadUserId])
      ]);
      const targetUsers = targetUsersRes.rows.map((row) => mapDbUser(mapPgUserRow(row)));
      if (!targetUsers.some((targetUser) => targetUser.role === "store_technician")) {
        throw new Error("Chỉ được đổi cửa hàng trưởng quản lí cho tài khoản Kỹ thuật viên.");
      }
      nextStoreLeadUser = leadUserRes.rows[0] ? mapDbUser(mapPgUserRow(leadUserRes.rows[0])) : null;
      assertCanAssignTechnicianStoreLead(actor, nextStoreLeadUser);
    }
    let targetStoreLeadUser: UserAccount | null = null;
    let nextStoreManagerUser: UserAccount | null = null;
    if (updates.storeManagerUserId !== undefined) {
      const [targetUsersRes, managerUserRes] = await Promise.all([
        pgQuery("select * from users where person_id = $1 or email = $2", [personId, existingPerson.email]),
        pgQuery("select * from users where id = $1 limit 1", [updates.storeManagerUserId])
      ]);
      const targetUsers = targetUsersRes.rows.map((row) => mapDbUser(mapPgUserRow(row)));
      targetStoreLeadUser = targetUsers.find((targetUser) => targetUser.role === "store_lead") ?? null;
      if (!targetStoreLeadUser) {
        throw new Error("Chỉ được đổi quản lí cửa hàng phụ trách cho tài khoản Cửa hàng trưởng.");
      }
      nextStoreManagerUser = managerUserRes.rows[0] ? mapDbUser(mapPgUserRow(managerUserRes.rows[0])) : null;
      assertCanAssignStoreLeadManager(actor, nextStoreManagerUser);
    }

    const now = new Date().toISOString();
    await pgQuery(
      `update people
       set name=$1, role=$2, email=$3, image_url=$4, team_id=$5, working_hours=$6::jsonb, updated_at=$7::timestamptz
       where id=$8`,
      [
        updates.name.trim(),
        normalizedRole,
        normalizedEmail,
        updates.imageURL?.trim() || "/placeholder.svg",
        updates.team,
        JSON.stringify(updates.workingHours),
        now,
        personId
      ]
    );
    if (existingPerson.teamId !== updates.team) {
      await pgQuery(
        "update company_teams set member_ids = coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(member_ids,'[]'::jsonb)) v where v <> $1),'[]'::jsonb) where id = $2",
        [personId, existingPerson.teamId]
      );
      await pgQuery(
        "update company_teams set member_ids = coalesce(member_ids,'[]'::jsonb) || to_jsonb($1::text) where id = $2 and not (coalesce(member_ids,'[]'::jsonb) @> to_jsonb(array[$1]::text[]))",
        [personId, updates.team]
      );
    }
    await pgQuery(
      `update users
       set person_id=$1, name=$2, email=$3, department=$4, role=coalesce($7, role), updated_at=$5::timestamptz
       where person_id=$1 or email=$6`,
      [personId, updates.name.trim(), normalizedEmail, mapTeamIdToDepartment(updates.team), now, existingPerson.email, nextAuthRole ?? null]
    );
    if (nextStoreLeadUser) {
      await pgQuery(
        `update users
         set store_region=$2, store_branch_ids=$3::jsonb, store_lead_user_id=$4, updated_at=$5::timestamptz
         where person_id=$1`,
        [
          personId,
          nextStoreLeadUser.storeRegion ?? null,
          JSON.stringify(nextStoreLeadUser.storeBranchIds ?? []),
          nextStoreLeadUser.id,
          now
        ]
      );
    }
    if (targetStoreLeadUser && nextStoreManagerUser) {
      await pgQuery(
        `update users
         set store_region=$2, store_branch_ids=$3::jsonb, store_lead_user_id=null, updated_at=$4::timestamptz
         where id=$1`,
        [
          targetStoreLeadUser.id,
          nextStoreManagerUser.storeRegion ?? null,
          JSON.stringify(nextStoreManagerUser.storeBranchIds ?? []),
          now
        ]
      );
      await pgQuery(
        `update users
         set store_region=$2, store_branch_ids=$3::jsonb, updated_at=$4::timestamptz
         where store_lead_user_id=$1`,
        [
          targetStoreLeadUser.id,
          nextStoreManagerUser.storeRegion ?? null,
          JSON.stringify(nextStoreManagerUser.storeBranchIds ?? []),
          now
        ]
      );
    }
    if (directStoreLeadLocation) {
      const targetUsersRes = await pgQuery("select * from users where person_id = $1 or email = $2", [personId, existingPerson.email]);
      const targetStoreLeadUserForLocation = targetUsersRes.rows
        .map((row) => mapDbUser(mapPgUserRow(row)))
        .find((targetUser) => targetUser.role === "store_lead") ?? null;
      if (!targetStoreLeadUserForLocation) {
        throw new Error("Chỉ được cập nhật khu vực/chi nhánh cho tài khoản Cửa hàng trưởng.");
      }
      await pgQuery(
        `update users
         set store_region=$2, store_branch_ids=$3::jsonb, store_lead_user_id=null, updated_at=$4::timestamptz
         where id=$1`,
        [
          targetStoreLeadUserForLocation.id,
          directStoreLeadLocation.storeRegion,
          JSON.stringify(directStoreLeadLocation.storeBranchIds),
          now
        ]
      );
      await pgQuery(
        `update users
         set store_region=$2, store_branch_ids=$3::jsonb, updated_at=$4::timestamptz
         where store_lead_user_id=$1`,
        [
          targetStoreLeadUserForLocation.id,
          directStoreLeadLocation.storeRegion,
          JSON.stringify(directStoreLeadLocation.storeBranchIds),
          now
        ]
      );
    }

    const updatedRes = await pgQuery("select * from people where id = $1 limit 1", [personId]);
    return updatedRes.rows[0] ? mapDbPerson(mapPgPersonRow(updatedRes.rows[0])) : null;
  }

  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);
  const existingPerson = await db.collection<DbPerson>("people").findOne({ _id: personId });
  if (!existingPerson) {
    return null;
  }

  const normalizedEmail = normalizeEmail(updates.email);
  const normalizedRole = normalizePersonDisplayRole(updates.role);

  if (!supportedPersonRoleSet.has(normalizedRole)) {
    throw new Error("Role hiển thị không hợp lệ.");
  }

  const duplicatePerson = await db.collection<DbPerson>("people").findOne({
    email: normalizedEmail,
    _id: { $ne: personId }
  });
  if (duplicatePerson) {
    throw new Error("Email nhân sự đã tồn tại.");
  }

  const nextTeam = await db.collection<DbCompanyTeam>("company_teams").findOne({ _id: updates.team });
  if (!nextTeam) {
    throw new Error("Phòng ban không tồn tại.");
  }

  if (isStoreTrainerActor(actor)) {
    if (!canAccessPerson(actor, personId)) {
      throw new Error("Forbidden");
    }
    if (existingPerson.teamId !== "store" || updates.team !== "store") {
      throw new Error("Trainer chỉ được chỉnh nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreTrainerManageDisplayRole(normalizedRole)) {
      throw new Error("Trainer chỉ được chỉnh role Quản lí cửa hàng, Cửa hàng trưởng hoặc Kỹ thuật viên.");
    }
  }
  if (isStoreManagerActor(actor)) {
    if (!canAccessPerson(actor, personId)) {
      throw new Error("Forbidden");
    }
    if (existingPerson.teamId !== "store" || updates.team !== "store") {
      throw new Error("Quản lí cửa hàng chỉ được chỉnh nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreManagerManageDisplayRole(normalizedRole)) {
      throw new Error("Quản lí cửa hàng chỉ được chỉnh role Cửa hàng trưởng hoặc Kỹ thuật viên.");
    }
  }
  const directStoreLeadLocation = updates.team === "store" && normalizedRole === "Cửa hàng trưởng" && updates.storeBranchIds !== undefined
    ? normalizeStoreLeadLocationInput(actor, updates)
    : null;
  const nextAuthRole = updates.team === "store" ? mapStoreDisplayRoleToAuthRole(normalizedRole) : undefined;
  let nextStoreLeadUser: UserAccount | null = null;
  if (updates.storeLeadUserId !== undefined) {
    const [targetUsers, leadUserDocument] = await Promise.all([
      db.collection<DbUser>("users").find({ $or: [{ personId }, { email: existingPerson.email }] }).toArray(),
      db.collection<DbUser>("users").findOne({ _id: updates.storeLeadUserId })
    ]);
    const mappedTargetUsers = targetUsers.map(mapDbUser);
    if (!mappedTargetUsers.some((targetUser) => targetUser.role === "store_technician")) {
      throw new Error("Chỉ được đổi cửa hàng trưởng quản lí cho tài khoản Kỹ thuật viên.");
    }
    nextStoreLeadUser = leadUserDocument ? mapDbUser(leadUserDocument) : null;
    assertCanAssignTechnicianStoreLead(actor, nextStoreLeadUser);
  }
  let targetStoreLeadUser: UserAccount | null = null;
  let nextStoreManagerUser: UserAccount | null = null;
  if (updates.storeManagerUserId !== undefined) {
    const [targetUsers, managerUserDocument] = await Promise.all([
      db.collection<DbUser>("users").find({ $or: [{ personId }, { email: existingPerson.email }] }).toArray(),
      db.collection<DbUser>("users").findOne({ _id: updates.storeManagerUserId })
    ]);
    const mappedTargetUsers = targetUsers.map(mapDbUser);
    targetStoreLeadUser = mappedTargetUsers.find((targetUser) => targetUser.role === "store_lead") ?? null;
    if (!targetStoreLeadUser) {
      throw new Error("Chỉ được đổi quản lí cửa hàng phụ trách cho tài khoản Cửa hàng trưởng.");
    }
    nextStoreManagerUser = managerUserDocument ? mapDbUser(managerUserDocument) : null;
    assertCanAssignStoreLeadManager(actor, nextStoreManagerUser);
  }

  const nextPayload: Partial<DbPerson> = {
    name: updates.name.trim(),
    role: normalizedRole,
    email: normalizedEmail,
    imageURL: updates.imageURL?.trim() || "/placeholder.svg",
    teamId: updates.team,
    workingHours: updates.workingHours
  };

  await db.collection<DbPerson>("people").updateOne({ _id: personId }, { $set: nextPayload });

  if (existingPerson.teamId !== updates.team) {
    await db.collection<DbCompanyTeam>("company_teams").updateOne(
      { _id: existingPerson.teamId },
      { $pull: { memberIds: personId } }
    );
    await db.collection<DbCompanyTeam>("company_teams").updateOne(
      { _id: updates.team },
      { $addToSet: { memberIds: personId } }
    );
  }

  await db.collection<DbUser>("users").updateMany(
    {
      $or: [{ personId }, { email: existingPerson.email }]
    },
    {
      $set: {
        personId,
        name: updates.name.trim(),
        email: normalizedEmail,
        department: mapTeamIdToDepartment(updates.team),
        ...(nextAuthRole ? { role: nextAuthRole } : {}),
        updatedAt: new Date().toISOString()
      }
    }
  );
  if (nextStoreLeadUser) {
    await db.collection<DbUser>("users").updateMany(
      { personId },
      {
        $set: {
          storeRegion: nextStoreLeadUser.storeRegion,
          storeBranchIds: nextStoreLeadUser.storeBranchIds ?? [],
          storeLeadUserId: nextStoreLeadUser.id,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }
  if (targetStoreLeadUser && nextStoreManagerUser) {
    await db.collection<DbUser>("users").updateOne(
      { _id: targetStoreLeadUser.id },
      {
        $set: {
          storeRegion: nextStoreManagerUser.storeRegion,
          storeBranchIds: nextStoreManagerUser.storeBranchIds ?? [],
          updatedAt: new Date().toISOString()
        },
        $unset: { storeLeadUserId: "" }
      }
    );
    await db.collection<DbUser>("users").updateMany(
      { storeLeadUserId: targetStoreLeadUser.id },
      {
        $set: {
          storeRegion: nextStoreManagerUser.storeRegion,
          storeBranchIds: nextStoreManagerUser.storeBranchIds ?? [],
          updatedAt: new Date().toISOString()
        }
      }
    );
  }
  if (directStoreLeadLocation) {
    const targetUsers = await db.collection<DbUser>("users").find({ $or: [{ personId }, { email: existingPerson.email }] }).toArray();
    const targetStoreLeadUserForLocation = targetUsers.map(mapDbUser).find((targetUser) => targetUser.role === "store_lead") ?? null;
    if (!targetStoreLeadUserForLocation) {
      throw new Error("Chỉ được cập nhật khu vực/chi nhánh cho tài khoản Cửa hàng trưởng.");
    }
    await db.collection<DbUser>("users").updateOne(
      { _id: targetStoreLeadUserForLocation.id },
      {
        $set: {
          storeRegion: directStoreLeadLocation.storeRegion,
          storeBranchIds: directStoreLeadLocation.storeBranchIds,
          updatedAt: new Date().toISOString()
        },
        $unset: { storeLeadUserId: "" }
      }
    );
    await db.collection<DbUser>("users").updateMany(
      { storeLeadUserId: targetStoreLeadUserForLocation.id },
      {
        $set: {
          storeRegion: directStoreLeadLocation.storeRegion,
          storeBranchIds: directStoreLeadLocation.storeBranchIds,
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  const updatedPerson = await db.collection<DbPerson>("people").findOne({ _id: personId });
  return updatedPerson ? mapDbPerson(updatedPerson) : null;
}

export async function updateOwnProfile(
  sessionUserId: string | null | undefined,
  updates: SelfProfileMutationInput
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const normalizedEmail = normalizeEmail(updates.email);
    const duplicateRes = await pgQuery("select id from people where email = $1 and id <> $2 limit 1", [
      normalizedEmail,
      actor.person.id
    ]);
    if (duplicateRes.rows[0]) {
      throw new Error("Email nhân sự đã tồn tại.");
    }

    const existingRes = await pgQuery("select id from people where id = $1 limit 1", [actor.person.id]);
    if (!existingRes.rows[0]) {
      throw new Error("Không tìm thấy hồ sơ nhân sự.");
    }

    const now = new Date().toISOString();
    await pgQuery(
      `update people
       set name = $1, email = $2, image_url = $3, working_hours = $4::jsonb, updated_at = $5::timestamptz
       where id = $6`,
      [
        updates.name.trim(),
        normalizedEmail,
        updates.imageURL?.trim() || "/placeholder.svg",
        JSON.stringify(updates.workingHours),
        now,
        actor.person.id
      ]
    );

    await pgQuery(
      `update users
       set name = $1, email = $2, updated_at = $3::timestamptz
       where id = $4`,
      [updates.name.trim(), normalizedEmail, now, actor.user.id]
    );

    const updatedRes = await pgQuery("select * from people where id = $1 limit 1", [actor.person.id]);
    return updatedRes.rows[0] ? mapDbPerson(mapPgPersonRow(updatedRes.rows[0])) : null;
  }

  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);

  const existingPerson = await db.collection<DbPerson>("people").findOne({ _id: actor.person.id });
  if (!existingPerson) {
    throw new Error("Không tìm thấy hồ sơ nhân sự.");
  }

  const normalizedEmail = normalizeEmail(updates.email);

  const duplicatePerson = await db.collection<DbPerson>("people").findOne({
    email: normalizedEmail,
    _id: { $ne: actor.person.id }
  });
  if (duplicatePerson) {
    throw new Error("Email nhân sự đã tồn tại.");
  }

  await db.collection<DbPerson>("people").updateOne(
    { _id: actor.person.id },
    {
      $set: {
        name: updates.name.trim(),
        email: normalizedEmail,
        imageURL: updates.imageURL?.trim() || "/placeholder.svg",
        workingHours: updates.workingHours
      }
    }
  );

  await db.collection<DbUser>("users").updateOne(
    { _id: actor.user.id },
    {
      $set: {
        name: updates.name.trim(),
        email: normalizedEmail,
        updatedAt: new Date().toISOString()
      }
    }
  );

  const updatedPerson = await db.collection<DbPerson>("people").findOne({ _id: actor.person.id });
  return updatedPerson ? mapDbPerson(updatedPerson) : null;
}

export async function getPendingRoleApprovalRequests(sessionUserId: string | null | undefined) {
  if (shouldUseSupabasePhaseA()) {
    const rootApproverRes = await pgQuery(
      `select id from users
       where verified = true and role in ('admin', 'ceo', 'boss')
       order by case when role = 'admin' then 0 else 1 end, created_at asc nulls last, id asc
       limit 1`
    );
    const rootApproverId = rootApproverRes.rows[0] ? String(rootApproverRes.rows[0].id) : null;
    if (!rootApproverId || rootApproverId !== sessionUserId) {
      throw new Error("Forbidden");
    }

    const requestsRes = await pgQuery(
      "select * from role_approval_requests where status = 'pending' order by created_at desc"
    );

    return requestsRes.rows.map((row) =>
      mapRoleApprovalRequest({
        _id: String(row.id) as unknown as ObjectId,
        email: String(row.email ?? ""),
        name: String(row.name ?? ""),
        role: String(row.role ?? "employee") as UserRole,
        department: String(row.department ?? "Vận hành") as Department,
        storeRegion: row.store_region ? (String(row.store_region) as StoreRegion) : undefined,
        storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
        storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
        status: "pending",
        approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
        otpVerifiedAt: toIsoStringOrUndefined(row.otp_verified_at) ?? new Date().toISOString(),
        createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
        updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
        approvedAt: toIsoStringOrUndefined(row.approved_at),
        rejectedAt: toIsoStringOrUndefined(row.rejected_at)
      })
    );
  }

  const db = await getMongoDb();
  const rootApprover = await getRootApprover(db);
  if (!rootApprover || rootApprover._id !== sessionUserId) {
    throw new Error("Forbidden");
  }

  const requests = await db.collection<DbRoleApprovalRequest>("role_approval_requests").find(
    { status: "pending" },
    { sort: { createdAt: -1 } }
  ).toArray();

  return requests.map(mapRoleApprovalRequest);
}

export async function getRoleApprovalHistory(sessionUserId: string | null | undefined) {
  await requireAdminActor(sessionUserId);

  if (shouldUseSupabasePhaseA()) {
    const [requestsRes, pendingRes] = await Promise.all([
      pgQuery(
        "select * from role_approval_requests where status in ('pending', 'approved', 'rejected') order by updated_at desc nulls last, created_at desc nulls last"
      ),
      pgQuery("select * from pending_registrations order by created_at desc nulls last")
    ]);
    const requests = requestsRes.rows.map((row) =>
      mapRoleApprovalRequest({
        _id: String(row.id) as unknown as ObjectId,
        email: String(row.email ?? ""),
        name: String(row.name ?? ""),
        role: String(row.role ?? "employee") as UserRole,
        department: String(row.department ?? "Vận hành") as Department,
        storeRegion: row.store_region ? (String(row.store_region) as StoreRegion) : undefined,
        storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
        storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
        status: String(row.status ?? "pending") as "pending" | "approved" | "rejected",
        approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
        otpVerifiedAt: toIsoStringOrUndefined(row.otp_verified_at) ?? new Date().toISOString(),
        createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
        updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString(),
        approvedAt: toIsoStringOrUndefined(row.approved_at),
        rejectedAt: toIsoStringOrUndefined(row.rejected_at)
      })
    );
    const pendings = pendingRes.rows.map((row) =>
      mapPendingRegistration({
        _id: String(row.id) as unknown as ObjectId,
        email: String(row.email ?? ""),
        name: String(row.name ?? ""),
        role: String(row.role ?? "employee") as UserRole,
        department: String(row.department ?? "Vận hành") as Department,
        storeRegion: row.store_region ? (String(row.store_region) as StoreRegion) : undefined,
        storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
        storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
        otp: String(row.otp ?? ""),
        expiresAt: toIsoStringOrUndefined(row.expires_at) ?? new Date().toISOString(),
        createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString()
      })
    );
    return [...requests, ...pendings].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });
  }

  const db = await getMongoDb();
  const [requests, pendingRegistrations] = await Promise.all([
    db.collection<DbRoleApprovalRequest>("role_approval_requests").find(
      { status: { $in: ["pending", "approved", "rejected"] } },
      { sort: { updatedAt: -1, createdAt: -1 } }
    ).toArray(),
    db.collection<PendingRegistration>("pending_registrations").find(
      {},
      { sort: { createdAt: -1 } }
    ).toArray()
  ]);

  return [...requests.map(mapRoleApprovalRequest), ...pendingRegistrations.map(mapPendingRegistration)].sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });
}

export async function getUserNotifications(
  sessionUserId: string | null | undefined,
  options?: { limit?: number; unreadOnly?: boolean; cursor?: string }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  const limit = Math.min(100, Math.max(1, options?.limit ?? 30));

  if (shouldUseSupabasePhaseA()) {
    const conditions: string[] = ["person_id = $1"];
    const values: unknown[] = [actor.person.id];
    let idx = 2;
    if (options?.unreadOnly) {
      conditions.push("read_at is null");
    }
    if (options?.cursor) {
      conditions.push(`created_at < $${idx}::timestamptz`);
      values.push(options.cursor);
      idx += 1;
    }
    values.push(limit + 1);
    const recordsRes = await pgQuery(
      `select * from person_notifications
       where ${conditions.join(" and ")}
       order by created_at desc
       limit $${idx}`,
      values
    );
    const unreadRes = await pgQuery(
      "select count(*)::int as total from person_notifications where person_id = $1 and read_at is null",
      [actor.person.id]
    );

    const records = recordsRes.rows.map((row) => ({
      _id: String(row.id) as unknown as ObjectId,
      personId: String(row.person_id ?? ""),
      type: String(row.type ?? "learning.updated") as AppRealtimeEventType,
      actorId: String(row.actor_id ?? ""),
      action: row.action ? (String(row.action) as AppRealtimeEventAction) : undefined,
      entityType: row.entity_type ? (String(row.entity_type) as AppRealtimeEntityType) : undefined,
      entityLabel: row.entity_label ? String(row.entity_label) : undefined,
      threadId: row.thread_id ? String(row.thread_id) : undefined,
      projectId: row.project_id ? String(row.project_id) : undefined,
      scheduleId: row.schedule_id ? String(row.schedule_id) : undefined,
      entityId: row.entity_id ? String(row.entity_id) : undefined,
      messageId: row.message_id ? String(row.message_id) : undefined,
      targetPersonIds: Array.isArray(row.target_person_ids) ? (row.target_person_ids as string[]) : [],
      occurredAt: toIsoStringOrUndefined(row.occurred_at) ?? new Date().toISOString(),
      createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
      readAt: toIsoStringOrUndefined(row.read_at) ?? null
    }));
    const hasMore = records.length > limit;
    const visibleRecords = hasMore ? records.slice(0, limit) : records;
    const nextCursor = hasMore ? visibleRecords[visibleRecords.length - 1]?.createdAt ?? null : null;

    return {
      notifications: visibleRecords.map(mapDbNotification),
      hasMore,
      nextCursor,
      unreadCount: Number(unreadRes.rows[0]?.total ?? 0)
    };
  }

  const db = await getMongoDb();
  const filter: {
    personId: string;
    readAt?: null;
    createdAt?: { $lt: string };
  } = { personId: actor.person.id };

  if (options?.unreadOnly) {
    filter.readAt = null;
  }

  if (options?.cursor) {
    filter.createdAt = { $lt: options.cursor };
  }

  const [records, unreadCount] = await Promise.all([
    db
      .collection<DbPersonNotification>("person_notifications")
      .find(filter, { sort: { createdAt: -1 }, limit: limit + 1 })
      .toArray(),
    db.collection<DbPersonNotification>("person_notifications").countDocuments({
      personId: actor.person.id,
      readAt: null
    })
  ]);

  const hasMore = records.length > limit;
  const visibleRecords = hasMore ? records.slice(0, limit) : records;
  const nextCursor = hasMore ? visibleRecords[visibleRecords.length - 1]?.createdAt ?? null : null;

  return {
    notifications: visibleRecords.map(mapDbNotification),
    hasMore,
    nextCursor,
    unreadCount
  };
}

export async function markUserNotificationsAsRead(
  sessionUserId: string | null | undefined,
  notificationIds?: string[]
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const now = new Date().toISOString();
    if (!notificationIds || notificationIds.length === 0) {
      const result = await pgQuery(
        "update person_notifications set read_at = $1::timestamptz where person_id = $2 and read_at is null",
        [now, actor.person.id]
      );
      return { updatedCount: result.rowCount ?? 0 };
    }

    const uniqueIds = Array.from(new Set(notificationIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { updatedCount: 0 };
    }

    const result = await pgQuery(
      "update person_notifications set read_at = $1::timestamptz where person_id = $2 and read_at is null and id = any($3::text[])",
      [now, actor.person.id, uniqueIds]
    );
    return { updatedCount: result.rowCount ?? 0 };
  }

  const db = await getMongoDb();
  const now = new Date().toISOString();
  const baseFilter = { personId: actor.person.id, readAt: null as null };

  if (!notificationIds || notificationIds.length === 0) {
    const result = await db.collection<DbPersonNotification>("person_notifications").updateMany(baseFilter, {
      $set: { readAt: now }
    });
    return { updatedCount: result.modifiedCount };
  }

  const objectIds = notificationIds
    .map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter((id): id is ObjectId => Boolean(id));

  if (objectIds.length === 0) {
    return { updatedCount: 0 };
  }

  const result = await db.collection<DbPersonNotification>("person_notifications").updateMany(
    {
      ...baseFilter,
      _id: { $in: objectIds }
    },
    { $set: { readAt: now } }
  );

  return { updatedCount: result.modifiedCount };
}

export async function approveRoleApprovalRequest(sessionUserId: string | null | undefined, requestId: string) {
  if (shouldUseSupabasePhaseA()) {
    const rootApproverRes = await pgQuery(
      `select id from users
       where verified = true and role in ('admin', 'ceo', 'boss')
       order by case when role = 'admin' then 0 else 1 end, created_at asc nulls last, id asc
       limit 1`
    );
    const rootApproverId = rootApproverRes.rows[0] ? String(rootApproverRes.rows[0].id) : null;
    if (!rootApproverId || rootApproverId !== sessionUserId) {
      throw new Error("Forbidden");
    }

    const approvalRes = await pgQuery("select * from role_approval_requests where id = $1 and status = 'pending' limit 1", [requestId]);
    const row = approvalRes.rows[0];
    if (!row) {
      throw new Error("Approval request not found.");
    }
    const approvalRequest: DbRoleApprovalRequest = {
      _id: String(row.id) as unknown as ObjectId,
      email: String(row.email ?? ""),
      name: String(row.name ?? ""),
      role: String(row.role ?? "employee") as UserRole,
      department: String(row.department ?? "Vận hành") as Department,
      storeRegion: row.store_region ? (String(row.store_region) as StoreRegion) : undefined,
      storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
      storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
      status: "pending",
      approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
      otpVerifiedAt: toIsoStringOrUndefined(row.otp_verified_at) ?? new Date().toISOString(),
      createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString()
    };

    const existingUserRes = await pgQuery("select id from users where email = $1 limit 1", [approvalRequest.email]);
    if (existingUserRes.rows[0]) {
      throw new Error("Email này đã tồn tại.");
    }

    const now = new Date().toISOString();
    const nextUserId = `u-generated-${Date.now()}-${randomInt(1000, 9999)}`;
    const normalizedEmail = normalizeEmail(approvalRequest.email);
    const personRes = await pgQuery("select * from people where email = $1 limit 1", [normalizedEmail]);
    const personRow = personRes.rows[0];
    const personId = personRow ? String(personRow.id) : `people_generated_${Date.now()}`;
    if (!personRow) {
      const teamId = mapDepartmentToTeamId(approvalRequest.department);
      await pgQuery(
        `insert into people (id, name, role, email, image_url, team_id, working_hours, raw_json)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          personId,
          approvalRequest.name,
          mapRequestedRoleToDisplayRole(approvalRequest.role),
          normalizedEmail,
          "/placeholder.svg",
          teamId,
          JSON.stringify({ start: "09:00", end: "17:00", timezone: "UTC+7" }),
          JSON.stringify({
            name: approvalRequest.name,
            role: mapRequestedRoleToDisplayRole(approvalRequest.role),
            email: normalizedEmail,
            imageURL: "/placeholder.svg",
            teamId,
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" }
          })
        ]
      );
    }
    await pgQuery(
      `insert into users (
        id, name, email, password, person_id, role, department, store_region, store_branch_ids, store_lead_user_id,
        verified, created_at, updated_at, raw_json
      ) values (
        $1, $2, $3, '', $4, $5, $6, $7, $8::jsonb, $9, true, $10::timestamptz, $11::timestamptz, $12::jsonb
      )`,
      [
        nextUserId,
        approvalRequest.name,
        normalizedEmail,
        personId,
        approvalRequest.role,
        approvalRequest.department,
        approvalRequest.storeRegion ?? null,
        JSON.stringify(approvalRequest.storeBranchIds ?? []),
        approvalRequest.storeLeadUserId ?? null,
        now,
        now,
        JSON.stringify({
          name: approvalRequest.name,
          email: normalizedEmail,
          password: "",
          personId,
          role: approvalRequest.role,
          department: approvalRequest.department,
          storeRegion: approvalRequest.storeRegion,
          storeBranchIds: approvalRequest.storeBranchIds ?? [],
          storeLeadUserId: approvalRequest.storeLeadUserId,
          verified: true,
          createdAt: now,
          updatedAt: now
        })
      ]
    );

    await pgQuery(
      `update role_approval_requests
       set status = 'approved', updated_at = $1::timestamptz, approved_at = $1::timestamptz, approver_user_id = $2
       where id = $3`,
      [now, sessionUserId ?? approvalRequest.approverUserId ?? null, requestId]
    );

    if (isOtpEmailConfigured()) {
      try {
        await sendRoleApprovalGrantedEmail({
          to: approvalRequest.email,
          name: approvalRequest.name,
          role: approvalRequest.role.toUpperCase()
        });
      } catch {
        // Approval is already complete even if the email cannot be sent.
      }
    }

    return mapDbUser({
      _id: nextUserId,
      name: approvalRequest.name,
      email: normalizedEmail,
      password: "",
      personId,
      role: approvalRequest.role,
      department: approvalRequest.department,
      storeRegion: approvalRequest.storeRegion,
      storeBranchIds: approvalRequest.storeBranchIds ?? [],
      storeLeadUserId: approvalRequest.storeLeadUserId,
      verified: true,
      createdAt: now,
      updatedAt: now
    });
  }

  const db = await getMongoDb();
  const rootApprover = await getRootApprover(db);
  if (!rootApprover || rootApprover._id !== sessionUserId) {
    throw new Error("Forbidden");
  }

  const approvalRequest = await db.collection<DbRoleApprovalRequest>("role_approval_requests").findOne({
    _id: new ObjectId(requestId),
    status: "pending"
  });

  if (!approvalRequest) {
    throw new Error("Approval request not found.");
  }

  const existingUser = await db.collection<DbUser>("users").findOne({ email: approvalRequest.email });
  if (existingUser) {
    throw new Error("Email này đã tồn tại.");
  }

  const newUser = await createApprovedUserFromRequest(db, approvalRequest);
  const now = new Date().toISOString();

  await db.collection<DbRoleApprovalRequest>("role_approval_requests").updateOne(
    { _id: approvalRequest._id },
    {
      $set: {
        status: "approved",
        updatedAt: now,
        approvedAt: now,
        approverUserId: sessionUserId ?? approvalRequest.approverUserId
      }
    }
  );

  if (isOtpEmailConfigured()) {
    try {
      await sendRoleApprovalGrantedEmail({
        to: approvalRequest.email,
        name: approvalRequest.name,
        role: approvalRequest.role.toUpperCase()
      });
    } catch {
      // Approval is already complete even if the email cannot be sent.
    }
  }

  return mapDbUser(newUser);
}

export async function rejectRoleApprovalRequest(sessionUserId: string | null | undefined, requestId: string) {
  if (shouldUseSupabasePhaseA()) {
    const rootApproverRes = await pgQuery(
      `select id from users
       where verified = true and role in ('admin', 'ceo', 'boss')
       order by case when role = 'admin' then 0 else 1 end, created_at asc nulls last, id asc
       limit 1`
    );
    const rootApproverId = rootApproverRes.rows[0] ? String(rootApproverRes.rows[0].id) : null;
    if (!rootApproverId || rootApproverId !== sessionUserId) {
      throw new Error("Forbidden");
    }

    const approvalRes = await pgQuery("select * from role_approval_requests where id = $1 and status = 'pending' limit 1", [requestId]);
    const row = approvalRes.rows[0];
    if (!row) {
      throw new Error("Approval request not found.");
    }
    const approvalRequest: DbRoleApprovalRequest = {
      _id: String(row.id) as unknown as ObjectId,
      email: String(row.email ?? ""),
      name: String(row.name ?? ""),
      role: String(row.role ?? "employee") as UserRole,
      department: String(row.department ?? "Vận hành") as Department,
      storeRegion: row.store_region ? (String(row.store_region) as StoreRegion) : undefined,
      storeBranchIds: Array.isArray(row.store_branch_ids) ? (row.store_branch_ids as number[]).map((v) => Number(v)) : undefined,
      storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
      status: "pending",
      approverUserId: row.approver_user_id ? String(row.approver_user_id) : undefined,
      otpVerifiedAt: toIsoStringOrUndefined(row.otp_verified_at) ?? new Date().toISOString(),
      createdAt: toIsoStringOrUndefined(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIsoStringOrUndefined(row.updated_at) ?? new Date().toISOString()
    };

    const now = new Date().toISOString();
    await pgQuery(
      `update role_approval_requests
       set status = 'rejected', updated_at = $1::timestamptz, rejected_at = $1::timestamptz, approver_user_id = $2
       where id = $3`,
      [now, sessionUserId ?? approvalRequest.approverUserId ?? null, requestId]
    );

    if (isOtpEmailConfigured()) {
      try {
        await sendRoleApprovalRejectedEmail({
          to: approvalRequest.email,
          name: approvalRequest.name,
          role: approvalRequest.role.toUpperCase()
        });
      } catch {
        // Rejection should persist even if the email fails.
      }
    }

    return mapRoleApprovalRequest({
      ...approvalRequest,
      status: "rejected",
      updatedAt: now,
      rejectedAt: now,
      approverUserId: sessionUserId ?? approvalRequest.approverUserId
    });
  }

  const db = await getMongoDb();
  const rootApprover = await getRootApprover(db);
  if (!rootApprover || rootApprover._id !== sessionUserId) {
    throw new Error("Forbidden");
  }

  const approvalRequest = await db.collection<DbRoleApprovalRequest>("role_approval_requests").findOne({
    _id: new ObjectId(requestId),
    status: "pending"
  });

  if (!approvalRequest) {
    throw new Error("Approval request not found.");
  }

  const now = new Date().toISOString();
  await db.collection<DbRoleApprovalRequest>("role_approval_requests").updateOne(
    { _id: approvalRequest._id },
    {
      $set: {
        status: "rejected",
        updatedAt: now,
        rejectedAt: now,
        approverUserId: sessionUserId ?? approvalRequest.approverUserId
      }
    }
  );

  if (isOtpEmailConfigured()) {
    try {
      await sendRoleApprovalRejectedEmail({
        to: approvalRequest.email,
        name: approvalRequest.name,
        role: approvalRequest.role.toUpperCase()
      });
    } catch {
      // Rejection should persist even if the email fails.
    }
  }

  return mapRoleApprovalRequest({
    ...approvalRequest,
    status: "rejected",
    updatedAt: now,
    rejectedAt: now,
    approverUserId: sessionUserId ?? approvalRequest.approverUserId
  });
}

export async function deletePersonRecord(
  sessionUserId: string | null | undefined,
  personId: string
) {
  const actor = await requirePeopleManagerActor(sessionUserId);

  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from people where id = $1 limit 1", [personId]);
    const existingRow = existingRes.rows[0];
    if (!existingRow) return false;
    const existingPerson = mapPgPersonRow(existingRow);

    if (isStoreTrainerActor(actor)) {
      if (!canAccessPerson(actor, personId)) throw new Error("Forbidden");
      if (existingPerson.teamId !== "store") throw new Error("Trainer chỉ được xóa nhân sự phòng ban Cửa hàng.");
      if (!canStoreTrainerManageDisplayRole(existingPerson.role)) throw new Error("Trainer không thể xóa role này.");
    }
    if (isStoreManagerActor(actor)) {
      if (!canAccessPerson(actor, personId)) throw new Error("Forbidden");
      if (existingPerson.teamId !== "store") throw new Error("Quản lí cửa hàng chỉ được xóa nhân sự phòng ban Cửa hàng.");
      if (!canStoreManagerManageDisplayRole(existingPerson.role)) throw new Error("Quản lí cửa hàng không thể xóa role này.");
    }

    const threadRes = await pgQuery(
      "select id from chat_threads where coalesce(participant_ids,'[]'::jsonb) @> to_jsonb(array[$1]::text[])",
      [personId]
    );
    const threadIds = threadRes.rows.map((r) => String(r.id));

    await pgQuery("delete from people where id = $1", [personId]);
    await pgQuery(
      "update company_teams set member_ids = coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(member_ids,'[]'::jsonb)) v where v <> $1),'[]'::jsonb)",
      [personId]
    );
    await pgQuery(
      "update workspace_teams set member_ids = coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(member_ids,'[]'::jsonb)) v where v <> $1),'[]'::jsonb)",
      [personId]
    );
    await pgQuery("delete from tasks where assignee_id = $1", [personId]);
    await pgQuery("delete from documents where owner_id = $1", [personId]);
    await pgQuery("delete from users where person_id = $1 or email = $2", [personId, existingPerson.email]);

    if (threadIds.length > 0) {
      await pgQuery("delete from chat_messages where thread_id = any($1::text[])", [threadIds]);
      await pgQuery("delete from chat_threads where id = any($1::text[])", [threadIds]);
    }
    return true;
  }

  const db = await getMongoDb();
  const existingPerson = await db.collection<DbPerson>("people").findOne({ _id: personId });
  if (!existingPerson) {
    return false;
  }

  if (isStoreTrainerActor(actor)) {
    if (!canAccessPerson(actor, personId)) {
      throw new Error("Forbidden");
    }
    if (existingPerson.teamId !== "store") {
      throw new Error("Trainer chỉ được xóa nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreTrainerManageDisplayRole(existingPerson.role)) {
      throw new Error("Trainer không thể xóa role này.");
    }
  }
  if (isStoreManagerActor(actor)) {
    if (!canAccessPerson(actor, personId)) {
      throw new Error("Forbidden");
    }
    if (existingPerson.teamId !== "store") {
      throw new Error("Quản lí cửa hàng chỉ được xóa nhân sự phòng ban Cửa hàng.");
    }
    if (!canStoreManagerManageDisplayRole(existingPerson.role)) {
      throw new Error("Quản lí cửa hàng không thể xóa role này.");
    }
  }

  await db.collection<DbPerson>("people").deleteOne({ _id: personId });
  await db.collection<DbCompanyTeam>("company_teams").updateMany(
    {},
    { $pull: { memberIds: personId } }
  );
  await db.collection<DbWorkspaceTeam>("workspace_teams").updateMany(
    {},
    { $pull: { memberIds: personId } }
  );
  await db.collection<DbTask>("tasks").deleteMany({ assigneeId: personId });
  await db.collection<DbDocument>("documents").deleteMany({ ownerId: personId });
  await db.collection<DbUser>("users").deleteMany({
    $or: [{ personId }, { email: existingPerson.email }]
  });

  const threads = await db.collection<DbChatThread>("chat_threads").find(
    { participantIds: personId },
    { projection: { _id: 1 } }
  ).toArray();
  const threadIds = threads.map((thread) => thread._id);

  if (threadIds.length > 0) {
    await db.collection<DbChatMessage>("chat_messages").deleteMany({ threadId: { $in: threadIds } });
    await db.collection<DbChatThread>("chat_threads").deleteMany({ _id: { $in: threadIds } });
  }

  return true;
}

export async function getWorkspaceData(sessionUserId?: string | null) {
  const actor = await getSessionActor(sessionUserId);

  if (shouldUseSupabasePhaseA()) {
    const [projectsRes, tasksRes] = await Promise.all([
      pgQuery("select * from workspace_teams order by created_at asc nulls last"),
      pgQuery("select * from tasks order by task_number asc nulls last")
    ]);
    const projects = projectsRes.rows.map((row) => mapPgWorkspaceTeamRow(row));
    const tasks = tasksRes.rows.map((row) => mapPgTaskRow(row));

    const visibleProjects = actor
      ? actor.isAdmin
        ? projects
        : projects.filter((project) => project.memberIds.includes(actor.person.id))
      : [];
    const visibleProjectIds = new Set(visibleProjects.map((project) => project._id));
    const projectTasks = tasks.reduce<Record<string, TaskGroups>>((acc, task) => {
      const projectId = task.workspaceTeamId;
      if (!visibleProjectIds.has(projectId)) return acc;
      if (actor && !canManageTask(actor, task)) return acc;
      if (!acc[projectId]) acc[projectId] = createEmptyTaskGroups();
      acc[projectId][task.timePeriod].push(mapDbTask(task));
      return acc;
    }, {});

    return { projects: visibleProjects.map(mapDbWorkspaceTeam), projectTasks };
  }

  const db = await getMongoDb();
  const [projects, tasks] = await Promise.all([
    db.collection<DbWorkspaceTeam>("workspace_teams").find({}, { sort: { createdAt: 1 } }).toArray(),
    db.collection<DbTask>("tasks").find({}, { sort: { taskNumber: 1 } }).toArray()
  ]);

  const visibleProjects = actor
    ? actor.isAdmin
      ? projects
      : projects.filter((project) => project.memberIds.includes(actor.person.id))
    : [];
  const visibleProjectIds = new Set(visibleProjects.map((project) => project._id));

  const projectTasks = tasks.reduce<Record<string, TaskGroups>>((acc, task) => {
    const projectId = task.workspaceTeamId;
    if (!visibleProjectIds.has(projectId)) {
      return acc;
    }

    if (actor && !canManageTask(actor, task)) {
      return acc;
    }

    if (!acc[projectId]) {
      acc[projectId] = createEmptyTaskGroups();
    }

    acc[projectId][task.timePeriod].push(mapDbTask(task));
    return acc;
  }, {});

  return {
    projects: visibleProjects.map(mapDbWorkspaceTeam),
    projectTasks
  };
}

export async function createWorkspaceTeam(sessionUserId: string | null | undefined, input: Omit<Project, "id">) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  const validMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const normalizedMemberIds = Array.from(
    new Set(input.memberIds.filter((memberId) => validMemberIds.has(memberId)))
  );

  if (!actor.isAdmin && !normalizedMemberIds.includes(actor.person.id)) {
    normalizedMemberIds.unshift(actor.person.id);
  }

  const now = new Date().toISOString();
  const nextId = new ObjectId().toString();
  const document: DbWorkspaceTeam = {
    _id: nextId,
    name: input.name,
    color: input.color,
    memberIds: normalizedMemberIds,
    ownerId: actor.person.id,
    visibility: "team",
    createdAt: now,
    updatedAt: now
  };

  if (shouldUseSupabasePhaseA()) {
    await pgQuery(
      `insert into workspace_teams (id,name,slug,color,member_ids,owner_id,visibility,created_at,updated_at,raw_json)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::timestamptz,$9::timestamptz,$10::jsonb)`,
      [
        document._id,
        document.name,
        document.slug ?? null,
        document.color,
        JSON.stringify(document.memberIds),
        document.ownerId ?? null,
        document.visibility ?? null,
        document.createdAt ?? now,
        document.updatedAt ?? now,
        JSON.stringify(document),
      ]
    );
    return mapDbWorkspaceTeam(document);
  }

  const db = await getMongoDb();
  await db.collection<DbWorkspaceTeam>("workspace_teams").insertOne(document);
  return mapDbWorkspaceTeam(document);
}

export async function createWorkspaceTask(sessionUserId: string | null | undefined, input: {
  projectId: string;
  timePeriod: TimePeriod;
  name: string;
  assigneeId: string;
  status: Task["status"];
  executionPeriod: string;
  audience: string;
  weight: string;
  resultMethod: string;
  target: string;
  progress: number;
  kpis: string[];
  childGoal: string;
  parentGoal: string;
  description: string;
  attachments: TaskAttachment[];
}) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  let project: DbWorkspaceTeam | null = null;
  if (shouldUseSupabasePhaseA()) {
    const projectRes = await pgQuery("select * from workspace_teams where id = $1 limit 1", [input.projectId]);
    project = projectRes.rows[0] ? mapPgWorkspaceTeamRow(projectRes.rows[0]) : null;
  } else {
    const db = await getMongoDb();
    project = await db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: input.projectId });
  }
  if (!project || (!actor.isAdmin && !project.memberIds.includes(actor.person.id))) {
    throw new Error("Forbidden");
  }

  if (!actor.isLeader && !actor.isAdmin && input.assigneeId !== actor.person.id) {
    throw new Error("Forbidden");
  }

  if (!project.memberIds.includes(input.assigneeId) || !canAccessPerson(actor, input.assigneeId)) {
    throw new Error("Forbidden");
  }

  let nextTaskNumber = 1;
  if (shouldUseSupabasePhaseA()) {
    const maxTaskRes = await pgQuery("select coalesce(max(task_number), 0) as max_task_number from tasks");
    nextTaskNumber = Number(maxTaskRes.rows[0]?.max_task_number ?? 0) + 1;
  } else {
    const db = await getMongoDb();
    const maxTask = await db.collection<DbTask>("tasks").find({}, { sort: { taskNumber: -1 }, limit: 1 }).next();
    nextTaskNumber = (maxTask?.taskNumber ?? 0) + 1;
  }
  const now = new Date().toISOString();

  const document: DbTask = {
    _id: `task_${nextTaskNumber}`,
    taskNumber: nextTaskNumber,
    workspaceTeamId: input.projectId,
    timePeriod: input.timePeriod,
    name: input.name,
    comments: 0,
    likes: 0,
    assigneeId: input.assigneeId,
    status: input.status,
    statusColor: getStatusColor(input.status),
    executionPeriod: input.executionPeriod,
    audience: input.audience,
    weight: input.weight,
    resultMethod: input.resultMethod,
    target: input.target,
    progress: input.progress,
    kpis: input.kpis,
    childGoal: input.childGoal,
    parentGoal: input.parentGoal,
    description: input.description,
    attachments: input.attachments,
    createdAt: now,
    updatedAt: now
  };

  if (shouldUseSupabasePhaseA()) {
    await pgQuery(
      `insert into tasks (id,task_number,workspace_team_id,time_period,name,comments,likes,assignee_id,status,status_color,execution_period,audience,weight,result_method,target,progress,kpis,child_goal,parent_goal,description,attachments,created_at,updated_at,raw_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21::jsonb,$22::timestamptz,$23::timestamptz,$24::jsonb)`,
      [
        document._id,
        document.taskNumber,
        document.workspaceTeamId,
        document.timePeriod,
        document.name,
        document.comments,
        document.likes,
        document.assigneeId,
        document.status,
        document.statusColor,
        document.executionPeriod,
        document.audience,
        document.weight,
        document.resultMethod,
        document.target,
        document.progress,
        JSON.stringify(document.kpis ?? []),
        document.childGoal,
        document.parentGoal,
        document.description,
        JSON.stringify(document.attachments ?? []),
        document.createdAt ?? now,
        document.updatedAt ?? now,
        JSON.stringify(document),
      ]
    );
    return mapDbTask(document);
  }

  const db = await getMongoDb();
  await db.collection<DbTask>("tasks").insertOne(document);
  return mapDbTask(document);
}

export async function updateWorkspaceTask(
  sessionUserId: string | null | undefined,
  taskNumber: number,
  updates: Partial<Omit<Task, "id" | "projectId">>
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  let existingTask: DbTask | null = null;
  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from tasks where task_number = $1 limit 1", [taskNumber]);
    existingTask = existingRes.rows[0] ? mapPgTaskRow(existingRes.rows[0]) : null;
  } else {
    const db = await getMongoDb();
    existingTask = await db.collection<DbTask>("tasks").findOne({ taskNumber });
  }
  if (!existingTask || !canManageTask(actor, existingTask)) {
    return null;
  }

  if (!actor.isLeader && !actor.isAdmin && updates.assigneeId && updates.assigneeId !== actor.person.id) {
    throw new Error("Forbidden");
  }

  if (updates.assigneeId && !canAccessPerson(actor, updates.assigneeId)) {
    throw new Error("Forbidden");
  }

  const updatePayload: Partial<DbTask> = {};

  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.comments !== undefined) updatePayload.comments = updates.comments;
  if (updates.likes !== undefined) updatePayload.likes = updates.likes;
  if (updates.assigneeId !== undefined) updatePayload.assigneeId = updates.assigneeId;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  if (updates.statusColor !== undefined) updatePayload.statusColor = updates.statusColor;
  if (updates.executionPeriod !== undefined) updatePayload.executionPeriod = updates.executionPeriod;
  if (updates.audience !== undefined) updatePayload.audience = updates.audience;
  if (updates.weight !== undefined) updatePayload.weight = updates.weight;
  if (updates.resultMethod !== undefined) updatePayload.resultMethod = updates.resultMethod;
  if (updates.target !== undefined) updatePayload.target = updates.target;
  if (updates.progress !== undefined) updatePayload.progress = updates.progress;
  if (updates.kpis !== undefined) updatePayload.kpis = updates.kpis;
  if (updates.childGoal !== undefined) updatePayload.childGoal = updates.childGoal;
  if (updates.parentGoal !== undefined) updatePayload.parentGoal = updates.parentGoal;
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.attachments !== undefined) updatePayload.attachments = updates.attachments;

  if (updatePayload.status && !updatePayload.statusColor) {
    updatePayload.statusColor = getStatusColor(updatePayload.status);
  }

  updatePayload.updatedAt = new Date().toISOString();

  if (shouldUseSupabasePhaseA()) {
    const mergedTask: DbTask = {
      ...existingTask,
      ...updatePayload,
    };
    await pgQuery(
      `update tasks
       set name=$1,comments=$2,likes=$3,assignee_id=$4,status=$5,status_color=$6,execution_period=$7,audience=$8,weight=$9,result_method=$10,target=$11,progress=$12,kpis=$13::jsonb,child_goal=$14,parent_goal=$15,description=$16,attachments=$17::jsonb,updated_at=$18::timestamptz,raw_json=$19::jsonb
       where task_number = $20`,
      [
        mergedTask.name,
        mergedTask.comments,
        mergedTask.likes,
        mergedTask.assigneeId,
        mergedTask.status,
        mergedTask.statusColor,
        mergedTask.executionPeriod,
        mergedTask.audience,
        mergedTask.weight,
        mergedTask.resultMethod,
        mergedTask.target,
        mergedTask.progress,
        JSON.stringify(mergedTask.kpis ?? []),
        mergedTask.childGoal,
        mergedTask.parentGoal,
        mergedTask.description,
        JSON.stringify(mergedTask.attachments ?? []),
        mergedTask.updatedAt ?? new Date().toISOString(),
        JSON.stringify(mergedTask),
        taskNumber,
      ]
    );
    return mapDbTask(mergedTask);
  }

  const db = await getMongoDb();
  await db.collection<DbTask>("tasks").updateOne(
    { taskNumber },
    { $set: updatePayload }
  );

  const updatedTask = await db.collection<DbTask>("tasks").findOne({ taskNumber });
  return updatedTask ? mapDbTask(updatedTask) : null;
}

export async function getScheduleData(
  sessionUserId: string | null | undefined,
  projectId?: string | null
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  const normalizedProjectId = projectId?.trim() || "general";
  let schedules: DbSchedule[] = [];
  if (shouldUseSupabasePhaseA()) {
    const schedulesRes = await pgQuery(
      "select * from schedules where workspace_team_id = $1 order by date_key asc, start_time asc, created_at asc",
      [normalizedProjectId]
    );
    schedules = schedulesRes.rows.map((row) => mapPgScheduleRow(row));
  } else {
    const db = await getMongoDb();
    schedules = await db.collection<DbSchedule>("schedules").find(
      { workspaceTeamId: normalizedProjectId },
      { sort: { dateKey: 1, startTime: 1, createdAt: 1 } }
    ).toArray();
  }

  return schedules.filter((schedule) => canViewSchedule(actor, schedule)).map(mapDbSchedule);
}

export async function createScheduleRecord(
  sessionUserId: string | null | undefined,
  input: {
    projectId?: string | null;
    dateKey: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendeeIds: string[];
  }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canManageSchedules(actor)) {
    throw new Error("Forbidden");
  }

  const attendeeIds = Array.from(new Set(input.attendeeIds));
  if (attendeeIds.length === 0 || !canManageScheduleAttendees(actor, attendeeIds)) {
    throw new Error("Forbidden");
  }

  const normalizedProjectId = input.projectId?.trim() || "general";
  if (normalizedProjectId !== "general") {
    let resolvedProject: DbWorkspaceTeam | null = null;
    if (shouldUseSupabasePhaseA()) {
      const projectRes = await pgQuery("select * from workspace_teams where id = $1 limit 1", [normalizedProjectId]);
      resolvedProject = projectRes.rows[0] ? mapPgWorkspaceTeamRow(projectRes.rows[0]) : null;
    } else {
      const db = await getMongoDb();
      resolvedProject = await db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: normalizedProjectId });
    }
    const projectToCheck = resolvedProject;
    if (!projectToCheck || (!actor.isAdmin && !projectToCheck.memberIds.includes(actor.person.id))) {
      throw new Error("Forbidden");
    }
  }

  const now = new Date().toISOString();
  const document: DbSchedule = {
    _id: new ObjectId().toString(),
    workspaceTeamId: normalizedProjectId,
    dateKey: input.dateKey,
    title: input.title.trim(),
    description: input.description.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    attendeeIds,
    createdByPersonId: actor.person.id,
    createdAt: now,
    updatedAt: now
  };

  if (shouldUseSupabasePhaseA()) {
    await pgQuery(
      `insert into schedules (id,workspace_team_id,date_key,title,description,start_time,end_time,attendee_ids,created_by_person_id,created_at,updated_at,raw_json)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::timestamptz,$11::timestamptz,$12::jsonb)`,
      [
        document._id,
        document.workspaceTeamId,
        document.dateKey,
        document.title,
        document.description,
        document.startTime,
        document.endTime,
        JSON.stringify(document.attendeeIds),
        document.createdByPersonId,
        document.createdAt,
        document.updatedAt,
        JSON.stringify(document),
      ]
    );
    return mapDbSchedule(document);
  }

  const db = await getMongoDb();
  await db.collection<DbSchedule>("schedules").insertOne(document);
  return mapDbSchedule(document);
}

export async function updateScheduleRecord(
  sessionUserId: string | null | undefined,
  scheduleId: string,
  updates: {
    dateKey: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendeeIds: string[];
  }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canManageSchedules(actor)) {
    throw new Error("Forbidden");
  }

  let existing: DbSchedule | null = null;
  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from schedules where id = $1 limit 1", [scheduleId]);
    existing = existingRes.rows[0] ? mapPgScheduleRow(existingRes.rows[0]) : null;
  } else {
    const db = await getMongoDb();
    existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  }
  if (!existing || !canViewSchedule(actor, existing)) {
    throw new Error("Forbidden");
  }

  const attendeeIds = Array.from(new Set(updates.attendeeIds));
  if (attendeeIds.length === 0 || !canManageScheduleAttendees(actor, attendeeIds)) {
    throw new Error("Forbidden");
  }

  const updatedDocument: DbSchedule = {
    ...existing,
    dateKey: updates.dateKey,
    title: updates.title.trim(),
    description: updates.description.trim(),
    startTime: updates.startTime,
    endTime: updates.endTime,
    attendeeIds,
    updatedAt: new Date().toISOString(),
  };

  if (shouldUseSupabasePhaseA()) {
    await pgQuery(
      `update schedules
       set date_key=$1,title=$2,description=$3,start_time=$4,end_time=$5,attendee_ids=$6::jsonb,updated_at=$7::timestamptz,raw_json=$8::jsonb
       where id = $9`,
      [
        updatedDocument.dateKey,
        updatedDocument.title,
        updatedDocument.description,
        updatedDocument.startTime,
        updatedDocument.endTime,
        JSON.stringify(updatedDocument.attendeeIds),
        updatedDocument.updatedAt,
        JSON.stringify(updatedDocument),
        scheduleId,
      ]
    );
    return mapDbSchedule(updatedDocument);
  }

  const db = await getMongoDb();
  await db.collection<DbSchedule>("schedules").updateOne(
    { _id: scheduleId },
    {
      $set: {
        dateKey: updates.dateKey,
        title: updates.title.trim(),
        description: updates.description.trim(),
        startTime: updates.startTime,
        endTime: updates.endTime,
        attendeeIds,
        updatedAt: new Date().toISOString()
      }
    }
  );

  const updated = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  return updated ? mapDbSchedule(updated) : null;
}

export async function getScheduleRealtimeRecipients(
  sessionUserId: string | null | undefined,
  scheduleId: string
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  let existing: DbSchedule | null = null;
  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from schedules where id = $1 limit 1", [scheduleId]);
    existing = existingRes.rows[0] ? mapPgScheduleRow(existingRes.rows[0]) : null;
  } else {
    const db = await getMongoDb();
    existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  }
  if (!existing || !canViewSchedule(actor, existing)) {
    throw new Error("Forbidden");
  }

  const adminPersonIds = await getAdminRealtimePersonIds();

  return {
    personIds: Array.from(new Set([...existing.attendeeIds, existing.createdByPersonId, ...adminPersonIds])),
    projectId: existing.workspaceTeamId
  };
}

export async function deleteScheduleRecord(
  sessionUserId: string | null | undefined,
  scheduleId: string
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canManageSchedules(actor)) {
    throw new Error("Forbidden");
  }

  let existing: DbSchedule | null = null;
  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from schedules where id = $1 limit 1", [scheduleId]);
    existing = existingRes.rows[0] ? mapPgScheduleRow(existingRes.rows[0]) : null;
  } else {
    const db = await getMongoDb();
    existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  }
  if (!existing || !canViewSchedule(actor, existing)) {
    throw new Error("Forbidden");
  }

  if (shouldUseSupabasePhaseA()) {
    await pgQuery("delete from schedules where id = $1", [scheduleId]);
    return true;
  }

  const db = await getMongoDb();
  await db.collection<DbSchedule>("schedules").deleteOne({ _id: scheduleId });
  return true;
}

export async function getTestsData(sessionUserId: string | null | undefined) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canManageTests(actor)) {
    throw new Error("Forbidden");
  }

  if (shouldUseSupabasePhaseA()) {
    const recordsRes = await pgQuery("select * from tests order by created_at desc nulls last");
    return recordsRes.rows.map((row) => mapDbTest(mapPgTestRow(row)));
  }

  const db = await getMongoDb();
  const records = await db
    .collection<DbTest>("tests")
    .find({}, { sort: { createdAt: -1 } })
    .toArray();

  return records.map(mapDbTest);
}

export async function createTestRecord(
  sessionUserId: string | null | undefined,
  input: { title: string; description?: string; questions: string[]; durationMinutes: number }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canManageTests(actor)) {
    throw new Error("Forbidden");
  }

  const normalizedTitle = input.title.trim();
  const normalizedQuestions = (input.questions ?? [])
    .map((question) => question.trim())
    .filter((question) => question.length > 0);

  if (!normalizedTitle) {
    throw new Error("Tiêu đề bài kiểm tra là bắt buộc.");
  }

  if (normalizedQuestions.length === 0) {
    throw new Error("Cần ít nhất 1 câu hỏi.");
  }

  const durationMinutes = Number.isFinite(input.durationMinutes)
    ? Math.max(5, Math.floor(input.durationMinutes))
    : 30;

  const now = new Date().toISOString();
  const document: DbTest = {
    _id: `test_${Date.now()}`,
    title: normalizedTitle,
    description: input.description?.trim() ?? "",
    questions: normalizedQuestions,
    durationMinutes,
    createdByPersonId: actor.person.id,
    createdAt: now,
    updatedAt: now
  };

  if (shouldUseSupabasePhaseA()) {
    await pgQuery(
      `insert into tests (id,title,description,questions,duration_minutes,created_by_person_id,created_at,updated_at,raw_json)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7::timestamptz,$8::timestamptz,$9::jsonb)`,
      [
        document._id,
        document.title,
        document.description,
        JSON.stringify(document.questions),
        document.durationMinutes,
        document.createdByPersonId,
        document.createdAt,
        document.updatedAt,
        JSON.stringify(document),
      ]
    );
    return mapDbTest(document);
  }

  const db = await getMongoDb();
  await db.collection<DbTest>("tests").insertOne(document);
  return mapDbTest(document);
}

export async function getDocumentsData(sessionUserId?: string | null, folderId?: string | null) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) return [];

  if (shouldUseSupabasePhaseA()) {
    const [docsResult, peopleResult, usersResult] = await Promise.all([
      folderId === undefined
        ? pgQuery("select * from documents order by modified_at desc nulls last")
        : pgQuery("select * from documents where folder_id is not distinct from $1 order by modified_at desc nulls last", [folderId ?? null]),
      pgQuery("select id, team_id from people"),
      pgQuery("select id, person_id, role, department, store_lead_user_id from users"),
    ]);

    const allDocs = docsResult.rows.map((row) => mapPgDocumentRow(row));
    const personTeamMap = new Map(peopleResult.rows.map((row) => [String(row.id), String(row.team_id)]));
    const personRolesMap = new Map<string, Set<UserRole>>();
    for (const row of usersResult.rows) {
      const personId = row.person_id ? String(row.person_id) : "";
      if (!personId) continue;
      const roles = personRolesMap.get(personId) ?? new Set<UserRole>();
      roles.add(normalizeUserRole(String(row.role ?? "employee") as StoredUserRole));
      personRolesMap.set(personId, roles);
    }
    const ownerUserByPersonId = new Map<string, UserAccount>();
    for (const row of usersResult.rows) {
      const personId = row.person_id ? String(row.person_id) : "";
      if (!personId) continue;
      ownerUserByPersonId.set(personId, {
        id: String(row.id ?? ""),
        name: "",
        email: "",
        password: "",
        personId,
        role: normalizeUserRole(String(row.role ?? "employee") as StoredUserRole),
        department: (row.department as Department | undefined) ?? "Vận hành",
        storeRegion: undefined,
        storeBranchIds: [],
        storeLeadUserId: row.store_lead_user_id ? String(row.store_lead_user_id) : undefined,
        verified: true,
      });
    }
    return allDocs
      .filter((doc) => canActorViewDocument(actor, doc, personTeamMap, personRolesMap, ownerUserByPersonId))
      .map((doc) => {
        if (isDocumentLockedForActor(actor, doc)) {
          return mapDbDocument({
            ...doc,
            learningPlan: undefined,
            url: undefined,
            thumbnail: undefined,
          });
        }
        return mapDbDocument(doc);
      });
  }

  const db = await getMongoDb();

  const query: Record<string, unknown> = {};
  if (folderId !== undefined) query.folderId = folderId ?? null;

  const [allDocs, allPeople, allUsers] = await Promise.all([
    db.collection<DbDocument>("documents").find(query, { sort: { modifiedAt: -1 } }).toArray(),
    db.collection<DbPerson>("people").find().toArray(),
    db.collection<DbUser>("users").find({}, { projection: { personId: 1, role: 1 } }).toArray(),
  ]);

  const personTeamMap = new Map(allPeople.map((p) => [p._id, p.teamId]));
  const personRolesMap = new Map<string, Set<UserRole>>();
  const ownerUserByPersonId = new Map<string, UserAccount>();
  for (const user of allUsers) {
    if (!user.personId) continue;
    const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesMap.set(user.personId, roles);
    ownerUserByPersonId.set(user.personId, mapDbUser(user));
  }
  return allDocs
    .filter((doc) => canActorViewDocument(actor, doc, personTeamMap, personRolesMap, ownerUserByPersonId))
    .map((doc) => {
      if (isDocumentLockedForActor(actor, doc)) {
        return mapDbDocument({
          ...doc,
          learningPlan: undefined,
          url: undefined,
          thumbnail: undefined,
        });
      }
      return mapDbDocument(doc);
    });
}

export async function createDocumentRecord(
  sessionUserId: string | null | undefined,
  input: Partial<Document> & { name: string; type: Document["type"] }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) {
    throw new Error(
      `Forbidden: role=${actor.user.role}; department=${actor.user.department}; team=${actor.person.team}`
    );
  }
  const isAdminActor = actor.user.role === "admin" || actor.user.role === "ceo";

  if (shouldUseSupabasePhaseA()) {
    let normalizedVisibility: Document["visibility"] = input.visibility ?? "team";
    let normalizedVisibleToPersonIds: string[] = input.visibleToPersonIds ?? [];

    if (!isAdminActor) {
      const departmentPeople = await pgQuery("select id from people where team_id = $1", [actor.person.team]);
      const departmentPersonIdSet = new Set(departmentPeople.rows.map((row) => String(row.id)));
      normalizedVisibleToPersonIds = normalizedVisibleToPersonIds.filter((personId) => departmentPersonIdSet.has(personId));
      normalizedVisibility = normalizedVisibleToPersonIds.length > 0 ? "specific" : "team";
    }

    const now = new Date().toISOString();
    const normalizedDeadlineAt = normalizeOptionalIsoDate(input.deadlineAt);
    const rawNextDocument: DbDocument = {
      _id: `doc_${Date.now()}`,
      name: input.name,
      type: input.type,
      size: input.size ?? 0,
      ownerId: actor.person.id,
      createdAt: now,
      modifiedAt: now,
      folder: input.folder,
      folderId: input.folderId,
      tags: input.tags ?? [],
      isStarred: Boolean(input.isStarred),
      thumbnail: input.thumbnail ?? null,
      description: input.description,
      url: input.url,
      visibility: normalizedVisibility,
      visibleToPersonIds: normalizedVisibleToPersonIds,
      isLearningMaterial: Boolean(input.isLearningMaterial),
      learningPlan: input.learningPlan,
      deadlineAt: normalizedDeadlineAt,
    };
    const nextDocument = sanitizeForJson(rawNextDocument);

    await pgQuery(
      `insert into documents
      (id,name,type,size,owner_id,created_at,modified_at,folder,folder_id,tags,is_starred,thumbnail,description,url,visibility,visible_to_person_ids,is_learning_material,learning_plan,deadline_at,raw_json)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb,$19,$20::jsonb)`,
      [
        nextDocument._id, nextDocument.name, nextDocument.type, nextDocument.size, nextDocument.ownerId,
        nextDocument.createdAt, nextDocument.modifiedAt, nextDocument.folder ?? null, nextDocument.folderId ?? null,
        JSON.stringify(nextDocument.tags ?? []), nextDocument.isStarred, nextDocument.thumbnail ?? null,
        nextDocument.description ?? null, nextDocument.url ?? null, nextDocument.visibility ?? "team",
        JSON.stringify(nextDocument.visibleToPersonIds ?? []), nextDocument.isLearningMaterial ?? false,
        JSON.stringify(nextDocument.learningPlan ?? null), nextDocument.deadlineAt ?? null, JSON.stringify(nextDocument),
      ]
    );
    return mapDbDocument(nextDocument);
  }

  const db = await getMongoDb();

  let normalizedVisibility: Document["visibility"] = input.visibility ?? "team";
  let normalizedVisibleToPersonIds: string[] = input.visibleToPersonIds ?? [];

  if (!isAdminActor) {
    const departmentPeople = await db.collection<DbPerson>("people").find(
      { teamId: actor.person.team },
      { projection: { _id: 1 } }
    ).toArray();
    const departmentPersonIdSet = new Set(departmentPeople.map((person) => person._id));
    normalizedVisibleToPersonIds = normalizedVisibleToPersonIds.filter((personId) => departmentPersonIdSet.has(personId));
    normalizedVisibility = normalizedVisibleToPersonIds.length > 0 ? "specific" : "team";
  }

  const now = new Date().toISOString();
  const normalizedDeadlineAt = normalizeOptionalIsoDate(input.deadlineAt);
  const nextDocument: DbDocument = {
    _id: `doc_${Date.now()}`,
    name: input.name,
    type: input.type,
    size: input.size ?? 0,
    ownerId: actor.person.id,
    createdAt: now,
    modifiedAt: now,
    folder: input.folder,
    folderId: input.folderId,
    tags: input.tags ?? [],
    isStarred: Boolean(input.isStarred),
    thumbnail: input.thumbnail ?? null,
    description: input.description,
    url: input.url,
    visibility: normalizedVisibility,
    visibleToPersonIds: normalizedVisibleToPersonIds,
    isLearningMaterial: Boolean(input.isLearningMaterial),
    learningPlan: input.learningPlan,
    deadlineAt: normalizedDeadlineAt,
  };

  await db.collection<DbDocument>("documents").insertOne(nextDocument);
  return mapDbDocument(nextDocument);
}

export async function updateDocumentRecord(
  sessionUserId: string | null | undefined,
  documentId: string,
  updates: DocumentPatch
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  const isAdminActor = actor.user.role === "admin" || actor.user.role === "ceo";

  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select * from documents where id = $1 limit 1", [documentId]);
    const existingRow = existingRes.rows[0];
    if (!existingRow) return null;
    const existing = mapPgDocumentRow(existingRow);
    if (!canAccessPerson(actor, existing.ownerId)) return null;
    if (!actor.isLeader && !actor.isAdmin && existing.ownerId !== actor.person.id) return null;

    const payload: Partial<DbDocument> = { modifiedAt: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.folderId !== undefined) {
      if (updates.folderId) {
        const folderRes = await pgQuery("select * from document_folders where id = $1 limit 1", [updates.folderId]);
        const folderRow = folderRes.rows[0];
        if (!folderRow) throw new Error("Folder not found");
        const targetFolder = mapPgFolderRow(folderRow);
        if (!actor.isAdmin && targetFolder.teamId !== actor.person.team) throw new Error("Forbidden");
        payload.folderId = targetFolder._id;
        payload.folder = targetFolder.name;
      } else {
        payload.folderId = null;
        payload.folder = null;
      }
    } else if (updates.folder !== undefined) {
      payload.folder = updates.folder;
    }
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.isStarred !== undefined) payload.isStarred = updates.isStarred;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.thumbnail !== undefined) payload.thumbnail = updates.thumbnail;
    if (updates.isLearningMaterial !== undefined && canManageLearningContent(actor)) payload.isLearningMaterial = updates.isLearningMaterial;
    if (updates.learningPlan !== undefined && canManageLearningContent(actor)) payload.learningPlan = updates.learningPlan;
    if (updates.deadlineAt !== undefined) payload.deadlineAt = normalizeOptionalIsoDate(updates.deadlineAt);
    if (updates.isLocked !== undefined && canManageLearningContent(actor)) {
      payload.isLocked = Boolean(updates.isLocked);
      payload.lockedAt = payload.isLocked ? new Date().toISOString() : undefined;
      payload.lockedByUserId = payload.isLocked ? actor.user.id : undefined;
    }

    if (isAdminActor) {
      if (updates.visibility !== undefined) payload.visibility = updates.visibility;
      if (updates.visibleToPersonIds !== undefined) payload.visibleToPersonIds = updates.visibleToPersonIds;
    } else {
      let normalizedVisibleToPersonIds = updates.visibleToPersonIds ?? existing.visibleToPersonIds ?? [];
      const ownerRes = await pgQuery("select team_id from people where id = $1 limit 1", [existing.ownerId]);
      const ownerTeamId = ownerRes.rows[0]?.team_id ? String(ownerRes.rows[0].team_id) : actor.person.team;
      const departmentPeople = await pgQuery("select id from people where team_id = $1", [ownerTeamId]);
      const departmentPersonIdSet = new Set(departmentPeople.rows.map((row) => String(row.id)));
      normalizedVisibleToPersonIds = normalizedVisibleToPersonIds.filter((personId) => departmentPersonIdSet.has(personId));
      payload.visibility = normalizedVisibleToPersonIds.length > 0 ? "specific" : "team";
      payload.visibleToPersonIds = normalizedVisibleToPersonIds;
    }

    const merged: DbDocument = { ...existing, ...payload };
    await pgQuery(
      `update documents set
      name=$2,folder=$3,folder_id=$4,tags=$5::jsonb,is_starred=$6,thumbnail=$7,description=$8,url=$9,visibility=$10,visible_to_person_ids=$11::jsonb,is_learning_material=$12,learning_plan=$13::jsonb,deadline_at=$14,modified_at=$15,raw_json=$16::jsonb
      where id=$1`,
      [
        documentId, merged.name, merged.folder ?? null, merged.folderId ?? null, JSON.stringify(merged.tags ?? []),
        merged.isStarred ?? false, merged.thumbnail ?? null, merged.description ?? null, merged.url ?? null,
        merged.visibility ?? "team", JSON.stringify(merged.visibleToPersonIds ?? []), merged.isLearningMaterial ?? false,
        JSON.stringify(merged.learningPlan ?? null), merged.deadlineAt ?? null, merged.modifiedAt, JSON.stringify(merged),
      ]
    );
    return mapDbDocument(merged);
  }

  const db = await getMongoDb();
  const existing = await db.collection<DbDocument>("documents").findOne({ _id: documentId });
  if (!existing || !canAccessPerson(actor, existing.ownerId)) return null;
  if (!actor.isLeader && !actor.isAdmin && existing.ownerId !== actor.person.id) return null;

  const payload: Partial<DbDocument> = { modifiedAt: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.folderId !== undefined) {
    if (updates.folderId) {
      const targetFolder = await db.collection<DbFolder>("document_folders").findOne({ _id: updates.folderId });
      if (!targetFolder) throw new Error("Folder not found");
      if (!actor.isAdmin && targetFolder.teamId !== actor.person.team) throw new Error("Forbidden");
      payload.folderId = targetFolder._id;
      payload.folder = targetFolder.name;
    } else {
      payload.folderId = null;
      payload.folder = null;
    }
  } else if (updates.folder !== undefined) {
    payload.folder = updates.folder;
  }
  if (updates.tags !== undefined) payload.tags = updates.tags;
  if (updates.isStarred !== undefined) payload.isStarred = updates.isStarred;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.thumbnail !== undefined) payload.thumbnail = updates.thumbnail;
  if (updates.isLearningMaterial !== undefined && canManageLearningContent(actor)) {
    payload.isLearningMaterial = updates.isLearningMaterial;
  }
  if (updates.learningPlan !== undefined && canManageLearningContent(actor)) {
    payload.learningPlan = updates.learningPlan;
  }
  if (updates.deadlineAt !== undefined) {
    payload.deadlineAt = normalizeOptionalIsoDate(updates.deadlineAt);
  }
  if (updates.isLocked !== undefined && canManageLearningContent(actor)) {
    payload.isLocked = Boolean(updates.isLocked);
    payload.lockedAt = payload.isLocked ? new Date().toISOString() : undefined;
    payload.lockedByUserId = payload.isLocked ? actor.user.id : undefined;
  }
  if (isAdminActor) {
    if (updates.visibility !== undefined) payload.visibility = updates.visibility;
    if (updates.visibleToPersonIds !== undefined) payload.visibleToPersonIds = updates.visibleToPersonIds;
  } else {
    let normalizedVisibleToPersonIds = updates.visibleToPersonIds ?? existing.visibleToPersonIds ?? [];
    const owner = await db.collection<DbPerson>("people").findOne(
      { _id: existing.ownerId },
      { projection: { teamId: 1 } }
    );
    const ownerTeamId = owner?.teamId ?? actor.person.team;
    const departmentPeople = await db.collection<DbPerson>("people").find(
      { teamId: ownerTeamId },
      { projection: { _id: 1 } }
    ).toArray();
    const departmentPersonIdSet = new Set(departmentPeople.map((person) => person._id));
    normalizedVisibleToPersonIds = normalizedVisibleToPersonIds.filter((personId) => departmentPersonIdSet.has(personId));
    payload.visibility = normalizedVisibleToPersonIds.length > 0 ? "specific" : "team";
    payload.visibleToPersonIds = normalizedVisibleToPersonIds;
  }

  await db.collection<DbDocument>("documents").updateOne({ _id: documentId }, { $set: payload });
  const updated = await db.collection<DbDocument>("documents").findOne({ _id: documentId });
  return updated ? mapDbDocument(updated) : null;
}

export async function deleteDocumentRecord(sessionUserId: string | null | undefined, documentId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    const existingRes = await pgQuery("select owner_id from documents where id = $1 limit 1", [documentId]);
    const row = existingRes.rows[0];
    if (!row) return false;
    const ownerId = String(row.owner_id);
    if (!canAccessPerson(actor, ownerId)) return false;
    if (!actor.isLeader && !actor.isAdmin && ownerId !== actor.person.id) return false;
    await pgQuery("delete from documents where id = $1", [documentId]);
    return true;
  }

  const db = await getMongoDb();
  const existing = await db.collection<DbDocument>("documents").findOne({ _id: documentId });
  if (!existing || !canAccessPerson(actor, existing.ownerId)) return false;
  if (!actor.isLeader && !actor.isAdmin && existing.ownerId !== actor.person.id) return false;

  await db.collection<DbDocument>("documents").deleteOne({ _id: documentId });
  return true;
}

export async function getFoldersData(sessionUserId?: string | null) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) return [];

  if (shouldUseSupabasePhaseA()) {
    const query = actor.isAdmin
      ? "select * from document_folders order by created_at desc nulls last"
      : "select * from document_folders where team_id = $1 order by created_at desc nulls last";
    const result = actor.isAdmin ? await pgQuery(query) : await pgQuery(query, [actor.person.team]);
    return result.rows.map((row) => mapDbFolder(mapPgFolderRow(row)));
  }

  const db = await getMongoDb();
  const folderQuery = actor.isAdmin ? {} : { teamId: actor.person.team };
  const folders = await db
    .collection<DbFolder>("document_folders")
    .find(folderQuery, { sort: { createdAt: -1 } })
    .toArray();
  return folders.map(mapDbFolder);
}

export async function createFolderRecord(
  sessionUserId: string | null | undefined,
  input: { name: string; parentId?: string | null }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");
  const parentId = input.parentId?.trim() || undefined;
  const folderName = input.name.trim();

  if (!folderName) throw new Error("Folder name is required");

  if (shouldUseSupabasePhaseA()) {
    if (parentId) {
      const parentRes = await pgQuery("select * from document_folders where id = $1 limit 1", [parentId]);
      const parentRow = parentRes.rows[0];
      if (!parentRow) throw new Error("Parent folder not found");
      const parentFolder = mapPgFolderRow(parentRow);
      if (!actor.isAdmin && parentFolder.teamId !== actor.person.team) throw new Error("Forbidden");
    }

    const now = new Date().toISOString();
    const folder: DbFolder = {
      _id: `folder_${Date.now()}`,
      name: folderName,
      parentId,
      ownerId: actor.person.id,
      teamId: actor.person.team,
      createdAt: now,
      updatedAt: now
    };
    try {
      await pgQuery(
        "insert into document_folders (id,name,parent_id,owner_id,team_id,created_at,updated_at,raw_json) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [folder._id, folder.name, folder.parentId ?? null, folder.ownerId, folder.teamId, folder.createdAt, folder.updatedAt, JSON.stringify(folder)]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("parent_id")) throw error;
      await pgQuery(
        "insert into document_folders (id,name,owner_id,team_id,created_at,updated_at,raw_json) values ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [folder._id, folder.name, folder.ownerId, folder.teamId, folder.createdAt, folder.updatedAt, JSON.stringify(folder)]
      );
    }
    return mapDbFolder(folder);
  }

  const db = await getMongoDb();
  if (parentId) {
    const parentFolder = await db.collection<DbFolder>("document_folders").findOne({ _id: parentId });
    if (!parentFolder) throw new Error("Parent folder not found");
    if (!actor.isAdmin && parentFolder.teamId !== actor.person.team) throw new Error("Forbidden");
  }

  const now = new Date().toISOString();
  const folder: DbFolder = {
    _id: `folder_${Date.now()}`,
    name: folderName,
    parentId,
    ownerId: actor.person.id,
    teamId: actor.person.team,
    createdAt: now,
    updatedAt: now
  };

  await db.collection<DbFolder>("document_folders").insertOne(folder);
  return mapDbFolder(folder);
}

export async function updateFolderRecord(
  sessionUserId: string | null | undefined,
  folderId: string,
  input: { name: string }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");

  const folderName = input.name.trim();
  if (!folderName) throw new Error("Folder name is required");

  if (shouldUseSupabasePhaseA()) {
    const folderRes = await pgQuery("select * from document_folders where id = $1 limit 1", [folderId]);
    const row = folderRes.rows[0];
    if (!row) return null;
    const existing = mapPgFolderRow(row);
    if (!actor.isAdmin && existing.teamId !== actor.person.team) throw new Error("Forbidden");

    const updated: DbFolder = {
      ...existing,
      name: folderName,
      updatedAt: new Date().toISOString()
    };

    await pgQuery(
      "update document_folders set name = $2, updated_at = $3::timestamptz, raw_json = $4::jsonb where id = $1",
      [folderId, updated.name, updated.updatedAt, JSON.stringify(updated)]
    );
    await pgQuery("update documents set folder = $2 where folder_id = $1", [folderId, updated.name]);
    return mapDbFolder(updated);
  }

  const db = await getMongoDb();
  const existing = await db.collection<DbFolder>("document_folders").findOne({ _id: folderId });
  if (!existing) return null;
  if (!actor.isAdmin && existing.teamId !== actor.person.team) throw new Error("Forbidden");

  const updatedAt = new Date().toISOString();
  await db.collection<DbFolder>("document_folders").updateOne(
    { _id: folderId },
    { $set: { name: folderName, updatedAt } }
  );
  await db.collection<DbDocument>("documents").updateMany(
    { folderId },
    { $set: { folder: folderName } }
  );

  return mapDbFolder({ ...existing, name: folderName, updatedAt });
}

export async function deleteFolderRecord(sessionUserId: string | null | undefined, folderId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    const folderRes = await pgQuery("select * from document_folders where id = $1 limit 1", [folderId]);
    const row = folderRes.rows[0];
    if (!row) return false;
    const folder = mapPgFolderRow(row);
    if (!actor.isAdmin && folder.teamId !== actor.person.team) return false;

    const allFoldersRes = actor.isAdmin
      ? await pgQuery("select * from document_folders")
      : await pgQuery("select * from document_folders where team_id = $1", [actor.person.team]);
    const folders = allFoldersRes.rows.map((item) => mapPgFolderRow(item));
    const folderIdsToDelete = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of folders) {
        if (candidate.parentId && folderIdsToDelete.has(candidate.parentId) && !folderIdsToDelete.has(candidate._id)) {
          folderIdsToDelete.add(candidate._id);
          changed = true;
        }
      }
    }

    const ids = Array.from(folderIdsToDelete);
    await pgQuery("delete from document_folders where id = any($1::text[])", [ids]);
    await pgQuery("update documents set folder_id = null where folder_id = any($1::text[])", [ids]);
    return true;
  }

  const db = await getMongoDb();
  const folder = await db.collection<DbFolder>("document_folders").findOne({ _id: folderId });
  if (!folder) return false;
  if (!actor.isAdmin && folder.teamId !== actor.person.team) return false;

  const folderQuery = actor.isAdmin ? {} : { teamId: actor.person.team };
  const folders = await db.collection<DbFolder>("document_folders").find(folderQuery).toArray();
  const folderIdsToDelete = new Set<string>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of folders) {
      if (candidate.parentId && folderIdsToDelete.has(candidate.parentId) && !folderIdsToDelete.has(candidate._id)) {
        folderIdsToDelete.add(candidate._id);
        changed = true;
      }
    }
  }

  const ids = Array.from(folderIdsToDelete);
  await db.collection<DbFolder>("document_folders").deleteMany({ _id: { $in: ids } });
  await db.collection<DbDocument>("documents").updateMany(
    { folderId: { $in: ids } },
    { $unset: { folderId: "" } }
  );
  return true;
}

export async function getChatsForPerson(sessionUserId: string | null | undefined) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    return [];
  }

  const personId = actor.person.id;
  if (shouldUseSupabasePhaseA()) {
    const rawThreadsRes = await pgQuery(
      "select * from chat_threads where coalesce(participant_ids,'[]'::jsonb) @> to_jsonb(array[$1]::text[]) order by updated_at desc nulls last",
      [personId]
    );
    const visibleMemberIds = new Set(actor.teamMembers.map((member) => member.id));
    const threads = rawThreadsRes.rows
      .map((row) => mapPgChatThreadRow(row))
      .filter((thread) => thread.participantIds.every((participantId) => visibleMemberIds.has(participantId)));

    const threadIds = threads.map((thread) => thread._id);
    const messagesRes = threadIds.length
      ? await pgQuery("select * from chat_messages where thread_id = any($1::text[]) order by created_at asc", [threadIds])
      : { rows: [] as Record<string, unknown>[] };
    const messagesByThread = messagesRes.rows
      .map((row) => mapPgChatMessageRow(row))
      .reduce<Record<string, ChatMessageRecord[]>>((acc, message) => {
        const mappedMessage = mapDbChatMessage(message);
        acc[message.threadId] = [...(acc[message.threadId] ?? []), mappedMessage];
        return acc;
      }, {});

    return threads.map((thread) => ({
      id: thread._id,
      type: thread.type,
      participantIds: thread.participantIds,
      teamId: thread.teamId,
      lastMessage: thread.lastMessage,
      lastMessageAt: formatChatTimestamp(thread.lastMessageAt),
      messages: messagesByThread[thread._id] ?? []
    }));
  }

  const db = await getMongoDb();
  const rawThreads = await db.collection<DbChatThread>("chat_threads").find(
    { participantIds: personId },
    { sort: { updatedAt: -1 } }
  ).toArray();
  const visibleMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const threads = rawThreads.filter((thread) =>
    thread.participantIds.every((participantId) => visibleMemberIds.has(participantId))
  );

  const threadIds = threads.map((thread) => thread._id);
  const messages = await db.collection<DbChatMessage>("chat_messages").find(
    { threadId: { $in: threadIds } },
    { sort: { createdAt: 1 } }
  ).toArray();

  const messagesByThread = messages.reduce<Record<string, ChatMessageRecord[]>>((acc, message) => {
    const mappedMessage = mapDbChatMessage(message);
    acc[message.threadId] = [...(acc[message.threadId] ?? []), mappedMessage];
    return acc;
  }, {});

  return threads.map((thread) => ({
    id: thread._id,
    type: thread.type,
    participantIds: thread.participantIds,
    teamId: thread.teamId,
    lastMessage: thread.lastMessage,
    lastMessageAt: formatChatTimestamp(thread.lastMessageAt),
    messages: messagesByThread[thread._id] ?? []
  }));
}

export async function sendChatMessage({
  sessionUserId,
  threadId,
  senderId,
  content,
  type = "text",
  fileName,
  mimeType,
  fileSize
}: {
  sessionUserId: string | null | undefined;
  threadId: string;
  senderId: string;
  content: string;
  type?: "text" | "image" | "file";
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor || actor.person.id !== senderId) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const threadRes = await pgQuery("select * from chat_threads where id = $1 limit 1", [threadId]);
    const row = threadRes.rows[0];
    const thread = row ? mapPgChatThreadRow(row) : null;
    if (!thread || !thread.participantIds.includes(senderId) || !thread.participantIds.every((id) => canAccessPerson(actor, id))) {
      throw new Error("Forbidden");
    }
    const normalizedContent = content.trim();
    if (!normalizedContent) throw new Error("Message content is required.");
    if (type === "file" && !fileName) throw new Error("File name is required.");

    const now = new Date().toISOString();
    const messageId = `${threadId}_${Date.now()}`;
    const messageDocument: DbChatMessage = {
      _id: messageId,
      threadId,
      senderId,
      type,
      content: normalizedContent,
      fileName,
      mimeType,
      fileSize,
      status: "sent",
      createdAt: now
    };
    const lastMessagePreview =
      type === "image" ? "Da gui mot hinh anh" : type === "file" ? `Da gui tep: ${fileName ?? "file"}` : normalizedContent;

    await pgQuery(
      `insert into chat_messages
      (id,thread_id,sender_id,type,content,file_name,mime_type,file_size,status,created_at,raw_json)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::jsonb)`,
      [
        messageDocument._id, messageDocument.threadId, messageDocument.senderId, messageDocument.type, messageDocument.content,
        messageDocument.fileName ?? null, messageDocument.mimeType ?? null, messageDocument.fileSize ?? null, messageDocument.status,
        messageDocument.createdAt, JSON.stringify(messageDocument)
      ]
    );
    await pgQuery(
      "update chat_threads set last_message=$1,last_message_at=$2::timestamptz,updated_at=$2::timestamptz where id=$3",
      [lastMessagePreview, now, threadId]
    );
    return mapDbChatMessage(messageDocument);
  }

  const db = await getMongoDb();
  const thread = await db.collection<DbChatThread>("chat_threads").findOne({ _id: threadId });
  if (!thread || !thread.participantIds.includes(senderId) || !thread.participantIds.every((id) => canAccessPerson(actor, id))) {
    throw new Error("Forbidden");
  }

  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new Error("Message content is required.");
  }

  if (type === "file" && !fileName) {
    throw new Error("File name is required.");
  }

  const now = new Date().toISOString();
  const messageId = `${threadId}_${Date.now()}`;
  const messageDocument: DbChatMessage = {
    _id: messageId,
    threadId,
    senderId,
    type,
    content: normalizedContent,
    fileName,
    mimeType,
    fileSize,
    status: "sent",
    createdAt: now
  };

  const lastMessagePreview =
    type === "image"
      ? "Da gui mot hinh anh"
      : type === "file"
        ? `Da gui tep: ${fileName ?? "file"}`
        : normalizedContent;

  await db.collection<DbChatMessage>("chat_messages").insertOne(messageDocument);
  await db.collection<DbChatThread>("chat_threads").updateOne(
    { _id: threadId },
    {
      $set: {
        lastMessage: lastMessagePreview,
        lastMessageAt: now,
        updatedAt: now
      }
    }
  );

  return mapDbChatMessage(messageDocument);
}

export async function markChatThreadAsRead(sessionUserId: string | null | undefined, threadId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const threadRes = await pgQuery("select * from chat_threads where id = $1 limit 1", [threadId]);
    const row = threadRes.rows[0];
    const thread = row ? mapPgChatThreadRow(row) : null;
    if (!thread || !thread.participantIds.includes(actor.person.id)) throw new Error("Forbidden");
    await pgQuery(
      "update chat_messages set status='read' where thread_id = $1 and sender_id <> $2 and status <> 'read'",
      [threadId, actor.person.id]
    );
    return;
  }

  const db = await getMongoDb();
  const thread = await db.collection<DbChatThread>("chat_threads").findOne({ _id: threadId });
  if (!thread || !thread.participantIds.includes(actor.person.id)) {
    throw new Error("Forbidden");
  }

  await db.collection<DbChatMessage>("chat_messages").updateMany(
    { threadId, senderId: { $ne: actor.person.id }, status: { $ne: "read" } },
    { $set: { status: "read" } }
  );
}

export async function createOrGetChatThread(sessionUserId: string | null | undefined, teammateId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (!canAccessPerson(actor, teammateId) || teammateId === actor.person.id) {
    throw new Error("Forbidden");
  }

  if (shouldUseSupabasePhaseA()) {
    const participantIds = [actor.person.id, teammateId].sort();
    const threadId = participantIds.join("__");
    const now = new Date().toISOString();
    const existingRes = await pgQuery("select id from chat_threads where id = $1 limit 1", [threadId]);
    if (!existingRes.rows[0]) {
      const thread: DbChatThread = {
        _id: threadId,
        type: "individual",
        participantIds,
        teamId: actor.person.team,
        lastMessage: "",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now
      };
      await pgQuery(
        `insert into chat_threads
        (id,type,participant_ids,team_id,last_message,last_message_at,created_at,updated_at,raw_json)
        values ($1,$2,$3::jsonb,$4,$5,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9::jsonb)`,
        [thread._id, thread.type, JSON.stringify(thread.participantIds), thread.teamId, thread.lastMessage, thread.lastMessageAt, now, now, JSON.stringify(thread)]
      );
    }
    return threadId;
  }

  const db = await getMongoDb();
  const participantIds = [actor.person.id, teammateId].sort();
  const threadId = participantIds.join("__");
  const now = new Date().toISOString();

  await db.collection<DbChatThread>("chat_threads").updateOne(
    { _id: threadId },
    {
      $setOnInsert: {
        _id: threadId,
        type: "individual",
        participantIds,
        teamId: actor.person.team,
        lastMessage: "",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now
      }
    },
    { upsert: true }
  );

  return threadId;
}

export async function getChatThreadParticipantIds(sessionUserId: string | null | undefined, threadId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const threadRes = await pgQuery("select * from chat_threads where id = $1 limit 1", [threadId]);
    const row = threadRes.rows[0];
    const thread = row ? mapPgChatThreadRow(row) : null;
    if (!thread || !thread.participantIds.includes(actor.person.id) || !thread.participantIds.every((id) => canAccessPerson(actor, id))) {
      throw new Error("Forbidden");
    }
    return thread.participantIds;
  }

  const db = await getMongoDb();
  const thread = await db.collection<DbChatThread>("chat_threads").findOne({ _id: threadId });
  if (!thread || !thread.participantIds.includes(actor.person.id) || !thread.participantIds.every((id) => canAccessPerson(actor, id))) {
    throw new Error("Forbidden");
  }

  return thread.participantIds;
}

export async function getLearningQuiz(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<LearningQuizRecord | null> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    const result = await pgQuery("select * from learning_quizzes where document_id = $1 limit 1", [documentId]);
    const row = result.rows[0];
    if (!row) return null;
    const quiz = mapPgLearningQuizRow(row);
    const sanitize = !canManageLearningContent(actor);
    return mapDbLearningQuiz(quiz, sanitize);
  }

  const db = await getMongoDb();
  const quiz = await db.collection<DbLearningQuiz>("learning_quizzes").findOne({ documentId });
  if (!quiz) return null;

  const sanitize = !canManageLearningContent(actor);
  return mapDbLearningQuiz(quiz, sanitize);
}

export async function createLearningQuiz(
  sessionUserId: string | null | undefined,
  input: {
    documentId: string;
    title: string;
    description?: string;
    questions: Array<{ text: string; options: string[]; correctIndex: number; explanation?: string }>;
    durationMinutes: number;
    timePerQuestionSeconds?: number;
    deadlineAt?: string;
  }
): Promise<LearningQuizRecord> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canManageLearningContent(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    const existing = await pgQuery("select id from learning_quizzes where document_id = $1 limit 1", [input.documentId]);
    if (existing.rows[0]) throw new Error("Quiz đã tồn tại cho tài liệu này.");

    const now = new Date().toISOString();
    const normalizedDeadlineAt = normalizeOptionalIsoDate(input.deadlineAt);
    const record: DbLearningQuiz = {
      _id: `lquiz_${Date.now()}`,
      documentId: input.documentId,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      questions: input.questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correctIndex: q.correctIndex,
        explanation: q.explanation?.trim() ?? "",
      })),
      durationMinutes: Math.max(5, input.durationMinutes),
      timePerQuestionSeconds: input.timePerQuestionSeconds ? Math.max(5, Math.floor(input.timePerQuestionSeconds)) : undefined,
      deadlineAt: normalizedDeadlineAt,
      createdByPersonId: actor.person.id,
      createdAt: now,
      updatedAt: now,
    };
    await pgQuery(
      `insert into learning_quizzes
      (id,document_id,title,description,questions,duration_minutes,time_per_question_seconds,deadline_at,created_by_person_id,created_at,updated_at,raw_json)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        record._id, record.documentId, record.title, record.description ?? "", JSON.stringify(record.questions),
        record.durationMinutes, record.timePerQuestionSeconds ?? null, record.deadlineAt ?? null, record.createdByPersonId,
        record.createdAt, record.updatedAt, JSON.stringify(record),
      ]
    );
    return mapDbLearningQuiz(record, false);
  }

  const db = await getMongoDb();
  const existing = await db.collection<DbLearningQuiz>("learning_quizzes").findOne({ documentId: input.documentId });
  if (existing) throw new Error("Quiz đã tồn tại cho tài liệu này.");

  const now = new Date().toISOString();
  const normalizedDeadlineAt = normalizeOptionalIsoDate(input.deadlineAt);
  const record: DbLearningQuiz = {
    _id: `lquiz_${Date.now()}`,
    documentId: input.documentId,
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    questions: input.questions.map((q) => ({
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctIndex: q.correctIndex,
      explanation: q.explanation?.trim() ?? "",
    })),
    durationMinutes: Math.max(5, input.durationMinutes),
    timePerQuestionSeconds: input.timePerQuestionSeconds
      ? Math.max(5, Math.floor(input.timePerQuestionSeconds))
      : undefined,
    deadlineAt: normalizedDeadlineAt,
    createdByPersonId: actor.person.id,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<DbLearningQuiz>("learning_quizzes").insertOne(record);
  return mapDbLearningQuiz(record, false);
}

export async function updateLearningQuiz(
  sessionUserId: string | null | undefined,
  quizId: string,
  updates: {
    title?: string;
    description?: string;
    questions?: Array<{ text: string; options: string[]; correctIndex: number; explanation?: string }>;
    durationMinutes?: number;
    timePerQuestionSeconds?: number;
    deadlineAt?: string;
  }
): Promise<LearningQuizRecord | null> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canManageLearningContent(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    const currentRes = await pgQuery("select * from learning_quizzes where id = $1 limit 1", [quizId]);
    const row = currentRes.rows[0];
    if (!row) return null;
    const current = mapPgLearningQuizRow(row);
    const payload: Partial<DbLearningQuiz> = { updatedAt: new Date().toISOString() };
    if (updates.title) payload.title = updates.title.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.questions) {
      payload.questions = updates.questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correctIndex: q.correctIndex,
        explanation: q.explanation?.trim() ?? "",
      }));
    }
    if (updates.durationMinutes !== undefined) payload.durationMinutes = Math.max(5, updates.durationMinutes);
    if (updates.timePerQuestionSeconds !== undefined) payload.timePerQuestionSeconds = Math.max(5, Math.floor(updates.timePerQuestionSeconds));
    if (updates.deadlineAt !== undefined) payload.deadlineAt = normalizeOptionalIsoDate(updates.deadlineAt);
    const merged: DbLearningQuiz = { ...current, ...payload };
    await pgQuery(
      `update learning_quizzes set
      title=$2,description=$3,questions=$4::jsonb,duration_minutes=$5,time_per_question_seconds=$6,deadline_at=$7,updated_at=$8,raw_json=$9::jsonb
      where id=$1`,
      [
        quizId, merged.title, merged.description ?? "", JSON.stringify(merged.questions), merged.durationMinutes,
        merged.timePerQuestionSeconds ?? null, merged.deadlineAt ?? null, merged.updatedAt, JSON.stringify(merged),
      ]
    );
    return mapDbLearningQuiz(merged, false);
  }

  const db = await getMongoDb();
  const payload: Partial<DbLearningQuiz> = { updatedAt: new Date().toISOString() };
  if (updates.title) payload.title = updates.title.trim();
  if (updates.description !== undefined) payload.description = updates.description.trim();
  if (updates.questions) {
    payload.questions = updates.questions.map((q) => ({
      text: q.text.trim(),
      options: q.options.map((o) => o.trim()),
      correctIndex: q.correctIndex,
      explanation: q.explanation?.trim() ?? "",
    }));
  }
  if (updates.durationMinutes !== undefined) payload.durationMinutes = Math.max(5, updates.durationMinutes);
  if (updates.timePerQuestionSeconds !== undefined) {
    payload.timePerQuestionSeconds = Math.max(5, Math.floor(updates.timePerQuestionSeconds));
  }
  if (updates.deadlineAt !== undefined) {
    payload.deadlineAt = normalizeOptionalIsoDate(updates.deadlineAt);
  }

  await db.collection<DbLearningQuiz>("learning_quizzes").updateOne({ _id: quizId }, { $set: payload });
  const updated = await db.collection<DbLearningQuiz>("learning_quizzes").findOne({ _id: quizId });
  return updated ? mapDbLearningQuiz(updated, false) : null;
}

export async function deleteLearningQuiz(
  sessionUserId: string | null | undefined,
  quizId: string
): Promise<boolean> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canManageLearningContent(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    const result = await pgQuery("delete from learning_quizzes where id = $1", [quizId]);
    return (result.rowCount ?? 0) > 0;
  }

  const db = await getMongoDb();
  const result = await db.collection<DbLearningQuiz>("learning_quizzes").deleteOne({ _id: quizId });
  return result.deletedCount > 0;
}

export async function submitQuizAttempt(
  sessionUserId: string | null | undefined,
  documentId: string,
  answers: number[],
  startedAt: string
): Promise<QuizAttemptRecord> {
  const passScore = 90;
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (actor.user.role === "store_trainer") throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();

    const [latestAttemptRes, latestResetRes] = await Promise.all([
      pgQuery(
        "select submitted_at, score from quiz_attempts where document_id = $1 and person_id = $2 order by submitted_at desc nulls last limit 1",
        [documentId, actor.person.id]
      ),
      pgQuery(
        "select reset_at from quiz_attempt_resets where document_id = $1 and person_id = $2 order by reset_at desc nulls last limit 1",
        [documentId, actor.person.id]
      ),
    ]);
    const latestAttemptAt = toIsoStringOrUndefined(latestAttemptRes.rows[0]?.submitted_at);
    const latestAttemptScore = Number(latestAttemptRes.rows[0]?.score ?? 0);
    const latestResetAt = toIsoStringOrUndefined(latestResetRes.rows[0]?.reset_at);
    if (
      latestAttemptAt &&
      latestAttemptScore >= passScore &&
      (!latestResetAt || new Date(latestAttemptAt).getTime() > new Date(latestResetAt).getTime())
    ) {
      throw new Error("Bạn đã hoàn thành bài kiểm tra này rồi.");
    }

    const quizRes = await pgQuery("select * from learning_quizzes where document_id = $1 limit 1", [documentId]);
    const quizRow = quizRes.rows[0];
    if (!quizRow) throw new Error("Không tìm thấy bài kiểm tra.");
    const quiz = mapPgLearningQuizRow(quizRow);

    let correctAnswers = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (answers[i] === quiz.questions[i].correctIndex) correctAnswers++;
    }
    const score = quiz.questions.length > 0 ? Math.round((correctAnswers / quiz.questions.length) * 100) : 0;
    const now = new Date().toISOString();
    const attempt: DbQuizAttempt = {
      _id: `attempt_${Date.now()}`,
      quizId: quiz._id,
      documentId,
      personId: actor.person.id,
      answers,
      score,
      correctAnswers,
      totalQuestions: quiz.questions.length,
      startedAt,
      submittedAt: now,
    };
    await pgQuery(
      `insert into quiz_attempts
      (id,quiz_id,document_id,person_id,answers,score,correct_answers,total_questions,started_at,submitted_at,raw_json)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        attempt._id, attempt.quizId, attempt.documentId, attempt.personId, JSON.stringify(attempt.answers),
        attempt.score, attempt.correctAnswers, attempt.totalQuestions, attempt.startedAt, attempt.submittedAt, JSON.stringify(attempt),
      ]
    );
    const reviewQuestions = buildQuizReviewQuestions(quiz);
    const roundRes = await pgQuery(
      "select count(*)::int as count from quiz_attempts where document_id = $1 and person_id = $2 and submitted_at <= $3::timestamptz",
      [documentId, actor.person.id, attempt.submittedAt]
    );
    const attemptRound = Math.max(1, Number(roundRes.rows[0]?.count ?? 1));
    return mapDbQuizAttempt(attempt, actor.person.name, actor.person.role, reviewQuestions, attemptRound, true);
  }

  const db = await getMongoDb();
  const [latestAttempt, latestReset] = await Promise.all([
    db.collection<DbQuizAttempt>("quiz_attempts").find({ documentId, personId: actor.person.id }, { sort: { submittedAt: -1 } }).limit(1).next(),
    db.collection<DbQuizAttemptReset>("quiz_attempt_resets").find({ documentId, personId: actor.person.id }, { sort: { resetAt: -1 } }).limit(1).next(),
  ]);
  if (
    latestAttempt &&
    latestAttempt.score >= passScore &&
    (!latestReset || new Date(latestAttempt.submittedAt).getTime() > new Date(latestReset.resetAt).getTime())
  ) {
    throw new Error("Bạn đã hoàn thành bài kiểm tra này rồi.");
  }

  const quiz = await db.collection<DbLearningQuiz>("learning_quizzes").findOne({ documentId });
  if (!quiz) throw new Error("Không tìm thấy bài kiểm tra.");

  let correctAnswers = 0;
  for (let i = 0; i < quiz.questions.length; i++) {
    if (answers[i] === quiz.questions[i].correctIndex) correctAnswers++;
  }
  const score = quiz.questions.length > 0 ? Math.round((correctAnswers / quiz.questions.length) * 100) : 0;

  const now = new Date().toISOString();
  const attempt: DbQuizAttempt = {
    _id: `attempt_${Date.now()}`,
    quizId: quiz._id,
    documentId,
    personId: actor.person.id,
    answers,
    score,
    correctAnswers,
    totalQuestions: quiz.questions.length,
    startedAt,
    submittedAt: now,
  };

  await db.collection<DbQuizAttempt>("quiz_attempts").insertOne(attempt);

  const reviewQuestions = buildQuizReviewQuestions(quiz);

  const attemptRound = await db.collection<DbQuizAttempt>("quiz_attempts").countDocuments({
    documentId,
    personId: actor.person.id,
    submittedAt: { $lte: attempt.submittedAt },
  });
  return mapDbQuizAttempt(attempt, actor.person.name, actor.person.role, reviewQuestions, Math.max(1, attemptRound), true);
}

export async function getMyQuizAttempt(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<QuizAttemptRecord | null> {
  const passScore = 90;
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [result, latestResetRes] = await Promise.all([
      pgQuery(
        "select * from quiz_attempts where document_id = $1 and person_id = $2 order by submitted_at desc nulls last limit 1",
        [documentId, actor.person.id]
      ),
      pgQuery(
        "select reset_at from quiz_attempt_resets where document_id = $1 and person_id = $2 order by reset_at desc nulls last limit 1",
        [documentId, actor.person.id]
      ),
    ]);
    const row = result.rows[0];
    if (!row) return null;
    const attempt = mapPgQuizAttemptRow(row);
    const latestResetAt = toIsoStringOrUndefined(latestResetRes.rows[0]?.reset_at);
    if (latestResetAt && new Date(attempt.submittedAt).getTime() < new Date(latestResetAt).getTime()) {
      return null;
    }
    if (attempt.score < passScore) return null;
    const roundRes = await pgQuery(
      "select count(*)::int as count from quiz_attempts where document_id = $1 and person_id = $2 and submitted_at <= $3::timestamptz",
      [documentId, actor.person.id, attempt.submittedAt]
    );
    const attemptRound = Math.max(1, Number(roundRes.rows[0]?.count ?? 1));
    return mapDbQuizAttempt(attempt, undefined, undefined, undefined, attemptRound, true);
  }

  const db = await getMongoDb();
  const [attempt, latestReset] = await Promise.all([
    db.collection<DbQuizAttempt>("quiz_attempts").find({ documentId, personId: actor.person.id }, { sort: { submittedAt: -1 } }).limit(1).next(),
    db.collection<DbQuizAttemptReset>("quiz_attempt_resets").find({ documentId, personId: actor.person.id }, { sort: { resetAt: -1 } }).limit(1).next(),
  ]);
  if (!attempt) return null;
  if (latestReset && new Date(attempt.submittedAt).getTime() < new Date(latestReset.resetAt).getTime()) return null;
  if (attempt.score < passScore) return null;
  const attemptRound = await db.collection<DbQuizAttempt>("quiz_attempts").countDocuments({
    documentId,
    personId: actor.person.id,
    submittedAt: { $lte: attempt.submittedAt },
  });
  return mapDbQuizAttempt(attempt, undefined, undefined, undefined, Math.max(1, attemptRound), true);
}

export async function getTeamQuizAttempts(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<QuizAttemptRecord[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canViewTeamLearningReports(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [documentRes, attemptsRes, peopleRes, resetRes, quizRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [documentId]),
      pgQuery("select * from quiz_attempts where document_id = $1 order by submitted_at desc nulls last", [documentId]),
      pgQuery("select * from people"),
      pgQuery("select * from quiz_attempt_resets where document_id = $1", [documentId]),
      pgQuery("select * from learning_quizzes where document_id = $1 limit 1", [documentId]),
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow || attemptsRes.rows.length === 0) return [];
    const document = mapPgDocumentRow(documentRow);
    const attempts = attemptsRes.rows.map((row) => mapPgQuizAttemptRow(row));
    const resets = resetRes.rows.map((row) => mapPgQuizAttemptResetRow(row));
    const reviewQuestions = quizRes.rows[0] ? buildQuizReviewQuestions(mapPgLearningQuizRow(quizRes.rows[0])) : undefined;
    const attemptRounds = computeAttemptRoundByPerson(attempts, resets);
    const latestResetAtByPerson = new Map<string, string>();
    for (const reset of resets) {
      const prev = latestResetAtByPerson.get(reset.personId);
      if (!prev || new Date(reset.resetAt).getTime() > new Date(prev).getTime()) {
        latestResetAtByPerson.set(reset.personId, reset.resetAt);
      }
    }
    const latestActiveAttemptIdByPerson = new Map<string, string>();
    for (const attempt of attempts) {
      const latestResetAt = latestResetAtByPerson.get(attempt.personId);
      if (latestResetAt && new Date(attempt.submittedAt).getTime() < new Date(latestResetAt).getTime()) continue;
      const currentId = latestActiveAttemptIdByPerson.get(attempt.personId);
      if (!currentId) {
        latestActiveAttemptIdByPerson.set(attempt.personId, attempt._id);
        continue;
      }
      const current = attempts.find((item) => item._id === currentId);
      if (!current || new Date(attempt.submittedAt).getTime() > new Date(current.submittedAt).getTime()) {
        latestActiveAttemptIdByPerson.set(attempt.personId, attempt._id);
      }
    }
    const people = peopleRes.rows.map((row) => mapPgPersonRow(row));
    const peopleById = new Map(people.map((person) => [person._id, mapDbPerson(person)]));
    const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
    const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
    const visibleAttempts = attempts.filter((attempt) => {
      const person = peopleById.get(attempt.personId);
      if (!person) return false;
      if (!visibleTeamMemberIds.has(person.id)) return false;
      if (!canPersonAccessDocument(person, document, ownerTeamByPersonId)) return false;
      return !normalizeIdentityValue(person.role).includes("trainer");
    });
    const scopedAttempts =
      actor.user.role === "store_lead"
        ? visibleAttempts.filter((attempt) => {
            const person = peopleById.get(attempt.personId);
            if (!person) return false;
            if (attempt.personId === actor.person.id) return true;
            const normalizedRole = normalizeIdentityValue(person.role);
            return (
              normalizedRole.includes("kỹ thuật viên") ||
              normalizedRole.includes("ky thuat vien") ||
              normalizedRole.includes("nhân viên cửa hàng") ||
              normalizedRole.includes("nhan vien cua hang")
            );
          })
        : visibleAttempts;
    return scopedAttempts.map((attempt) =>
      mapDbQuizAttempt(
        attempt,
        peopleById.get(attempt.personId)?.name ?? "Unknown",
        peopleById.get(attempt.personId)?.role,
        reviewQuestions,
        attemptRounds.get(attempt._id),
        latestActiveAttemptIdByPerson.get(attempt.personId) === attempt._id
      )
    );
  }

  const db = await getMongoDb();
  const [document, attempts, resets, quiz] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db
      .collection<DbQuizAttempt>("quiz_attempts")
      .find({ documentId }, { sort: { submittedAt: -1 } })
      .toArray(),
    db.collection<DbQuizAttemptReset>("quiz_attempt_resets").find({ documentId }).toArray(),
    db.collection<DbLearningQuiz>("learning_quizzes").findOne({ documentId }),
  ]);

  if (!document || attempts.length === 0) return [];

  const personIds = [...new Set(attempts.map((a) => a.personId))];
  const people = await db
    .collection<DbPerson>("people")
    .find({ _id: { $in: personIds } })
    .toArray();
  const peopleById = new Map(people.map((person) => [person._id, mapDbPerson(person)]));
  const ownerTeamByPersonId = new Map(
    people.map((person) => [person._id, normalizeTeamId(person.teamId)])
  );
  const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const visibleAttempts = attempts.filter((attempt) => {
    const person = peopleById.get(attempt.personId);
    if (!person) return false;
    if (!visibleTeamMemberIds.has(person.id)) return false;
    if (!canPersonAccessDocument(person, document, ownerTeamByPersonId)) return false;
    return !normalizeIdentityValue(person.role).includes("trainer");
  });

  const scopedAttempts =
    actor.user.role === "store_lead"
      ? visibleAttempts.filter((attempt) => {
          const person = peopleById.get(attempt.personId);
          if (!person) return false;
          if (attempt.personId === actor.person.id) return true;
          const normalizedRole = normalizeIdentityValue(person.role);
          return (
            normalizedRole.includes("kỹ thuật viên") ||
            normalizedRole.includes("ky thuat vien") ||
            normalizedRole.includes("nhân viên cửa hàng") ||
            normalizedRole.includes("nhan vien cua hang")
          );
        })
      : visibleAttempts;

  const attemptRounds = computeAttemptRoundByPerson(attempts, resets);
  const reviewQuestions = buildQuizReviewQuestions(quiz);
  const latestResetAtByPerson = new Map<string, string>();
  for (const reset of resets) {
    const prev = latestResetAtByPerson.get(reset.personId);
    if (!prev || new Date(reset.resetAt).getTime() > new Date(prev).getTime()) {
      latestResetAtByPerson.set(reset.personId, reset.resetAt);
    }
  }
  const latestActiveAttemptIdByPerson = new Map<string, string>();
  for (const attempt of attempts) {
    const latestResetAt = latestResetAtByPerson.get(attempt.personId);
    if (latestResetAt && new Date(attempt.submittedAt).getTime() < new Date(latestResetAt).getTime()) continue;
    const currentId = latestActiveAttemptIdByPerson.get(attempt.personId);
    if (!currentId) {
      latestActiveAttemptIdByPerson.set(attempt.personId, attempt._id);
      continue;
    }
    const current = attempts.find((item) => item._id === currentId);
    if (!current || new Date(attempt.submittedAt).getTime() > new Date(current.submittedAt).getTime()) {
      latestActiveAttemptIdByPerson.set(attempt.personId, attempt._id);
    }
  }
  return scopedAttempts.map((attempt) =>
    mapDbQuizAttempt(
      attempt,
      peopleById.get(attempt.personId)?.name ?? "Unknown",
      peopleById.get(attempt.personId)?.role,
      reviewQuestions,
      attemptRounds.get(attempt._id),
      latestActiveAttemptIdByPerson.get(attempt.personId) === attempt._id
    )
  );
}

export async function getTeamQuizAttemptResets(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<QuizAttemptResetRecord[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canViewTeamLearningReports(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [documentRes, resetRes, peopleRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [documentId]),
      pgQuery("select * from quiz_attempt_resets where document_id = $1 order by reset_at desc nulls last", [documentId]),
      pgQuery("select * from people"),
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow || resetRes.rows.length === 0) return [];
    const document = mapPgDocumentRow(documentRow);
    const resets = resetRes.rows.map((row) => mapPgQuizAttemptResetRow(row));
    const people = peopleRes.rows.map((row) => mapPgPersonRow(row));
    const peopleById = new Map(people.map((person) => [person._id, mapDbPerson(person)]));
    const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
    const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
    const visibleResets = resets.filter((reset) => {
      const person = peopleById.get(reset.personId);
      if (!person) return false;
      if (!visibleTeamMemberIds.has(person.id)) return false;
      if (!canPersonAccessDocument(person, document, ownerTeamByPersonId)) return false;
      return !normalizeIdentityValue(person.role).includes("trainer");
    });
    const scopedResets =
      actor.user.role === "store_lead"
        ? visibleResets.filter((reset) => {
            const person = peopleById.get(reset.personId);
            if (!person) return false;
            if (reset.personId === actor.person.id) return true;
            const normalizedRole = normalizeIdentityValue(person.role);
            return (
              normalizedRole.includes("kỹ thuật viên") ||
              normalizedRole.includes("ky thuat vien") ||
              normalizedRole.includes("nhân viên cửa hàng") ||
              normalizedRole.includes("nhan vien cua hang")
            );
          })
        : visibleResets;
    return scopedResets.map((reset) =>
      mapDbQuizAttemptReset(
        reset,
        peopleById.get(reset.personId)?.name ?? "Unknown",
        peopleById.get(reset.resetByPersonId)?.name ?? "Unknown"
      )
    );
  }

  const db = await getMongoDb();
  const [document, resets] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db
      .collection<DbQuizAttemptReset>("quiz_attempt_resets")
      .find({ documentId }, { sort: { resetAt: -1 } })
      .toArray(),
  ]);
  if (!document || resets.length === 0) return [];
  const personIds = [...new Set(resets.flatMap((r) => [r.personId, r.resetByPersonId]))];
  const people = await db.collection<DbPerson>("people").find({ _id: { $in: personIds } }).toArray();
  const peopleById = new Map(people.map((person) => [person._id, mapDbPerson(person)]));
  const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
  const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const visibleResets = resets.filter((reset) => {
    const person = peopleById.get(reset.personId);
    if (!person) return false;
    if (!visibleTeamMemberIds.has(person.id)) return false;
    if (!canPersonAccessDocument(person, document, ownerTeamByPersonId)) return false;
    return !normalizeIdentityValue(person.role).includes("trainer");
  });
  const scopedResets =
    actor.user.role === "store_lead"
      ? visibleResets.filter((reset) => {
          const person = peopleById.get(reset.personId);
          if (!person) return false;
          if (reset.personId === actor.person.id) return true;
          const normalizedRole = normalizeIdentityValue(person.role);
          return (
            normalizedRole.includes("kỹ thuật viên") ||
            normalizedRole.includes("ky thuat vien") ||
            normalizedRole.includes("nhân viên cửa hàng") ||
            normalizedRole.includes("nhan vien cua hang")
          );
        })
      : visibleResets;
  return scopedResets.map((reset) =>
    mapDbQuizAttemptReset(
      reset,
      peopleById.get(reset.personId)?.name ?? "Unknown",
      peopleById.get(reset.resetByPersonId)?.name ?? "Unknown"
    )
  );
}

export async function resetQuizAttemptForPerson(
  sessionUserId: string | null | undefined,
  input: { documentId: string; personId: string }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!actor.isAdmin && actor.user.role !== "store_trainer") throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [personRes, documentRes] = await Promise.all([
      pgQuery("select id,name from people where id = $1 limit 1", [input.personId]),
      pgQuery("select id,name,owner_id,visibility,visible_to_person_ids from documents where id = $1 limit 1", [input.documentId]),
    ]);
    const target = personRes.rows[0];
    const document = documentRes.rows[0];
    if (!target || !document) throw new Error("Not found");
    if (!canAccessPerson(actor, String(target.id))) throw new Error("Forbidden");
    const now = new Date().toISOString();
    const reset: DbQuizAttemptReset = {
      _id: `attempt_reset_${Date.now()}`,
      documentId: input.documentId,
      personId: input.personId,
      resetByPersonId: actor.person.id,
      resetAt: now,
    };
    await pgQuery(
      `insert into quiz_attempt_resets
      (id, document_id, person_id, reset_by_person_id, reset_at, raw_json)
      values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [reset._id, reset.documentId, reset.personId, reset.resetByPersonId, reset.resetAt, JSON.stringify(reset)]
    );
    const result = await pgQuery(
      "select id from quiz_attempts where document_id = $1 and person_id = $2 order by submitted_at desc nulls last limit 1",
      [input.documentId, input.personId]
    );
    return {
      deleted: (result.rowCount ?? 0) > 0,
      resetAt: now,
      documentName: String(document.name),
      personName: String(target.name),
    };
  }

  const db = await getMongoDb();
  const [targetPerson, document] = await Promise.all([
    db.collection<DbPerson>("people").findOne({ _id: input.personId }),
    db.collection<DbDocument>("documents").findOne({ _id: input.documentId }),
  ]);

  if (!targetPerson || !document) {
    throw new Error("Not found");
  }
  if (!canAccessPerson(actor, targetPerson._id)) {
    throw new Error("Forbidden");
  }

  const now = new Date().toISOString();
  await db.collection<DbQuizAttemptReset>("quiz_attempt_resets").insertOne({
    _id: `attempt_reset_${Date.now()}`,
    documentId: input.documentId,
    personId: input.personId,
    resetByPersonId: actor.person.id,
    resetAt: now,
  });
  const latestAttempt = await db.collection<DbQuizAttempt>("quiz_attempts").find({ documentId: input.documentId, personId: input.personId }, { sort: { submittedAt: -1 } }).limit(1).next();

  return {
    deleted: Boolean(latestAttempt),
    resetAt: now,
    documentName: document.name,
    personName: targetPerson.name,
  };
}

export async function resetLearningProgressForPerson(
  sessionUserId: string | null | undefined,
  input: { documentId: string; personId: string }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!actor.isAdmin && actor.user.role !== "store_trainer") throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [personRes, documentRes, peopleRes, usersRes] = await Promise.all([
      pgQuery("select * from people where id = $1 limit 1", [input.personId]),
      pgQuery("select * from documents where id = $1 limit 1", [input.documentId]),
      pgQuery("select id,team_id from people"),
      pgQuery("select id, name, email, person_id, role, department, store_lead_user_id, verified from users where person_id is not null"),
    ]);
    const targetRow = personRes.rows[0];
    const documentRow = documentRes.rows[0];
    if (!targetRow || !documentRow) throw new Error("Not found");

    const targetPerson = mapDbPerson(mapPgPersonRow(targetRow));
    const document = mapPgDocumentRow(documentRow);
    const ownerTeamByPersonId = new Map(peopleRes.rows.map((row) => [String(row.id), normalizeTeamId(String(row.team_id))]));
    const personRolesByPersonId = buildPersonRolesMap(usersRes.rows);
    if (!canAccessPerson(actor, targetPerson.id)) throw new Error("Forbidden");
    if (!isEmployeePerson(targetPerson)) throw new Error("Forbidden");
    if (!canPersonAccessDocument(targetPerson, document, ownerTeamByPersonId, personRolesByPersonId)) throw new Error("Forbidden");

    const now = new Date().toISOString();
    const [deleteRes, latestAttemptRes] = await Promise.all([
      pgQuery("delete from learning_progress where document_id = $1 and person_id = $2", [input.documentId, input.personId]),
      pgQuery(
        "select id from quiz_attempts where document_id = $1 and person_id = $2 order by submitted_at desc nulls last limit 1",
        [input.documentId, input.personId]
      ),
    ]);
    const resetQuizAttempt = (latestAttemptRes.rowCount ?? 0) > 0;
    if (resetQuizAttempt) {
      const reset: DbQuizAttemptReset = {
        _id: `attempt_reset_${Date.now()}_${randomInt(1000, 9999)}`,
        documentId: input.documentId,
        personId: input.personId,
        resetByPersonId: actor.person.id,
        resetAt: now,
      };
      await pgQuery(
        `insert into quiz_attempt_resets
        (id, document_id, person_id, reset_by_person_id, reset_at, raw_json)
        values ($1, $2, $3, $4, $5, $6::jsonb)`,
        [reset._id, reset.documentId, reset.personId, reset.resetByPersonId, reset.resetAt, JSON.stringify(reset)]
      );
    }

    return {
      deletedProgress: (deleteRes.rowCount ?? 0) > 0,
      resetQuizAttempt,
      resetAt: now,
      documentName: document.name,
      personName: targetPerson.name,
    };
  }

  const db = await getMongoDb();
  const [targetPerson, document, people, users] = await Promise.all([
    db.collection<DbPerson>("people").findOne({ _id: input.personId }),
    db.collection<DbDocument>("documents").findOne({ _id: input.documentId }),
    db.collection<DbPerson>("people").find({}, { projection: { _id: 1, teamId: 1 } }).toArray(),
    db.collection<DbUser>("users").find({}, { projection: { _id: 1, name: 1, email: 1, personId: 1, role: 1, department: 1, storeLeadUserId: 1, verified: 1 } }).toArray(),
  ]);
  if (!targetPerson || !document) throw new Error("Not found");

  const mappedTargetPerson = mapDbPerson(targetPerson);
  const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
  const personRolesByPersonId = new Map<string, Set<UserRole>>();
  for (const user of users) {
    if (!user.personId) continue;
    const roles = personRolesByPersonId.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesByPersonId.set(user.personId, roles);
  }
  if (!canAccessPerson(actor, mappedTargetPerson.id)) throw new Error("Forbidden");
  if (!isEmployeePerson(mappedTargetPerson)) throw new Error("Forbidden");
  if (!canPersonAccessDocument(mappedTargetPerson, document, ownerTeamByPersonId, personRolesByPersonId)) throw new Error("Forbidden");

  const now = new Date().toISOString();
  const [deleteRes, latestAttempt] = await Promise.all([
    db.collection<DbLearningProgress>("learning_progress").deleteOne({ documentId: input.documentId, personId: input.personId }),
    db.collection<DbQuizAttempt>("quiz_attempts").find({ documentId: input.documentId, personId: input.personId }, { sort: { submittedAt: -1 } }).limit(1).next(),
  ]);
  const resetQuizAttempt = Boolean(latestAttempt);
  if (resetQuizAttempt) {
    await db.collection<DbQuizAttemptReset>("quiz_attempt_resets").insertOne({
      _id: `attempt_reset_${Date.now()}_${randomInt(1000, 9999)}`,
      documentId: input.documentId,
      personId: input.personId,
      resetByPersonId: actor.person.id,
      resetAt: now,
    });
  }

  return {
    deletedProgress: deleteRes.deletedCount > 0,
    resetQuizAttempt,
    resetAt: now,
    documentName: document.name,
    personName: targetPerson.name,
  };
}

export async function getMyLearningProgress(
  sessionUserId: string | null | undefined
): Promise<LearningProgressRecord[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    const result = await pgQuery(
      "select * from learning_progress where person_id = $1 order by updated_at desc nulls last",
      [actor.person.id]
    );
    return result.rows.map((row) => mapDbLearningProgress(mapPgLearningProgressRow(row)));
  }

  const db = await getMongoDb();
  const progresses = await db
    .collection<DbLearningProgress>("learning_progress")
    .find({ personId: actor.person.id }, { sort: { updatedAt: -1 } })
    .toArray();

  return progresses.map(mapDbLearningProgress);
}

export async function maybeCreateLearningDeadlineReminders(sessionUserId: string | null | undefined) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) return;
  if (actor.isAdmin || actor.isLeader || actor.user.role === "store_trainer") return;

  const nowMs = Date.now();
  const reminderWindowMs = 24 * 60 * 60 * 1000;
  const dedupeWindowIso = new Date(nowMs - 6 * 60 * 60 * 1000).toISOString();

  if (shouldUseSupabasePhaseA()) {
    const documents = await getDocumentsData(sessionUserId);
    const learningDocs = documents.filter((doc) => {
      if (!doc.isLearningMaterial || !doc.deadlineAt) return false;
      const deadlineMs = new Date(doc.deadlineAt).getTime();
      if (!Number.isFinite(deadlineMs)) return false;
      const remaining = deadlineMs - nowMs;
      return remaining > 0 && remaining <= reminderWindowMs;
    });
    if (learningDocs.length === 0) return;

    const documentIds = learningDocs.map((doc) => doc.id);
    const [progressesRes, quizzesRes, attemptsRes] = await Promise.all([
      pgQuery("select * from learning_progress where person_id = $1 and document_id = any($2::text[])", [actor.person.id, documentIds]),
      pgQuery("select * from learning_quizzes where document_id = any($1::text[])", [documentIds]),
      pgQuery("select * from quiz_attempts where person_id = $1 and document_id = any($2::text[])", [actor.person.id, documentIds]),
    ]);
    const progresses = progressesRes.rows.map((row) => mapPgLearningProgressRow(row));
    const quizzes = quizzesRes.rows.map((row) => mapPgLearningQuizRow(row));
    const attempts = attemptsRes.rows.map((row) => mapPgQuizAttemptRow(row));
    const progressByDocId = new Map(progresses.map((item) => [item.documentId, item]));
    const quizByDocId = new Map(quizzes.map((item) => [item.documentId, item]));
    const submittedDocIdSet = new Set(attempts.map((item) => item.documentId));
    const candidates: Array<{ entityType: AppRealtimeEntityType; entityId: string; entityLabel: string }> = [];
    for (const doc of learningDocs) {
      const deadlineMs = new Date(doc.deadlineAt!).getTime();
      const remainingHours = Math.max(1, Math.ceil((deadlineMs - nowMs) / (60 * 60 * 1000)));
      const learningProgress = progressByDocId.get(doc.id);
      const isLearningDone = Boolean(learningProgress?.completedAt);
      if (!isLearningDone) candidates.push({ entityType: "document", entityId: doc.id, entityLabel: `Nhắc học liệu: "${doc.name}" còn ${remainingHours}h tới hạn` });
      const quiz = quizByDocId.get(doc.id);
      if (quiz && !submittedDocIdSet.has(doc.id)) candidates.push({ entityType: "quiz", entityId: quiz._id, entityLabel: `Nhắc làm quiz: "${quiz.title}" còn ${remainingHours}h tới hạn` });
    }
    if (candidates.length === 0) return;

    const existingRemindersRes = await pgQuery(
      `select entity_type, entity_id from person_notifications
       where person_id = $1 and type = 'learning.updated' and action = 'reminder' and created_at >= $2`,
      [actor.person.id, dedupeWindowIso]
    );
    const existingReminderKeySet = new Set(
      existingRemindersRes.rows.map((item) => `${String(item.entity_type ?? "unknown")}:${String(item.entity_id ?? "unknown")}`)
    );

    const nowIso = new Date().toISOString();
    const nextNotifications = candidates.filter((candidate) => !existingReminderKeySet.has(`${candidate.entityType}:${candidate.entityId}`));
    for (const candidate of nextNotifications) {
      const id = new ObjectId().toHexString();
      await pgQuery(
        `insert into person_notifications
        (id,person_id,type,actor_id,action,entity_type,entity_id,entity_label,occurred_at,created_at,read_at,raw_json)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
        [
          id, actor.person.id, "learning.updated", "system", "reminder", candidate.entityType, candidate.entityId, candidate.entityLabel,
          nowIso, nowIso, null, JSON.stringify({ personId: actor.person.id, entityType: candidate.entityType, entityId: candidate.entityId }),
        ]
      );
    }
    return;
  }

  const db = await getMongoDb();

  const documents = await getDocumentsData(sessionUserId);
  const learningDocs = documents.filter((doc) => {
    if (!doc.isLearningMaterial || !doc.deadlineAt) return false;
    const deadlineMs = new Date(doc.deadlineAt).getTime();
    if (!Number.isFinite(deadlineMs)) return false;
    const remaining = deadlineMs - nowMs;
    return remaining > 0 && remaining <= reminderWindowMs;
  });
  if (learningDocs.length === 0) return;

  const documentIds = learningDocs.map((doc) => doc.id);
  const [progresses, quizzes, attempts] = await Promise.all([
    db
      .collection<DbLearningProgress>("learning_progress")
      .find({ personId: actor.person.id, documentId: { $in: documentIds } })
      .toArray(),
    db.collection<DbLearningQuiz>("learning_quizzes").find({ documentId: { $in: documentIds } }).toArray(),
    db
      .collection<DbQuizAttempt>("quiz_attempts")
      .find({ personId: actor.person.id, documentId: { $in: documentIds } })
      .toArray(),
  ]);

  const progressByDocId = new Map(progresses.map((item) => [item.documentId, item]));
  const quizByDocId = new Map(quizzes.map((item) => [item.documentId, item]));
  const submittedDocIdSet = new Set(attempts.map((item) => item.documentId));

  const candidates: Array<{ entityType: AppRealtimeEntityType; entityId: string; entityLabel: string }> = [];
  for (const doc of learningDocs) {
    const deadlineMs = new Date(doc.deadlineAt!).getTime();
    const remainingHours = Math.max(1, Math.ceil((deadlineMs - nowMs) / (60 * 60 * 1000)));
    const learningProgress = progressByDocId.get(doc.id);
    const isLearningDone = Boolean(learningProgress?.completedAt);
    if (!isLearningDone) {
      candidates.push({
        entityType: "document",
        entityId: doc.id,
        entityLabel: `Nhắc học liệu: "${doc.name}" còn ${remainingHours}h tới hạn`,
      });
    }

    const quiz = quizByDocId.get(doc.id);
    if (quiz && !submittedDocIdSet.has(doc.id)) {
      candidates.push({
        entityType: "quiz",
        entityId: quiz._id,
        entityLabel: `Nhắc làm quiz: "${quiz.title}" còn ${remainingHours}h tới hạn`,
      });
    }
  }

  if (candidates.length === 0) return;

  const existingReminders = await db
    .collection<DbPersonNotification>("person_notifications")
    .find({
      personId: actor.person.id,
      type: "learning.updated",
      action: "reminder",
      createdAt: { $gte: dedupeWindowIso },
      $or: candidates.map((candidate) => ({
        entityType: candidate.entityType,
        entityId: candidate.entityId,
      })),
    })
    .toArray();

  const existingReminderKeySet = new Set(
    existingReminders.map((item) => `${item.entityType ?? "unknown"}:${item.entityId ?? "unknown"}`)
  );

  const nowIso = new Date().toISOString();
  const nextNotifications = candidates
    .filter((candidate) => !existingReminderKeySet.has(`${candidate.entityType}:${candidate.entityId}`))
    .map((candidate) => ({
      personId: actor.person.id,
      type: "learning.updated" as AppRealtimeEventType,
      actorId: "system",
      action: "reminder" as AppRealtimeEventAction,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      entityLabel: candidate.entityLabel,
      occurredAt: nowIso,
      createdAt: nowIso,
      readAt: null,
    }));

  if (nextNotifications.length === 0) return;
  await db.collection<DbPersonNotification>("person_notifications").insertMany(nextNotifications);
}

export async function upsertMyLearningProgress(
  sessionUserId: string | null | undefined,
  input: {
    documentId: string;
    startedAt?: string | null;
    completedAt?: string | null;
    activeStepIndex?: number;
    completedStepIds?: string[];
    startedAtByStepId?: Record<string, string>;
  }
): Promise<LearningProgressRecord> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    const [documentRes, peopleRes, usersRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [input.documentId]),
      pgQuery("select id,team_id from people"),
      pgQuery("select id, name, email, person_id, role, department, store_lead_user_id, verified from users where person_id is not null"),
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow) throw new Error("Document not found.");
    const document = mapPgDocumentRow(documentRow);
    const personTeamMap = new Map(peopleRes.rows.map((row) => [String(row.id), normalizeTeamId(String(row.team_id))]));
    const personRolesMap = buildPersonRolesMap(usersRes.rows);
    const ownerUserByPersonId = buildOwnerUserByPersonId(usersRes.rows);
    const canLearnViaPersonalVisibility = canActorViewDocument(
      actor,
      document,
      personTeamMap,
      personRolesMap,
      ownerUserByPersonId
    );
    const canLearnViaManagementScope = canViewTeamLearningReports(actor) && canAccessPerson(actor, document.ownerId);
    if (!canLearnViaPersonalVisibility && !canLearnViaManagementScope) throw new Error("Forbidden");

    const now = new Date().toISOString();
    const existingRes = await pgQuery(
      "select * from learning_progress where person_id = $1 and document_id = $2 limit 1",
      [actor.person.id, input.documentId]
    );
    const existing = existingRes.rows[0] ? mapPgLearningProgressRow(existingRes.rows[0]) : null;
    const payload: Partial<DbLearningProgress> = {
      updatedAt: now,
      activeStepIndex: Math.max(0, input.activeStepIndex ?? 0),
      completedStepIds: Array.isArray(input.completedStepIds) ? [...new Set(input.completedStepIds)] : [],
      startedAtByStepId: input.startedAtByStepId ?? {},
    };
    if (input.startedAt !== undefined) payload.startedAt = input.startedAt || undefined;
    else if (!existing?.startedAt) payload.startedAt = now;
    if (input.completedAt !== undefined) payload.completedAt = input.completedAt || undefined;
    if (!existing) payload.createdAt = now;

    const record: DbLearningProgress = {
      _id: existing?._id ?? `lp_${Date.now()}_${randomInt(1000, 9999)}`,
      personId: actor.person.id,
      documentId: input.documentId,
      startedAt: payload.startedAt ?? existing?.startedAt,
      completedAt: payload.completedAt ?? existing?.completedAt,
      activeStepIndex: payload.activeStepIndex ?? existing?.activeStepIndex ?? 0,
      completedStepIds: payload.completedStepIds ?? existing?.completedStepIds ?? [],
      startedAtByStepId: payload.startedAtByStepId ?? existing?.startedAtByStepId ?? {},
      createdAt: payload.createdAt ?? existing?.createdAt ?? now,
      updatedAt: payload.updatedAt ?? now,
    };
    await pgQuery(
      `insert into learning_progress
      (id,person_id,document_id,started_at,completed_at,active_step_index,completed_step_ids,started_at_by_step_id,created_at,updated_at,raw_json)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb)
      on conflict (id) do update set
      started_at=excluded.started_at,
      completed_at=excluded.completed_at,
      active_step_index=excluded.active_step_index,
      completed_step_ids=excluded.completed_step_ids,
      started_at_by_step_id=excluded.started_at_by_step_id,
      updated_at=excluded.updated_at,
      raw_json=excluded.raw_json`,
      [
        record._id, record.personId, record.documentId, record.startedAt ?? null, record.completedAt ?? null,
        record.activeStepIndex, JSON.stringify(record.completedStepIds ?? []), JSON.stringify(record.startedAtByStepId ?? {}),
        record.createdAt, record.updatedAt, JSON.stringify(record),
      ]
    );
    return mapDbLearningProgress(record);
  }

  const db = await getMongoDb();
  const [document, people, users] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: input.documentId }),
    db.collection<DbPerson>("people").find({}, { projection: { _id: 1, teamId: 1 } }).toArray(),
    db.collection<DbUser>("users").find({}, { projection: { _id: 1, name: 1, email: 1, personId: 1, role: 1, department: 1, storeLeadUserId: 1, verified: 1 } }).toArray(),
  ]);

  if (!document) throw new Error("Document not found.");

  const personTeamMap = new Map(
    people.map((person) => [person._id, normalizeTeamId(person.teamId)])
  );
  const personRolesMap = new Map<string, Set<UserRole>>();
  const ownerUserByPersonId = new Map<string, UserAccount>();
  for (const user of users) {
    if (!user.personId) continue;
    const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesMap.set(user.personId, roles);
    ownerUserByPersonId.set(user.personId, mapDbUser(user));
  }
  const canLearnViaPersonalVisibility = canActorViewDocument(
    actor,
    document,
    personTeamMap,
    personRolesMap,
    ownerUserByPersonId
  );
  const canLearnViaManagementScope =
    canViewTeamLearningReports(actor) && canAccessPerson(actor, document.ownerId);
  if (!canLearnViaPersonalVisibility && !canLearnViaManagementScope) {
    throw new Error("Forbidden");
  }

  const now = new Date().toISOString();
  const query = { personId: actor.person.id, documentId: input.documentId };
  const existing = await db.collection<DbLearningProgress>("learning_progress").findOne(query);

  const payload: Partial<DbLearningProgress> = {
    updatedAt: now,
    activeStepIndex: Math.max(0, input.activeStepIndex ?? 0),
    completedStepIds: Array.isArray(input.completedStepIds)
      ? [...new Set(input.completedStepIds)]
      : [],
    startedAtByStepId: input.startedAtByStepId ?? {},
  };

  if (input.startedAt !== undefined) {
    payload.startedAt = input.startedAt || undefined;
  } else if (!existing?.startedAt) {
    payload.startedAt = now;
  }

  if (input.completedAt !== undefined) {
    payload.completedAt = input.completedAt || undefined;
  }

  if (!existing) {
    payload.createdAt = now;
  }

  await db.collection<DbLearningProgress>("learning_progress").updateOne(
    query,
    { $set: payload, ...(existing ? {} : { $setOnInsert: { _id: `lp_${Date.now()}_${randomInt(1000, 9999)}` } }) },
    { upsert: true }
  );

  const saved = await db.collection<DbLearningProgress>("learning_progress").findOne(query);
  if (!saved) throw new Error("Failed to save learning progress.");
  return mapDbLearningProgress(saved);
}

export async function getTeamLearningStatusesForDocument(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<TeamLearningStatusRow[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canViewTeamLearningReports(actor)) throw new Error("Forbidden");

  if (shouldUseSupabasePhaseA()) {
    await ensureQuizAttemptResetSchemaReady();
    const [documentRes, peopleRes, usersRes, progressesRes, attemptsRes, resetRes] = await Promise.all([
      pgQuery("select * from documents where id = $1 limit 1", [documentId]),
      pgQuery("select * from people"),
      pgQuery("select * from users where person_id is not null"),
      pgQuery("select * from learning_progress where document_id = $1", [documentId]),
      pgQuery("select * from quiz_attempts where document_id = $1", [documentId]),
      pgQuery("select * from quiz_attempt_resets where document_id = $1", [documentId]),
    ]);
    const documentRow = documentRes.rows[0];
    if (!documentRow) return [];
    const document = mapPgDocumentRow(documentRow);
    const mappedPeople = peopleRes.rows.map((row) => mapDbPerson(mapPgPersonRow(row)));
    const ownerTeamByPersonId = new Map(mappedPeople.map((person) => [person.id, person.team]));
    const personRolesByPersonId = buildPersonRolesMap(usersRes.rows);
    const allUsers = usersRes.rows.map((row) => mapPgUserRow(row)).map(mapDbUser);
    const userByPersonId = new Map(allUsers.filter((user) => Boolean(user.personId)).map((user) => [user.personId as string, user]));
    const storeProfileByPersonId = new Map(
      allUsers
        .filter((user) => Boolean(user.personId))
        .map((user) => [user.personId as string, {
          storeRegion: user.storeRegion,
          storeBranchIds: user.storeBranchIds ?? [],
          storeBranchNames: getStoreBranchNames(user.storeBranchIds),
          ...getTechnicianSupervisorProfile(user, allUsers),
        }])
    );
    const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
    const targetPeople = mappedPeople.filter((person) => {
      if (!visibleTeamMemberIds.has(person.id)) return false;
      if (!isEmployeePerson(person)) return false;
      if (actor.user.role === "store_lead" && person.id === actor.person.id) return false;
      return canPersonAccessDocument(person, document, ownerTeamByPersonId, personRolesByPersonId);
    });
    if (targetPeople.length === 0) return [];
    const targetPersonIdSet = new Set(targetPeople.map((person) => person.id));
    const progresses = progressesRes.rows
      .map((row) => mapPgLearningProgressRow(row))
      .filter((progress) => targetPersonIdSet.has(progress.personId));
    const attempts = attemptsRes.rows
      .map((row) => mapPgQuizAttemptRow(row))
      .filter((attempt) => targetPersonIdSet.has(attempt.personId));
    const resets = resetRes.rows
      .map((row) => mapPgQuizAttemptResetRow(row))
      .filter((reset) => targetPersonIdSet.has(reset.personId));
    const latestResetAtByPerson = new Map<string, string>();
    for (const reset of resets) {
      const prev = latestResetAtByPerson.get(reset.personId);
      if (!prev || new Date(reset.resetAt).getTime() > new Date(prev).getTime()) {
        latestResetAtByPerson.set(reset.personId, reset.resetAt);
      }
    }
    const progressByPersonId = new Map(progresses.map((progress) => [progress.personId, progress]));
    const attemptPersonIdSet = new Set(
      attempts
        .filter((attempt) => {
          const latestResetAt = latestResetAtByPerson.get(attempt.personId);
          return !latestResetAt || new Date(attempt.submittedAt).getTime() > new Date(latestResetAt).getTime();
        })
        .map((attempt) => attempt.personId)
    );
    return targetPeople
      .map((person) => {
        const progress = progressByPersonId.get(person.id);
        const hasStarted =
          Boolean(progress?.startedAt) ||
          (progress?.activeStepIndex ?? 0) > 0 ||
          (progress?.completedStepIds?.length ?? 0) > 0 ||
          Object.keys(progress?.startedAtByStepId ?? {}).length > 0;
        const completed = isLearningProgressCompleted(progress, document) || attemptPersonIdSet.has(person.id);
        return {
          personId: person.id,
          personName: person.name,
          personEmail: person.email,
          personRole: person.role,
          team: person.team,
          ...storeProfileByPersonId.get(person.id),
          status: completed ? "completed" : hasStarted ? "in_progress" : "not_started",
        } satisfies TeamLearningStatusRow;
      })
      .sort((a, b) => a.personName.localeCompare(b.personName, "vi"));
  }

  const db = await getMongoDb();
  const [document, allPeople, allUsers] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db.collection<DbPerson>("people").find({}).toArray(),
    db.collection<DbUser>("users").find({ personId: { $exists: true } }).toArray(),
  ]);
  if (!document) return [];

  const mappedPeople = allPeople.map(mapDbPerson);
  const ownerTeamByPersonId = new Map(
    mappedPeople.map((person) => [person.id, person.team])
  );
  const personRolesByPersonId = new Map<string, Set<UserRole>>();
  const storeProfileByPersonId = new Map<string, Pick<TeamLearningStatusRow, "storeRegion" | "storeBranchIds" | "storeBranchNames" | "supervisorUserId" | "supervisorName" | "supervisorRole">>();
  const mappedUsers = allUsers.map(mapDbUser);
  for (const user of mappedUsers) {
    if (!user.personId) continue;
    const roles = personRolesByPersonId.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesByPersonId.set(user.personId, roles);
    storeProfileByPersonId.set(user.personId, {
      storeRegion: user.storeRegion,
      storeBranchIds: user.storeBranchIds ?? [],
      storeBranchNames: getStoreBranchNames(user.storeBranchIds),
      ...getTechnicianSupervisorProfile(user, mappedUsers),
    });
  }
  const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const targetPeople = mappedPeople.filter((person) => {
    if (!visibleTeamMemberIds.has(person.id)) return false;
    if (!isEmployeePerson(person)) return false;
    if (actor.user.role === "store_lead" && person.id === actor.person.id) return false;
    return canPersonAccessDocument(person, document, ownerTeamByPersonId, personRolesByPersonId);
  });

  if (targetPeople.length === 0) return [];

  const targetPersonIds = targetPeople.map((person) => person.id);
  const [progresses, attempts, resets] = await Promise.all([
    db
      .collection<DbLearningProgress>("learning_progress")
      .find({ documentId, personId: { $in: targetPersonIds } })
      .toArray(),
    db
      .collection<DbQuizAttempt>("quiz_attempts")
      .find({ documentId, personId: { $in: targetPersonIds } })
      .toArray(),
    db
      .collection<DbQuizAttemptReset>("quiz_attempt_resets")
      .find({ documentId, personId: { $in: targetPersonIds } })
      .toArray(),
  ]);

  const progressByPersonId = new Map(progresses.map((progress) => [progress.personId, progress]));
  const latestResetAtByPerson = new Map<string, string>();
  for (const reset of resets) {
    const prev = latestResetAtByPerson.get(reset.personId);
    if (!prev || new Date(reset.resetAt).getTime() > new Date(prev).getTime()) {
      latestResetAtByPerson.set(reset.personId, reset.resetAt);
    }
  }
  const attemptPersonIdSet = new Set(
    attempts
      .filter((attempt) => {
        const latestResetAt = latestResetAtByPerson.get(attempt.personId);
        return !latestResetAt || new Date(attempt.submittedAt).getTime() > new Date(latestResetAt).getTime();
      })
      .map((attempt) => attempt.personId)
  );

  return targetPeople
    .map((person) => {
      const progress = progressByPersonId.get(person.id);
      const hasStarted =
        Boolean(progress?.startedAt) ||
        (progress?.activeStepIndex ?? 0) > 0 ||
        (progress?.completedStepIds?.length ?? 0) > 0 ||
        Object.keys(progress?.startedAtByStepId ?? {}).length > 0;
      const completed = isLearningProgressCompleted(progress, document) || attemptPersonIdSet.has(person.id);

      return {
        personId: person.id,
        personName: person.name,
        personEmail: person.email,
        personRole: person.role,
        team: person.team,
        ...storeProfileByPersonId.get(person.id),
        status: completed ? "completed" : hasStarted ? "in_progress" : "not_started",
      } satisfies TeamLearningStatusRow;
    })
    .sort((a, b) => a.personName.localeCompare(b.personName, "vi"));
}

export type QuizReportAttempt = {
  quizId: string;
  documentId: string;
  documentName: string;
  quizTitle: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  attemptRound: number;
  retakeCount: number;
  submittedAt: string;
};

export type QuizReportRow = {
  personId: string;
  personName: string;
  teamId: string;
  teamName: string;
  learningTotal: number;
  learningCompleted: number;
  learningInProgress: number;
  learningNotStarted: number;
  learningProgressPercent: number;
  totalAttempts: number;
  retakeCount: number;
  averageScore: number;
  highestScore: number;
  lastAttemptAt?: string;
  attempts: QuizReportAttempt[];
};

export async function getQuizReport(
  sessionUserId: string | null | undefined
): Promise<QuizReportRow[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  if (shouldUseSupabasePhaseA()) {
    const [attemptRows, quizzesRes, docsRes, peopleRes, teamsRes, progressRes, usersRes] = await Promise.all([
      pgQuery("select * from quiz_attempts order by submitted_at desc nulls last"),
      pgQuery("select id,title from learning_quizzes"),
      pgQuery("select * from documents"),
      pgQuery("select * from people"),
      pgQuery("select id,name from company_teams"),
      pgQuery("select * from learning_progress"),
      pgQuery("select person_id, role from users where person_id is not null"),
    ]);
    const allAttempts = attemptRows.rows.map((row) => mapPgQuizAttemptRow(row));
    const quizMap = new Map(quizzesRes.rows.map((q) => [String(q.id), String(q.title ?? "Quiz")]));
    const documents = docsRes.rows.map((row) => mapPgDocumentRow(row));
    const docMap = new Map(documents.map((document) => [document._id, document.name]));
    const learningDocuments = documents.filter((document) => document.isLearningMaterial);
    const people = peopleRes.rows.map((row) => mapPgPersonRow(row));
    const mappedPeople = people.map(mapDbPerson);
    const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
    const personRolesByPersonId = buildPersonRolesMap(usersRes.rows);
    const teamNameMap = new Map(teamsRes.rows.map((t) => [String(t.id), String(t.name)]));
    const progressRows = progressRes.rows.map((row) => mapPgLearningProgressRow(row));

    const targetPeople = actor.isAdmin
      ? mappedPeople
      : actor.isLeader
        ? actor.teamMembers
        : [actor.person];
    const targetPersonIds = new Set(targetPeople.map((person) => person.id));
    const attempts = allAttempts.filter((attempt) => targetPersonIds.has(attempt.personId));
    const attemptRounds = computeAttemptRoundByPersonAndDocument(attempts);
    const attemptDocIdsByPerson = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      const docIds = attemptDocIdsByPerson.get(attempt.personId) ?? new Set<string>();
      docIds.add(attempt.documentId);
      attemptDocIdsByPerson.set(attempt.personId, docIds);
    }
    const progressByPersonAndDocument = new Map<string, DbLearningProgress>();
    for (const progress of progressRows) {
      progressByPersonAndDocument.set(`${progress.personId}:${progress.documentId}`, progress);
    }

    const grouped = new Map<string, DbQuizAttempt[]>();
    for (const attempt of attempts) {
      const list = grouped.get(attempt.personId) ?? [];
      list.push(attempt);
      grouped.set(attempt.personId, list);
    }

    const rows: QuizReportRow[] = [];
    for (const person of targetPeople) {
      const personAttempts = grouped.get(person.id) ?? [];
      const accessibleLearningDocuments = learningDocuments.filter((document) =>
        canPersonAccessDocument(person, document, ownerTeamByPersonId, personRolesByPersonId) && !document.isLocked
      );
      const attemptedDocIds = attemptDocIdsByPerson.get(person.id) ?? new Set<string>();
      let learningCompleted = 0;
      let learningInProgress = 0;
      for (const document of accessibleLearningDocuments) {
        const progress = progressByPersonAndDocument.get(`${person.id}:${document._id}`);
        const hasStarted =
          Boolean(progress?.startedAt) ||
          (progress?.activeStepIndex ?? 0) > 0 ||
          (progress?.completedStepIds?.length ?? 0) > 0 ||
          Object.keys(progress?.startedAtByStepId ?? {}).length > 0;
        const completed = isLearningProgressCompleted(progress, document) || attemptedDocIds.has(document._id);
        if (completed) {
          learningCompleted++;
        } else if (hasStarted) {
          learningInProgress++;
        }
      }
      const learningTotal = accessibleLearningDocuments.length;
      const learningNotStarted = Math.max(learningTotal - learningCompleted - learningInProgress, 0);
      const attemptDetails: QuizReportAttempt[] = personAttempts.map((a) => ({
        ...(() => {
          const attemptRound = Math.max(1, attemptRounds.get(a._id) ?? 1);
          return { attemptRound, retakeCount: Math.max(0, attemptRound - 1) };
        })(),
        quizId: a.quizId,
        documentId: a.documentId,
        documentName: docMap.get(a.documentId) ?? "Tài liệu",
        quizTitle: quizMap.get(a.quizId) ?? "Quiz",
        score: a.score,
        correctAnswers: a.correctAnswers,
        totalQuestions: a.totalQuestions,
        submittedAt: a.submittedAt,
      }));
      const scores = personAttempts.map((a) => a.score);
      const retakeCount = attemptDetails.reduce((sum, attempt) => sum + attempt.retakeCount, 0);
      rows.push({
        personId: person.id,
        personName: person.name,
        teamId: person.team,
        teamName: teamNameMap.get(person.team) ?? person.team,
        learningTotal,
        learningCompleted,
        learningInProgress,
        learningNotStarted,
        learningProgressPercent: learningTotal > 0 ? Math.round((learningCompleted / learningTotal) * 100) : 0,
        totalAttempts: personAttempts.length,
        retakeCount,
        averageScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
        highestScore: scores.length > 0 ? Math.max(...scores) : 0,
        lastAttemptAt: personAttempts[0]?.submittedAt,
        attempts: attemptDetails,
      });
    }
    rows.sort((a, b) => b.learningProgressPercent - a.learningProgressPercent || b.averageScore - a.averageScore);
    return rows;
  }

  const db = await getMongoDb();

  let personIdFilter: string[] | null = null;
  if (actor.isAdmin) {
    personIdFilter = null;
  } else if (actor.isLeader) {
    personIdFilter = actor.teamMembers.map((m) => m.id);
  } else {
    personIdFilter = [actor.person.id];
  }

  const attemptQuery = personIdFilter ? { personId: { $in: personIdFilter } } : {};
  const attempts = await db
    .collection<DbQuizAttempt>("quiz_attempts")
    .find(attemptQuery, { sort: { submittedAt: -1 } })
    .toArray();
  const attemptRounds = computeAttemptRoundByPersonAndDocument(attempts);

  const quizIds = [...new Set(attempts.map((a) => a.quizId))];

  const [quizzes, documents, people, companyTeams, progresses, users] = await Promise.all([
    db.collection<DbLearningQuiz>("learning_quizzes").find({ _id: { $in: quizIds } }).toArray(),
    db.collection<DbDocument>("documents").find({}).toArray(),
    db.collection<DbPerson>("people").find(personIdFilter ? { _id: { $in: personIdFilter } } : {}).toArray(),
    db.collection<DbCompanyTeam>("company_teams").find({}).toArray(),
    db.collection<DbLearningProgress>("learning_progress").find(personIdFilter ? { personId: { $in: personIdFilter } } : {}).toArray(),
    db.collection<DbUser>("users").find({ personId: { $exists: true } }, { projection: { personId: 1, role: 1 } }).toArray(),
  ]);

  const quizMap = new Map(quizzes.map((q) => [q._id, q]));
  const docMap = new Map(documents.map((d) => [d._id, d.name]));
  const teamNameMap = new Map(companyTeams.map((t) => [t._id, t.name]));
  const mappedPeople = people.map(mapDbPerson);
  const ownerTeamByPersonId = new Map(people.map((person) => [person._id, normalizeTeamId(person.teamId)]));
  const personRolesByPersonId = new Map<string, Set<UserRole>>();
  for (const user of users) {
    if (!user.personId) continue;
    const roles = personRolesByPersonId.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesByPersonId.set(user.personId, roles);
  }
  const learningDocuments = documents.filter((document) => document.isLearningMaterial);
  const progressByPersonAndDocument = new Map<string, DbLearningProgress>();
  for (const progress of progresses) {
    progressByPersonAndDocument.set(`${progress.personId}:${progress.documentId}`, progress);
  }
  const attemptDocIdsByPerson = new Map<string, Set<string>>();
  for (const attempt of attempts) {
    const docIds = attemptDocIdsByPerson.get(attempt.personId) ?? new Set<string>();
    docIds.add(attempt.documentId);
    attemptDocIdsByPerson.set(attempt.personId, docIds);
  }

  const grouped = new Map<string, DbQuizAttempt[]>();
  for (const attempt of attempts) {
    const list = grouped.get(attempt.personId) ?? [];
    list.push(attempt);
    grouped.set(attempt.personId, list);
  }

  const rows: QuizReportRow[] = [];
  for (const person of mappedPeople) {
    const personAttempts = grouped.get(person.id) ?? [];
    const accessibleLearningDocuments = learningDocuments.filter((document) =>
      canPersonAccessDocument(person, document, ownerTeamByPersonId, personRolesByPersonId) && !document.isLocked
    );
    const attemptedDocIds = attemptDocIdsByPerson.get(person.id) ?? new Set<string>();
    let learningCompleted = 0;
    let learningInProgress = 0;
    for (const document of accessibleLearningDocuments) {
      const progress = progressByPersonAndDocument.get(`${person.id}:${document._id}`);
      const hasStarted =
        Boolean(progress?.startedAt) ||
        (progress?.activeStepIndex ?? 0) > 0 ||
        (progress?.completedStepIds?.length ?? 0) > 0 ||
        Object.keys(progress?.startedAtByStepId ?? {}).length > 0;
      const completed = isLearningProgressCompleted(progress, document) || attemptedDocIds.has(document._id);
      if (completed) {
        learningCompleted++;
      } else if (hasStarted) {
        learningInProgress++;
      }
    }
    const learningTotal = accessibleLearningDocuments.length;
    const learningNotStarted = Math.max(learningTotal - learningCompleted - learningInProgress, 0);

    const attemptDetails: QuizReportAttempt[] = personAttempts.map((a) => ({
      ...(() => {
        const attemptRound = Math.max(1, attemptRounds.get(a._id) ?? 1);
        return { attemptRound, retakeCount: Math.max(0, attemptRound - 1) };
      })(),
      quizId: a.quizId,
      documentId: a.documentId,
      documentName: docMap.get(a.documentId) ?? "Tài liệu",
      quizTitle: quizMap.get(a.quizId)?.title ?? "Quiz",
      score: a.score,
      correctAnswers: a.correctAnswers,
      totalQuestions: a.totalQuestions,
      submittedAt: a.submittedAt,
    }));

    const scores = personAttempts.map((a) => a.score);
    const retakeCount = attemptDetails.reduce((sum, attempt) => sum + attempt.retakeCount, 0);
    rows.push({
      personId: person.id,
      personName: person.name,
      teamId: person.team,
      teamName: teamNameMap.get(person.team) ?? person.team,
      learningTotal,
      learningCompleted,
      learningInProgress,
      learningNotStarted,
      learningProgressPercent: learningTotal > 0 ? Math.round((learningCompleted / learningTotal) * 100) : 0,
      totalAttempts: personAttempts.length,
      retakeCount,
      averageScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
      highestScore: scores.length > 0 ? Math.max(...scores) : 0,
      lastAttemptAt: personAttempts[0]?.submittedAt,
      attempts: attemptDetails,
    });
  }

  rows.sort((a, b) => b.learningProgressPercent - a.learningProgressPercent || b.averageScore - a.averageScore);
  return rows;
}

export async function deleteChatMessage(sessionUserId: string | null | undefined, threadId: string, messageId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
  }

  if (shouldUseSupabasePhaseA()) {
    const messageRes = await pgQuery("select * from chat_messages where id = $1 and thread_id = $2 limit 1", [messageId, threadId]);
    const row = messageRes.rows[0];
    const message = row ? mapPgChatMessageRow(row) : null;
    if (!message || message.senderId !== actor.person.id) return false;

    await pgQuery("delete from chat_messages where id = $1 and thread_id = $2", [messageId, threadId]);
    const lastRes = await pgQuery("select * from chat_messages where thread_id = $1 order by created_at desc nulls last limit 1", [threadId]);
    const lastRow = lastRes.rows[0];
    const lastMessage = lastRow ? mapPgChatMessageRow(lastRow) : null;

    const now = new Date().toISOString();
    await pgQuery(
      "update chat_threads set last_message=$1,last_message_at=$2::timestamptz,updated_at=$3::timestamptz where id=$4",
      [lastMessage?.content ?? "", lastMessage?.createdAt ?? now, now, threadId]
    );
    return true;
  }

  const db = await getMongoDb();
  const message = await db.collection<DbChatMessage>("chat_messages").findOne({ _id: messageId, threadId });
  if (!message || message.senderId !== actor.person.id) {
    return false;
  }

  await db.collection<DbChatMessage>("chat_messages").deleteOne({ _id: messageId, threadId });

  const lastMessage = await db.collection<DbChatMessage>("chat_messages").find(
    { threadId },
    { sort: { createdAt: -1 }, limit: 1 }
  ).next();

  await db.collection<DbChatThread>("chat_threads").updateOne(
    { _id: threadId },
    {
      $set: {
        lastMessage: lastMessage?.content ?? "",
        lastMessageAt: lastMessage?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }
  );

  return true;
}
