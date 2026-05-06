import "server-only";

import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import {
  canManageStoreRole,
  isAdminLikeRole,
  isStoreRole,
  requiresApprovalRole,
  type Department,
  type UserAccount,
  type UserRole
} from "@/lib/auth";
import { STORE_BRANCH_ID_SET, STORE_REGIONS, type StoreRegion } from "@/lib/store-branches";
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
  storeRegion?: StoreRegion;
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
  folder?: string;
  folderId?: string;
  tags: string[];
  isStarred: boolean;
  thumbnail?: string | null;
  description?: string;
  url?: string;
  visibility?: "team" | "office" | "store" | "specific";
  visibleToPersonIds?: string[];
  isLearningMaterial?: boolean;
  learningPlan?: Document["learningPlan"];
};

type DbFolder = {
  _id: string;
  name: string;
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
  storeRegion?: StoreRegion;
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
  storeRegion?: StoreRegion;
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
      const candidateBranches = candidateUser.storeBranchIds ?? [];
      const hasOverlap = candidateBranches.some((branchId) => actorBranches.has(branchId));
      if (hasOverlap) managed.add(candidate.id);
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
  reviewQuestions?: QuizQuestion[];
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
  personRole?: string;
  team: string;
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
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeIdentityValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
  if (role === "manager") {
    return "leader";
  }

  if (role === "boss") {
    return "ceo";
  }

  return role;
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
    folder: document.folder,
    folderId: document.folderId,
    tags: document.tags ?? [],
    isStarred: document.isStarred,
    thumbnail: document.thumbnail ?? undefined,
    description: document.description,
    url: document.url,
    visibility: document.visibility ?? "team",
    visibleToPersonIds: document.visibleToPersonIds ?? [],
    isLearningMaterial: document.isLearningMaterial ?? false,
    learningPlan: document.learningPlan
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
    createdByPersonId: quiz.createdByPersonId,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}

function mapDbQuizAttempt(
  attempt: DbQuizAttempt,
  personName?: string,
  personRole?: string,
  reviewQuestions?: QuizQuestion[]
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
    reviewQuestions,
  };
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

function mapDbFolder(folder: DbFolder): Folder {
  return {
    id: folder._id,
    name: folder.name,
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

function createEmptyTaskGroups(): TaskGroups {
  return {
    "This Week": [],
    "Last Week": [],
    "This Month": []
  };
}

export async function getAuthState(userId?: string | null) {
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
  const db = await getMongoDb();
  const [project, adminPersonIds] = await Promise.all([
    db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: projectId }),
    getAdminRealtimePersonIds()
  ]);

  return Array.from(new Set([...(project?.memberIds ?? []), ...adminPersonIds]));
}

