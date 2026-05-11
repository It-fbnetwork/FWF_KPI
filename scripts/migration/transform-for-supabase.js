#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const INPUT_DIR = process.argv[2] || path.resolve('migration_export/raw');
const OUTPUT_DIR = process.argv[3] || path.resolve('migration_export/sql');

const COLLECTION_CONFIG = {
  users: { table: 'users', columns: ['id','name','email','password','person_id','role','department','store_region','store_branch_ids','store_lead_user_id','verified','created_at','updated_at','raw_json'] },
  people: { table: 'people', columns: ['id','name','role','email','image_url','team_id','working_hours','created_at','updated_at','raw_json'] },
  company_teams: { table: 'company_teams', columns: ['id','name','color','member_ids','raw_json'] },
  workspace_teams: { table: 'workspace_teams', columns: ['id','name','slug','color','member_ids','owner_id','visibility','created_at','updated_at','raw_json'] },
  tasks: { table: 'tasks', columns: ['id','task_number','workspace_team_id','time_period','name','comments','likes','assignee_id','status','status_color','execution_period','audience','weight','result_method','target','progress','kpis','child_goal','parent_goal','description','attachments','created_at','updated_at','raw_json'] },
  documents: { table: 'documents', columns: ['id','name','type','size','owner_id','created_at','modified_at','folder','folder_id','tags','is_starred','thumbnail','description','url','visibility','visible_to_person_ids','is_learning_material','learning_plan','deadline_at','raw_json'] },
  document_folders: { table: 'document_folders', columns: ['id','name','owner_id','team_id','created_at','updated_at','raw_json'] },
  learning_quizzes: { table: 'learning_quizzes', columns: ['id','document_id','title','description','questions','duration_minutes','time_per_question_seconds','deadline_at','created_by_person_id','created_at','updated_at','raw_json'] },
  quiz_attempts: { table: 'quiz_attempts', columns: ['id','quiz_id','document_id','person_id','answers','score','correct_answers','total_questions','started_at','submitted_at','raw_json'] },
  learning_progress: { table: 'learning_progress', columns: ['id','person_id','document_id','started_at','completed_at','active_step_index','completed_step_ids','started_at_by_step_id','created_at','updated_at','raw_json'] },
  chat_threads: { table: 'chat_threads', columns: ['id','type','participant_ids','team_id','last_message','last_message_at','created_at','updated_at','raw_json'] },
  chat_messages: { table: 'chat_messages', columns: ['id','thread_id','sender_id','type','content','file_name','mime_type','file_size','status','created_at','raw_json'] },
  schedules: { table: 'schedules', columns: ['id','workspace_team_id','date_key','title','description','start_time','end_time','attendee_ids','created_by_person_id','created_at','updated_at','raw_json'] },
  tests: { table: 'tests', columns: ['id','title','description','questions','duration_minutes','created_by_person_id','created_at','updated_at','raw_json'] },
  person_notifications: { table: 'person_notifications', columns: ['id','person_id','type','actor_id','action','entity_type','entity_label','thread_id','project_id','schedule_id','entity_id','message_id','target_person_ids','occurred_at','created_at','read_at','raw_json'] },
  pending_registrations: { table: 'pending_registrations', columns: ['id','email','name','role','department','store_region','store_branch_ids','store_lead_user_id','otp','expires_at','created_at','raw_json'] },
  pending_login_otps: { table: 'pending_login_otps', columns: ['id','email','otp','expires_at','created_at','raw_json'] },
  role_approval_requests: { table: 'role_approval_requests', columns: ['id','email','name','role','department','store_region','store_branch_ids','store_lead_user_id','status','approver_user_id','otp_verified_at','created_at','updated_at','approved_at','rejected_at','raw_json'] },
  uploads_files: { table: 'uploads_files', columns: ['id','filename','length','chunk_size','upload_date','metadata','raw_json'] }
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    return JSON.parse(raw);
  }

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeMongoSpecial(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeMongoSpecial);
  }

  if (!value || typeof value !== 'object') return value;

  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$oid') return String(value.$oid);
  if (keys.length === 1 && keys[0] === '$date') {
    const dateVal = value.$date;
    if (typeof dateVal === 'string') return new Date(dateVal).toISOString();
    if (dateVal && typeof dateVal === 'object' && '$numberLong' in dateVal) {
      return new Date(Number(dateVal.$numberLong)).toISOString();
    }
  }
  if (keys.length === 1 && keys[0] === '$numberLong') return Number(value.$numberLong);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = normalizeMongoSpecial(v);
  }
  return out;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toJson(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function mapRecord(collection, doc) {
  const raw = normalizeMongoSpecial(doc);

  switch (collection) {
    case 'users':
      return {
        id: raw._id,
        name: raw.name,
        email: raw.email,
        password: raw.password,
        person_id: raw.personId,
        role: raw.role,
        department: raw.department,
        store_region: raw.storeRegion,
        store_branch_ids: toJson(raw.storeBranchIds || []),
        store_lead_user_id: raw.storeLeadUserId,
        verified: raw.verified === true,
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'people':
      return {
        id: raw._id,
        name: raw.name,
        role: raw.role,
        email: raw.email,
        image_url: raw.imageURL,
        team_id: raw.teamId,
        working_hours: toJson(raw.workingHours),
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'company_teams':
      return { id: raw._id, name: raw.name, color: raw.color, member_ids: toJson(raw.memberIds || []), raw_json: toJson(raw) };
    case 'workspace_teams':
      return {
        id: raw._id,
        name: raw.name,
        slug: raw.slug,
        color: raw.color,
        member_ids: toJson(raw.memberIds || []),
        owner_id: raw.ownerId,
        visibility: raw.visibility,
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'tasks':
      return {
        id: raw._id,
        task_number: raw.taskNumber,
        workspace_team_id: raw.workspaceTeamId,
        time_period: raw.timePeriod,
        name: raw.name,
        comments: raw.comments,
        likes: raw.likes,
        assignee_id: raw.assigneeId,
        status: raw.status,
        status_color: raw.statusColor,
        execution_period: raw.executionPeriod,
        audience: raw.audience,
        weight: raw.weight,
        result_method: raw.resultMethod,
        target: raw.target,
        progress: raw.progress,
        kpis: toJson(raw.kpis || []),
        child_goal: raw.childGoal,
        parent_goal: raw.parentGoal,
        description: raw.description,
        attachments: toJson(raw.attachments || []),
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'documents':
      return {
        id: raw._id,
        name: raw.name,
        type: raw.type,
        size: raw.size,
        owner_id: raw.ownerId,
        created_at: toIso(raw.createdAt),
        modified_at: toIso(raw.modifiedAt),
        folder: raw.folder,
        folder_id: raw.folderId,
        tags: toJson(raw.tags || []),
        is_starred: raw.isStarred === true,
        thumbnail: raw.thumbnail,
        description: raw.description,
        url: raw.url,
        visibility: raw.visibility,
        visible_to_person_ids: toJson(raw.visibleToPersonIds || []),
        is_learning_material: raw.isLearningMaterial === true,
        learning_plan: toJson(raw.learningPlan),
        deadline_at: toIso(raw.deadlineAt),
        raw_json: toJson(raw)
      };
    case 'document_folders':
      return { id: raw._id, name: raw.name, owner_id: raw.ownerId, team_id: raw.teamId, created_at: toIso(raw.createdAt), updated_at: toIso(raw.updatedAt), raw_json: toJson(raw) };
    case 'learning_quizzes':
      return {
        id: raw._id,
        document_id: raw.documentId,
        title: raw.title,
        description: raw.description,
        questions: toJson(raw.questions || []),
        duration_minutes: raw.durationMinutes,
        time_per_question_seconds: raw.timePerQuestionSeconds,
        deadline_at: toIso(raw.deadlineAt),
        created_by_person_id: raw.createdByPersonId,
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'quiz_attempts':
      return {
        id: raw._id,
        quiz_id: raw.quizId,
        document_id: raw.documentId,
        person_id: raw.personId,
        answers: toJson(raw.answers || []),
        score: raw.score,
        correct_answers: raw.correctAnswers,
        total_questions: raw.totalQuestions,
        started_at: toIso(raw.startedAt),
        submitted_at: toIso(raw.submittedAt),
        raw_json: toJson(raw)
      };
    case 'learning_progress':
      return {
        id: raw._id,
        person_id: raw.personId,
        document_id: raw.documentId,
        started_at: toIso(raw.startedAt),
        completed_at: toIso(raw.completedAt),
        active_step_index: raw.activeStepIndex,
        completed_step_ids: toJson(raw.completedStepIds || []),
        started_at_by_step_id: toJson(raw.startedAtByStepId || {}),
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'chat_threads':
      return {
        id: raw._id,
        type: raw.type,
        participant_ids: toJson(raw.participantIds || []),
        team_id: raw.teamId,
        last_message: raw.lastMessage,
        last_message_at: toIso(raw.lastMessageAt),
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'chat_messages':
      return {
        id: raw._id,
        thread_id: raw.threadId,
        sender_id: raw.senderId,
        type: raw.type,
        content: raw.content,
        file_name: raw.fileName,
        mime_type: raw.mimeType,
        file_size: raw.fileSize,
        status: raw.status,
        created_at: toIso(raw.createdAt),
        raw_json: toJson(raw)
      };
    case 'schedules':
      return {
        id: raw._id,
        workspace_team_id: raw.workspaceTeamId,
        date_key: raw.dateKey,
        title: raw.title,
        description: raw.description,
        start_time: raw.startTime,
        end_time: raw.endTime,
        attendee_ids: toJson(raw.attendeeIds || []),
        created_by_person_id: raw.createdByPersonId,
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'tests':
      return {
        id: raw._id,
        title: raw.title,
        description: raw.description,
        questions: toJson(raw.questions || []),
        duration_minutes: raw.durationMinutes,
        created_by_person_id: raw.createdByPersonId,
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        raw_json: toJson(raw)
      };
    case 'person_notifications':
      return {
        id: raw._id,
        person_id: raw.personId,
        type: raw.type,
        actor_id: raw.actorId,
        action: raw.action,
        entity_type: raw.entityType,
        entity_label: raw.entityLabel,
        thread_id: raw.threadId,
        project_id: raw.projectId,
        schedule_id: raw.scheduleId,
        entity_id: raw.entityId,
        message_id: raw.messageId,
        target_person_ids: toJson(raw.targetPersonIds || []),
        occurred_at: toIso(raw.occurredAt),
        created_at: toIso(raw.createdAt),
        read_at: toIso(raw.readAt),
        raw_json: toJson(raw)
      };
    case 'pending_registrations':
      return {
        id: raw._id,
        email: raw.email,
        name: raw.name,
        role: raw.role,
        department: raw.department,
        store_region: raw.storeRegion,
        store_branch_ids: toJson(raw.storeBranchIds || []),
        store_lead_user_id: raw.storeLeadUserId,
        otp: raw.otp,
        expires_at: toIso(raw.expiresAt),
        created_at: toIso(raw.createdAt),
        raw_json: toJson(raw)
      };
    case 'pending_login_otps':
      return {
        id: raw._id,
        email: raw.email,
        otp: raw.otp,
        expires_at: toIso(raw.expiresAt),
        created_at: toIso(raw.createdAt),
        raw_json: toJson(raw)
      };
    case 'role_approval_requests':
      return {
        id: raw._id,
        email: raw.email,
        name: raw.name,
        role: raw.role,
        department: raw.department,
        store_region: raw.storeRegion,
        store_branch_ids: toJson(raw.storeBranchIds || []),
        store_lead_user_id: raw.storeLeadUserId,
        status: raw.status,
        approver_user_id: raw.approverUserId,
        otp_verified_at: toIso(raw.otpVerifiedAt),
        created_at: toIso(raw.createdAt),
        updated_at: toIso(raw.updatedAt),
        approved_at: toIso(raw.approvedAt),
        rejected_at: toIso(raw.rejectedAt),
        raw_json: toJson(raw)
      };
    case 'uploads_files':
      return {
        id: raw._id,
        filename: raw.filename,
        length: raw.length,
        chunk_size: raw.chunkSize,
        upload_date: toIso(raw.uploadDate),
        metadata: toJson(raw.metadata || {}),
        raw_json: toJson(raw)
      };
    default:
      return { id: raw._id || null, raw_json: toJson(raw) };
  }
}

function main() {
  ensureDir(OUTPUT_DIR);
  const summaries = [];

  for (const [collection, config] of Object.entries(COLLECTION_CONFIG)) {
    const filePath = path.join(INPUT_DIR, `${collection}.json`);
    const docs = parseJsonFile(filePath);
    const rows = docs.map((doc) => mapRecord(collection, doc));

    const csvPath = path.join(OUTPUT_DIR, `${config.table}.csv`);
    const header = config.columns.join(',');
    const csvRows = rows.map((row) => config.columns.map((col) => csvEscape(row[col])).join(','));
    fs.writeFileSync(csvPath, [header, ...csvRows].join('\n'));

    summaries.push({ collection, table: config.table, input: docs.length, output: rows.length, file: csvPath });
    console.log(`Done ${collection}: ${rows.length} rows`);
  }

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2));
  console.log(`Manifest: ${manifestPath}`);
}

main();