export async function getDocumentRealtimeAudience(documentId: string) {
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
  const isAdmin = isAdminLikeRole(user.role);
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

function isStorePerson(person: Person) {
  const normalizedRole = normalizeIdentityValue(person.role);
  return (
    person.team === "store" ||
    normalizedRole.includes("cửa hàng") ||
    normalizedRole.includes("cua hang")
  );
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
  ownerTeamByPersonId: Map<string, string>
) {
  const ownerTeam = ownerTeamByPersonId.get(document.ownerId);
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
        return { ok: false, message: "Vui lòng chọn Cửa hàng trưởng quản lý." };
      }
      const leadUser = await db.collection<DbUser>("users").findOne({ _id: normalizedStoreLeadUserId, verified: true });
      if (!leadUser || normalizeUserRole(leadUser.role) !== "store_lead" || leadUser.department !== "Cửa hàng") {
        return { ok: false, message: "Cửa hàng trưởng đã chọn không hợp lệ." };
      }
      if (!leadUser.storeRegion || !leadUser.storeBranchIds || leadUser.storeBranchIds.length === 0) {
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
  const db = await getMongoDb();
  await ensureCompanyDirectorySynced(db);
  const [people, teams] = await Promise.all([
    db.collection<DbPerson>("people").find({}, { sort: { name: 1 } }).toArray(),
    db.collection<DbCompanyTeam>("company_teams").find(
      { _id: { $in: supportedTeamIds } },
      { sort: { name: 1 } }
    ).toArray()
  ]);

  return {
    people: people.map(mapDbPerson),
    teams: teams.map(mapDbCompanyTeam)
  };
}

type PersonMutationInput = {
  name: string;
  role: string;
  email: string;
  imageURL?: string;
  team: string;
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

export async function createPersonRecord(
  sessionUserId: string | null | undefined,
  input: PersonMutationInput
) {
  const actor = await requirePeopleManagerActor(sessionUserId);

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
        updatedAt: new Date().toISOString()
      }
    }
  );

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

  const db = await getMongoDb();
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

  const db = await getMongoDb();
  const project = await db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: input.projectId });
  if (!project || (!actor.isAdmin && !project.memberIds.includes(actor.person.id))) {
    throw new Error("Forbidden");
  }

  if (!actor.isLeader && !actor.isAdmin && input.assigneeId !== actor.person.id) {
    throw new Error("Forbidden");
  }

  if (!project.memberIds.includes(input.assigneeId) || !canAccessPerson(actor, input.assigneeId)) {
    throw new Error("Forbidden");
  }

  const maxTask = await db.collection<DbTask>("tasks").find({}, { sort: { taskNumber: -1 }, limit: 1 }).next();
  const nextTaskNumber = (maxTask?.taskNumber ?? 0) + 1;
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

  const db = await getMongoDb();
  const existingTask = await db.collection<DbTask>("tasks").findOne({ taskNumber });
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

  const db = await getMongoDb();
  const normalizedProjectId = projectId?.trim() || "general";
  const schedules = await db.collection<DbSchedule>("schedules").find(
    { workspaceTeamId: normalizedProjectId },
    { sort: { dateKey: 1, startTime: 1, createdAt: 1 } }
  ).toArray();

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

  const db = await getMongoDb();
  const normalizedProjectId = input.projectId?.trim() || "general";
  if (normalizedProjectId !== "general") {
    const project = await db.collection<DbWorkspaceTeam>("workspace_teams").findOne({ _id: normalizedProjectId });
    if (!project || (!actor.isAdmin && !project.memberIds.includes(actor.person.id))) {
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

  const db = await getMongoDb();
  const existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  if (!existing || !canViewSchedule(actor, existing)) {
    throw new Error("Forbidden");
  }

  const attendeeIds = Array.from(new Set(updates.attendeeIds));
  if (attendeeIds.length === 0 || !canManageScheduleAttendees(actor, attendeeIds)) {
    throw new Error("Forbidden");
  }

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

  const db = await getMongoDb();
  const existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
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

  const db = await getMongoDb();
  const existing = await db.collection<DbSchedule>("schedules").findOne({ _id: scheduleId });
  if (!existing || !canViewSchedule(actor, existing)) {
    throw new Error("Forbidden");
  }

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

  const db = await getMongoDb();
  await db.collection<DbTest>("tests").insertOne(document);
  return mapDbTest(document);
}

export async function getDocumentsData(sessionUserId?: string | null, folderId?: string | null) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) return [];

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
  for (const user of allUsers) {
    if (!user.personId) continue;
    const roles = personRolesMap.get(user.personId) ?? new Set<UserRole>();
    roles.add(normalizeUserRole(user.role));
    personRolesMap.set(user.personId, roles);
  }
  // Vận hành leader: team "product" + isLeader
  const isVanHanhLeader = actor.isLeader && !actor.isAdmin && actor.person.team === "product";

  return allDocs
    .filter((doc) => {
      if (actor.isAdmin) return true;

      const visibility = doc.visibility ?? "team";
      const ownerTeam = personTeamMap.get(doc.ownerId);
      if (ownerTeam && actor.person.team !== ownerTeam) return false;
      const ownerRoles = personRolesMap.get(doc.ownerId);
      const ownerIsLeaderCreator =
        Boolean(ownerRoles?.has("leader")) &&
        !Boolean(ownerRoles?.has("admin") || ownerRoles?.has("ceo"));

      // Tài liệu do leader tạo: chỉ trong phạm vi phòng ban của leader tạo.
      if (ownerIsLeaderCreator) {
        if (visibility === "specific") {
          return (
            doc.ownerId === actor.person.id ||
            (actor.person.team === ownerTeam && (doc.visibleToPersonIds ?? []).includes(actor.person.id))
          );
        }
        return actor.person.team === ownerTeam || doc.ownerId === actor.person.id;
      }

      if (visibility === "team") {
        return actor.person.team === ownerTeam || doc.ownerId === actor.person.id;
      }
      if (visibility === "office") {
        return actor.person.team !== "store";
      }
      if (visibility === "store") {
        return actor.person.team === "store" || isVanHanhLeader;
      }
      // "specific"
      return (
        doc.ownerId === actor.person.id ||
        actor.isLeader ||
        (doc.visibleToPersonIds ?? []).includes(actor.person.id)
      );
    })
    .map(mapDbDocument);
}

export async function createDocumentRecord(
  sessionUserId: string | null | undefined,
  input: Partial<Document> & { name: string; type: Document["type"] }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");
  const isAdminActor = actor.user.role === "admin" || actor.user.role === "ceo";
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
  };

  await db.collection<DbDocument>("documents").insertOne(nextDocument);
  return mapDbDocument(nextDocument);
}

export async function updateDocumentRecord(
  sessionUserId: string | null | undefined,
  documentId: string,
  updates: Partial<Document>
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  const isAdminActor = actor.user.role === "admin" || actor.user.role === "ceo";

  const db = await getMongoDb();
  const existing = await db.collection<DbDocument>("documents").findOne({ _id: documentId });
  if (!existing || !canAccessPerson(actor, existing.ownerId)) return null;
  if (!actor.isLeader && !actor.isAdmin && existing.ownerId !== actor.person.id) return null;

  const payload: Partial<DbDocument> = { modifiedAt: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.folder !== undefined) payload.folder = updates.folder;
  if (updates.folderId !== undefined) payload.folderId = updates.folderId;
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
  input: { name: string }
) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");

  const now = new Date().toISOString();
  const folder: DbFolder = {
    _id: `folder_${Date.now()}`,
    name: input.name.trim(),
    ownerId: actor.person.id,
    teamId: actor.person.team,
    createdAt: now,
    updatedAt: now
  };

  const db = await getMongoDb();
  await db.collection<DbFolder>("document_folders").insertOne(folder);
  return mapDbFolder(folder);
}

export async function deleteFolderRecord(sessionUserId: string | null | undefined, folderId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canCreateDocuments(actor)) throw new Error("Forbidden");

  const db = await getMongoDb();
  const folder = await db.collection<DbFolder>("document_folders").findOne({ _id: folderId });
  if (!folder) return false;
  if (!actor.isAdmin && folder.teamId !== actor.person.team) return false;

  await db.collection<DbFolder>("document_folders").deleteOne({ _id: folderId });
  await db.collection<DbDocument>("documents").updateMany(
    { folderId },
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
  const db = await getMongoDb();
  if (!actor) {
    throw new Error("Unauthorized");
  }

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
  }
): Promise<LearningQuizRecord> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canManageLearningContent(actor)) throw new Error("Forbidden");

  const db = await getMongoDb();
  const existing = await db.collection<DbLearningQuiz>("learning_quizzes").findOne({ documentId: input.documentId });
  if (existing) throw new Error("Quiz đã tồn tại cho tài liệu này.");

  const now = new Date().toISOString();
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
  }
): Promise<LearningQuizRecord | null> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canManageLearningContent(actor)) throw new Error("Forbidden");

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
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (actor.user.role === "store_trainer") throw new Error("Forbidden");

  const db = await getMongoDb();
  const existingAttempt = await db.collection<DbQuizAttempt>("quiz_attempts").findOne({
    documentId,
    personId: actor.person.id,
  });
  if (existingAttempt) throw new Error("Bạn đã hoàn thành bài kiểm tra này rồi.");

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

  const reviewQuestions = quiz.questions.map((q) => ({
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  }));

  return mapDbQuizAttempt(attempt, actor.person.name, actor.person.role, reviewQuestions);
}

export async function getMyQuizAttempt(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<QuizAttemptRecord | null> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  const db = await getMongoDb();
  const attempt = await db.collection<DbQuizAttempt>("quiz_attempts").findOne({
    documentId,
    personId: actor.person.id,
  });
  return attempt ? mapDbQuizAttempt(attempt) : null;
}

export async function getTeamQuizAttempts(
  sessionUserId: string | null | undefined,
  documentId: string
): Promise<QuizAttemptRecord[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");
  if (!canViewTeamLearningReports(actor)) throw new Error("Forbidden");

  const db = await getMongoDb();
  const [document, attempts] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db
      .collection<DbQuizAttempt>("quiz_attempts")
      .find({ documentId }, { sort: { submittedAt: -1 } })
      .toArray(),
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

  return scopedAttempts.map((attempt) =>
    mapDbQuizAttempt(
      attempt,
      peopleById.get(attempt.personId)?.name ?? "Unknown",
      peopleById.get(attempt.personId)?.role
    )
  );
}

export async function getMyLearningProgress(
  sessionUserId: string | null | undefined
): Promise<LearningProgressRecord[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  const db = await getMongoDb();
  const progresses = await db
    .collection<DbLearningProgress>("learning_progress")
    .find({ personId: actor.person.id }, { sort: { updatedAt: -1 } })
    .toArray();

  return progresses.map(mapDbLearningProgress);
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

  const db = await getMongoDb();
  const [document, people] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: input.documentId }),
    db.collection<DbPerson>("people").find({}, { projection: { _id: 1, teamId: 1 } }).toArray(),
  ]);

  if (!document) throw new Error("Document not found.");

  const ownerTeamByPersonId = new Map(
    people.map((person) => [person._id, normalizeTeamId(person.teamId)])
  );
  const canLearnViaPersonalVisibility = canPersonAccessDocument(actor.person, document, ownerTeamByPersonId);
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

  const db = await getMongoDb();
  const [document, allPeople] = await Promise.all([
    db.collection<DbDocument>("documents").findOne({ _id: documentId }),
    db.collection<DbPerson>("people").find({}).toArray(),
  ]);
  if (!document) return [];

  const mappedPeople = allPeople.map(mapDbPerson);
  const ownerTeamByPersonId = new Map(
    mappedPeople.map((person) => [person.id, person.team])
  );
  const visibleTeamMemberIds = new Set(actor.teamMembers.map((member) => member.id));
  const targetPeople = mappedPeople.filter((person) => {
    if (!visibleTeamMemberIds.has(person.id)) return false;
    if (!isEmployeePerson(person)) return false;
    if (actor.user.role === "store_lead" && person.id === actor.person.id) return false;
    return canPersonAccessDocument(person, document, ownerTeamByPersonId);
  });

  if (targetPeople.length === 0) return [];

  const targetPersonIds = targetPeople.map((person) => person.id);
  const [progresses, attempts] = await Promise.all([
    db
      .collection<DbLearningProgress>("learning_progress")
      .find({ documentId, personId: { $in: targetPersonIds } })
      .toArray(),
    db
      .collection<DbQuizAttempt>("quiz_attempts")
      .find({ documentId, personId: { $in: targetPersonIds } })
      .toArray(),
  ]);

  const progressByPersonId = new Map(progresses.map((progress) => [progress.personId, progress]));
  const attemptPersonIdSet = new Set(attempts.map((attempt) => attempt.personId));

  return targetPeople
    .map((person) => {
      const progress = progressByPersonId.get(person.id);
      const hasStarted =
        Boolean(progress?.startedAt) ||
        (progress?.activeStepIndex ?? 0) > 0 ||
        (progress?.completedStepIds?.length ?? 0) > 0 ||
        Object.keys(progress?.startedAtByStepId ?? {}).length > 0;
      const completed = Boolean(progress?.completedAt) || attemptPersonIdSet.has(person.id);

      return {
        personId: person.id,
        personName: person.name,
        personRole: person.role,
        team: person.team,
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
  submittedAt: string;
};

export type QuizReportRow = {
  personId: string;
  personName: string;
  teamId: string;
  teamName: string;
  totalAttempts: number;
  averageScore: number;
  highestScore: number;
  lastAttemptAt: string;
  attempts: QuizReportAttempt[];
};

export async function getQuizReport(
  sessionUserId: string | null | undefined
): Promise<QuizReportRow[]> {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) throw new Error("Unauthorized");

  const db = await getMongoDb();

  // Determine which personIds we can see
  let personIdFilter: string[] | null = null;
  if (actor.isAdmin) {
    personIdFilter = null; // all
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

  if (attempts.length === 0) return [];

  // Load quizzes and documents in parallel
  const quizIds = [...new Set(attempts.map((a) => a.quizId))];
  const docIds = [...new Set(attempts.map((a) => a.documentId))];
  const personIds = [...new Set(attempts.map((a) => a.personId))];

  const [quizzes, documents, people, companyTeams] = await Promise.all([
    db.collection<DbLearningQuiz>("learning_quizzes").find({ _id: { $in: quizIds } }).toArray(),
    db.collection<DbDocument>("documents").find({ _id: { $in: docIds } }, { projection: { _id: 1, name: 1 } }).toArray(),
    db.collection<DbPerson>("people").find({ _id: { $in: personIds } }).toArray(),
    db.collection<DbCompanyTeam>("company_teams").find({}).toArray(),
  ]);

  const quizMap = new Map(quizzes.map((q) => [q._id, q]));
  const docMap = new Map(documents.map((d) => [d._id, d.name]));
  const personMap = new Map(people.map((p) => [p._id, p]));
  const teamNameMap = new Map(companyTeams.map((t) => [t._id, t.name]));

  // Group attempts by person
  const grouped = new Map<string, DbQuizAttempt[]>();
  for (const attempt of attempts) {
    const list = grouped.get(attempt.personId) ?? [];
    list.push(attempt);
    grouped.set(attempt.personId, list);
  }

  const rows: QuizReportRow[] = [];
  for (const [personId, personAttempts] of grouped) {
    const person = personMap.get(personId);
    if (!person) continue;

    const attemptDetails: QuizReportAttempt[] = personAttempts.map((a) => ({
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
    rows.push({
      personId,
      personName: person.name,
      teamId: person.teamId,
      teamName: teamNameMap.get(person.teamId) ?? person.teamId,
      totalAttempts: personAttempts.length,
      averageScore: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      highestScore: Math.max(...scores),
      lastAttemptAt: personAttempts[0]!.submittedAt,
      attempts: attemptDetails,
    });
  }

  // Sort by average score desc
  rows.sort((a, b) => b.averageScore - a.averageScore);
  return rows;
}

export async function deleteChatMessage(sessionUserId: string | null | undefined, threadId: string, messageId: string) {
  const actor = await getSessionActor(sessionUserId);
  if (!actor) {
    throw new Error("Unauthorized");
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
