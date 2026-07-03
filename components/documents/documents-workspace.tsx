"use client"

import type React from "react"

import dynamic from "next/dynamic"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useDirectory } from "@/components/directory-provider"
import { useAuth } from "@/components/auth-provider"
import { subscribeToPersonChannel } from "@/lib/client/realtime"
import { YoutubeLikePlayer } from "@/components/youtube-like-player"
import { toast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { documentTypes, formatFileSize, formatDate, type Document, type Folder } from "@/lib/documents"
import { isAdminLikeRole, type UserAccount } from "@/lib/auth"
import { useIsMobile } from "@/components/hooks/use-mobile"
import {
    Search,
    Filter,
    Grid3X3,
    List,
    FolderPlus,
    FolderOpen,
    Folder as FolderIcon,
    ChevronDown,
    ChevronLeft,
    Star,
    StarOff,
    Trash2,
    Edit,
    Move,
    Eye,
    FileText,
    Tag,
    MoreHorizontal,
    Link,
    Globe,
    Store,
    Building2,
    X,
    Plus,
    BookOpen,
    ClipboardCheck,
    Timer,
    CheckCircle2,
    XCircle,
    Trophy,
    BarChart2,
    ChevronRight,
    Pencil,
    Users,
    GraduationCap,
    RotateCcw,
    Lock,
    Unlock,
    Loader2,
    PanelLeft,
    Maximize2,
    Minimize2,
    FileDown,
} from "lucide-react"

type LearningQuizQuestion = {
    text: string
    options: string[]
    correctIndex?: number
    explanation?: string
}

type LockableScreenOrientation = ScreenOrientation & {
    lock?: (orientation: "landscape" | "portrait" | "any" | "natural") => Promise<void>
}

type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
}

type FullscreenDocument = globalThis.Document & {
    webkitFullscreenElement?: Element | null
    webkitExitFullscreen?: () => Promise<void> | void
}

type LearningQuizRecord = {
    id: string
    documentId: string
    title: string
    description: string
    questions: LearningQuizQuestion[]
    durationMinutes: number
    timePerQuestionSeconds?: number
    deadlineAt?: string
    createdByPersonId: string
    createdAt: string
    updatedAt: string
}

type QuizAttemptRecord = {
    id: string
    quizId: string
    documentId: string
    personId: string
    personName?: string
    personRole?: string
    answers: number[]
    score: number
    correctAnswers: number
    totalQuestions: number
    startedAt: string
    submittedAt: string
    attemptRound?: number
    retakeCount?: number
    isActiveAttempt?: boolean
    reviewQuestions?: LearningQuizQuestion[]
}

const getQuizRetakeCount = (attempt: Pick<QuizAttemptRecord, "attemptRound" | "retakeCount">) =>
    Math.max(0, attempt.retakeCount ?? ((attempt.attemptRound ?? 1) - 1))

type QuizAttemptResetRecord = {
    id: string
    documentId: string
    personId: string
    personName?: string
    resetByPersonId: string
    resetByPersonName?: string
    resetAt: string
}

type QuizCreateQuestion = {
    text: string
    options: [string, string, string, string]
    correctIndex: number
    explanation: string
}

interface QuizCreateState {
    open: boolean
    documentId: string
    documentName: string
    existingQuizId: string | null
    title: string
    description: string
    durationMinutes: string
    timePerQuestionSeconds: string
    deadlineAt: string
    questions: QuizCreateQuestion[]
    isNewDocument?: boolean
    isGenerating?: boolean
    autoQuestionCount?: string
}

interface QuizTakeState {
    open: boolean
    quiz: LearningQuizRecord | null
    documentId: string
    answers: number[]
    currentQuestion: number
    startedAt: string
    timeLeftSeconds: number
    questionTimeLimitSeconds: number
    expiredQuestionIndexes: number[]
    isSubmitting: boolean
    isSubmitted: boolean
    result: QuizAttemptRecord | null
    questionOrder: number[]
    optionOrderByQuestion: number[][]
}

interface QuizResultsState {
    open: boolean
    documentId: string
    documentName: string
    attempts: QuizAttemptRecord[]
    resets: QuizAttemptResetRecord[]
    learningStatuses: LearningStatusRow[]
    isLoading: boolean
}

type QuizResultsRoleFilter = "all" | "store_manager" | "store_lead" | "store_technician" | "trainer" | "other"
type QuizResultsTab = "results" | "reset_history"

type LearningStatusType = "completed" | "in_progress" | "not_started"

type LearningStatusRow = {
    personId: string
    personName: string
    personEmail?: string
    personRole?: string
    team: string
    storeRegion?: string
    storeBranchIds?: number[]
    storeBranchNames?: string[]
    supervisorUserId?: string
    supervisorName?: string
    supervisorRole?: string
    status: LearningStatusType
}

type LearningStatusListDetail = {
    title: string
    rows: LearningStatusRow[]
}

type ExcelCellValue = string | number | boolean | null | undefined

function escapeExcelXml(value: ExcelCellValue) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

function sanitizeExcelSheetName(name: string) {
    const safeName = name.replace(/[\\/?*[\]:]/g, " ").trim()
    return (safeName || "Sheet").slice(0, 31)
}

function sanitizeFilenamePart(name: string) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "bao-cao"
}

function buildExcelWorksheet(name: string, rows: ExcelCellValue[][]) {
    const worksheetRows = rows.map((row) => (
        `<Row>${row.map((cell) => {
            const cellType = typeof cell === "number" ? "Number" : "String"
            return `<Cell><Data ss:Type="${cellType}">${escapeExcelXml(cell)}</Data></Cell>`
        }).join("")}</Row>`
    )).join("")

    return `<Worksheet ss:Name="${escapeExcelXml(sanitizeExcelSheetName(name))}"><Table>${worksheetRows}</Table></Worksheet>`
}

function downloadExcelWorkbook(filename: string, sheets: Array<{ name: string; rows: ExcelCellValue[][] }>) {
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${sheets.map((sheet) => buildExcelWorksheet(sheet.name, sheet.rows)).join("")}
</Workbook>`
    const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename.endsWith(".xls") ? filename : `${filename}.xls`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
}

function shuffleIndices(length: number) {
    const indices = Array.from({ length }, (_, index) => index)
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = indices[i]!
        indices[i] = indices[j]!
        indices[j] = temp
    }
    return indices
}

type LearningProgressRecord = {
    documentId: string
    startedAt?: string
    completedAt?: string
    activeStepIndex: number
    completedStepIds: string[]
    startedAtByStepId: Record<string, string>
}

type SortBy = "name" | "date" | "size" | "type" | "owner"
type GroupBy = "none" | "type" | "date" | "owner" | "folder"
type ViewMode = "grid" | "list"
type DocVisibility = "team" | "office" | "store"
type DocumentPatch = Omit<Partial<Document>, "folder" | "folderId"> & {
    folder?: string | null
    folderId?: string | null
}

interface ContextMenuPosition {
    x: number
    y: number
}

interface NewFolderDialogState {
    open: boolean
    name: string
    parentId: string | null
}

interface MoveDocumentDialogState {
    open: boolean
    document: Document | null
    selectedFolderId: string | null
}

interface CreateDocumentDialogState {
    open: boolean
    name: string
    visibility: DocVisibility
    file: File | null
    selectedOfficePersonIds: string[]
    deadlineAt: string
}

interface UploadRecoveryDialogState {
    open: boolean
    message: string
    suggestedName: string
}

interface VisibilityDialogState {
    open: boolean
    docId: string
    visibility: DocVisibility
    selectedOfficePersonIds: string[]
}

const LEARNING_REQUIRED_SECONDS = 10
const LANDSCAPE_HINT_DURATION_MS = 4500
const FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS = [80, 180, 360, 650]
const QUIZ_PASS_SCORE = 90

const MobilePdfPageCanvas = dynamic(
    () => import("@/components/mobile-pdf-page-canvas").then((mod) => mod.MobilePdfPageCanvas),
    {
        ssr: false,
        loading: () => (
            <div className="grid h-full w-full place-items-center bg-neutral-100 dark:bg-neutral-950">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
            </div>
        ),
    }
)

type LearningProgressState = {
    completedDocIds: string[]
    startedAtByDocId: Record<string, string>
}

type LearningPlanProgress = {
    activeStepIndex: number
    completedStepIds: string[]
    startedAtByStepId: Record<string, string>
}

type LearningPlanProgressMap = Record<string, LearningPlanProgress>
type LearningFullscreenViewport = {
    width: number
    height: number
    offsetLeft: number
    offsetTop: number
}

function buildDefaultPlanProgress(): LearningPlanProgress {
    return {
        activeStepIndex: 0,
        completedStepIds: [],
        startedAtByStepId: {},
    }
}

function getLearningVideoProgressKey(docId: string, stepId?: string) {
    return stepId ? `${docId}:${stepId}` : docId
}

function getDefaultVisibility(user: UserAccount | null): DocVisibility {
    if (user?.role === "ceo" || user?.role === "admin") return "office"
    return "team"
}

function buildDefaultCreateDocumentDialog(user: UserAccount | null): CreateDocumentDialogState {
    return {
        open: false,
        name: "",
        visibility: getDefaultVisibility(user),
        file: null,
        selectedOfficePersonIds: [],
        deadlineAt: "",
    }
}

function toDatetimeLocalInputValue(value?: string) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const timezoneOffset = date.getTimezoneOffset() * 60_000
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function inferBaseName(fileName: string) {
    const idx = fileName.lastIndexOf(".")
    return idx > 0 ? fileName.slice(0, idx) : fileName
}

function buildDefaultVisibilityDialog(user: UserAccount | null): VisibilityDialogState {
    return {
        open: false,
        docId: "",
        visibility: getDefaultVisibility(user),
        selectedOfficePersonIds: [],
    }
}

export default function DocumentsPage() {
    const { people, refresh } = useDirectory()
    const { user } = useAuth()
    const isMobile = useIsMobile()
    const isLeaderOrAdmin =
        user?.role === "leader" ||
        user?.role === "admin" ||
        user?.role === "ceo" ||
        (user?.role === "store_trainer" && user?.department === "Cửa hàng")
    const canViewTeamLearningReports =
        isLeaderOrAdmin ||
        (user?.department === "Cửa hàng" &&
            (user?.role === "store_manager" || user?.role === "store_lead"))
    const canResetTeamLearning = isAdminLikeRole(user?.role) || user?.role === "store_trainer"

    const [searchQuery, setSearchQuery] = useState("")
    const [sortBy, setSortBy] = useState<SortBy>("date")
    const [groupBy, setGroupBy] = useState<GroupBy>("none")
    const [viewMode, setViewMode] = useState<ViewMode>("grid")
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [drawerPreviewImageFailed, setDrawerPreviewImageFailed] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ document: Document; position: ContextMenuPosition } | null>(null)
    const [documentsData, setDocumentsData] = useState<Document[]>([])
    const [documentsLoading, setDocumentsLoading] = useState(true)
    const [folders, setFolders] = useState<Folder[]>([])
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
    const [newFolderDialog, setNewFolderDialog] = useState<NewFolderDialogState>({ open: false, name: "", parentId: null })
    const [moveDocumentDialog, setMoveDocumentDialog] = useState<MoveDocumentDialogState>({
        open: false,
        document: null,
        selectedFolderId: null,
    })
    const [createDocumentDialog, setCreateDocumentDialog] = useState<CreateDocumentDialogState>(
        buildDefaultCreateDocumentDialog(user)
    )
    const [createRoleFilter, setCreateRoleFilter] = useState<string[]>([])
    const [createMemberSearch, setCreateMemberSearch] = useState("")
    const [uploadRecoveryDialog, setUploadRecoveryDialog] = useState<UploadRecoveryDialogState>({
        open: false,
        message: "",
        suggestedName: "",
    })
    const [visibilityDialog, setVisibilityDialog] = useState<VisibilityDialogState>(
        buildDefaultVisibilityDialog(user)
    )
    const [visibilityRoleFilter, setVisibilityRoleFilter] = useState<string[]>([])
    const [visibilityMemberSearch, setVisibilityMemberSearch] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [pendingStarIds, setPendingStarIds] = useState<Set<string>>(new Set())
    const [pendingLockIds, setPendingLockIds] = useState<Set<string>>(new Set())

    // ── Learning / E-learning state ──────────────────────────────────
    const [activeTab, setActiveTab] = useState<"all" | "learning">("all")
    const [quizzes, setQuizzes] = useState<Record<string, LearningQuizRecord | null>>({})
    const [myAttempts, setMyAttempts] = useState<Record<string, QuizAttemptRecord | null>>({})
    const [learningDataLoaded, setLearningDataLoaded] = useState(false)
    const [learningDataLoading, setLearningDataLoading] = useState(false)

    const defaultQuizCreate = (): QuizCreateState => ({
        open: false, documentId: "", documentName: "", existingQuizId: null,
        title: "", description: "", durationMinutes: "15", timePerQuestionSeconds: "30", deadlineAt: "",
        questions: [{ text: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" }],
        isNewDocument: false,
    })
    const defaultQuizTake = (): QuizTakeState => ({
        open: false, quiz: null, documentId: "", answers: [],
        currentQuestion: 0, startedAt: "", timeLeftSeconds: 0,
        questionTimeLimitSeconds: 0,
        expiredQuestionIndexes: [],
        isSubmitting: false, isSubmitted: false, result: null,
        questionOrder: [],
        optionOrderByQuestion: [],
    })

    const [quizCreateDialog, setQuizCreateDialog] = useState<QuizCreateState>(defaultQuizCreate())
    const [quizTakeModal, setQuizTakeModal] = useState<QuizTakeState>(defaultQuizTake())
    const [quizResultsModal, setQuizResultsModal] = useState<QuizResultsState>({
        open: false, documentId: "", documentName: "", attempts: [], resets: [], learningStatuses: [], isLoading: false,
    })
    const [resettingAttemptPersonId, setResettingAttemptPersonId] = useState<string | null>(null)
    const [resettingLearningPersonId, setResettingLearningPersonId] = useState<string | null>(null)
    const [quizResultsRoleFilter, setQuizResultsRoleFilter] = useState<QuizResultsRoleFilter>("all")
    const [quizResultsSupervisorFilter, setQuizResultsSupervisorFilter] = useState<string>("all")
    const [selectedLearningStatusListDetail, setSelectedLearningStatusListDetail] = useState<LearningStatusListDetail | null>(null)
    const [learningStatusListSearch, setLearningStatusListSearch] = useState("")
    const [quizResultsTab, setQuizResultsTab] = useState<QuizResultsTab>("results")
    const [quizResetPersonFilter, setQuizResetPersonFilter] = useState<string>("all")
    const [quizResetTimeFilter, setQuizResetTimeFilter] = useState<"all" | "today" | "7d" | "30d" | "90d">("all")
    const [expandedAttemptIds, setExpandedAttemptIds] = useState<Set<string>>(new Set())
    const [selectedLearningDoc, setSelectedLearningDoc] = useState<Document | null>(null)
    const [isLearningSidebarCollapsed, setIsLearningSidebarCollapsed] = useState(false)
    const [failedLearningPreviewKeys, setFailedLearningPreviewKeys] = useState<Record<string, true>>({})
    const [failedCanvasPreviewKeys, setFailedCanvasPreviewKeys] = useState<Record<string, true>>({})
    const [learningPreviewErrorMessages, setLearningPreviewErrorMessages] = useState<Record<string, string>>({})
    const [loadedLearningPreviewKeys, setLoadedLearningPreviewKeys] = useState<Record<string, true>>({})
    const [learningProgress, setLearningProgress] = useState<LearningProgressState>({
        completedDocIds: [],
        startedAtByDocId: {},
    })
    const [learningPlanProgress, setLearningPlanProgress] = useState<LearningPlanProgressMap>({})
    const [learningRemainingSeconds, setLearningRemainingSeconds] = useState(LEARNING_REQUIRED_SECONDS)
    const [videoProgressByDocId, setVideoProgressByDocId] = useState<Record<string, { current: number; duration: number }>>({})
    const [isLearningFullscreen, setIsLearningFullscreen] = useState(false)
    const [showLandscapeHint, setShowLandscapeHint] = useState(false)
    const [isLearningLandscape, setIsLearningLandscape] = useState(true)
    const [learningFullscreenViewport, setLearningFullscreenViewport] = useState<LearningFullscreenViewport | null>(null)
    const [isLearningViewportSettling, setIsLearningViewportSettling] = useState(false)
    const [isBrowserOnline, setIsBrowserOnline] = useState(true)
    const [mobileLearningMode, setMobileLearningMode] = useState<"list" | "reader">("list")

    const contextMenuRef = useRef<HTMLDivElement>(null)
    const quizTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const learningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const quizTakeModalRef = useRef<QuizTakeState>(defaultQuizTake())
    const learningViewerRef = useRef<HTMLDivElement>(null)
    const learningTouchStartRef = useRef<{ x: number; y: number } | null>(null)
    const documentsLoadSeqRef = useRef(0)
    const learningFullscreenTransitionRef = useRef(false)
    const learningViewportSettleSeqRef = useRef(0)

    const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null
    const folderChildrenByParentId = useMemo(() => {
        const map = new Map<string, Folder[]>()
        for (const folder of folders) {
            const parentKey = folder.parentId ?? "__root__"
            const children = map.get(parentKey) ?? []
            children.push(folder)
            map.set(parentKey, children)
        }
        for (const children of map.values()) {
            children.sort((a, b) => a.name.localeCompare(b.name, "vi"))
        }
        return map
    }, [folders])
    const visibleFolders = folderChildrenByParentId.get(activeFolderId ?? "__root__") ?? []
    const activeFolderPath = useMemo(() => {
        if (!activeFolderId) return []
        const byId = new Map(folders.map((folder) => [folder.id, folder]))
        const path: Folder[] = []
        const visited = new Set<string>()
        let cursor = byId.get(activeFolderId)
        while (cursor && !visited.has(cursor.id)) {
            path.unshift(cursor)
            visited.add(cursor.id)
            cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
        }
        return path
    }, [activeFolderId, folders])
    const getFolderPathLabel = useCallback((folderId: string | null | undefined) => {
        if (!folderId) return "Ngoài folder"
        const byId = new Map(folders.map((folder) => [folder.id, folder]))
        const path: string[] = []
        const visited = new Set<string>()
        let cursor = byId.get(folderId)
        while (cursor && !visited.has(cursor.id)) {
            path.unshift(cursor.name)
            visited.add(cursor.id)
            cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
        }
        return path.length > 0 ? path.join(" / ") : "Folder không tồn tại"
    }, [folders])
    const currentPerson = people.find((person) => person.id === user?.personId) ?? null
    const normalizeRoleValue = useCallback((value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(), [])
    const getRoleGroup = useCallback((role: string) => {
        const normalized = normalizeRoleValue(role)
        if (normalized.includes("trainer")) return "trainer"
        if (normalized.includes("quan li cua hang") || normalized.includes("quan ly cua hang") || normalized.includes("store_manager")) return "store_manager"
        if (normalized.includes("cua hang truong") || normalized.includes("store_lead")) return "store_lead"
        if (
            normalized.includes("ky thuat vien") ||
            normalized.includes("nhan vien cua hang") ||
            normalized.includes("store_technician") ||
            normalized.includes("store_staff")
        ) return "store_technician"
        return normalized
    }, [normalizeRoleValue])
    const officeSelectablePeople = currentPerson
        ? people.filter((person) => person.team === currentPerson.team)
        : []

    useEffect(() => {
        if (isMobile) setIsLearningSidebarCollapsed(false)
    }, [isMobile])

    useEffect(() => {
        const updateOnlineStatus = () => setIsBrowserOnline(navigator.onLine)
        updateOnlineStatus()
        window.addEventListener("online", updateOnlineStatus)
        window.addEventListener("offline", updateOnlineStatus)
        return () => {
            window.removeEventListener("online", updateOnlineStatus)
            window.removeEventListener("offline", updateOnlineStatus)
        }
    }, [])

    useEffect(() => {
        if (!isMobile) {
            setMobileLearningMode("reader")
            return
        }
        if (activeTab !== "learning") {
            setMobileLearningMode("list")
            return
        }
        if (selectedLearningDoc) {
            setMobileLearningMode("reader")
            return
        }
        if (!selectedLearningDoc) {
            setMobileLearningMode("list")
        }
    }, [activeTab, isMobile, selectedLearningDoc?.id])

    useEffect(() => {
        const isReaderActive = isMobile && activeTab === "learning" && (mobileLearningMode === "reader" || isLearningFullscreen)
        if (isReaderActive) {
            document.body.dataset.learningReaderActive = "true"
            return () => {
                delete document.body.dataset.learningReaderActive
            }
        }
        delete document.body.dataset.learningReaderActive
        return undefined
    }, [activeTab, isLearningFullscreen, isMobile, mobileLearningMode])

    const unlockLearningOrientation = useCallback(() => {
        if (typeof screen === "undefined") return
        try {
            screen.orientation?.unlock?.()
        } catch {
            // Some browsers expose the API but throw when orientation was not locked.
        }
    }, [])

    const lockLearningLandscape = useCallback(async () => {
        const orientation = typeof screen === "undefined" ? undefined : (screen.orientation as LockableScreenOrientation | undefined)
        if (!isMobile || typeof orientation?.lock !== "function") {
            return false
        }
        try {
            await orientation.lock("landscape")
            return true
        } catch {
            return false
        }
    }, [isMobile])

    const requestNativeFullscreen = useCallback(async () => {
        const target = learningViewerRef.current as FullscreenElement | null
        if (!target) return false
        try {
            if (typeof target.requestFullscreen === "function") {
                await target.requestFullscreen({ navigationUI: "hide" })
                return true
            }
            if (typeof target.webkitRequestFullscreen === "function") {
                await target.webkitRequestFullscreen()
                return true
            }
        } catch {
            return false
        }
        return false
    }, [])

    const exitNativeFullscreen = useCallback(async () => {
        const fullscreenDocument = document as FullscreenDocument
        try {
            if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
                await document.exitFullscreen()
                return
            }
            if (fullscreenDocument.webkitFullscreenElement && typeof fullscreenDocument.webkitExitFullscreen === "function") {
                await fullscreenDocument.webkitExitFullscreen()
            }
        } catch {
            // Browser can reject exitFullscreen when fullscreen already ended.
        }
    }, [])

    const isLandscapeViewport = useCallback(() => {
        if (typeof window === "undefined") return false
        return window.matchMedia?.("(orientation: landscape)").matches || window.innerWidth > window.innerHeight
    }, [])

    useEffect(() => {
        if (!isMobile || !isLearningFullscreen) return
        const settleTimers = new Set<number>()

        const syncFullscreenViewport = () => {
            const viewport = window.visualViewport
            setLearningFullscreenViewport({
                width: Math.round(viewport?.width ?? window.innerWidth),
                height: Math.round(viewport?.height ?? window.innerHeight),
                offsetLeft: Math.round(viewport?.pageLeft ?? 0),
                offsetTop: Math.round(viewport?.pageTop ?? 0),
            })
        }
        const clearSettleTimers = () => {
            settleTimers.forEach((settleTimer) => window.clearTimeout(settleTimer))
            settleTimers.clear()
        }
        const settleFullscreenViewport = () => {
            const settleSeq = learningViewportSettleSeqRef.current + 1
            learningViewportSettleSeqRef.current = settleSeq
            clearSettleTimers()
            setIsLearningViewportSettling(true)
            syncFullscreenViewport()
            for (const delay of FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS) {
                const timer = window.setTimeout(() => {
                    settleTimers.delete(timer)
                    syncFullscreenViewport()
                    if (delay === FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS[FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS.length - 1] && learningViewportSettleSeqRef.current === settleSeq) {
                        setIsLearningViewportSettling(false)
                    }
                }, delay)
                settleTimers.add(timer)
            }
        }

        const syncOrientationState = () => {
            const isLandscape = isLandscapeViewport()
            setIsLearningLandscape(isLandscape)
            setShowLandscapeHint(!isLandscape)
            settleFullscreenViewport()
        }

        syncOrientationState()

        const onOrientationChange = () => {
            syncOrientationState()
        }
        window.addEventListener("orientationchange", onOrientationChange)
        window.addEventListener("resize", onOrientationChange)
        window.visualViewport?.addEventListener("resize", settleFullscreenViewport)
        window.visualViewport?.addEventListener("scroll", settleFullscreenViewport)
        const timer = window.setTimeout(() => setShowLandscapeHint(false), LANDSCAPE_HINT_DURATION_MS)

        return () => {
            window.clearTimeout(timer)
            clearSettleTimers()
            window.removeEventListener("orientationchange", onOrientationChange)
            window.removeEventListener("resize", onOrientationChange)
            window.visualViewport?.removeEventListener("resize", settleFullscreenViewport)
            window.visualViewport?.removeEventListener("scroll", settleFullscreenViewport)
            setLearningFullscreenViewport(null)
            setIsLearningViewportSettling(false)
        }
    }, [isLandscapeViewport, isLearningFullscreen, isMobile])

    useEffect(() => {
        if (!isLearningFullscreen) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            setIsLearningFullscreen(false)
            setIsLearningViewportSettling(false)
            setShowLandscapeHint(false)
            void exitNativeFullscreen()
            unlockLearningOrientation()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [exitNativeFullscreen, isLearningFullscreen, unlockLearningOrientation])

    useEffect(() => {
        const onFullscreenChange = () => {
            const fullscreenDocument = document as FullscreenDocument
            const activeElement = document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null
            if (!activeElement && isLearningFullscreen) {
                setIsLearningFullscreen(false)
                setIsLearningViewportSettling(false)
                setShowLandscapeHint(false)
                unlockLearningOrientation()
            }
        }
        document.addEventListener("fullscreenchange", onFullscreenChange)
        document.addEventListener("webkitfullscreenchange", onFullscreenChange)
        return () => {
            document.removeEventListener("fullscreenchange", onFullscreenChange)
            document.removeEventListener("webkitfullscreenchange", onFullscreenChange)
        }
    }, [isLearningFullscreen, unlockLearningOrientation])

    useEffect(() => {
        if (!isLearningFullscreen) return
        const previousOverflow = document.body.style.overflow
        const previousOverscrollBehavior = document.body.style.overscrollBehavior
        const previousTouchAction = document.body.style.touchAction
        document.body.style.overflow = "hidden"
        document.body.style.overscrollBehavior = "none"
        document.body.style.touchAction = "manipulation"
        return () => {
            document.body.style.overflow = previousOverflow
            document.body.style.overscrollBehavior = previousOverscrollBehavior
            document.body.style.touchAction = previousTouchAction
            setIsLearningLandscape(true)
            setShowLandscapeHint(false)
            unlockLearningOrientation()
        }
    }, [isLearningFullscreen, unlockLearningOrientation])

    const handleToggleLearningFullscreen = useCallback(async (fallbackUrl?: string) => {
        if (learningFullscreenTransitionRef.current) return
        learningFullscreenTransitionRef.current = true
        try {
            if (isLearningFullscreen) {
                setIsLearningFullscreen(false)
                setIsLearningViewportSettling(false)
                setShowLandscapeHint(false)
                await exitNativeFullscreen()
                unlockLearningOrientation()
                return
            }
            setIsLearningFullscreen(true)
            setIsLearningViewportSettling(isMobile)
            if (isMobile) {
                setShowLandscapeHint(!isLandscapeViewport())
                window.setTimeout(() => {
                    if (isLandscapeViewport()) setShowLandscapeHint(false)
                }, FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS[FULLSCREEN_VIEWPORT_SETTLE_DELAYS_MS.length - 1])
                return
            }
            await requestNativeFullscreen()
        } catch {
            if (fallbackUrl && isMobile) {
                window.open(fallbackUrl, "_blank", "noopener,noreferrer")
                return
            }
            toast({
                title: "Không thể bật toàn màn hình.",
                description: "Trình duyệt hiện tại không hỗ trợ hoặc đã chặn thao tác này.",
                variant: "destructive",
            })
        } finally {
            window.setTimeout(() => {
                learningFullscreenTransitionRef.current = false
            }, 450)
        }
    }, [exitNativeFullscreen, isLandscapeViewport, isLearningFullscreen, isMobile, requestNativeFullscreen, unlockLearningOrientation])
    const officeRoleOptions = useMemo(() => {
        const roles = new Set(officeSelectablePeople.map((person) => person.role))
        if (currentPerson?.team === "store") {
            roles.add("Quản lí cửa hàng")
            roles.add("Cửa hàng trưởng")
            roles.add("Kỹ thuật viên")
        }

        roles.delete("Trainer")
        roles.delete("trainer")

        const preferredOrder = ["Quản lí cửa hàng", "Cửa hàng trưởng", "Kỹ thuật viên"]
        const orderedRoles = Array.from(roles).sort((a, b) => {
            const aIndex = preferredOrder.indexOf(a)
            const bIndex = preferredOrder.indexOf(b)
            if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
            if (aIndex >= 0) return -1
            if (bIndex >= 0) return 1
            return a.localeCompare(b, "vi")
        })

        return ["all", ...orderedRoles]
    }, [currentPerson?.team, officeSelectablePeople])
    const matchesAnySelectedRole = useCallback(
        (personRole: string, selectedRoles: string[]) => {
            if (selectedRoles.length === 0) return true
            return selectedRoles.some((selectedRole) => {
                if (personRole === selectedRole) return true
                return getRoleGroup(personRole) === getRoleGroup(selectedRole)
            })
        },
        [getRoleGroup]
    )
    const filteredCreatePeople = useMemo(
        () => {
            const base = officeSelectablePeople.filter((person) =>
                matchesAnySelectedRole(person.role, createRoleFilter)
            )
            const query = createMemberSearch.trim().toLowerCase()
            if (!query) return base
            return base.filter(
                (person) =>
                    person.name.toLowerCase().includes(query) ||
                    person.email.toLowerCase().includes(query)
            )
        },
        [createMemberSearch, createRoleFilter, matchesAnySelectedRole, officeSelectablePeople]
    )
    const filteredVisibilityPeople = useMemo(
        () => {
            const base = officeSelectablePeople.filter((person) =>
                matchesAnySelectedRole(person.role, visibilityRoleFilter)
            )
            const query = visibilityMemberSearch.trim().toLowerCase()
            if (!query) return base
            return base.filter(
                (person) =>
                    person.name.toLowerCase().includes(query) ||
                    person.email.toLowerCase().includes(query)
            )
        },
        [matchesAnySelectedRole, officeSelectablePeople, visibilityMemberSearch, visibilityRoleFilter]
    )

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
                setContextMenu(null)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        loadFolders()
        loadDocuments()
    }, [])

    useEffect(() => {
        loadDocuments()
    }, [activeFolderId])

    useEffect(() => {
        setDrawerPreviewImageFailed(false)
    }, [selectedDocument?.id])

    useEffect(() => {
        if (!selectedLearningDoc?.id) return
        const docPrefix = `${selectedLearningDoc.id}:`
        setFailedLearningPreviewKeys((prev) => {
            let changed = false
            const next: Record<string, true> = {}
            for (const [key, value] of Object.entries(prev)) {
                if (key.startsWith(docPrefix)) {
                    changed = true
                    continue
                }
                next[key] = value
            }
            return changed ? next : prev
        })
        setLoadedLearningPreviewKeys((prev) => {
            let changed = false
            const next: Record<string, true> = {}
            for (const [key, value] of Object.entries(prev)) {
                if (key.startsWith(docPrefix)) {
                    changed = true
                    continue
                }
                next[key] = value
            }
            return changed ? next : prev
        })
        setFailedCanvasPreviewKeys((prev) => {
            let changed = false
            const next: Record<string, true> = {}
            for (const [key, value] of Object.entries(prev)) {
                if (key.startsWith(docPrefix)) {
                    changed = true
                    continue
                }
                next[key] = value
            }
            return changed ? next : prev
        })
    }, [selectedLearningDoc?.id])

    useEffect(() => {
        setCreateDocumentDialog((state) => ({
            ...state,
            visibility: getDefaultVisibility(user),
        }))
    }, [user])

    useEffect(() => {
        if (isLeaderOrAdmin || !user?.personId) {
            setLearningProgress({ completedDocIds: [], startedAtByDocId: {} })
            setLearningPlanProgress({})
            return
        }

        let isCancelled = false
        const loadServerLearningProgress = async () => {
            try {
                const res = await fetch("/api/learning/progress", { credentials: "include", cache: "no-store" })
                if (!res.ok) throw new Error()
                const payload = (await res.json()) as { ok: boolean; progresses: LearningProgressRecord[] }
                const records = payload.progresses ?? []
                const completedDocIds = records
                    .filter((record) => Boolean(record.completedAt))
                    .map((record) => record.documentId)
                const startedAtByDocId = Object.fromEntries(
                    records
                        .filter((record) => Boolean(record.startedAt))
                        .map((record) => [record.documentId, record.startedAt!])
                )
                const nextPlanProgress: LearningPlanProgressMap = Object.fromEntries(
                    records
                        .filter((record) =>
                            (record.completedStepIds?.length ?? 0) > 0 ||
                            (record.activeStepIndex ?? 0) > 0 ||
                            Object.keys(record.startedAtByStepId ?? {}).length > 0
                        )
                        .map((record) => [
                            record.documentId,
                            {
                                activeStepIndex: Math.max(0, record.activeStepIndex ?? 0),
                                completedStepIds: record.completedStepIds ?? [],
                                startedAtByStepId: record.startedAtByStepId ?? {},
                            } satisfies LearningPlanProgress,
                        ])
                )
                if (isCancelled) return
                setLearningProgress({ completedDocIds, startedAtByDocId })
                setLearningPlanProgress(nextPlanProgress)
            } catch {
                if (isCancelled) return
                setLearningProgress({ completedDocIds: [], startedAtByDocId: {} })
                setLearningPlanProgress({})
            }
        }

        void loadServerLearningProgress()
        return () => {
            isCancelled = true
        }
    }, [isLeaderOrAdmin, user?.personId])

    const refreshMyLearningProgress = useCallback(async () => {
        if (isLeaderOrAdmin || !user?.personId) return
        const res = await fetch("/api/learning/progress", { credentials: "include", cache: "no-store" })
        if (!res.ok) throw new Error("Failed to load learning progress.")
        const payload = (await res.json()) as { ok: boolean; progresses: LearningProgressRecord[] }
        const records = payload.progresses ?? []
        const completedDocIds = records
            .filter((record) => Boolean(record.completedAt))
            .map((record) => record.documentId)
        const startedAtByDocId = Object.fromEntries(
            records
                .filter((record) => Boolean(record.startedAt))
                .map((record) => [record.documentId, record.startedAt!])
        )
        const nextPlanProgress: LearningPlanProgressMap = Object.fromEntries(
            records
                .filter((record) =>
                    (record.completedStepIds?.length ?? 0) > 0 ||
                    (record.activeStepIndex ?? 0) > 0 ||
                    Object.keys(record.startedAtByStepId ?? {}).length > 0
                )
                .map((record) => [
                    record.documentId,
                    {
                        activeStepIndex: Math.max(0, record.activeStepIndex ?? 0),
                        completedStepIds: record.completedStepIds ?? [],
                        startedAtByStepId: record.startedAtByStepId ?? {},
                    } satisfies LearningPlanProgress,
                ])
        )
        setLearningProgress({ completedDocIds, startedAtByDocId })
        setLearningPlanProgress(nextPlanProgress)
    }, [isLeaderOrAdmin, user?.personId])

    const buildLearningProgressPayload = (
        documentId: string,
        progressState: LearningProgressState,
        planState: LearningPlanProgressMap
    ) => {
        const planProgress = planState[documentId] ?? buildDefaultPlanProgress()
        const firstStepStartedAt = Object.values(planProgress.startedAtByStepId ?? {})[0]
        return {
            documentId,
            startedAt: progressState.startedAtByDocId[documentId] ?? firstStepStartedAt ?? null,
            completedAt: progressState.completedDocIds.includes(documentId) ? new Date().toISOString() : null,
            activeStepIndex: Math.max(0, planProgress.activeStepIndex),
            completedStepIds: planProgress.completedStepIds ?? [],
            startedAtByStepId: planProgress.startedAtByStepId ?? {},
        }
    }

    const syncLearningProgressToServer = async (
        documentId: string,
        progressState: LearningProgressState,
        planState: LearningPlanProgressMap
    ) => {
        if (isLeaderOrAdmin || !user?.personId) return
        try {
            const payload = buildLearningProgressPayload(documentId, progressState, planState)
            await fetch("/api/learning/progress", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            })
        } catch {
            // keep local UI responsive if sync fails temporarily
        }
    }

    const loadFolders = async () => {
        try {
            const res = await fetch("/api/documents/folders", { credentials: "include", cache: "no-store" })
            if (!res.ok) return
            const payload = (await res.json()) as { folders: Folder[] }
            setFolders(payload.folders)
        } catch { /* ignore */ }
    }

    const loadDocuments = async () => {
        const loadSeq = documentsLoadSeqRef.current + 1
        documentsLoadSeqRef.current = loadSeq
        setDocumentsLoading(true)
        try {
            const url = activeFolderId
                ? `/api/documents?folderId=${activeFolderId}`
                : "/api/documents"
            const res = await fetch(url, { credentials: "include", cache: "no-store" })
            if (!res.ok) return []
            const payload = (await res.json()) as { documents: Document[] }
            setDocumentsData(payload.documents)
            return payload.documents
        } catch {
            return []
        } finally {
            if (documentsLoadSeqRef.current === loadSeq) {
                setDocumentsLoading(false)
            }
        }
    }

    const patchDocument = async (
        documentId: string,
        updates: DocumentPatch
    ) => {
        const res = await fetch(`/api/documents/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
        })
        if (!res.ok) throw new Error("Failed to update document.")
        const payload = (await res.json()) as { ok: boolean; document: Document }
        return payload.document
    }

    const inferDocumentType = (fileName: string): Document["type"] => {
        const ext = fileName.split(".").pop()?.toLowerCase()
        switch (ext) {
            case "pdf": case "docx": case "xlsx": case "pptx": case "txt":
            case "jpg": case "png": case "mp4": case "zip": return ext
            case "fig": case "figma": return "figma"
            default: return "txt"
        }
    }

    // ── Folder handlers ──────────────────────────────────────────────

    const openNewFolderDialog = (parentId: string | null = activeFolderId) => {
        setNewFolderDialog({ open: true, name: "", parentId })
    }

    const handleCreateFolder = async () => {
        if (!newFolderDialog.name.trim()) return
        setIsSubmitting(true)
        try {
            const res = await fetch("/api/documents/folders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: newFolderDialog.name.trim(),
                    parentId: newFolderDialog.parentId,
                }),
            })
            const payload = (await res.json()) as { ok: boolean; folder?: Folder; message?: string }
            if (!res.ok || !payload.folder) throw new Error(payload.message || "Không thể tạo folder")
            const createdFolder = payload.folder
            setFolders((prev) => [createdFolder, ...prev])
            setNewFolderDialog({ open: false, name: "", parentId: null })
            toast({ title: createdFolder.parentId ? "Tạo folder con thành công" : "Tạo folder thành công" })
        } catch {
            toast({ title: "Không thể tạo folder", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleRenameFolder = async (folder: Folder) => {
        const next = window.prompt("Nhập tên folder mới", folder.name)?.trim()
        if (!next || next === folder.name) return
        try {
            const res = await fetch(`/api/documents/folders/${folder.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: next }),
            })
            const payload = (await res.json()) as { ok: boolean; folder?: Folder; message?: string }
            if (!res.ok || !payload.folder) throw new Error(payload.message || "Không thể đổi tên folder")
            const renamedFolder = payload.folder
            setFolders((prev) => prev.map((item) => (item.id === renamedFolder.id ? renamedFolder : item)))
            setDocumentsData((prev) => prev.map((doc) => (
                doc.folderId === renamedFolder.id ? { ...doc, folder: renamedFolder.name } : doc
            )))
            setSelectedDocument((prev) => (
                prev?.folderId === renamedFolder.id ? { ...prev, folder: renamedFolder.name } : prev
            ))
            setSelectedLearningDoc((prev) => (
                prev?.folderId === renamedFolder.id ? { ...prev, folder: renamedFolder.name } : prev
            ))
            toast({ title: "Đã đổi tên folder" })
        } catch {
            toast({ title: "Không thể đổi tên folder", variant: "destructive" })
        }
    }

    const handleDeleteFolder = async (folderId: string) => {
        if (!confirm("Xóa folder này? Folder con cũng sẽ bị xóa. Các file bên trong sẽ không bị xóa.")) return
        try {
            const res = await fetch(`/api/documents/folders/${folderId}`, { method: "DELETE", credentials: "include" })
            const payload = (await res.json()) as { ok: boolean; message?: string }
            if (!res.ok || !payload.ok) throw new Error(payload.message || "Không thể xóa folder")
            const idsToDelete = new Set<string>([folderId])
            let changed = true
            while (changed) {
                changed = false
                for (const folder of folders) {
                    if (folder.parentId && idsToDelete.has(folder.parentId) && !idsToDelete.has(folder.id)) {
                        idsToDelete.add(folder.id)
                        changed = true
                    }
                }
            }
            setFolders((prev) => prev.filter((f) => !idsToDelete.has(f.id)))
            if (activeFolderId && idsToDelete.has(activeFolderId)) {
                setActiveFolderId(null)
                await loadDocuments()
            }
            toast({ title: "Đã xóa folder" })
        } catch {
            toast({ title: "Không thể xóa folder", variant: "destructive" })
        }
    }

    const openCreateDocumentDialog = () => {
        void refresh().catch(() => {
            // keep dialog usable even if directory refresh fails
        })
        setCreateDocumentDialog({
            ...buildDefaultCreateDocumentDialog(user),
            open: true,
        })
        setCreateRoleFilter([])
        setCreateMemberSearch("")
    }

    const closeCreateDocumentDialog = () => {
        setCreateDocumentDialog(buildDefaultCreateDocumentDialog(user))
        setCreateRoleFilter([])
        setCreateMemberSearch("")
    }

    const selectedUploadExt = createDocumentDialog.file?.name.split(".").pop()?.toLowerCase()

    const handleCreateDocument = async () => {
        const { file, visibility } = createDocumentDialog
        const selectedOfficePersonIds = createDocumentDialog.selectedOfficePersonIds ?? []
        const normalizedName = (createDocumentDialog.name ?? "").trim()
        if (!file) return
        const ext = file.name.split(".").pop()?.toLowerCase()
        if (ext !== "pdf" && ext !== "pptx") {
            toast({ title: "Chỉ hỗ trợ upload file PDF hoặc PPTX", variant: "destructive" })
            return
        }

        setIsSubmitting(true)
        try {
            const requestVisibility: Document["visibility"] =
                (visibility === "team" || visibility === "office") && selectedOfficePersonIds.length > 0
                    ? "specific"
                    : visibility

            // Direct upload to Supabase Storage (signed URL) to speed up large files.
            let uploadedFileUrl: string | undefined
            let generatedLearningPlan: Document["learningPlan"] | undefined
            const inferredDocType = inferDocumentType(file.name)
            const contentType = file.type || (
                inferredDocType === "pdf"
                    ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            )

            const presignRes = await fetch("/api/documents/upload/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    filename: file.name,
                    contentType,
                    size: file.size,
                }),
            })
            if (!presignRes.ok) throw new Error("Không thể khởi tạo upload file")
            const presignData = (await presignRes.json()) as {
                ok: boolean
                message?: string
                fileId: string
                bucket: string
                objectPath: string
                uploadUrl: string
                contentType: string
            }
            if (!presignData.ok) throw new Error(presignData.message || "Không thể khởi tạo upload file")

            const directUploadRes = await fetch(presignData.uploadUrl, {
                method: "PUT",
                headers: {
                    "content-type": presignData.contentType || contentType,
                    "x-upsert": "true",
                },
                body: file,
            })
            if (!directUploadRes.ok) throw new Error("Upload file thất bại")

            const finalizeRes = await fetch("/api/documents/upload/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    fileId: presignData.fileId,
                    filename: file.name,
                    contentType: presignData.contentType || contentType,
                    size: file.size,
                    bucket: presignData.bucket,
                    objectPath: presignData.objectPath,
                }),
            })
            if (!finalizeRes.ok) throw new Error("Không thể hoàn tất upload file")
            const uploadData = (await finalizeRes.json()) as {
                ok: boolean
                message?: string
                url: string
                learningPlan?: Document["learningPlan"]
                warnings?: string[]
            }
            if (!uploadData.ok) throw new Error(uploadData.message || "Không thể upload file")
            uploadedFileUrl = uploadData.url
            generatedLearningPlan = uploadData.learningPlan
            if (uploadData.warnings?.length) {
                const conversionFallbackWarning = uploadData.warnings.find((item) =>
                    item.toLowerCase().includes("fallback") || item.toLowerCase().includes("không thể chuyển pptx sang pdf")
                )
                toast({
                    title: "Tài liệu đã tải lên, nhưng có rủi ro hiển thị",
                    description: `${uploadData.warnings[0]} Mẹo: xuất PDF chất lượng cao để hiển thị ổn định hơn.`,
                })
                if (conversionFallbackWarning) {
                    setUploadRecoveryDialog({
                        open: true,
                        message: conversionFallbackWarning,
                        suggestedName: `${inferBaseName(file.name)}.pdf`,
                    })
                }
            }

            const requestPayload = {
                name: normalizedName || file.name,
                type: inferDocumentType(file.name),
                size: file.size,
                folderId: activeFolderId ?? undefined,
                tags: ["uploaded"],
                visibility: requestVisibility,
                visibleToPersonIds: requestVisibility === "specific" ? selectedOfficePersonIds : [],
                description: `Uploaded on ${new Date().toLocaleDateString("vi-VN")}`,
                url: uploadedFileUrl,
                learningPlan: generatedLearningPlan,
                isLearningMaterial: Boolean(generatedLearningPlan),
                deadlineAt: createDocumentDialog.deadlineAt ? new Date(createDocumentDialog.deadlineAt).toISOString() : undefined,
            }

            const res = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(requestPayload),
            })

            const responsePayload = (await res.json()) as { ok: boolean; document?: Document; message?: string }
            if (!res.ok || !responsePayload.ok || !responsePayload.document) {
                throw new Error(responsePayload.message ?? "Không thể tạo tài liệu")
            }
            const createdDocument = responsePayload.document

            setDocumentsData((prev) => [createdDocument, ...prev])
            closeCreateDocumentDialog()
            toast({ title: "Tạo file thành công" })
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : "Không thể tạo tài liệu", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Visibility handler ───────────────────────────────────────────

    const handleSaveVisibility = async () => {
        try {
            const selectedOfficePersonIds = visibilityDialog.selectedOfficePersonIds ?? []
            const requestVisibility: Document["visibility"] =
                (visibilityDialog.visibility === "team" || visibilityDialog.visibility === "office") &&
                    selectedOfficePersonIds.length > 0
                    ? "specific"
                    : visibilityDialog.visibility
            const updated = await patchDocument(visibilityDialog.docId, {
                visibility: requestVisibility,
                visibleToPersonIds:
                    requestVisibility === "specific" ? selectedOfficePersonIds : [],
            })
            setDocumentsData((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
            if (selectedDocument?.id === updated.id) setSelectedDocument(updated)
            setVisibilityDialog(buildDefaultVisibilityDialog(user))
            toast({ title: "Đã cập nhật quyền xem" })
        } catch {
            toast({ title: "Không thể cập nhật quyền xem", variant: "destructive" })
        }
    }

    // ── Document handlers ────────────────────────────────────────────

    const handleDocumentClick = (doc: Document) => {
        if (doc.isLocked && !isLeaderOrAdmin) {
            toast({
                title: "Tài liệu đang bị khóa",
                description: "Trainer đã khóa tài liệu này. Vui lòng chờ mở khóa để xem.",
                variant: "destructive",
            })
            return
        }
        setSelectedDocument(doc)
        setIsDrawerOpen(true)
    }

    const estimateContextMenuHeight = (doc: Document) => {
        let height = 44 /* detail */ + 44 /* star */
        if (doc.type === "link" && doc.url) height += 44
        if (isLeaderOrAdmin) {
            height += 44 /* visibility */
            height += 12 /* separator */
            height += 44 /* rename */
            height += 44 /* move */
            height += 44 /* lock toggle */
            height += 44 /* learning toggle */
            height += 12 /* separator */
            height += 44 /* delete */
        }
        return height + 12 /* vertical padding */
    }

    const handleContextMenu = (e: React.MouseEvent, doc: Document) => {
        e.preventDefault()
        const menuWidth = 220
        const menuHeight = estimateContextMenuHeight(doc)
        const padding = 12
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight
        const safeBottom = isMobile ? 76 : padding
        const x = Math.max(padding, Math.min(e.clientX, viewportWidth - menuWidth - padding))
        const y = Math.max(padding, Math.min(e.clientY, viewportHeight - menuHeight - safeBottom))
        setContextMenu({ document: doc, position: { x, y } })
    }

    const handleStarToggle = async (docId: string) => {
        const target = documentsData.find((d) => d.id === docId)
        if (!target) return
        if (pendingStarIds.has(docId)) return
        setPendingStarIds((prev) => new Set(prev).add(docId))
        try {
            const updated = await patchDocument(docId, { isStarred: !target.isStarred })
            setDocumentsData((prev) => prev.map((d) => (d.id === docId ? updated : d)))
            if (selectedDocument?.id === docId) setSelectedDocument(updated)
        } catch {
            toast({ title: "Không thể cập nhật", variant: "destructive" })
        } finally {
            setPendingStarIds((prev) => {
                const next = new Set(prev)
                next.delete(docId)
                return next
            })
        }
    }

    const handleDeleteDocument = async (docId: string) => {
        if (!confirm("Xóa tài liệu này? Thao tác này không thể hoàn tác.")) return
        try {
            const res = await fetch(`/api/documents/${docId}`, { method: "DELETE", credentials: "include" })
            if (!res.ok) throw new Error()
            setDocumentsData((prev) => prev.filter((d) => d.id !== docId))
            setQuizzes((prev) => {
                const next = { ...prev }
                delete next[docId]
                return next
            })
            setMyAttempts((prev) => {
                const next = { ...prev }
                delete next[docId]
                return next
            })
            if (selectedLearningDoc?.id === docId) {
                setSelectedLearningDoc(null)
            }
            setContextMenu(null)
            if (selectedDocument?.id === docId) { setSelectedDocument(null); setIsDrawerOpen(false) }
            toast({ title: "Đã xóa tài liệu" })
        } catch {
            toast({ title: "Không thể xóa file", variant: "destructive" })
        }
    }

    const handleRenameDocument = async (doc: Document) => {
        const next = window.prompt("Nhập tên mới", doc.name)?.trim()
        if (!next || next === doc.name) return
        try {
            const updated = await patchDocument(doc.id, { name: next })
            setDocumentsData((prev) => prev.map((d) => (d.id === doc.id ? updated : d)))
            setContextMenu(null)
            if (selectedDocument?.id === doc.id) setSelectedDocument(updated)
        } catch {
            toast({ title: "Không thể đổi tên", variant: "destructive" })
        }
    }

    const openMoveDocumentDialog = (doc: Document) => {
        setMoveDocumentDialog({
            open: true,
            document: doc,
            selectedFolderId: doc.folderId ?? null,
        })
        setContextMenu(null)
    }

    const handleConfirmMoveDocument = async () => {
        const doc = moveDocumentDialog.document
        if (!doc) return
        setIsSubmitting(true)
        try {
            const targetFolder = moveDocumentDialog.selectedFolderId
                ? folders.find((folder) => folder.id === moveDocumentDialog.selectedFolderId) ?? null
                : null
            const updated = await patchDocument(doc.id, {
                folder: targetFolder?.name ?? null,
                folderId: targetFolder?.id ?? null,
            })
            setDocumentsData((prev) => {
                if (activeFolderId && updated.folderId !== activeFolderId) {
                    return prev.filter((item) => item.id !== doc.id)
                }
                return prev.map((item) => (item.id === doc.id ? updated : item))
            })
            setMoveDocumentDialog({ open: false, document: null, selectedFolderId: null })
            if (selectedDocument?.id === doc.id) setSelectedDocument(updated)
            if (selectedLearningDoc?.id === doc.id) setSelectedLearningDoc(updated)
            toast({ title: "Đã di chuyển tài liệu" })
        } catch {
            toast({ title: "Không thể di chuyển", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderMoveFolderOption = (folder: Folder, depth = 0): React.ReactNode => {
        const children = folderChildrenByParentId.get(folder.id) ?? []
        const selected = moveDocumentDialog.selectedFolderId === folder.id
        return (
            <div key={folder.id}>
                <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        selected
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-700"
                            : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                    }`}
                    style={{ paddingLeft: `${12 + depth * 22}px` }}
                    onClick={() => setMoveDocumentDialog((state) => ({ ...state, selectedFolderId: folder.id }))}
                >
                    {children.length > 0 ? (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                        <span className="h-3.5 w-3.5" />
                    )}
                    <FolderIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    {children.length > 0 && (
                        <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                            {children.length}
                        </Badge>
                    )}
                </button>
                {children.map((child) => renderMoveFolderOption(child, depth + 1))}
            </div>
        )
    }

    const handleToggleDocumentLock = async (doc: Document) => {
        if (!isLeaderOrAdmin) return
        if (pendingLockIds.has(doc.id)) return
        setPendingLockIds((prev) => new Set(prev).add(doc.id))
        try {
            const updated = await patchDocument(doc.id, { isLocked: !doc.isLocked })
            setDocumentsData((prev) => prev.map((item) => (item.id === doc.id ? updated : item)))
            setSelectedDocument((prev) => (prev?.id === doc.id ? updated : prev))
            setSelectedLearningDoc((prev) => (prev?.id === doc.id ? updated : prev))
            setContextMenu(null)
            toast({ title: updated.isLocked ? "Đã khóa tài liệu" : "Đã mở khóa tài liệu" })
        } catch {
            toast({ title: "Không thể cập nhật trạng thái khóa", variant: "destructive" })
        } finally {
            setPendingLockIds((prev) => {
                const next = new Set(prev)
                next.delete(doc.id)
                return next
            })
        }
    }

    const handleDeleteLearningStep = async (doc: Document, stepId: string) => {
        const steps = doc.learningPlan?.steps ?? []
        if (!doc.learningPlan || steps.length === 0) return
        if (steps.length <= 1) {
            toast({
                title: "Tài liệu cần ít nhất 1 slide",
                description: "Không thể xóa slide cuối cùng.",
                variant: "destructive",
            })
            return
        }

        const targetStep = steps.find((step) => step.id === stepId)
        if (!targetStep) return

        const confirmed = window.confirm(`Xóa "${targetStep.title}" khỏi học liệu?`)
        if (!confirmed) return

        setIsSubmitting(true)
        try {
            const filteredSteps = steps.filter((step) => step.id !== stepId)
            const updatedLearningPlan = {
                ...doc.learningPlan,
                steps: filteredSteps,
            }

            const updated = await patchDocument(doc.id, { learningPlan: updatedLearningPlan })

            setDocumentsData((prev) => prev.map((item) => (item.id === doc.id ? updated : item)))
            setSelectedLearningDoc((prev) => (prev?.id === doc.id ? updated : prev))

            setLearningPlanProgress((prev) => {
                const currentProgress = prev[doc.id] ?? buildDefaultPlanProgress()
                const currentActiveStep = steps[currentProgress.activeStepIndex]
                const activeStepStillExists = currentActiveStep && currentActiveStep.id !== stepId
                const fallbackIndex = Math.max(0, Math.min(currentProgress.activeStepIndex, filteredSteps.length - 1))
                const adjustedActiveStepIndex = activeStepStillExists
                    ? Math.min(currentProgress.activeStepIndex, filteredSteps.length - 1)
                    : Math.max(0, Math.min(currentProgress.activeStepIndex - 1, filteredSteps.length - 1))

                const nextProgressForDoc = {
                    activeStepIndex: Number.isFinite(adjustedActiveStepIndex) ? adjustedActiveStepIndex : fallbackIndex,
                    completedStepIds: currentProgress.completedStepIds.filter((id) => id !== stepId),
                    startedAtByStepId: Object.fromEntries(
                        Object.entries(currentProgress.startedAtByStepId).filter(([id]) => id !== stepId)
                    ),
                }

                const nextState = {
                    ...prev,
                    [doc.id]: nextProgressForDoc,
                }
                void syncLearningProgressToServer(doc.id, learningProgress, nextState)
                return nextState
            })

            toast({ title: "Đã xóa slide khỏi học liệu" })
        } catch {
            toast({ title: "Không thể xóa slide", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Filtering & sorting ──────────────────────────────────────────

    const normalizedSearchQuery = searchQuery.trim().toLowerCase()
    const filteredVisibleFolders = visibleFolders.filter((folder) => {
        if (!normalizedSearchQuery) return true
        const owner = people.find((p) => p.id === folder.ownerId)
        return (
            folder.name.toLowerCase().includes(normalizedSearchQuery) ||
            owner?.name.toLowerCase().includes(normalizedSearchQuery) ||
            folder.teamId.toLowerCase().includes(normalizedSearchQuery)
        )
    })

    const filteredDocuments = documentsData.filter(
        (doc) =>
            doc.name.toLowerCase().includes(normalizedSearchQuery) ||
            doc.tags.some((t) => t.toLowerCase().includes(normalizedSearchQuery)) ||
            doc.folder?.toLowerCase().includes(normalizedSearchQuery)
    )

    const sortedDocuments = [...filteredDocuments].sort((a, b) => {
        switch (sortBy) {
            case "name": return a.name.localeCompare(b.name)
            case "date": return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
            case "size": return b.size - a.size
            case "type": return a.type.localeCompare(b.type)
            case "owner": {
                const na = people.find((p) => p.id === a.ownerId)?.name || ""
                const nb = people.find((p) => p.id === b.ownerId)?.name || ""
                return na.localeCompare(nb)
            }
            default: return 0
        }
    })

    const groupedDocuments = () => {
        if (groupBy === "none") return { "Tất cả": sortedDocuments }
        const groups: Record<string, Document[]> = {}
        sortedDocuments.forEach((doc) => {
            let key = ""
            switch (groupBy) {
                case "type": key = doc.type.toUpperCase(); break
                case "date": {
                    const diff = Math.ceil(Math.abs(Date.now() - new Date(doc.modifiedAt).getTime()) / 86400000)
                    key = diff <= 1 ? "Hôm nay" : diff <= 7 ? "Tuần này" : diff <= 30 ? "Tháng này" : "Cũ hơn"
                    break
                }
                case "owner": key = people.find((p) => p.id === doc.ownerId)?.name || "Không rõ"; break
                case "folder": key = doc.folder || "Chưa có folder"; break
            }
            if (!groups[key]) groups[key] = []
            groups[key].push(doc)
        })
        return groups
    }

    const groups = groupedDocuments()
    const shouldShowDocumentList = Boolean(activeFolderId || normalizedSearchQuery)
    const learningDocs = (isLeaderOrAdmin
        ? documentsData.filter((d) => d.isLearningMaterial)
        : documentsData.filter((d) => !d.isLocked)
    ).sort((a, b) => new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime())
    const learningDocsKey = learningDocs.map((doc) => doc.id).join("|")
    const learningTabLoading = documentsLoading || learningDataLoading || (activeTab === "learning" && !learningDataLoaded)
    const completedLearningCount = learningDocs.filter((doc) => learningProgress.completedDocIds.includes(doc.id)).length

    useEffect(() => {
        if (isLeaderOrAdmin) return
        const validIds = new Set(learningDocs.map((doc) => doc.id))
        setLearningProgress((prev) => {
            const completedDocIds = prev.completedDocIds.filter((id) => validIds.has(id))
            const startedAtByDocId = Object.fromEntries(
                Object.entries(prev.startedAtByDocId).filter(([id]) => validIds.has(id))
            )
            const unchanged =
                completedDocIds.length === prev.completedDocIds.length &&
                Object.keys(startedAtByDocId).length === Object.keys(prev.startedAtByDocId).length
            return unchanged ? prev : { completedDocIds, startedAtByDocId }
        })
    }, [isLeaderOrAdmin, learningDocs])

    useEffect(() => {
        if (activeTab !== "learning" || learningDocs.length === 0) return
        setSelectedLearningDoc((prev) => {
            if (prev && learningDocs.some((doc) => doc.id === prev.id)) return prev
            return learningDocs[0] ?? null
        })
    }, [activeTab, learningDocs])

    useEffect(() => {
        setLearningPlanProgress((prev) => {
            const validIds = new Set(documentsData.map((doc) => doc.id))
            const next: LearningPlanProgressMap = {}
            for (const [docId, progress] of Object.entries(prev)) {
                if (!validIds.has(docId)) continue
                const doc = documentsData.find((item) => item.id === docId)
                const steps = doc?.learningPlan?.steps ?? []
                if (steps.length === 0) continue
                const validStepIds = new Set(steps.map((step) => step.id))
                const completedStepIds = progress.completedStepIds.filter((id) => validStepIds.has(id))
                const startedAtByStepId = Object.fromEntries(
                    Object.entries(progress.startedAtByStepId).filter(([id]) => validStepIds.has(id))
                )
                next[docId] = {
                    activeStepIndex: Math.min(progress.activeStepIndex, Math.max(steps.length - 1, 0)),
                    completedStepIds,
                    startedAtByStepId,
                }
            }
            return next
        })
    }, [documentsData])

    useEffect(() => {
        if (isLeaderOrAdmin || activeTab !== "learning" || !selectedLearningDoc) {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)
            setLearningRemainingSeconds(LEARNING_REQUIRED_SECONDS)
            return
        }
        const currentDocId = selectedLearningDoc.id
        const planSteps = selectedLearningDoc.learningPlan?.steps ?? []
        const docPlanProgress = learningPlanProgress[currentDocId] ?? buildDefaultPlanProgress()
        const activePlanStep = planSteps[docPlanProgress.activeStepIndex] ?? planSteps[0]
        const videoProgress = videoProgressByDocId[getLearningVideoProgressKey(currentDocId)]
        const isVideoLesson = selectedLearningDoc.type === "mp4" && Boolean(selectedLearningDoc.url)

        if (learningProgress.completedDocIds.includes(currentDocId)) {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)
            setLearningRemainingSeconds(0)
            return
        }

        if (isMobile && isLearningFullscreen && !isLearningLandscape) {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)
            setLearningRemainingSeconds(LEARNING_REQUIRED_SECONDS)
            return
        }

        if (planSteps.length > 0 && activePlanStep) {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)

            let startedAt = docPlanProgress.startedAtByStepId[activePlanStep.id]
            if (!startedAt) {
                startedAt = new Date().toISOString()
                setLearningPlanProgress((prev) => {
                    const nextPlanProgress = {
                        ...prev,
                        [currentDocId]: {
                            ...docPlanProgress,
                            startedAtByStepId: {
                                ...docPlanProgress.startedAtByStepId,
                                [activePlanStep.id]: startedAt!,
                            },
                        },
                    }
                    void syncLearningProgressToServer(currentDocId, learningProgress, nextPlanProgress)
                    return nextPlanProgress
                })
            }

            const tick = () => {
                const elapsed = Math.floor((Date.now() - new Date(startedAt!).getTime()) / 1000)
                const required = LEARNING_REQUIRED_SECONDS
                const remain = Math.max(0, required - elapsed)
                setLearningRemainingSeconds(remain)
                if (remain <= 0) {
                    if (learningTimerRef.current) clearInterval(learningTimerRef.current)
                    setLearningPlanProgress((prev) => {
                        const current = prev[currentDocId] ?? buildDefaultPlanProgress()
                        if (current.completedStepIds.includes(activePlanStep.id)) return prev
                        const completedStepIds = [...current.completedStepIds, activePlanStep.id]
                        const nextState: LearningPlanProgress = {
                            ...current,
                            completedStepIds,
                            activeStepIndex: Math.min(current.activeStepIndex, Math.max(planSteps.length - 1, 0)),
                        }
                        const nextPlanProgress = { ...prev, [currentDocId]: nextState }
                        if (completedStepIds.length >= planSteps.length) {
                            const nextLearningProgress = learningProgress.completedDocIds.includes(currentDocId)
                                ? learningProgress
                                : {
                                    ...learningProgress,
                                    completedDocIds: [...learningProgress.completedDocIds, currentDocId],
                                }
                            setLearningProgress(nextLearningProgress)
                            void syncLearningProgressToServer(currentDocId, nextLearningProgress, nextPlanProgress)
                        } else {
                            void syncLearningProgressToServer(currentDocId, learningProgress, nextPlanProgress)
                        }
                        return nextPlanProgress
                    })
                }
            }

            tick()
            learningTimerRef.current = setInterval(tick, 1000)
            return () => {
                if (learningTimerRef.current) clearInterval(learningTimerRef.current)
            }
        }

        if (isVideoLesson) {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)
            const remaining = videoProgress?.duration && videoProgress.duration > 0
                ? Math.max(0, Math.ceil(videoProgress.duration - videoProgress.current))
                : LEARNING_REQUIRED_SECONDS
            setLearningRemainingSeconds(remaining)
            return
        }

        let startedAt = learningProgress.startedAtByDocId[currentDocId]
        if (!startedAt) {
            startedAt = new Date().toISOString()
            setLearningProgress((prev) => {
                const nextProgress = {
                    ...prev,
                    startedAtByDocId: {
                        ...prev.startedAtByDocId,
                        [currentDocId]: startedAt!,
                    },
                }
                void syncLearningProgressToServer(currentDocId, nextProgress, learningPlanProgress)
                return nextProgress
            })
        }

        const tick = () => {
            const elapsed = Math.floor((Date.now() - new Date(startedAt!).getTime()) / 1000)
            const remain = Math.max(0, LEARNING_REQUIRED_SECONDS - elapsed)
            setLearningRemainingSeconds(remain)
            if (remain <= 0 && learningTimerRef.current) {
                clearInterval(learningTimerRef.current)
            }
        }

        tick()
        learningTimerRef.current = setInterval(tick, 1000)
        return () => {
            if (learningTimerRef.current) clearInterval(learningTimerRef.current)
        }
    }, [activeTab, isLeaderOrAdmin, isLearningFullscreen, isLearningLandscape, isMobile, learningPlanProgress, learningProgress.completedDocIds, learningProgress.startedAtByDocId, selectedLearningDoc, videoProgressByDocId])

    // ── Learning handlers ────────────────────────────────────────────

    const loadLearningData = async (docs: Document[]) => {
        setLearningDataLoading(true)
        try {
            if (docs.length === 0) {
                setQuizzes({})
                setMyAttempts({})
                setLearningDataLoaded(true)
                return
            }
            const results = await Promise.allSettled(
                docs.map((doc) =>
                    Promise.all([
                        fetch(`/api/learning/quiz/${doc.id}`, { credentials: "include", cache: "no-store" })
                            .then((r) => r.json() as Promise<{ quiz: LearningQuizRecord | null }>),
                        fetch(`/api/learning/quiz/${doc.id}/attempts`, { credentials: "include", cache: "no-store" })
                            .then((r) => r.json() as Promise<{ attempt: QuizAttemptRecord | null }>),
                    ])
                )
            )
            const newQuizzes: Record<string, LearningQuizRecord | null> = {}
            const newAttempts: Record<string, QuizAttemptRecord | null> = {}
            results.forEach((result, i) => {
                const doc = docs[i]!
                if (result.status === "fulfilled") {
                    newQuizzes[doc.id] = result.value[0].quiz ?? null
                    newAttempts[doc.id] = result.value[1].attempt ?? null
                }
            })
            setQuizzes(newQuizzes)
            setMyAttempts(newAttempts)
            setLearningDataLoaded(true)
        } finally {
            setLearningDataLoading(false)
        }
    }

    useEffect(() => {
        if (activeTab !== "learning" || documentsLoading) return
        void loadLearningData(learningDocs)
    }, [activeTab, documentsLoading, learningDocsKey])

    const refreshLearningRealtimeData = useCallback(async () => {
        await loadFolders()
        const docs = await loadDocuments()
        if (activeTab !== "learning") return

        const learningDocs = isLeaderOrAdmin
            ? docs.filter((d) => d.isLearningMaterial)
            : docs.filter((d) => !d.isLocked)
        if (learningDocs.length > 0 && !selectedLearningDoc) {
            setSelectedLearningDoc(learningDocs[0] ?? null)
        }
        if (selectedLearningDoc && !learningDocs.some((doc) => doc.id === selectedLearningDoc.id)) {
            setSelectedLearningDoc(learningDocs[0] ?? null)
        }
        await loadLearningData(learningDocs)
    }, [activeFolderId, activeTab, isLeaderOrAdmin, selectedLearningDoc])

    useEffect(() => {
        if (!user?.personId) {
            return
        }

        return subscribeToPersonChannel(user.personId, (message) => {
            const payload = message.data as { type?: string; actorId?: string; entityType?: string } | undefined
            if (payload?.type !== "learning.updated") {
                return
            }
            if (payload.actorId === user.personId) {
                return
            }
            if (payload.entityType === "learning_progress") {
                if (!isLeaderOrAdmin) {
                    void refreshMyLearningProgress().catch(() => {
                        // Keep current progress snapshot if the targeted refresh fails.
                    })
                }
                return
            }

            void refreshLearningRealtimeData().catch(() => {
                // Ignore transient realtime refresh failures.
            })
        })
    }, [isLeaderOrAdmin, refreshLearningRealtimeData, refreshMyLearningProgress, user?.personId])

    const handleEnterLearningTab = async () => {
        setActiveTab("learning")
        const sourceDocs = documentsLoading ? await loadDocuments() : documentsData
        const docs = isLeaderOrAdmin
            ? sourceDocs.filter((d) => d.isLearningMaterial)
            : sourceDocs.filter((d) => !d.isLocked)
        const targetDoc = selectedLearningDoc && docs.some((doc) => doc.id === selectedLearningDoc.id)
            ? selectedLearningDoc
            : docs[0] ?? null
        if (targetDoc) {
            setSelectedLearningDoc(targetDoc)
            if (isMobile) setMobileLearningMode("reader")
        } else if (isMobile) {
            setMobileLearningMode("list")
        }
        await loadLearningData(docs)
    }

    const markDocumentAsCompleted = (docId: string) => {
        setLearningProgress((prev) => {
            if (prev.completedDocIds.includes(docId)) return prev
            const nextProgress = {
                ...prev,
                completedDocIds: [...prev.completedDocIds, docId],
            }
            void syncLearningProgressToServer(docId, nextProgress, learningPlanProgress)
            return nextProgress
        })
    }

    const handleMarkLessonCompleted = (docId: string) => {
        if (isLeaderOrAdmin) return
        if (learningRemainingSeconds > 0) {
            toast({
                title: `Bạn cần học thêm ${learningRemainingSeconds}s trước khi hoàn thành bài này.`,
                variant: "destructive",
            })
            return
        }
        const doc = documentsData.find((item) => item.id === docId)
        const steps = doc?.learningPlan?.steps ?? []
        if (steps.length > 0) {
            const currentProgress = learningPlanProgress[docId] ?? buildDefaultPlanProgress()
            const activeStepIndex = Math.min(currentProgress.activeStepIndex, Math.max(steps.length - 1, 0))
            const activeStep = steps[activeStepIndex]
            if (!activeStep) return
            const completedStepIds = currentProgress.completedStepIds.includes(activeStep.id)
                ? currentProgress.completedStepIds
                : [...currentProgress.completedStepIds, activeStep.id]
            const nextPlanProgress: LearningPlanProgressMap = {
                ...learningPlanProgress,
                [docId]: {
                    ...currentProgress,
                    activeStepIndex,
                    completedStepIds,
                },
            }
            const shouldCompleteDoc = completedStepIds.length >= steps.length
            const nextLearningProgress = shouldCompleteDoc && !learningProgress.completedDocIds.includes(docId)
                ? {
                    ...learningProgress,
                    completedDocIds: [...learningProgress.completedDocIds, docId],
                }
                : learningProgress
            setLearningPlanProgress(nextPlanProgress)
            if (nextLearningProgress !== learningProgress) {
                setLearningProgress(nextLearningProgress)
            }
            void syncLearningProgressToServer(docId, nextLearningProgress, nextPlanProgress)
            toast({
                title: shouldCompleteDoc
                    ? "Đã hoàn thành toàn bộ bài học. Bạn có thể làm bài kiểm tra."
                    : "Đã hoàn thành trang hiện tại. Bạn có thể qua trang tiếp theo.",
            })
            return
        }
        markDocumentAsCompleted(docId)
        toast({ title: "Đã đánh dấu học xong. Bạn có thể sang bài tiếp theo hoặc làm bài kiểm tra." })
    }

    const handleLearningVideoProgress = (docId: string, current: number, duration: number, stepId?: string) => {
        if (!Number.isFinite(duration) || duration <= 0) return
        const progressKey = getLearningVideoProgressKey(docId, stepId)

        setVideoProgressByDocId((prev) => ({
            ...prev,
            [progressKey]: { current, duration },
        }))

        if (stepId) {
            const doc = documentsData.find((item) => item.id === docId)
            const steps = doc?.learningPlan?.steps ?? []
            const docProgress = learningPlanProgress[docId] ?? buildDefaultPlanProgress()
            if (docProgress.completedStepIds.includes(stepId)) return
            const remaining = Math.max(0, Math.ceil(duration - current))
            if (selectedLearningDoc?.id === docId) {
                setLearningRemainingSeconds(remaining)
            }
            if (remaining === 0) {
                setLearningPlanProgress((prev) => {
                    const nextPlanProgress = {
                        ...prev,
                        [docId]: {
                            ...docProgress,
                            completedStepIds: docProgress.completedStepIds.includes(stepId)
                                ? docProgress.completedStepIds
                                : [...docProgress.completedStepIds, stepId],
                            activeStepIndex: Math.min(docProgress.activeStepIndex, Math.max(steps.length - 1, 0)),
                        },
                    }
                    void syncLearningProgressToServer(docId, learningProgress, nextPlanProgress)
                    return nextPlanProgress
                })
                const completedStepIds = docProgress.completedStepIds.includes(stepId)
                    ? docProgress.completedStepIds
                    : [...docProgress.completedStepIds, stepId]
                if (steps.length > 0 && completedStepIds.length >= steps.length) {
                    markDocumentAsCompleted(docId)
                }
            }
            return
        }

        if (learningProgress.completedDocIds.includes(docId)) return

        const remaining = Math.max(0, Math.ceil(duration - current))
        if (selectedLearningDoc?.id === docId) {
            setLearningRemainingSeconds(remaining)
        }

        if (remaining === 0) {
            markDocumentAsCompleted(docId)
        }
    }

    const handleMarkAsLearning = async (docId: string, isLearning: boolean) => {
        try {
            const res = await fetch(`/api/documents/${docId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ isLearningMaterial: isLearning }),
            })
            if (!res.ok) throw new Error()
            const payload = (await res.json()) as { ok: boolean; document: Document }
            setDocumentsData((prev) => prev.map((d) => (d.id === docId ? payload.document : d)))
            toast({ title: isLearning ? "Đã đánh dấu là Có kiểm tra" : "Đã bỏ đánh dấu có kiểm tra" })
        } catch {
            toast({ title: "Không thể cập nhật", variant: "destructive" })
        }
    }

    const handleStartLearningFromDocument = (doc: Document) => {
        if (doc.isLocked && !isLeaderOrAdmin) {
            toast({
                title: "Tài liệu đang bị khóa",
                description: "Trainer đã khóa tài liệu này. Vui lòng chờ mở khóa để xem.",
                variant: "destructive",
            })
            return
        }
        const targetLearningDoc = learningDocs.find((item) => item.id === doc.id) ?? null
        if (!targetLearningDoc) {
            toast({
                title: "Tài liệu này chưa có trong phần học liệu.",
                description: "Hãy đánh dấu tài liệu là học liệu hoặc chọn tài liệu khác.",
                variant: "destructive",
            })
            return
        }

        setActiveTab("learning")
        setSelectedLearningDoc(targetLearningDoc)
        if (isMobile) {
            setMobileLearningMode("reader")
        }
        const docs = isLeaderOrAdmin
            ? documentsData.filter((item) => item.isLearningMaterial)
            : documentsData.filter((item) => !item.isLocked)
        void loadLearningData(docs)
    }

    const markLearningPreviewFailed = useCallback((key: string, message?: string) => {
        setFailedLearningPreviewKeys((prev) => {
            if (prev[key]) return prev
            return { ...prev, [key]: true }
        })
        if (message) {
            setLearningPreviewErrorMessages((prev) => ({ ...prev, [key]: message }))
        }
    }, [])

    const clearLearningPreviewFailure = useCallback((key: string) => {
        setFailedLearningPreviewKeys((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
        setFailedCanvasPreviewKeys((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
        setLoadedLearningPreviewKeys((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
        setLearningPreviewErrorMessages((prev) => {
            if (!prev[key]) return prev
            const next = { ...prev }
            delete next[key]
            return next
        })
    }, [])

    const markLearningPreviewLoaded = useCallback((key: string) => {
        setLoadedLearningPreviewKeys((prev) => {
            if (prev[key]) return prev
            return { ...prev, [key]: true }
        })
    }, [])

    const getIncorrectAttemptQuestions = (attempt: QuizAttemptRecord) => {
        const questions = attempt.reviewQuestions ?? []
        return questions
            .map((question, index) => ({
                question,
                questionIndex: index,
                selectedIndex: attempt.answers[index] ?? -1,
                correctIndex: question.correctIndex ?? -1,
            }))
            .filter((item) => item.correctIndex >= 0 && item.selectedIndex !== item.correctIndex)
    }

    const toggleAttemptDetail = (attemptId: string) => {
        setExpandedAttemptIds((prev) => {
            const next = new Set(prev)
            if (next.has(attemptId)) {
                next.delete(attemptId)
            } else {
                next.add(attemptId)
            }
            return next
        })
    }

    const handleOpenQuizCreate = (doc: Document) => {
        const existingQuiz = quizzes[doc.id] ?? null
        setQuizCreateDialog({
            open: true,
            documentId: doc.id,
            documentName: doc.name,
            existingQuizId: existingQuiz?.id ?? null,
            title: existingQuiz?.title ?? doc.name,
            description: existingQuiz?.description ?? "",
            durationMinutes: String(existingQuiz?.durationMinutes ?? 15),
            timePerQuestionSeconds: String(existingQuiz?.timePerQuestionSeconds ?? 30),
            deadlineAt: toDatetimeLocalInputValue(existingQuiz?.deadlineAt),
            questions: existingQuiz?.questions.map((q) => ({
                text: q.text,
                options: (q.options as [string, string, string, string]) ?? ["", "", "", ""],
                correctIndex: q.correctIndex ?? 0,
                explanation: q.explanation ?? "",
            })) ?? [{ text: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" }],
        })
    }

    const handleAddQuizQuestion = () => {
        setQuizCreateDialog((s) => ({
            ...s,
            questions: [...s.questions, { text: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" }],
        }))
    }

    const handleRemoveQuizQuestion = (idx: number) => {
        setQuizCreateDialog((s) => ({ ...s, questions: s.questions.filter((_, i) => i !== idx) }))
    }

    const handleSaveQuiz = async () => {
        const { documentId: currentDocId, existingQuizId, title, description, durationMinutes, timePerQuestionSeconds, deadlineAt, questions, isNewDocument } = quizCreateDialog
        const normalizedTitle = title.trim()
        if (!normalizedTitle) { toast({ title: "Cần nhập tên bài kiểm tra", variant: "destructive" }); return }
        if (questions.some((q) => !q.text.trim() || q.options.some((o) => !o.trim()))) {
            toast({ title: "Cần nhập đầy đủ câu hỏi và 4 đáp án", variant: "destructive" }); return
        }
        setIsSubmitting(true)
        try {
            let resolvedDocId = currentDocId

            // When creating a brand-new learning item, create the document first
            if (isNewDocument && !existingQuizId) {
                const docRes = await fetch("/api/documents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        name: normalizedTitle,
                        type: "txt",
                        size: 0,
                        tags: ["learning"],
                        visibility: getDefaultVisibility(user),
                        visibleToPersonIds: [],
                        description: description.trim() || `Tạo ngày ${new Date().toLocaleDateString("vi-VN")}`,
                        isLearningMaterial: true,
                        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : undefined,
                    }),
                })
                const docPayload = (await docRes.json()) as { ok: boolean; document: Document }
                if (!docRes.ok) throw new Error("Không thể tạo bài học")
                const newDoc = docPayload.document
                resolvedDocId = newDoc.id
                setDocumentsData((prev) => [newDoc, ...prev])
                setQuizzes((prev) => ({ ...prev, [newDoc.id]: null }))
                setMyAttempts((prev) => ({ ...prev, [newDoc.id]: null }))
                setSelectedLearningDoc(newDoc)
            }

            const payload = {
                title: normalizedTitle,
                description: description.trim(),
                durationMinutes: Number(durationMinutes) || 15,
                timePerQuestionSeconds: Math.max(5, Number(timePerQuestionSeconds) || 30),
                deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : undefined,
                questions,
                ...(existingQuizId ? { quizId: existingQuizId } : {}),
            }
            const res = await fetch(`/api/learning/quiz/${resolvedDocId}`, {
                method: existingQuizId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            })
            const data = (await res.json()) as { ok: boolean; quiz?: LearningQuizRecord; message?: string }
            if (!res.ok || !data.ok) throw new Error(data.message ?? "Lỗi")
            setQuizzes((prev) => ({ ...prev, [resolvedDocId]: data.quiz! }))
            setQuizCreateDialog(defaultQuizCreate())
            toast({ title: existingQuizId ? "Đã cập nhật quiz" : "Đã tạo quiz" })
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : "Không thể lưu quiz", variant: "destructive" })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAutoGenerateQuiz = async () => {
        const { documentId, autoQuestionCount } = quizCreateDialog
        const targetDoc = documentsData.find((doc) => doc.id === documentId)
        const isAutoSupportedFormat = targetDoc?.type === "pdf" || targetDoc?.type === "pptx"
        if (!targetDoc || !isAutoSupportedFormat) {
            toast({
                title: "Định dạng này chưa hỗ trợ tạo tự động. Vui lòng tạo câu hỏi thủ công.",
                variant: "destructive",
            })
            return
        }
        const count = Math.min(Math.max(Number(autoQuestionCount) || 5, 1), 30)
        setQuizCreateDialog((s) => ({ ...s, isGenerating: true }))
        try {
            const res = await fetch(`/api/learning/quiz/${documentId}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ questionCount: count }),
            })
            const data = (await res.json()) as {
                ok: boolean
                questions?: QuizCreateQuestion[]
                documentName?: string
                message?: string
                fallback?: boolean
                warning?: string
            }
            if (!res.ok || !data.ok) throw new Error(data.message ?? "Lỗi tạo câu hỏi")
            setQuizCreateDialog((s) => ({
                ...s,
                questions: data.questions!,
                ...(s.title === "" && data.documentName ? { title: `Kiểm tra: ${data.documentName}` } : {}),
            }))
            toast({
                title: data.fallback
                    ? `Đã tạo ${data.questions!.length} câu hỏi nháp`
                    : `Đã tạo ${data.questions!.length} câu hỏi tự động`,
                description: data.warning,
            })
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : "Không thể tạo câu hỏi", variant: "destructive" })
        } finally {
            setQuizCreateDialog((s) => ({ ...s, isGenerating: false }))
        }
    }

    const handleDeleteQuiz = async (documentId: string) => {
        const quiz = quizzes[documentId]
        if (!quiz) return
        if (!confirm("Xoá quiz này? Tất cả kết quả của nhân viên cũng sẽ bị xoá.")) return
        try {
            await fetch(`/api/learning/quiz/${documentId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ quizId: quiz.id }),
            })
            setQuizzes((prev) => ({ ...prev, [documentId]: null }))
            toast({ title: "Đã xoá quiz" })
        } catch {
            toast({ title: "Không thể xoá quiz", variant: "destructive" })
        }
    }

    const handleOpenQuizTake = (doc: Document) => {
        const learningPlanSteps = doc.learningPlan?.steps ?? []
        const docPlanProgress = learningPlanProgress[doc.id] ?? buildDefaultPlanProgress()
        const hasCompletedAllPlanSteps = learningPlanSteps.length > 0 && learningPlanSteps.every((step) =>
            docPlanProgress.completedStepIds.includes(step.id)
        )
        const isLearningCompleted = learningProgress.completedDocIds.includes(doc.id) || hasCompletedAllPlanSteps
        if (!isLeaderOrAdmin && !isLearningCompleted) {
            toast({
                title: "Bạn cần học xong tất cả slide trước khi làm bài kiểm tra.",
                variant: "destructive",
            })
            return
        }
        const quiz = quizzes[doc.id]
        if (!quiz) return
        if (!isLeaderOrAdmin && hasCompletedAllPlanSteps && !learningProgress.completedDocIds.includes(doc.id)) {
            const nextLearningProgress = {
                ...learningProgress,
                completedDocIds: [...learningProgress.completedDocIds, doc.id],
            }
            setLearningProgress(nextLearningProgress)
            void syncLearningProgressToServer(doc.id, nextLearningProgress, learningPlanProgress)
        }
        const questionOrder = shuffleIndices(quiz.questions.length)
        const optionOrderByQuestion = quiz.questions.map((question) => shuffleIndices(question.options.length))
        const startedAt = new Date().toISOString()
        const questionTimeLimitSeconds = quiz.timePerQuestionSeconds
            ? Math.max(5, quiz.timePerQuestionSeconds)
            : Math.max(10, Math.floor((quiz.durationMinutes * 60) / Math.max(quiz.questions.length, 1)))
        setQuizTakeModal({
            open: true,
            quiz,
            documentId: doc.id,
            answers: Array(quiz.questions.length).fill(-1) as number[],
            currentQuestion: 0,
            startedAt,
            timeLeftSeconds: questionTimeLimitSeconds,
            questionTimeLimitSeconds,
            expiredQuestionIndexes: [],
            isSubmitting: false,
            isSubmitted: false,
            result: null,
            questionOrder,
            optionOrderByQuestion,
        })
    }

    useEffect(() => {
        if (!quizTakeModal.open || quizTakeModal.isSubmitted) {
            if (quizTimerRef.current) clearInterval(quizTimerRef.current)
            return
        }
        quizTimerRef.current = setInterval(() => {
            setQuizTakeModal((prev) => {
                if (prev.timeLeftSeconds <= 1) {
                    const currentIndex = prev.currentQuestion
                    const expiredSet = new Set(prev.expiredQuestionIndexes)
                    expiredSet.add(currentIndex)
                    const isLastQuestion = currentIndex >= (prev.quiz?.questions.length ?? 1) - 1
                    if (isLastQuestion) {
                        clearInterval(quizTimerRef.current!)
                        void handleSubmitQuiz(true)
                        return {
                            ...prev,
                            expiredQuestionIndexes: Array.from(expiredSet).sort((a, b) => a - b),
                            timeLeftSeconds: 0,
                        }
                    }
                    return {
                        ...prev,
                        expiredQuestionIndexes: Array.from(expiredSet).sort((a, b) => a - b),
                        currentQuestion: currentIndex + 1,
                        timeLeftSeconds: prev.questionTimeLimitSeconds,
                    }
                }
                return { ...prev, timeLeftSeconds: prev.timeLeftSeconds - 1 }
            })
        }, 1000)
        return () => { if (quizTimerRef.current) clearInterval(quizTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizTakeModal.open, quizTakeModal.isSubmitted])

    // Keep ref in sync so anti-cheat handlers always read latest answers
    useEffect(() => { quizTakeModalRef.current = quizTakeModal }, [quizTakeModal])

    const handleSubmitQuiz = async (autoSubmit = false) => {
        if (!autoSubmit && !confirm(`Nộp bài? Bạn cần đạt từ ${QUIZ_PASS_SCORE}% để hoàn thành.`)) return
        if (quizTimerRef.current) clearInterval(quizTimerRef.current)
        setQuizTakeModal((prev) => ({ ...prev, isSubmitting: true }))
        try {
            const { documentId, answers, startedAt } = quizTakeModalRef.current
            const res = await fetch(`/api/learning/quiz/${documentId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ answers, startedAt }),
            })
            const data = (await res.json()) as { ok: boolean; result?: QuizAttemptRecord; message?: string }
            if (!res.ok || !data.ok) throw new Error(data.message ?? "Lỗi nộp bài")
            setMyAttempts((prev) => ({
                ...prev,
                [documentId]: data.result!.score >= QUIZ_PASS_SCORE ? data.result! : null,
            }))
            setQuizTakeModal((prev) => ({ ...prev, isSubmitting: false, isSubmitted: true, result: data.result! }))
            if (data.result!.score < QUIZ_PASS_SCORE) {
                toast({
                    title: `Chưa đạt ${QUIZ_PASS_SCORE}%. Bạn cần làm lại bài kiểm tra.`,
                    description: `Lần làm ${data.result!.attemptRound ?? 1}: ${data.result!.score}/100 điểm.`,
                    variant: "destructive",
                })
            }
        } catch (err) {
            toast({ title: err instanceof Error ? err.message : "Không thể nộp bài", variant: "destructive" })
            setQuizTakeModal((prev) => ({ ...prev, isSubmitting: false }))
        }
    }

    const canNavigateToQuestion = useCallback((targetIndex: number, state: QuizTakeState) => {
        if (targetIndex < 0) return false
        if (targetIndex >= (state.quiz?.questions.length ?? 0)) return false
        if (targetIndex > state.currentQuestion) {
            const currentOriginalIndex = state.questionOrder[state.currentQuestion] ?? state.currentQuestion
            return state.answers[currentOriginalIndex] !== -1
        }
        if (targetIndex === state.currentQuestion) return true
        return !state.expiredQuestionIndexes.includes(targetIndex)
    }, [])

    const moveToQuizQuestion = useCallback((targetIndex: number) => {
        setQuizTakeModal((prev) => {
            if (!canNavigateToQuestion(targetIndex, prev)) {
                return prev
            }
            return {
                ...prev,
                currentQuestion: targetIndex,
                timeLeftSeconds: prev.questionTimeLimitSeconds,
            }
        })
    }, [canNavigateToQuestion])

    const handleOpenQuizResults = async (doc: Document) => {
        setQuizResultsRoleFilter("all")
        setQuizResultsSupervisorFilter("all")
        setSelectedLearningStatusListDetail(null)
        setQuizResultsTab("results")
        setQuizResetPersonFilter("all")
        setQuizResetTimeFilter("all")
        setExpandedAttemptIds(new Set())
        setQuizResultsModal({
            open: true,
            documentId: doc.id,
            documentName: doc.name,
            attempts: [],
            resets: [],
            learningStatuses: [],
            isLoading: true,
        })
        try {
            const [attemptsRes, statusesRes] = await Promise.all([
                fetch(`/api/learning/quiz/${doc.id}/attempts?scope=team`, { credentials: "include", cache: "no-store" }),
                fetch(`/api/learning/progress/${doc.id}/team`, { credentials: "include", cache: "no-store" }),
            ])
            const attemptsData = (await attemptsRes.json()) as { attempts: QuizAttemptRecord[]; resets?: QuizAttemptResetRecord[] }
            const statusData = (await statusesRes.json()) as { rows: LearningStatusRow[] }
            const attempts = attemptsData.attempts ?? []
            const resets = attemptsData.resets ?? []
            const learningStatuses = statusData.rows ?? []
            setQuizResultsModal((prev) => ({ ...prev, attempts, resets, learningStatuses, isLoading: false }))
        } catch {
            setQuizResultsModal((prev) => ({ ...prev, isLoading: false }))
        }
    }

    const handleResetQuizAttemptForPerson = async (personId: string) => {
        if (!quizResultsModal.documentId) return
        setResettingAttemptPersonId(personId)
        try {
            const res = await fetch(`/api/learning/quiz/${quizResultsModal.documentId}/attempts`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ personId }),
            })
            const data = (await res.json()) as { ok?: boolean; message?: string; deleted?: boolean; resetAt?: string }
            if (!res.ok || !data.ok) throw new Error(data.message ?? "Không thể reset kết quả")
            const [attemptsRes, statusesRes] = await Promise.all([
                fetch(`/api/learning/quiz/${quizResultsModal.documentId}/attempts?scope=team`, { credentials: "include", cache: "no-store" }),
                fetch(`/api/learning/progress/${quizResultsModal.documentId}/team`, { credentials: "include", cache: "no-store" }),
            ])
            const attemptsData = (await attemptsRes.json()) as { attempts: QuizAttemptRecord[]; resets?: QuizAttemptResetRecord[] }
            const statusData = (await statusesRes.json()) as { rows: LearningStatusRow[] }
            setQuizResultsModal((prev) => ({
                ...prev,
                attempts: attemptsData.attempts ?? [],
                resets: attemptsData.resets ?? prev.resets,
                learningStatuses: statusData.rows ?? prev.learningStatuses,
            }))
            toast({ title: "Đã reset kết quả. Nhân viên có thể làm bài lại." })
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : "Không thể reset kết quả", variant: "destructive" })
        } finally {
            setResettingAttemptPersonId(null)
        }
    }

    const handleResetLearningProgressForPerson = async (personId: string, personName: string) => {
        if (!quizResultsModal.documentId) return
        const confirmed = window.confirm(`Cho ${personName} học lại tài liệu này? Tiến độ học và kết quả kiểm tra hiện tại sẽ được reset.`)
        if (!confirmed) return

        setResettingLearningPersonId(personId)
        try {
            const res = await fetch(`/api/learning/progress/${quizResultsModal.documentId}/team`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ personId }),
            })
            const data = (await res.json()) as { ok?: boolean; message?: string }
            if (!res.ok || !data.ok) throw new Error(data.message ?? "Không thể cho nhân sự học lại")
            const [attemptsRes, statusesRes] = await Promise.all([
                fetch(`/api/learning/quiz/${quizResultsModal.documentId}/attempts?scope=team`, { credentials: "include", cache: "no-store" }),
                fetch(`/api/learning/progress/${quizResultsModal.documentId}/team`, { credentials: "include", cache: "no-store" }),
            ])
            const attemptsData = (await attemptsRes.json()) as { attempts: QuizAttemptRecord[]; resets?: QuizAttemptResetRecord[] }
            const statusData = (await statusesRes.json()) as { rows: LearningStatusRow[] }
            setQuizResultsModal((prev) => ({
                ...prev,
                attempts: attemptsData.attempts ?? [],
                resets: attemptsData.resets ?? prev.resets,
                learningStatuses: statusData.rows ?? prev.learningStatuses,
            }))
            setSelectedLearningStatusListDetail((prev) =>
                prev ? { ...prev, rows: prev.rows.filter((item) => item.personId !== personId) } : prev
            )
            toast({ title: "Đã cho nhân sự học lại. Tiến độ học và bài kiểm tra cũ đã được reset." })
        } catch (error) {
            toast({ title: error instanceof Error ? error.message : "Không thể cho nhân sự học lại", variant: "destructive" })
        } finally {
            setResettingLearningPersonId(null)
        }
    }

    const buildQuizResultsScope = useCallback(() => {
        const personRoleById = new Map(people.map((person) => [person.id, person.role]))
        const getRoleGroupByPersonId = (personId: string): Exclude<QuizResultsRoleFilter, "all"> => {
            const roleFromStatus = quizResultsModal.learningStatuses.find((item) => item.personId === personId)?.personRole
            const roleFromAttempt = quizResultsModal.attempts.find((item) => item.personId === personId)?.personRole
            const role = roleFromStatus ?? roleFromAttempt ?? personRoleById.get(personId)
            if (!role) return "other"
            const group = getRoleGroup(role)
            if (group === "store_manager" || group === "store_lead" || group === "store_technician" || group === "trainer") {
                return group
            }
            return "other"
        }
        const roleMatched = (personId: string) =>
            quizResultsRoleFilter === "all" || getRoleGroupByPersonId(personId) === quizResultsRoleFilter
        const statusByPersonId = new Map(quizResultsModal.learningStatuses.map((item) => [item.personId, item]))
        const supervisorMatched = (personId: string) =>
            quizResultsSupervisorFilter === "all" ||
            statusByPersonId.get(personId)?.supervisorUserId === quizResultsSupervisorFilter
        const scopedLearningStatuses = quizResultsModal.learningStatuses.filter((item) => roleMatched(item.personId) && supervisorMatched(item.personId))
        const scopedAttempts = quizResultsModal.attempts.filter((attempt) => roleMatched(attempt.personId) && supervisorMatched(attempt.personId))
        const activeAttempts = scopedAttempts.filter((attempt) => attempt.isActiveAttempt !== false)
        const submittedPersonIdSet = new Set(activeAttempts.map((attempt) => attempt.personId))
        const completed = scopedLearningStatuses.filter((item) => item.status === "completed")
        const inProgress = scopedLearningStatuses.filter((item) => item.status === "in_progress")
        const notStarted = scopedLearningStatuses.filter((item) => item.status === "not_started")
        const readyButNotSubmitted = completed.filter((item) => !submittedPersonIdSet.has(item.personId))
        const notEligibleForQuiz = [...inProgress, ...notStarted]

        return {
            getRoleGroupByPersonId,
            statusByPersonId,
            scopedLearningStatuses,
            scopedAttempts,
            activeAttempts,
            completed,
            inProgress,
            notStarted,
            readyButNotSubmitted,
            notEligibleForQuiz,
        }
    }, [getRoleGroup, people, quizResultsModal.attempts, quizResultsModal.learningStatuses, quizResultsRoleFilter, quizResultsSupervisorFilter])

    const handleExportQuizResultsExcel = useCallback(() => {
        if (quizResultsModal.isLoading) return
        const {
            getRoleGroupByPersonId,
            statusByPersonId,
            scopedLearningStatuses,
            scopedAttempts,
            activeAttempts,
            completed,
            inProgress,
            notStarted,
            readyButNotSubmitted,
            notEligibleForQuiz,
        } = buildQuizResultsScope()
        const roleLabelByGroup: Record<Exclude<QuizResultsRoleFilter, "all">, string> = {
            store_manager: "Quản lí cửa hàng",
            store_lead: "Cửa hàng trưởng",
            store_technician: "Kỹ thuật viên",
            trainer: "Trainer",
            other: "Khác",
        }
        const statusLabel: Record<LearningStatusType, string> = {
            completed: "Đã học",
            in_progress: "Đang học",
            not_started: "Chưa học",
        }
        const formatDateTime = (value?: string) => value ? new Date(value).toLocaleString("vi-VN") : ""
        const averageScore = activeAttempts.length > 0
            ? Math.round(activeAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / activeAttempts.length)
            : 0
        const needsRetakeAttempts = activeAttempts.filter((attempt) => attempt.score < QUIZ_PASS_SCORE)
        const totalRetakeCount = activeAttempts.reduce((sum, attempt) => sum + getQuizRetakeCount(attempt), 0)
        const filename = `${sanitizeFilenamePart(quizResultsModal.documentName)}-tien-do-${new Date().toISOString().slice(0, 10)}.xls`
        const statusRows = (rows: LearningStatusRow[]) => rows.map((item) => [
            item.personName,
            item.personRole ?? "",
            roleLabelByGroup[getRoleGroupByPersonId(item.personId)],
            item.team,
            item.supervisorName ?? "",
            statusLabel[item.status],
        ])
        const attemptSupervisor = (personId: string) => statusByPersonId.get(personId)?.supervisorName ?? ""
        const selectedSupervisorLabel =
            quizResultsSupervisorFilter === "all"
                ? "Tất cả"
                : quizResultsModal.learningStatuses.find((item) => item.supervisorUserId === quizResultsSupervisorFilter)?.supervisorName ?? quizResultsSupervisorFilter

        downloadExcelWorkbook(filename, [
            {
                name: "Tong quan",
                rows: [
                    ["Báo cáo theo dõi tiến độ nhân viên"],
                    ["Tài liệu", quizResultsModal.documentName],
                    ["Bộ lọc vai trò", quizResultsRoleFilter === "all" ? "Tất cả" : roleLabelByGroup[quizResultsRoleFilter]],
                    ["Bộ lọc người phụ trách", selectedSupervisorLabel],
                    ["Xuất lúc", new Date().toLocaleString("vi-VN")],
                    [],
                    ["Nhóm", "Số lượng"],
                    ["Đã học", completed.length],
                    ["Đang học", inProgress.length],
                    ["Chưa học", notStarted.length],
                    ["Đã nộp quiz", activeAttempts.length],
                    ["Chưa nộp quiz (đã học)", readyButNotSubmitted.length],
                    ["Chưa đủ điều kiện làm quiz", notEligibleForQuiz.length],
                    ["Điểm trung bình", averageScore],
                    [`Đạt >=${QUIZ_PASS_SCORE}`, activeAttempts.filter((attempt) => attempt.score >= QUIZ_PASS_SCORE).length],
                    [`Cần làm lại (<${QUIZ_PASS_SCORE})`, needsRetakeAttempts.length],
                    ["Tổng số lần làm lại", totalRetakeCount],
                ],
            },
            {
                name: "Trang thai hoc",
                rows: [
                    ["Nhân viên", "Vai trò", "Nhóm vai trò", "Team", "Người phụ trách", "Trạng thái học"],
                    ...statusRows(scopedLearningStatuses),
                ],
            },
            {
                name: "Da hoc",
                rows: [
                    ["Nhân viên", "Vai trò", "Nhóm vai trò", "Team", "Người phụ trách", "Trạng thái học"],
                    ...statusRows(completed),
                ],
            },
            {
                name: "Dang hoc",
                rows: [
                    ["Nhân viên", "Vai trò", "Nhóm vai trò", "Team", "Người phụ trách", "Trạng thái học"],
                    ...statusRows(inProgress),
                ],
            },
            {
                name: "Chua hoc",
                rows: [
                    ["Nhân viên", "Vai trò", "Nhóm vai trò", "Team", "Người phụ trách", "Trạng thái học"],
                    ...statusRows(notStarted),
                ],
            },
            {
                name: "Tien do quiz",
                rows: [
                    ["Nhân viên", "Vai trò", "Người phụ trách", "Trạng thái học", "Trạng thái quiz", "Điểm hiện tại", "Số lần làm lại"],
                    ...scopedLearningStatuses.map((item) => {
                        const activeAttempt = activeAttempts.find((attempt) => attempt.personId === item.personId)
                        const quizStatus = activeAttempt
                            ? activeAttempt.score >= QUIZ_PASS_SCORE
                                ? "Đạt"
                                : "Cần làm lại"
                            : item.status === "completed"
                                ? "Chưa nộp (đã học)"
                                : "Chưa đủ điều kiện"
                        return [
                            item.personName,
                            item.personRole ?? "",
                            item.supervisorName ?? "",
                            statusLabel[item.status],
                            quizStatus,
                            activeAttempt?.score ?? "",
                            activeAttempt ? getQuizRetakeCount(activeAttempt) : "",
                        ]
                    }),
                ],
            },
            {
                name: "Ket qua quiz",
                rows: [
                    ["Nhân viên", "Vai trò", "Người phụ trách", "Điểm", "Câu đúng", "Tổng câu", "Lần làm", "Số lần làm lại", "Kết quả", "Trạng thái", "Bắt đầu", "Nộp lúc"],
                    ...scopedAttempts.map((attempt) => [
                        attempt.personName ?? "Unknown",
                        attempt.personRole ?? "",
                        attemptSupervisor(attempt.personId),
                        attempt.score,
                        attempt.correctAnswers,
                        attempt.totalQuestions,
                        attempt.attemptRound ?? 1,
                        getQuizRetakeCount(attempt),
                        attempt.score >= QUIZ_PASS_SCORE ? "Đạt" : "Cần làm lại",
                        attempt.isActiveAttempt === false ? "Đã reset" : "Hiệu lực",
                        formatDateTime(attempt.startedAt),
                        formatDateTime(attempt.submittedAt),
                    ]),
                ],
            },
            {
                name: "Lich su reset",
                rows: [
                    ["Nhân viên", "Người reset", "Thời điểm reset"],
                    ...quizResultsModal.resets
                        .filter((reset) => quizResultsRoleFilter === "all" || getRoleGroupByPersonId(reset.personId) === quizResultsRoleFilter)
                        .map((reset) => [
                            reset.personName ?? "Unknown",
                            reset.resetByPersonName ?? "Unknown",
                            formatDateTime(reset.resetAt),
                        ]),
                ],
            },
        ])
    }, [buildQuizResultsScope, quizResultsModal.documentName, quizResultsModal.isLoading, quizResultsModal.learningStatuses, quizResultsModal.resets, quizResultsRoleFilter, quizResultsSupervisorFilter])

    // ── Sub-components ───────────────────────────────────────────────

    const VisibilityBadge = ({ doc }: { doc: Document }) => {
        if (doc.visibility === "store") {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                    <Store className="w-3 h-3" />
                    Cửa hàng
                </span>
            )
        }
        if (doc.visibility === "office") {
            return (
                <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <Building2 className="w-3 h-3" />
                    Văn phòng
                </span>
            )
        }
        return (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Globe className="w-3 h-3" />
                Phòng ban
            </span>
        )
    }

    const DocumentCard = ({ doc }: { doc: Document }) => {
        const owner = people.find((p) => p.id === doc.ownerId)
        const docType = documentTypes[doc.type] ?? documentTypes.txt
        const isLockPending = pendingLockIds.has(doc.id)
        const isStarPending = pendingStarIds.has(doc.id)

        return (
            <Card
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => handleStartLearningFromDocument(doc)}
                onDoubleClick={() => handleDocumentClick(doc)}
                onContextMenu={(e) => handleContextMenu(e, doc)}
            >
                <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                        <div className={`w-12 h-12 rounded-lg ${docType.bgColor} flex items-center justify-center text-2xl overflow-hidden`}>
                            {doc.thumbnail ? (
                                <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover rounded-lg" />
                            ) : doc.type === "link" ? (
                                <Link className="w-6 h-6 text-cyan-500" />
                            ) : (
                                <span>{docType.icon}</span>
                            )}
                        </div>
                        <div className="flex items-center space-x-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`h-6 w-6 ${
                                    doc.isLocked ? "text-amber-500 hover:text-amber-600" : "text-emerald-500 hover:text-emerald-600"
                                }`}
                                title={doc.isLocked ? "Khóa tài liệu" : "Mở khóa tài liệu"}
                                disabled={!isLeaderOrAdmin || isLockPending}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (isLeaderOrAdmin) {
                                        void handleToggleDocumentLock(doc)
                                    }
                                }}
                            >
                                {isLockPending ? <Loader2 className="w-3 h-3 animate-spin" /> : doc.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                                disabled={isStarPending}
                                onClick={(e) => { e.stopPropagation(); void handleStarToggle(doc.id) }}>
                                {isStarPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                ) : (
                                    doc.isStarred
                                        ? <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                        : <StarOff className="w-3 h-3 text-gray-400" />
                                )}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleContextMenu(e, doc)
                                }}>
                                <MoreHorizontal className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate" title={doc.name}>
                            {doc.name}
                        </h3>
                        {doc.isLocked && (
                            <div className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <Lock className="w-3 h-3" />
                                Đã khóa
                            </div>
                        )}
                        {doc.type === "link" && doc.url && (
                            <p className="text-xs text-cyan-600 dark:text-cyan-400 truncate">{doc.url}</p>
                        )}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>{formatFileSize(doc.size)}</span>
                            <VisibilityBadge doc={doc} />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Avatar className="w-5 h-5">
                                <AvatarImage src={owner?.imageURL || "/placeholder.svg"} />
                                <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-xs">
                                    {owner?.name.split(" ").map((n) => n[0]).join("") || "U"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{owner?.name || "Unknown"}</span>
                        </div>
                        {!isLeaderOrAdmin && (
                            <div className="pt-1">
                                <Button
                                    size="sm"
                                    className="h-8 w-full bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleStartLearningFromDocument(doc)
                                    }}
                                >
                                    <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                                    Học
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    const DocumentListItem = ({ doc }: { doc: Document }) => {
        const owner = people.find((p) => p.id === doc.ownerId)
        const docType = documentTypes[doc.type] ?? documentTypes.txt
        const isLockPending = pendingLockIds.has(doc.id)

        return (
            <div
                className="flex items-center space-x-4 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer group"
                onClick={() => handleStartLearningFromDocument(doc)}
                onDoubleClick={() => handleDocumentClick(doc)}
                onContextMenu={(e) => handleContextMenu(e, doc)}
            >
                <div className={`w-10 h-10 rounded-lg ${docType.bgColor} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
                    {doc.thumbnail ? (
                        <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover rounded-lg" />
                    ) : doc.type === "link" ? (
                        <Link className="w-5 h-5 text-cyan-500" />
                    ) : (
                        <span className="text-lg">{docType.icon}</span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">{doc.name}</h3>
                        {doc.isLocked && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <Lock className="w-3 h-3" />
                                Đã khóa
                            </span>
                        )}
                        {doc.isStarred && <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{formatFileSize(doc.size)}</span>
                        <span>{formatDate(doc.modifiedAt)}</span>
                        <VisibilityBadge doc={doc} />
                    </div>
                </div>
                <div className="flex items-center space-x-3 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${
                            doc.isLocked ? "text-amber-500 hover:text-amber-600" : "text-emerald-500 hover:text-emerald-600"
                        }`}
                        title={doc.isLocked ? "Khóa tài liệu" : "Mở khóa tài liệu"}
                        disabled={!isLeaderOrAdmin || isLockPending}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (isLeaderOrAdmin) {
                                void handleToggleDocumentLock(doc)
                            }
                        }}
                    >
                        {isLockPending ? <Loader2 className="w-4 h-4 animate-spin" /> : doc.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </Button>
                    {!isLeaderOrAdmin && (
                        <Button
                            size="sm"
                            className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleStartLearningFromDocument(doc)
                            }}
                        >
                            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                            Học
                        </Button>
                    )}
                    <Avatar className="w-6 h-6">
                        <AvatarImage src={owner?.imageURL || "/placeholder.svg"} />
                        <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-xs">
                            {owner?.name.split(" ").map((n) => n[0]).join("") || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-600 dark:text-gray-300 hidden sm:block">{owner?.name || "Unknown"}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleContextMenu(e, doc)
                        }}>
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        )
    }

    const FolderListItem = ({ folder }: { folder: Folder }) => {
        const owner = people.find((p) => p.id === folder.ownerId)
        const childCount = folderChildrenByParentId.get(folder.id)?.length ?? 0

        return (
            <div
                className="group flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setActiveFolderId(folder.id)}
            >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
                    <FolderIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium text-gray-900 dark:text-white" title={folder.name}>
                            {folder.name}
                        </h3>
                        {childCount > 0 && (
                            <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                                {childCount}
                            </Badge>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>Folder</span>
                        <span>{formatDate(folder.updatedAt)}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <Globe className="h-3 w-3" />
                            Phòng ban
                        </span>
                    </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                    <Unlock className="h-4 w-4 text-emerald-500" />
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={owner?.imageURL || "/placeholder.svg"} />
                        <AvatarFallback className="bg-gray-200 text-xs dark:bg-gray-600">
                            {owner?.name.split(" ").map((n) => n[0]).join("") || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm text-gray-600 dark:text-gray-300 sm:block">{owner?.name || "Unknown"}</span>
                    {isLeaderOrAdmin && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`Mở menu folder ${folder.name}`}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem onClick={() => void handleRenameFolder(folder)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Đổi tên
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                    onClick={() => void handleDeleteFolder(folder.id)}
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Xóa
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        )
    }

    const LearningCard = ({ doc }: { doc: Document }) => {
        const owner = people.find((p) => p.id === doc.ownerId)
        const docType = documentTypes[doc.type] ?? documentTypes.txt
        const quiz = quizzes[doc.id]
        const attempt = myAttempts[doc.id]
        const quizLoaded = doc.id in quizzes

        return (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-all flex flex-col">
                <CardContent className="p-5 flex flex-col flex-1">
                    {/* Doc icon + badges */}
                    <div className="flex items-start gap-3 mb-4">
                        <div className={`w-12 h-12 rounded-xl ${docType.bgColor} flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden`}>
                            {doc.thumbnail
                                ? <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover rounded-xl" />
                                : doc.type === "link" ? <Link className="w-6 h-6 text-cyan-500" />
                                : <span>{docType.icon}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white truncate" title={doc.name}>{doc.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <Avatar className="w-4 h-4">
                                    <AvatarImage src={owner?.imageURL || "/placeholder.svg"} />
                                    <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-xs">{owner?.name?.[0] ?? "U"}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{owner?.name ?? "Unknown"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quiz status */}
                    <div className="mb-4">
                        {!quizLoaded ? (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Đang tải...</span>
                        ) : quiz ? (
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                    <ClipboardCheck className="w-3 h-3" />
                                    Quiz · {quiz.questions.length} câu · {quiz.durationMinutes} phút
                                </span>
                            </div>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                Chưa có quiz
                            </span>
                        )}
                    </div>

                    {/* Attempt status (employee) / stats (leader) */}
                    <div className="mb-4 flex-1">
                        {!isLeaderOrAdmin && quiz && (
                            attempt ? (
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${attempt.score >= QUIZ_PASS_SCORE ? "bg-green-50 dark:bg-green-900/20" : attempt.score >= 50 ? "bg-yellow-50 dark:bg-yellow-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                                    <Trophy className={`w-4 h-4 ${attempt.score >= QUIZ_PASS_SCORE ? "text-green-600" : attempt.score >= 50 ? "text-yellow-600" : "text-red-500"}`} />
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{attempt.score}/100 điểm</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{attempt.correctAnswers}/{attempt.totalQuestions} câu đúng</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                    <BookOpen className="w-4 h-4 text-blue-500" />
                                    <span className="text-sm text-blue-700 dark:text-blue-300">Chưa làm bài</span>
                                </div>
                            )
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                        {/* View document */}
                        {doc.url && (
                            <Button size="sm" variant="outline" className="bg-transparent text-xs h-8"
                                onClick={() => window.open(doc.url, "_blank")}>
                                <Eye className="w-3 h-3 mr-1" />Xem tài liệu
                            </Button>
                        )}

                        {/* Employee: take quiz */}
                        {!isLeaderOrAdmin && quiz && !attempt && (
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-xs h-8"
                                onClick={() => handleOpenQuizTake(doc)}>
                                <ClipboardCheck className="w-3 h-3 mr-1" />Làm bài
                            </Button>
                        )}

                        {/* Employee: review result */}
                        {!isLeaderOrAdmin && quiz && attempt && (
                            <Button size="sm" variant="outline" className="bg-transparent text-xs h-8"
                                onClick={() => setQuizTakeModal((prev) => ({ ...prev, open: true, quiz, documentId: doc.id, isSubmitted: true, result: attempt }))}>
                                <BarChart2 className="w-3 h-3 mr-1" />Xem kết quả
                            </Button>
                        )}

                        {/* Leader: create/edit quiz */}
                        {isLeaderOrAdmin && (
                            <>
                                <Button size="sm" variant="outline" className="bg-transparent text-xs h-8"
                                    onClick={() => handleOpenQuizCreate(doc)}>
                                    <Pencil className="w-3 h-3 mr-1" />{quiz ? "Sửa quiz" : "Tạo quiz"}
                                </Button>
                                {quiz && (
                                    <Button size="sm" variant="outline" className="bg-transparent text-xs h-8"
                                        onClick={() => void handleOpenQuizResults(doc)}>
                                        <Users className="w-3 h-3 mr-1" />Kết quả
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        )
    }

    // ── Render ───────────────────────────────────────────────────────
    const quizCreateTargetDoc = documentsData.find((doc) => doc.id === quizCreateDialog.documentId)
    const quizCreateDocType = quizCreateTargetDoc?.type
    const canAutoGenerateByFormat = quizCreateDocType === "pdf" || quizCreateDocType === "pptx"

    return (
        <div className="p-3 sm:p-4 lg:p-6">
            {/* Header */}
            <div className="mb-4 sm:mb-5">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Documents</h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Quản lý và tổ chức tài liệu của phòng ban</p>
            </div>

            {/* ── Tab bar ── */}
            <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800 sm:mb-6 sm:w-fit">
                <button
                    onClick={() => setActiveTab("all")}
                    className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "all"
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                >
                    <FileText className="w-4 h-4" />
                    Tài liệu
                </button>
                <button
                    onClick={handleEnterLearningTab}
                    className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === "learning"
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                >
                    <GraduationCap className="w-4 h-4" />
                    {isLeaderOrAdmin ? "Bài Kiểm Tra" : "Học liệu"}
                    {learningDocs.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                            {learningDocs.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ── Học liệu tab ── */}
            {activeTab === "learning" && (
                learningTabLoading ? (
                    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 py-20 text-center">
                        <Loader2 className="h-7 w-7 animate-spin text-violet-600 dark:text-violet-400" />
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Đang tải học liệu...</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Vui lòng chờ dữ liệu tài liệu hoàn tất.</p>
                        </div>
                    </div>
                ) : learningDocs.length === 0 ? (
                    <div className="text-center py-20">
                        <GraduationCap className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                        <h3 className="text-base font-medium text-gray-700 dark:text-gray-300 mb-2">Chưa có học liệu</h3>
                        {isLeaderOrAdmin ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Vào tab <strong>Tài liệu</strong>, chuột phải vào tài liệu và chọn <strong>"Đánh dấu là có kiểm tra"</strong>.
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có tài liệu học nào.</p>
                        )}
                    </div>
                ) : (
	                    <div
	                        className={`flex flex-col overflow-hidden border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex-row ${
	                            isLearningFullscreen
	                                ? "fixed z-[300] isolate rounded-none border-0 bg-black dark:bg-black"
	                                : isMobile
	                                    ? "-mx-3 rounded-none border-x-0"
	                                    : "rounded-xl"
	                        }`}
	                        style={isLearningFullscreen
	                            ? {
	                                left: `${learningFullscreenViewport?.offsetLeft ?? 0}px`,
	                                top: `${learningFullscreenViewport?.offsetTop ?? 0}px`,
	                                width: `${learningFullscreenViewport?.width ?? (typeof window !== "undefined" ? window.innerWidth : 0)}px`,
	                                height: `${learningFullscreenViewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0)}px`,
	                                maxHeight: `${learningFullscreenViewport?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0)}px`,
	                                minHeight: 0,
	                            }
	                            : { minHeight: isMobile ? "calc(100dvh - 190px)" : "calc(100vh - 220px)" }}
	                    >
                        {/* ── Left Sidebar ─────────────────────────────────── */}
                        <div className={`${isLearningFullscreen ? "hidden " : ""}w-full flex-shrink-0 border-b border-gray-200 transition-all duration-200 dark:border-gray-800 lg:border-b-0 lg:border-r ${
                            isMobile && mobileLearningMode === "reader" ? "hidden" : ""
                        } ${
                            isLearningSidebarCollapsed ? "lg:w-16 xl:w-16" : "lg:w-72 xl:w-80"
                        }`}>
                            {/* Sidebar header */}
                            <div className={`border-b border-gray-200 dark:border-gray-800 ${isLearningSidebarCollapsed ? "px-3 py-4" : "px-5 py-4"}`}>
                                <div className="flex items-center justify-between mb-1">
                                    {isLearningSidebarCollapsed ? <div /> : (
                                        <h2 className="font-semibold text-gray-900 dark:text-white">
                                            {isLeaderOrAdmin ? "Bài Kiểm Tra" : "Học liệu"}
                                        </h2>
                                    )}
                                    <div className="flex items-center gap-1">
                                        {isLeaderOrAdmin && !isLearningSidebarCollapsed && (
                                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                                                onClick={() => setQuizCreateDialog({
                                                    open: true, documentId: "", documentName: "", existingQuizId: null,
                                                    title: "", description: "", durationMinutes: "15", timePerQuestionSeconds: "30", deadlineAt: "",
                                                    questions: [{ text: "", options: ["", "", "", ""], correctIndex: 0, explanation: "" }],
                                                    isNewDocument: true,
                                                })}>
                                                <Plus className="w-3 h-3 mr-1" />Thêm
                                            </Button>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="hidden h-8 w-8 lg:inline-flex"
                                            onClick={() => setIsLearningSidebarCollapsed((prev) => !prev)}
                                            aria-label={isLearningSidebarCollapsed ? "Mở danh sách học liệu" : "Thu gọn danh sách học liệu"}
                                            title={isLearningSidebarCollapsed ? "Mở danh sách" : "Thu gọn danh sách"}
                                        >
                                            {isLearningSidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                                {!isLearningSidebarCollapsed && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{learningDocs.length} bài học</p>
                                )}
                                {/* Employee progress bar */}
                                {!isLeaderOrAdmin && !isLearningSidebarCollapsed && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                                            <span>Tiến độ</span>
                                            <span>{completedLearningCount}/{learningDocs.length}</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-green-500 rounded-full transition-all"
                                                style={{ width: `${learningDocs.length === 0 ? 0 : Math.round((completedLearningCount / learningDocs.length) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Doc list */}
                            {!isLearningSidebarCollapsed ? (
                                <div className="max-h-[42vh] overflow-y-auto lg:max-h-none lg:flex-1">
                                {learningDocs.map((doc) => {
                                    const quiz = quizzes[doc.id]
                                    const attempt = myAttempts[doc.id]
                                    const isSelected = selectedLearningDoc?.id === doc.id
                                    const isCompleted = !isLeaderOrAdmin && learningProgress.completedDocIds.includes(doc.id)

                                    return (
                                        <button
                                            key={doc.id}
                                            onClick={() => {
                                                setSelectedLearningDoc(doc)
                                                if (isMobile) setMobileLearningMode("reader")
                                            }}
                                            className={`w-full flex items-start gap-3 py-3.5 text-left transition-colors border-b border-gray-100 dark:border-gray-800/60 ${
                                                isSelected
                                                    ? "bg-violet-50 dark:bg-violet-900/20 border-l-[3px] border-l-violet-500 pl-[13px] pr-4"
                                                    : "px-4 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                                            }`}
                                        >
                                            <div className="mt-0.5 flex-shrink-0">
                                                {isCompleted
                                                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                    : <div className={`w-5 h-5 rounded-full border-2 ${isSelected ? "border-violet-400" : "border-gray-300 dark:border-gray-600"}`} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm leading-snug ${isSelected ? "font-semibold text-violet-700 dark:text-violet-300" : "font-medium text-gray-800 dark:text-gray-200"}`}>
                                                    {doc.name}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {quiz ? (
                                                        <span className="text-xs text-violet-500 dark:text-violet-400">
                                                            {quiz.questions.length} câu · {quiz.durationMinutes} phút
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">Chưa có quiz</span>
                                                    )}
                                                </div>
                                                {!isLeaderOrAdmin && attempt && (
                                                    <span className={`text-xs font-semibold mt-0.5 block ${attempt.score >= QUIZ_PASS_SCORE ? "text-green-600" : attempt.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
                                                        Điểm: {attempt.score}/100
                                                    </span>
                                                )}
                                            </div>
                                            {isSelected && <ChevronRight className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />}
                                        </button>
                                    )
                                })}
                                </div>
                            ) : null}
                        </div>

                        {/* ── Main Content ──────────────────────────────────── */}
                        <div className={`min-w-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950 ${isMobile && mobileLearningMode === "list" ? "hidden lg:block" : ""}`}>
                            {!selectedLearningDoc ? (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-sm text-gray-400">Chọn một bài học từ danh sách bên trái</p>
                                </div>
                            ) : (() => {
                                const doc = selectedLearningDoc
                                const quiz = quizzes[doc.id]
                                const attempt = myAttempts[doc.id]
                                const docType = documentTypes[doc.type] ?? documentTypes.txt
                                const currentIdx = learningDocs.findIndex((d) => d.id === doc.id)
                                const prevDoc = currentIdx > 0 ? learningDocs[currentIdx - 1] ?? null : null
                                const nextDoc = currentIdx < learningDocs.length - 1 ? learningDocs[currentIdx + 1] ?? null : null
                                const learningPlanSteps = doc.learningPlan?.steps ?? []
                                const hasLearningPlan = learningPlanSteps.length > 0
                                const docPlanProgress = learningPlanProgress[doc.id] ?? buildDefaultPlanProgress()
                                const activePlanStepIndex = Math.min(
                                    docPlanProgress.activeStepIndex,
                                    Math.max(learningPlanSteps.length - 1, 0)
                                )
                                const activePlanStep = learningPlanSteps[activePlanStepIndex]
                                const activeStepHasVideo = Boolean(activePlanStep?.media?.some((item) => item.type === "video"))
                                const isVideoLesson = doc.type === "mp4" && Boolean(doc.url)
                                const requiredSeconds = LEARNING_REQUIRED_SECONDS
                                const hasCompletedAllPlanSteps = hasLearningPlan && learningPlanSteps.every((step) =>
                                    docPlanProgress.completedStepIds.includes(step.id)
                                )
                                const isCurrentLessonCompleted = isLeaderOrAdmin || learningProgress.completedDocIds.includes(doc.id) || hasCompletedAllPlanSteps
                                const canGoNext = !!nextDoc
                                const shouldPromoteQuiz = Boolean(!isLeaderOrAdmin && quiz && isCurrentLessonCompleted && !attempt && !isLearningFullscreen)
                                const prevPlanStep = hasLearningPlan && activePlanStepIndex > 0
                                    ? learningPlanSteps[activePlanStepIndex - 1] ?? null
                                    : null
                                const nextPlanStep = hasLearningPlan && activePlanStepIndex < learningPlanSteps.length - 1
                                    ? learningPlanSteps[activePlanStepIndex + 1] ?? null
                                    : null
                                const isActiveStepCompleted = hasLearningPlan && activePlanStep
                                    ? isLeaderOrAdmin ||
                                        docPlanProgress.completedStepIds.includes(activePlanStep.id) ||
                                        learningRemainingSeconds <= 0
                                    : false
		                                const isMobileReader = isMobile && !isLearningFullscreen
		                                const isMobilePreviewSettling = isMobile && isLearningFullscreen && isLearningViewportSettling
		                                const previewFrameClass = isLearningFullscreen
		                                    ? "h-full min-h-0 w-full !rounded-none !border-0"
		                                    : "aspect-video"
	                                const requiresLandscapeToView = false
                                const goToPrevStep = () => {
                                    if (!prevPlanStep) return
                                    setLearningPlanProgress((prev) => {
                                        const nextPlanProgress = {
                                            ...prev,
                                            [doc.id]: {
                                                ...(prev[doc.id] ?? buildDefaultPlanProgress()),
                                                activeStepIndex: Math.max(activePlanStepIndex - 1, 0),
                                            },
                                        }
                                        void syncLearningProgressToServer(doc.id, learningProgress, nextPlanProgress)
                                        return nextPlanProgress
                                    })
                                }
                                const goToNextStep = () => {
                                    if (!nextPlanStep) return
                                    if (!isActiveStepCompleted) {
                                        toast({
                                            title: "Hoàn thành thời gian học của trang hiện tại trước khi qua trang tiếp theo.",
                                            variant: "destructive",
                                        })
                                        return
                                    }
                                    setLearningPlanProgress((prev) => {
                                        const nextPlanProgress = {
                                            ...prev,
                                            [doc.id]: {
                                                ...(prev[doc.id] ?? buildDefaultPlanProgress()),
                                                activeStepIndex: Math.min(activePlanStepIndex + 1, learningPlanSteps.length - 1),
                                            },
                                        }
                                        void syncLearningProgressToServer(doc.id, learningProgress, nextPlanProgress)
                                        return nextPlanProgress
                                    })
                                }
                                const handleReaderTouchStart = (event: React.TouchEvent) => {
                                    if (!isMobile) return
                                    const touch = event.changedTouches[0]
                                    learningTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
                                }
                                const handleReaderTouchEnd = (event: React.TouchEvent) => {
                                    if (!isMobile) return
                                    const start = learningTouchStartRef.current
                                    learningTouchStartRef.current = null
                                    if (!start) return
                                    const touch = event.changedTouches[0]
                                    const dx = touch.clientX - start.x
                                    const dy = touch.clientY - start.y
                                    if (Math.abs(dy) > 60 || Math.abs(dx) < 48) return
                                    if (dx < 0) {
                                        goToNextStep()
                                    } else {
                                        goToPrevStep()
                                    }
                                }

                                return (
                                    <div className={`mx-auto space-y-4 sm:space-y-5 sm:px-5 sm:py-6 lg:px-6 lg:py-8 ${
                                        isLearningFullscreen
                                            ? "h-full max-w-none px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0"
                                            : isMobileReader
                                                ? "max-w-none px-0 py-0"
                                                : isLearningSidebarCollapsed
                                                    ? "max-w-5xl px-3 py-4"
                                                    : "max-w-3xl px-3 py-4"
                                    }`}>
                                        {/* Document viewer card */}
                                        <div
                                            ref={learningViewerRef}
                                            className={`relative bg-white dark:bg-gray-900 overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 ${
                                                isLearningFullscreen
                                                    ? "z-30 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-none border-0 shadow-none"
                                                    : isMobileReader
                                                        ? "min-h-[calc(100dvh-190px)] rounded-none border-x-0 border-t-0"
                                                        : "rounded-2xl"
                                            }`}
                                        >
                                            {isMobile && isLearningFullscreen && showLandscapeHint && (
                                                <div className="pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full bg-gray-950/85 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                        Xoay ngang để xem rộng hơn
                                                    </span>
                                                </div>
                                            )}
                                            {isMobileReader && (
                                                <div className="border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 px-2 text-xs"
                                                            onClick={() => {
                                                                setActiveTab("all")
                                                                setMobileLearningMode("list")
                                                            }}
                                                        >
                                                            <ChevronLeft className="mr-1 h-4 w-4" />
                                                            Tài liệu
                                                        </Button>
                                                        <span className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                                                            {currentIdx + 1}/{learningDocs.length}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            {shouldPromoteQuiz && quiz && (
                                                <div className="absolute inset-0 z-40 flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm">
                                                    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-violet-400/30 bg-white shadow-2xl dark:bg-gray-950">
                                                        <div className="border-b border-violet-200 bg-violet-100 px-5 py-4 dark:border-violet-900/50 dark:bg-violet-950/70">
                                                            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-violet-700 dark:text-violet-200">
                                                                <ClipboardCheck className="h-5 w-5" />
                                                                Bài kiểm tra đã sẵn sàng
                                                            </p>
                                                        </div>
                                                        <div className="p-5 sm:p-6">
                                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{quiz.title}</h2>
                                                            {quiz.description && (
                                                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{quiz.description}</p>
                                                            )}
                                                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <ClipboardCheck className="h-4 w-4 text-violet-500" />
                                                                    {quiz.questions.length} câu hỏi
                                                                </span>
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <Timer className="h-4 w-4 text-violet-500" />
                                                                    {quiz.durationMinutes} phút
                                                                </span>
                                                            </div>
                                                            <Button
                                                                className="mt-6 bg-blue-600 text-white hover:bg-blue-700"
                                                                onClick={() => handleOpenQuizTake(doc)}
                                                            >
                                                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                                                Bắt đầu kiểm tra
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {/* Preview area */}
	                                            {hasLearningPlan && activePlanStep ? (
	                                                <div className={`bg-[linear-gradient(180deg,rgba(241,245,249,0.85),rgba(248,250,252,0.95))] dark:bg-gray-900 ${
	                                                    isLearningFullscreen ? "grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden bg-black p-0 dark:bg-black" : isMobileReader ? "space-y-2 p-2" : "space-y-4 p-4 md:p-6"
	                                                }`}
                                                    onTouchStart={handleReaderTouchStart}
                                                    onTouchEnd={handleReaderTouchEnd}
                                                >
                                                    {!isLearningFullscreen && (
                                                        <div className={`flex items-center justify-between gap-3 ${
                                                            isMobileReader ? "rounded-xl bg-white/90 px-3 py-2 shadow-sm dark:bg-gray-900/80" : ""
                                                        }`}>
                                                            <div>
                                                                <p className="text-xs uppercase tracking-wide text-violet-500 dark:text-violet-400">
                                                                    {activePlanStep.kind === "page" ? `Trang ${activePlanStep.pageNumber}` : `Slide ${activePlanStep.slideNumber}`} · {activePlanStepIndex + 1}/{learningPlanSteps.length}
                                                                </p>
                                                                <h3 className={`${isMobileReader ? "line-clamp-1 text-sm" : "text-base"} font-semibold text-gray-900 dark:text-white`}>
                                                                    {activePlanStep.title}
                                                                </h3>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {requiresLandscapeToView ? (
                                                        <div className={`${previewFrameClass} grid place-items-center rounded-xl border border-gray-700 bg-gray-950 text-white`}>
                                                            <div className="max-w-xs px-6 text-center">
                                                                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                                                                    <RotateCcw className="h-7 w-7 text-violet-200" />
                                                                </div>
                                                                <p className="text-base font-semibold">Xoay ngang điện thoại để xem tài liệu</p>
                                                                <p className="mt-2 text-sm text-white/70">
                                                                    Tài liệu chỉ hiển thị ở chế độ ngang để đảm bảo đọc rõ và chỉ xem từng slide.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                    {(() => {
                                                        const stepPreviewKey = `${doc.id}:${activePlanStep.id}:preview`
                                                        const rawPreviewCandidates = [
                                                            doc.learningPlan?.previewUrl,
                                                            doc.learningPlan?.sourceType === "pdf" || doc.type === "pdf" ? doc.url : undefined,
                                                        ].filter((value): value is string => Boolean(value && value.trim()))
                                                        const previewCandidates = Array.from(new Set(rawPreviewCandidates))
                                                        const previewKeyForUrl = (url: string) => `${stepPreviewKey}:${url}`
                                                        const previewBaseUrl = previewCandidates.find((url) => !failedLearningPreviewKeys[previewKeyForUrl(url)])
                                                        const failedPreviewKeys = previewCandidates.map(previewKeyForUrl).filter((key) => failedLearningPreviewKeys[key])
                                                        const canUsePdfPreview = Boolean(previewBaseUrl && activePlanStep.pageNumber)
                                                        const hasTriedAllPreviewSources = previewCandidates.length > 0 && failedPreviewKeys.length === previewCandidates.length
                                                        const isStepPreviewLoaded = Boolean(loadedLearningPreviewKeys[stepPreviewKey])
                                                        const shouldUseCanvas = isMobile
                                                        const currentPage = activePlanStep.pageNumber ?? 1
                                                        const previewParams = "&view=Fit&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0"

                                                        if (canUsePdfPreview && previewBaseUrl) {
                                                            const activePreviewKey = previewKeyForUrl(previewBaseUrl)
                                                            const previewSrc = `${previewBaseUrl}#page=${currentPage}${previewParams}`
                                                            return (
                                                                <div className={`relative ${previewFrameClass} overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700`}>
                                                                    {shouldUseCanvas ? (
                                                                        <MobilePdfPageCanvas
                                                                            key={`${doc.id}-${activePlanStep.id}-${previewBaseUrl}-${failedCanvasPreviewKeys[activePreviewKey] ? "retry" : "canvas"}`}
                                                                            src={previewBaseUrl!}
	                                                                            pageNumber={currentPage}
	                                                                            title={`${doc.name}-page-${activePlanStep.pageNumber}`}
	                                                                            className="h-full w-full"
	                                                                            suspendRender={isMobilePreviewSettling}
	                                                                            onRendered={() => {
	                                                                                clearLearningPreviewFailure(activePreviewKey)
                                                                                clearLearningPreviewFailure(stepPreviewKey)
                                                                                markLearningPreviewLoaded(activePreviewKey)
                                                                                markLearningPreviewLoaded(stepPreviewKey)
                                                                            }}
                                                                            onError={(error) => {
                                                                                markLearningPreviewFailed(activePreviewKey, error.message)
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <>
                                                                            <iframe
                                                                                key={`${doc.id}-${activePlanStep.id}-iframe`}
                                                                                title={`${doc.name}-page-${activePlanStep.pageNumber}`}
                                                                                src={previewSrc}
                                                                                className={`block h-full w-full transition-opacity duration-200 pointer-events-none ${isStepPreviewLoaded ? "opacity-100" : "opacity-0"}`}
                                                                                loading="lazy"
                                                                                scrolling="no"
                                                                                onLoad={() => {
                                                                                    clearLearningPreviewFailure(activePreviewKey)
                                                                                    clearLearningPreviewFailure(stepPreviewKey)
                                                                                    markLearningPreviewLoaded(activePreviewKey)
                                                                                    markLearningPreviewLoaded(stepPreviewKey)
                                                                                }}
                                                                                onError={() => markLearningPreviewFailed(activePreviewKey, "Trình duyệt không tải được file preview.")}
                                                                            />
                                                                            {!isStepPreviewLoaded && (
                                                                                <div className="absolute inset-0 grid place-items-center bg-white/90 dark:bg-gray-900/80">
                                                                                    <div className="text-center">
                                                                                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                                                                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Đang tải trang...</p>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="secondary"
                                                                        className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full border border-white/40 bg-black/55 text-white shadow-lg hover:bg-black/70"
                                                                        onClick={() => void handleToggleLearningFullscreen(doc.learningPlan?.previewUrl || doc.url)}
                                                                    >
                                                                        {isLearningFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                                                    </Button>
                                                                </div>
                                                            )
                                                        }
                                                        if (hasTriedAllPreviewSources) {
                                                            const errorMessages = failedPreviewKeys
                                                                .map((key) => learningPreviewErrorMessages[key])
                                                                .filter(Boolean)
                                                            const previewErrorMessage = !isBrowserOnline
                                                                ? "Thiết bị đang mất kết nối internet. Vui lòng kết nối lại mạng rồi bấm tải lại."
                                                                : errorMessages[0] ?? "Có thể do đường truyền internet đang chập chờn, file preview chưa sẵn sàng, hoặc URL file không còn hợp lệ. Vui lòng kiểm tra lại internet rồi bấm tải lại."
                                                            return (
                                                                <div className={`relative ${previewFrameClass} grid place-items-center rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20`}>
                                                                    <div className="text-center px-6">
                                                                        <FileText className="w-10 h-10 mx-auto text-amber-500 mb-3" />
                                                                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                                                            Chưa tải được preview của slide này
                                                                        </p>
                                                                        <p className="text-xs text-amber-700/80 dark:text-amber-400 mt-1">
                                                                            {previewErrorMessage}
                                                                        </p>
                                                                        <div className="mt-4 flex items-center justify-center gap-2">
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                variant="outline"
                                                                                className="bg-white/70 dark:bg-amber-950/20"
                                                                                onClick={() => {
                                                                                    clearLearningPreviewFailure(stepPreviewKey)
                                                                                    previewCandidates.forEach((url) => clearLearningPreviewFailure(previewKeyForUrl(url)))
                                                                                }}
                                                                            >
                                                                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                                                                Tải lại preview
                                                                            </Button>
                                                                            {(doc.learningPlan?.previewUrl || doc.url) && (
                                                                                <Button
                                                                                    type="button"
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    className="bg-white/70 dark:bg-amber-950/20"
                                                                                    onClick={() => window.open(doc.learningPlan?.previewUrl || doc.url, "_blank", "noopener,noreferrer")}
                                                                                >
                                                                                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                                                                                    Mở file trực tiếp
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="secondary"
                                                                        className="absolute bottom-3 right-3 z-20 h-10 w-10 rounded-full border border-white/40 bg-black/55 text-white shadow-lg hover:bg-black/70"
                                                                        onClick={() => void handleToggleLearningFullscreen(doc.learningPlan?.previewUrl || doc.url)}
                                                                    >
                                                                        {isLearningFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                                                    </Button>
                                                                </div>
                                                            )
                                                        }
                                                        return null
                                                    })() ?? (
                                                        doc.learningPlan?.sourceType === "pptx" && activePlanStep.content?.trim() ? (
                                                        <div className={`${previewFrameClass} overflow-y-auto rounded-xl border border-gray-200 bg-white/90 p-5 dark:border-gray-700 dark:bg-gray-900/70`}>
                                                            <div className="space-y-3">
                                                                {activePlanStep.content
                                                                    .split("\n")
                                                                    .map((line) => line.trim())
                                                                    .filter(Boolean)
                                                                    .map((line, index) => (
                                                                        <p key={`${activePlanStep.id}-line-${index}`} className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                                                                            {line}
                                                                        </p>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                        ) : (
                                                        <div className={`${previewFrameClass} grid place-items-center rounded-xl border border-gray-200 bg-white/70 dark:border-gray-700 dark:bg-gray-800/60`}>
                                                            <div className="text-center px-4">
                                                                <BookOpen className="w-12 h-12 mx-auto text-violet-400 mb-3" />
                                                                <p className="text-sm text-gray-700 dark:text-gray-200">
                                                                    {activePlanStep.title}
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                    Nội dung slide được hiển thị theo từng bước học.
                                                                </p>
                                                            </div>
                                                        </div>
                                                        )
                                                    )}

                                                    {activePlanStep.media && activePlanStep.media.length > 0 && (
                                                        <div className="space-y-3">
                                                            {activePlanStep.media.map((media) => {
                                                                const mediaPreviewKey = `${doc.id}:${activePlanStep.id}:${media.id}:media`
                                                                if (failedLearningPreviewKeys[mediaPreviewKey]) {
                                                                    return (
                                                                        <div key={media.id} className={`${previewFrameClass} grid place-items-center rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20`}>
                                                                            <div className="text-center px-6">
                                                                                <FileText className="w-10 h-10 mx-auto text-amber-500 mb-3" />
                                                                                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                                                                    Chưa tải được video bài học
                                                                                </p>
                                                                                <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400">
                                                                                    {isBrowserOnline
                                                                                        ? "Có thể do đường truyền internet yếu hoặc kết nối tới file bị gián đoạn. Vui lòng kiểm tra lại internet rồi tải lại."
                                                                                        : "Thiết bị đang mất kết nối internet. Vui lòng kết nối lại mạng rồi tải lại."}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                }

                                                                return (
                                                                    <div key={media.id} className={`relative ${previewFrameClass} overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-gray-700`}>
                                                                        <YoutubeLikePlayer
                                                                            src={media.url}
                                                                            preload="metadata"
                                                                            className="h-full w-full"
                                                                            title={activePlanStep.title || doc.name}
                                                                            onLoadedMetadata={(video) =>
                                                                                handleLearningVideoProgress(
                                                                                    doc.id,
                                                                                    video.currentTime,
                                                                                    video.duration,
                                                                                    activePlanStep.id
                                                                                )
                                                                            }
                                                                            onTimeUpdate={(video) =>
                                                                                handleLearningVideoProgress(
                                                                                    doc.id,
                                                                                    video.currentTime,
                                                                                    video.duration,
                                                                                    activePlanStep.id
                                                                                )
                                                                            }
                                                                            onEnded={(video) =>
                                                                                handleLearningVideoProgress(
                                                                                    doc.id,
                                                                                    video.duration,
                                                                                    video.duration,
                                                                                    activePlanStep.id
                                                                                )
                                                                            }
                                                                            onCanPlay={() => {
                                                                                clearLearningPreviewFailure(mediaPreviewKey)
                                                                                markLearningPreviewLoaded(mediaPreviewKey)
                                                                            }}
                                                                            onError={() => markLearningPreviewFailed(mediaPreviewKey)}
                                                                        />
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                        </>
                                                    )}

	                                                    <div className={`rounded-xl border border-gray-200 bg-white/90 p-2 dark:border-gray-700 dark:bg-gray-900/75 ${
	                                                        isLearningFullscreen
	                                                            ? "z-[140] min-h-0 flex-shrink-0 !rounded-none !border-x-0 !border-b-0 !bg-white/92 !p-1.5 !pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur dark:!bg-gray-900/90"
	                                                            : isMobileReader
	                                                                ? "sticky bottom-2 z-20"
	                                                                : ""
	                                                    }`}>
	                                                        <div className="grid grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size={isMobile || isLearningFullscreen ? "sm" : "default"}
                                                                className={`min-w-0 bg-transparent ${!prevPlanStep ? "invisible" : ""}`}
                                                                onClick={goToPrevStep}
                                                            >
                                                                <ChevronLeft className="h-4 w-4 sm:mr-2" />
                                                                <span className="hidden sm:inline">Trang trước</span>
                                                            </Button>
                                                            <p className="whitespace-nowrap text-center text-xs text-gray-500 dark:text-gray-400">
                                                                {activePlanStep.kind === "page" ? `Trang ${activePlanStep.pageNumber}` : `Slide ${activePlanStep.slideNumber}`}
                                                                {" · "}
                                                                {activePlanStepIndex + 1}/{learningPlanSteps.length}
                                                            </p>
                                                            <Button
                                                                type="button"
                                                                variant={nextPlanStep && isActiveStepCompleted ? "default" : "outline"}
                                                                size={isMobile || isLearningFullscreen ? "sm" : "default"}
                                                                className={`min-w-0 justify-end ${
                                                                    nextPlanStep
                                                                        ? isActiveStepCompleted
                                                                            ? "bg-violet-600 hover:bg-violet-700 text-white"
                                                                            : "bg-transparent"
                                                                        : "bg-transparent invisible"
                                                                }`}
                                                                onClick={goToNextStep}
                                                            >
                                                                <span className="hidden sm:inline">
                                                                    {isActiveStepCompleted ? "Trang tiếp theo" : `Trang tiếp theo (${learningRemainingSeconds}s)`}
                                                                </span>
                                                                <span className="sm:hidden">
                                                                    {isActiveStepCompleted ? "Tiếp" : `${learningRemainingSeconds}s`}
                                                                </span>
                                                                <ChevronRight className="h-4 w-4 sm:ml-2" />
                                                            </Button>
                                                        </div>
                                                        {isLeaderOrAdmin && !isLearningFullscreen && (
                                                            <div className="mt-2 flex justify-end">
                                                                <Button
                                                                    type="button"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    disabled={isSubmitting}
                                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
                                                                    onClick={() => void handleDeleteLearningStep(doc, activePlanStep.id)}
                                                                >
                                                                    <Trash2 className="w-4 h-4 mr-1.5" />
                                                                    Xóa slide này
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : isVideoLesson && doc.url ? (
                                                <div className={`${previewFrameClass} w-full bg-black`}>
                                                    <YoutubeLikePlayer
                                                        src={doc.url}
                                                        title={doc.name}
                                                        className="h-full w-full"
                                                        onLoadedMetadata={(video) =>
                                                            handleLearningVideoProgress(doc.id, video.currentTime, video.duration)
                                                        }
                                                        onTimeUpdate={(video) =>
                                                            handleLearningVideoProgress(doc.id, video.currentTime, video.duration)
                                                        }
                                                        onEnded={(video) =>
                                                            handleLearningVideoProgress(doc.id, video.duration, video.duration)
                                                        }
                                                    />
                                                </div>
                                            ) : doc.thumbnail ? (
                                                <div className={`${previewFrameClass} w-full overflow-hidden bg-black`}>
                                                    <img src={doc.thumbnail} alt={doc.name} className="w-full h-full object-cover" />
                                                </div>
                                            ) : doc.url ? (
                                                <div className={`${previewFrameClass} flex w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-950/40 dark:to-blue-950/40`}>
                                                    <BookOpen className="w-16 h-16 text-violet-300 dark:text-violet-600" />
                                                    <a
                                                        href={doc.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition-colors shadow"
                                                    >
                                                        <Eye className="w-4 h-4" />Mở tài liệu
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className={`${previewFrameClass} w-full ${docType.bgColor} flex items-center justify-center`}>
                                                    <span className="text-7xl">{docType.icon}</span>
                                                </div>
                                            )}

                                            {/* Doc info */}
                                            <div className={`${isLearningFullscreen ? "hidden" : isMobileReader ? "p-3" : "p-6"}`}>
                                                <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <h1 className={`${isMobileReader ? "text-lg" : "text-xl"} font-bold text-gray-900 dark:text-white leading-snug`}>{doc.name}</h1>
                                                        {doc.description && (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">{doc.description}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
                                                        {doc.url && isLeaderOrAdmin && (
                                                            <Button size="sm" variant="outline" className="bg-transparent"
                                                                onClick={() => window.open(doc.url, "_blank")}>
                                                                <Eye className="w-4 h-4 mr-1.5" />Xem tài liệu
                                                            </Button>
                                                        )}
                                                        {isLeaderOrAdmin && (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                                                        <MoreHorizontal className="w-4 h-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => handleOpenQuizCreate(doc)}>
                                                                        <Pencil className="w-4 h-4 mr-2" />{quiz ? "Sửa quiz" : "Tạo quiz"}
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => void handleOpenQuizResults(doc)}>
                                                                        <Users className="w-4 h-4 mr-2" />Theo dõi tiến độ nhân viên
                                                                    </DropdownMenuItem>
                                                                    {quiz && (
                                                                        <DropdownMenuItem
                                                                            className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                                                                            onClick={() => void handleDeleteQuiz(doc.id)}
                                                                        >
                                                                            <Trash2 className="w-4 h-4 mr-2" />Xóa bài kiểm tra
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                                                                        onClick={() => void handleDeleteDocument(doc.id)}
                                                                    >
                                                                        <Trash2 className="w-4 h-4 mr-2" />Xóa tài liệu
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {!isLeaderOrAdmin && (
                                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wide text-violet-500 dark:text-violet-400">Học liệu bắt buộc</p>
                                                        <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-1">
                                                            {hasLearningPlan
                                                                ? `Hoàn thành toàn bộ khóa học trước khi qua trang tiếp theo`
                                                                : `Hoàn thành ${requiredSeconds} giây học trước khi qua bài tiếp theo`}
                                                        </h3>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                            {isCurrentLessonCompleted
                                                                ? "Bài này đã được đánh dấu học xong."
                                                                : learningRemainingSeconds > 0
                                                                    ? `Bạn còn ${learningRemainingSeconds}s để đủ điều kiện hoàn thành bài học.`
                                                                    : hasLearningPlan && activeStepHasVideo
                                                                        ? "Bạn đã xem xong video của step này."
                                                                        : isVideoLesson
                                                                        ? "Bạn đã xem hết video, bài học được hoàn thành."
                                                                        : "Bạn đã đủ thời gian, hãy bấm Đánh dấu đã học xong."}
                                                        </p>
                                                        {!isLeaderOrAdmin && (isVideoLesson || (hasLearningPlan && activeStepHasVideo)) && (
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                                                Có thể tua tới hoặc tua lùi video. Tải xuống đã bị tắt trong trình phát.
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                                                            learningRemainingSeconds > 0 && !isCurrentLessonCompleted
                                                                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                                                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                                        }`}>
                                                            <Timer className="w-4 h-4" />
                                                            {isCurrentLessonCompleted ? "Đã hoàn thành" : `${learningRemainingSeconds}s`}
                                                        </span>
                                                        <Button
                                                            size="sm"
                                                            disabled={isVideoLesson || isCurrentLessonCompleted || learningRemainingSeconds > 0}
                                                            onClick={() => handleMarkLessonCompleted(doc.id)}
                                                            className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                                            Đánh dấu đã học xong
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Quiz section */}
                                        {!shouldPromoteQuiz && quiz ? (
                                            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-violet-50 dark:bg-violet-900/20 flex items-center gap-2">
                                                    <ClipboardCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                                    <h2 className="font-semibold text-gray-900 dark:text-white">Bài kiểm tra</h2>
                                                </div>
                                                <div className="p-6">
                                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{quiz.title}</h3>
                                                    {quiz.description && (
                                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{quiz.description}</p>
                                                    )}
                                                    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400 sm:gap-5">
                                                        <span className="flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4 text-violet-400" />{quiz.questions.length} câu hỏi</span>
                                                        <span className="flex items-center gap-1.5"><Timer className="w-4 h-4 text-violet-400" />{quiz.durationMinutes} phút</span>
                                                    </div>

                                                    {!isLeaderOrAdmin && (
                                                        attempt ? (
                                                            <div className="space-y-4">
                                                                <div className={`flex items-start gap-4 rounded-xl p-4 sm:items-center sm:gap-5 sm:p-5 ${attempt.score >= QUIZ_PASS_SCORE ? "bg-green-50 dark:bg-green-900/20" : attempt.score >= 50 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                                                                    <Trophy className={`w-9 h-9 flex-shrink-0 ${attempt.score >= QUIZ_PASS_SCORE ? "text-green-500" : attempt.score >= 50 ? "text-amber-500" : "text-red-500"}`} />
                                                                    <div>
                                                                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                                                            {attempt.score}<span className="text-base font-normal text-gray-400 ml-1">/100 điểm</span>
                                                                        </p>
                                                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                                                            {attempt.correctAnswers}/{attempt.totalQuestions} câu đúng · {new Date(attempt.submittedAt).toLocaleDateString("vi-VN")}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <Button variant="outline" className="bg-transparent"
                                                                    onClick={() => setQuizTakeModal((prev) => ({ ...prev, open: true, quiz, documentId: doc.id, isSubmitted: true, result: attempt }))}>
                                                                    <BarChart2 className="w-4 h-4 mr-2" />Xem lại đáp án
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                <Button
                                                                    className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                                                                    disabled={!isCurrentLessonCompleted}
                                                                    onClick={() => handleOpenQuizTake(doc)}
                                                                >
                                                                    <ClipboardCheck className="w-4 h-4 mr-2" />Bắt đầu kiểm tra
                                                                </Button>
                                                                {!isCurrentLessonCompleted && (
                                                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                                                        Cần học xong tất cả slide trước khi làm bài kiểm tra.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )
                                                    )}

                                                    {!isLeaderOrAdmin && canViewTeamLearningReports && (
                                                        <Button variant="outline" className="bg-transparent"
                                                            onClick={() => void handleOpenQuizResults(doc)}>
                                                            <Users className="w-4 h-4 mr-2" />Theo dõi tiến độ nhân viên
                                                        </Button>
                                                    )}

                                                    {isLeaderOrAdmin && (
                                                        <div className="flex flex-col gap-3 sm:flex-row">
                                                            <Button variant="outline" className="bg-transparent"
                                                                onClick={() => handleOpenQuizCreate(doc)}>
                                                                <Pencil className="w-4 h-4 mr-2" />Sửa quiz
                                                            </Button>
                                                            <Button variant="outline" className="bg-transparent"
                                                                onClick={() => void handleOpenQuizResults(doc)}>
                                                                <Users className="w-4 h-4 mr-2" />Theo dõi tiến độ nhân viên
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : !quiz && (isLeaderOrAdmin || canViewTeamLearningReports) ? (
                                            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-900 sm:p-10">
                                                <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">Chưa có bài kiểm tra cho tài liệu này</p>
                                                <div className="flex flex-wrap items-center justify-center gap-2">
                                                    <Button size="sm" variant="outline" className="bg-transparent" onClick={() => void handleOpenQuizResults(doc)}>
                                                        <Users className="w-4 h-4 mr-2" />Theo dõi tiến độ nhân viên
                                                    </Button>
                                                    {isLeaderOrAdmin && (
                                                        <Button size="sm" onClick={() => handleOpenQuizCreate(doc)}>
                                                            <Plus className="w-4 h-4 mr-2" />Tạo bài kiểm tra
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Navigation */}
                                        <div className="flex items-center justify-between gap-2 pt-2 pb-4">
                                            <Button
                                                variant="outline"
                                                className={`bg-transparent ${!prevDoc ? "invisible" : ""}`}
                                                onClick={() => prevDoc && setSelectedLearningDoc(prevDoc)}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-2" />Bài trước
                                            </Button>
                                            <span className="text-sm text-gray-400 dark:text-gray-500">
                                                {currentIdx + 1} / {learningDocs.length}
                                            </span>
                                            <Button
                                                variant={nextDoc && canGoNext ? "default" : "outline"}
                                                className={nextDoc ? (canGoNext ? "bg-violet-600 hover:bg-violet-700 text-white" : "bg-transparent") : "bg-transparent invisible"}
                                                onClick={() => {
                                                    if (!nextDoc) return
                                                    if (!canGoNext) {
                                                        toast({
                                                            title: "Hoàn thành bài hiện tại trước khi chuyển bài tiếp theo.",
                                                            variant: "destructive",
                                                        })
                                                        return
                                                    }
                                                    setSelectedLearningDoc(nextDoc)
                                                }}
                                            >
                                                Bài tiếp theo<ChevronRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    </div>
                )
            )}

            {/* ── Tài liệu tab ── */}
            {activeTab === "all" && <>

            {/* Top controls */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                            placeholder="Tìm kiếm folder, tài liệu, tags..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white dark:bg-gray-700"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {shouldShowDocumentList && (
                        <>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="bg-transparent">
                                        {isMobile ? "Sort" : `Sort: ${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`}
                                        <ChevronDown className="w-4 h-4 ml-2" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    {(["name", "date", "size", "type", "owner"] as SortBy[]).map((s) => (
                                        <DropdownMenuItem key={s} onClick={() => setSortBy(s)}>
                                            {s.charAt(0).toUpperCase() + s.slice(1)}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="bg-transparent">
                                        <Filter className="w-4 h-4 mr-2" />
                                        {isMobile ? "Group" : `Group: ${groupBy === "none" ? "None" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
                                        <ChevronDown className="w-4 h-4 ml-2" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    {(["none", "type", "date", "owner", "folder"] as GroupBy[]).map((g) => (
                                        <DropdownMenuItem key={g} onClick={() => setGroupBy(g)}>
                                            {g === "none" ? "None" : g.charAt(0).toUpperCase() + g.slice(1)}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="flex items-center border rounded-lg p-1 bg-white dark:bg-gray-800">
                                <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("grid")} className="h-8 px-3">
                                    <Grid3X3 className="w-4 h-4" />
                                </Button>
                                <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="h-8 px-3">
                                    <List className="w-4 h-4" />
                                </Button>
                            </div>
                        </>
                    )}

                    {isLeaderOrAdmin && (
                        <>
                            <Button
                                variant="outline"
                                className="border-dashed border-gray-300 bg-transparent text-gray-600 dark:border-gray-600 dark:text-gray-400"
                                onClick={() => openNewFolderDialog(activeFolderId)}
                            >
                                <FolderPlus className="w-4 h-4 mr-2" />
                                {activeFolder ? "Tạo folder con" : "Tạo folder"}
                            </Button>
                            <Button className="bg-blue-600 hover:bg-blue-700" onClick={openCreateDocumentDialog}>
                                <Plus className="w-4 h-4 mr-2" />
                                Tạo tài liệu
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Active folder bar */}
            {activeFolderId && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-700 dark:bg-blue-900/20">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-blue-600 dark:text-blue-400 h-7 px-2"
                        onClick={() => setActiveFolderId(null)}
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Tất cả
                    </Button>
                    <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-blue-700 dark:text-blue-300">
                        {activeFolderPath.map((folder, index) => (
                            <div key={folder.id} className="flex min-w-0 items-center gap-1">
                                <span className="text-blue-400">/</span>
                                <button
                                    type="button"
                                    className={`max-w-[180px] truncate rounded px-1 py-0.5 text-left hover:bg-blue-100 dark:hover:bg-blue-900/40 ${
                                        index === activeFolderPath.length - 1 ? "font-semibold" : "font-medium"
                                    }`}
                                    onClick={() => setActiveFolderId(folder.id)}
                                >
                                    {folder.name}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Actions inside folder — leader/admin only */}
                    {isLeaderOrAdmin && (
                        <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
                            <Button size="sm" variant="outline"
                                className="border-blue-300 text-blue-700 dark:text-blue-300 bg-transparent"
                                onClick={() => openNewFolderDialog(activeFolderId)}>
                                <FolderPlus className="w-3.5 h-3.5 mr-1" />
                                Tạo folder con
                            </Button>
                            <Button size="sm" variant="outline"
                                className="border-blue-300 text-blue-700 dark:text-blue-300 bg-transparent"
                                onClick={openCreateDocumentDialog}>
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                Tạo tài liệu
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Folders section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Folders</h2>
                    {normalizedSearchQuery && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {filteredVisibleFolders.length} / {visibleFolders.length} folder
                        </span>
                    )}
                </div>

                {filteredVisibleFolders.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                        {normalizedSearchQuery
                            ? "Không tìm thấy folder phù hợp."
                            : activeFolder
                                ? (isLeaderOrAdmin ? "Folder này chưa có folder con. Tạo folder con đầu tiên." : "Folder này chưa có folder con.")
                                : (isLeaderOrAdmin ? "Chưa có folder nào. Tạo folder đầu tiên." : "Chưa có folder nào.")}
                    </p>
                ) : (
                    <div className="space-y-1">
                        {filteredVisibleFolders.map((folder) => (
                            <FolderListItem key={folder.id} folder={folder} />
                        ))}
                    </div>
                )}
            </div>

            {shouldShowDocumentList && (documentsLoading ? (
                <div className="flex min-h-[35vh] flex-col items-center justify-center gap-3 py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600 dark:text-blue-400" />
                    <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Đang tải tài liệu...</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Vui lòng chờ dữ liệu tài liệu hoàn tất.</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Results count */}
                    <div className="mb-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {filteredDocuments.length} / {documentsData.length} tài liệu
                            {activeFolder ? ` trong "${activeFolder.name}"` : ""}
                        </p>
                    </div>

                    {/* Document list */}
                    <div className="space-y-8">
                        {Object.entries(groups).map(([groupName, groupDocs]) => (
                            <div key={groupName}>
                                {groupBy !== "none" && (
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                                        {groupName}
                                        <Badge variant="secondary" className="ml-2">{groupDocs.length}</Badge>
                                    </h2>
                                )}
                                {viewMode === "grid" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {(sortBy === "date" ? [...groupDocs].reverse() : groupDocs).map((doc) => (
                                            <DocumentCard key={doc.id} doc={doc} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {groupDocs.map((doc) => <DocumentListItem key={doc.id} doc={doc} />)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {filteredDocuments.length === 0 && (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Không có tài liệu</h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                {activeFolder ? `Folder "${activeFolder.name}" chưa có file nào.` : "Thử thay đổi bộ lọc hoặc tìm kiếm."}
                            </p>
                        </div>
                    )}
                </>
            ))}

            {/* ── Context Menu ─────────────────────────────────────────── */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-50 min-w-[180px] max-w-[calc(100vw-24px)] max-h-[calc(100dvh-90px)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                    style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
                >
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                        onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleDocumentClick(contextMenu.document)
                            setContextMenu(null)
                        }}>
                        <Eye className="w-4 h-4 mr-2" />Chi tiết
                    </button>
                    {contextMenu.document.type === "link" && contextMenu.document.url && (
                        <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            onClick={() => { window.open(contextMenu.document.url, "_blank"); setContextMenu(null) }}>
                            <Link className="w-4 h-4 mr-2" />Mở link
                        </button>
                    )}
                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                        onClick={() => { void handleStarToggle(contextMenu.document.id); setContextMenu(null) }}>
                        {contextMenu.document.isStarred ? <><StarOff className="w-4 h-4 mr-2" />Bỏ star</> : <><Star className="w-4 h-4 mr-2" />Star</>}
                    </button>
                    {isLeaderOrAdmin && (
                        <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                            onClick={() => {
                                const vis = contextMenu.document.visibility ?? "team"
                                setVisibilityDialog({
                                    open: true,
                                    docId: contextMenu.document.id,
                                    visibility: vis === "specific" ? "team" : (vis as DocVisibility),
                                    selectedOfficePersonIds: contextMenu.document.visibleToPersonIds ?? [],
                                })
                                setVisibilityRoleFilter([])
                                setContextMenu(null)
                            }}>
                            <Globe className="w-4 h-4 mr-2" />Quyền xem
                        </button>
                    )}
                    {isLeaderOrAdmin && (
                        <>
                            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                                onClick={() => void handleRenameDocument(contextMenu.document)}>
                                <Edit className="w-4 h-4 mr-2" />Đổi tên
                            </button>
                            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                                onClick={() => openMoveDocumentDialog(contextMenu.document)}>
                                <Move className="w-4 h-4 mr-2" />Di chuyển
                            </button>
                            <button
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                                onClick={() => void handleToggleDocumentLock(contextMenu.document)}
                            >
                                {contextMenu.document.isLocked ? (
                                    <>
                                        <Unlock className="w-4 h-4 mr-2" />
                                        Mở khóa tài liệu
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-4 h-4 mr-2" />
                                        Khóa tài liệu
                                    </>
                                )}
                            </button>
                            <button className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                                onClick={() => { void handleMarkAsLearning(contextMenu.document.id, !contextMenu.document.isLearningMaterial); setContextMenu(null) }}>
                                <GraduationCap className="w-4 h-4 mr-2" />
                                {contextMenu.document.isLearningMaterial ? "Bỏ Học liệu" : "Đánh dấu Học liệu"}
                            </button>
                            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                            <button className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                                onClick={() => void handleDeleteDocument(contextMenu.document.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />Xóa
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Document Details Drawer ──────────────────────────────── */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetContent className="w-full max-w-full overflow-y-auto bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 sm:w-[540px]">
                    <SheetHeader>
                        <SheetTitle className="text-gray-900 dark:text-white">Chi tiết tài liệu</SheetTitle>
                    </SheetHeader>
                    {selectedDocument && (() => {
                        const docType = documentTypes[selectedDocument.type] ?? documentTypes.txt
                        const owner = people.find((p) => p.id === selectedDocument.ownerId)
                        return (
                            <div className="mt-6 space-y-6">
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Xem trước</h3>
                                    <div className="w-full h-48 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                                        {selectedDocument.type === "mp4" && selectedDocument.url ? (
                                            <YoutubeLikePlayer
                                                src={selectedDocument.url}
                                                title={selectedDocument.name}
                                                className="h-full w-full rounded-lg"
                                            />
                                        ) : selectedDocument.thumbnail && !drawerPreviewImageFailed ? (
                                            <img
                                                src={selectedDocument.thumbnail}
                                                alt={selectedDocument.name}
                                                className="max-w-full max-h-full object-contain rounded-lg"
                                                onError={() => setDrawerPreviewImageFailed(true)}
                                            />
                                        ) : selectedDocument.type === "link" ? (
                                            <div className="text-center">
                                                <Link className="w-10 h-10 text-cyan-400 mx-auto mb-2" />
                                                <a href={selectedDocument.url} target="_blank" rel="noopener noreferrer"
                                                    className="text-sm text-cyan-600 dark:text-cyan-400 underline break-all px-4">
                                                    {selectedDocument.url}
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <span className="text-4xl mb-2 block">{docType.icon}</span>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    {selectedDocument.type === "mp4"
                                                        ? "Chưa có link video để xem trước"
                                                        : "Không có xem trước"}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Thông tin file</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Tên</span>
                                            <span className="text-gray-900 dark:text-white font-medium text-right max-w-[250px] break-words">{selectedDocument.name}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-500">Loại</span>
                                            <Badge className={`${docType.color} bg-transparent border`}>{selectedDocument.type.toUpperCase()}</Badge>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Kích thước</span>
                                            <span className="text-gray-900 dark:text-white">{formatFileSize(selectedDocument.size)}</span>
                                        </div>
                                        {selectedDocument.url && (
                                            <div className="flex justify-between items-start gap-3">
                                                <span className="text-gray-500">Link đính kèm</span>
                                                <a
                                                    href={selectedDocument.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-cyan-600 dark:text-cyan-400 underline text-right max-w-[250px] break-all"
                                                >
                                                    {selectedDocument.url}
                                                </a>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-500">Quyền xem</span>
                                            <VisibilityBadge doc={selectedDocument} />
                                        </div>
                                        {selectedDocument.folder && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Folder</span>
                                                <span className="text-gray-900 dark:text-white">{selectedDocument.folder}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Chủ sở hữu</h3>
                                    <div className="flex items-center space-x-3">
                                        <Avatar className="w-10 h-10">
                                            <AvatarImage src={owner?.imageURL || "/placeholder.svg"} />
                                            <AvatarFallback>{owner?.name.split(" ").map((n) => n[0]).join("") || "U"}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{owner?.name || "Unknown"}</p>
                                            <p className="text-xs text-gray-500">{owner?.email || ""}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Tạo lúc</span>
                                        <span className="text-gray-900 dark:text-white">{formatDate(selectedDocument.createdAt)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Sửa lúc</span>
                                        <span className="text-gray-900 dark:text-white">{formatDate(selectedDocument.modifiedAt)}</span>
                                    </div>
                                </div>

                                {selectedDocument.tags.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Tags</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedDocument.tags.map((tag) => (
                                                <Badge key={tag} variant="secondary"><Tag className="w-3 h-3 mr-1" />{tag}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedDocument.description && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Mô tả</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-300">{selectedDocument.description}</p>
                                    </div>
                                )}

                                <div className="flex space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <Button variant="outline" className="flex-1 bg-transparent"
                                        onClick={() => void handleStarToggle(selectedDocument.id)}>
                                        {selectedDocument.isStarred ? <><StarOff className="w-4 h-4 mr-2" />Bỏ star</> : <><Star className="w-4 h-4 mr-2" />Star</>}
                                    </Button>
                                    {isLeaderOrAdmin && (
                                        <Button variant="outline" className="flex-1 bg-transparent"
                                            onClick={() => {
                                                const vis = selectedDocument.visibility ?? "team"
                                                setVisibilityDialog({
                                                    open: true,
                                                    docId: selectedDocument.id,
                                                    visibility: vis === "specific" ? "team" : (vis as DocVisibility),
                                                    selectedOfficePersonIds: selectedDocument.visibleToPersonIds ?? [],
                                                })
                                                setVisibilityRoleFilter([])
                                            }}>
                                            <Globe className="w-4 h-4 mr-2" />Quyền xem
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </SheetContent>
            </Sheet>

            {/* ── New Folder Dialog ────────────────────────────────────── */}
            {newFolderDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-800 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {newFolderDialog.parentId ? "Tạo folder con" : "Tạo folder mới"}
                        </h2>
                        {newFolderDialog.parentId && (
                            <p className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Trong folder: <span className="font-medium text-gray-700 dark:text-gray-200">
                                    {folders.find((folder) => folder.id === newFolderDialog.parentId)?.name ?? "Folder hiện tại"}
                                </span>
                            </p>
                        )}
                        {!newFolderDialog.parentId && <div className="mb-4" />}
                        <Input
                            autoFocus
                            placeholder="Tên folder..."
                            value={newFolderDialog.name}
                            onChange={(e) => setNewFolderDialog((s) => ({ ...s, name: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder() }}
                            className="mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" className="bg-transparent"
                                onClick={() => setNewFolderDialog({ open: false, name: "", parentId: null })}>Huỷ</Button>
                            <Button disabled={!newFolderDialog.name.trim() || isSubmitting}
                                onClick={() => void handleCreateFolder()}>Tạo</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Move Document Dialog ────────────────────────────────── */}
            {moveDocumentDialog.open && moveDocumentDialog.document && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-800 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Di chuyển tài liệu</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Chọn folder đích cho <span className="font-medium text-gray-700 dark:text-gray-200">
                                {moveDocumentDialog.document.name}
                            </span>
                        </p>
                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                            Hiện tại: <span className="font-medium">{getFolderPathLabel(moveDocumentDialog.document.folderId)}</span>
                        </div>

                        <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-700">
                            <button
                                type="button"
                                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                    moveDocumentDialog.selectedFolderId === null
                                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-700"
                                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                }`}
                                onClick={() => setMoveDocumentDialog((state) => ({ ...state, selectedFolderId: null }))}
                            >
                                <FolderOpen className="h-4 w-4 shrink-0" />
                                <span className="font-medium">Ngoài folder</span>
                            </button>

                            {(folderChildrenByParentId.get("__root__") ?? []).length === 0 ? (
                                <p className="px-3 py-4 text-sm italic text-gray-400 dark:text-gray-500">
                                    Chưa có folder nào để chọn.
                                </p>
                            ) : (
                                (folderChildrenByParentId.get("__root__") ?? []).map((folder) => renderMoveFolderOption(folder))
                            )}
                        </div>

                        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                            Folder đích: <span className="font-medium">{getFolderPathLabel(moveDocumentDialog.selectedFolderId)}</span>
                        </div>

                        <div className="mt-4 flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                className="bg-transparent"
                                onClick={() => setMoveDocumentDialog({ open: false, document: null, selectedFolderId: null })}
                            >
                                Huỷ
                            </Button>
                            <Button
                                disabled={isSubmitting || moveDocumentDialog.selectedFolderId === (moveDocumentDialog.document.folderId ?? null)}
                                onClick={() => void handleConfirmMoveDocument()}
                            >
                                Di chuyển
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Document Dialog ──────────────────────────────── */}
            {createDocumentDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
                    <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-800 space-y-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tạo tài liệu</h2>

                        <div className="space-y-3">
                            <Input
                                type="file"
                                accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null
                                    setCreateDocumentDialog((s) => ({
                                        ...s,
                                        file,
                                        name: s.name.trim() ? s.name : (file?.name ?? ""),
                                    }))
                                }}
                            />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tên tài liệu</p>
                                <Input
                                    placeholder="Nhập tên tài liệu (mặc định theo tên file)"
                                    value={createDocumentDialog.name}
                                    onChange={(e) =>
                                        setCreateDocumentDialog((s) => ({ ...s, name: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Deadline học liệu (tuỳ chọn)</p>
                                <Input
                                    type="datetime-local"
                                    value={createDocumentDialog.deadlineAt}
                                    onChange={(e) =>
                                        setCreateDocumentDialog((s) => ({ ...s, deadlineAt: e.target.value }))
                                    }
                                />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Chỉ nhận file định dạng PDF hoặc PPTX.
                            </p>
                            {selectedUploadExt === "pptx" ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                                    Bạn đang tải file PPTX. Hệ thống sẽ chỉ giữ bản có độ chính xác hiển thị cao; nếu PPTX không convert chuẩn sẽ bị từ chối. Khuyến nghị xuất PDF chất lượng cao (embed font) rồi upload.
                                </div>
                            ) : selectedUploadExt === "pdf" ? (
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                                    Định dạng PDF thường cho kết quả hiển thị ổn định và ít lỗi font nhất trên mọi thiết bị.
                                </div>
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                                    Mẹo: nếu tài liệu cần hiển thị chính xác tuyệt đối, hãy ưu tiên PDF.
                                </div>
                            )}
                        </div>
                        <VisibilityPicker
                            user={user}
                            visibility={createDocumentDialog.visibility}
                            onChange={(v) => setCreateDocumentDialog((s) => ({
                                ...s,
                                visibility: v,
                                selectedOfficePersonIds: (v === "team" || v === "office") ? (s.selectedOfficePersonIds ?? []) : [],
                            }))}
                        />
                        {(createDocumentDialog.visibility === "team" || createDocumentDialog.visibility === "office") && officeSelectablePeople.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Nhân viên trực thuộc phòng ban
                                </p>
                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setCreateRoleFilter([])}
                                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                    createRoleFilter.length === 0
                                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                        : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                }`}
                                            >
                                                Tất cả vai trò
                                            </button>
                                            {officeRoleOptions
                                                .filter((role) => role !== "all")
                                                .map((role) => {
                                                    const selected = createRoleFilter.includes(role)
                                                    return (
                                                        <button
                                                            key={`create-role-${role}`}
                                                            type="button"
                                                            onClick={() =>
                                                                setCreateRoleFilter((prev) =>
                                                                    prev.includes(role)
                                                                        ? prev.filter((item) => item !== role)
                                                                        : [...prev, role]
                                                                )
                                                            }
                                                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                                selected
                                                                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                                    : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                            }`}
                                                        >
                                                            {role}
                                                        </button>
                                                    )
                                                })}
                                        </div>
                                        <Input
                                            value={createMemberSearch}
                                            onChange={(e) => setCreateMemberSearch(e.target.value)}
                                            placeholder="Tìm tên hoặc email..."
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>{filteredCreatePeople.length} nhân sự phù hợp</span>
                                        <span>
                                            Đã chọn {(createDocumentDialog.selectedOfficePersonIds ?? []).length}
                                        </span>
                                    </div>
                                </div>
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 p-2 space-y-2 bg-white/60 dark:bg-gray-900/20">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCreateDocumentDialog((s) => ({
                                                    ...s,
                                                    selectedOfficePersonIds: Array.from(
                                                        new Set([
                                                            ...(s.selectedOfficePersonIds ?? []),
                                                            ...filteredCreatePeople.map((person) => person.id),
                                                        ])
                                                    ),
                                                }))
                                            }
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Chọn tất cả theo bộ lọc
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCreateDocumentDialog((s) => ({ ...s, selectedOfficePersonIds: [] }))}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Bỏ chọn
                                        </button>
                                    </div>
                                    {filteredCreatePeople.map((person) => {
                                        const selected = (createDocumentDialog.selectedOfficePersonIds ?? []).includes(person.id)
                                        return (
                                            <button
                                                key={person.id}
                                                type="button"
                                                onClick={() => setCreateDocumentDialog((s) => {
                                                    const selectedIds = s.selectedOfficePersonIds ?? []
                                                    const exists = selectedIds.includes(person.id)
                                                    return {
                                                        ...s,
                                                        selectedOfficePersonIds: exists
                                                            ? selectedIds.filter((id) => id !== person.id)
                                                            : [...selectedIds, person.id],
                                                    }
                                                })}
                                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                                                    selected
                                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                        : "border-gray-300 text-gray-600 hover:border-blue-300 dark:border-gray-600 dark:text-gray-300"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="font-medium">{person.name}</p>
                                                        <p className="text-xs opacity-75">{person.email}</p>
                                                    </div>
                                                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] dark:bg-gray-700">
                                                        {person.role}
                                                    </span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Chọn &quot;Tất cả&quot; để chia sẻ cho toàn bộ phòng ban, hoặc chọn từng nhân viên cụ thể.
                                </p>
                            </div>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" className="bg-transparent"
                                onClick={closeCreateDocumentDialog}>Huỷ</Button>
                            <Button
                                disabled={
                                    isSubmitting ||
                                    !createDocumentDialog.file
                                }
                                onClick={() => void handleCreateDocument()}
                            >
                                {isSubmitting && createDocumentDialog.file
                                    ? "Đang upload..."
                                    : isSubmitting
                                        ? "Đang tạo..."
                                        : "Tạo"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {uploadRecoveryDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-800 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Định dạng hiển thị có thể chưa chuẩn</h2>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{uploadRecoveryDialog.message}</p>
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                            <p className="font-medium">Cách xử lý nhanh (khuyến nghị)</p>
                            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs sm:text-sm">
                                <li>Mở file PPTX gốc trên PowerPoint.</li>
                                <li>Chọn Save As / Export → PDF (Quality: High, Embed fonts).</li>
                                <li>Upload lại file PDF để hiển thị ổn định như bản gốc.</li>
                            </ol>
                        </div>
                        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                variant="outline"
                                className="bg-transparent"
                                onClick={() => setUploadRecoveryDialog({ open: false, message: "", suggestedName: "" })}
                            >
                                Để sau
                            </Button>
                            <Button
                                onClick={() => {
                                    setUploadRecoveryDialog({ open: false, message: "", suggestedName: "" })
                                    setCreateDocumentDialog((prev) => ({
                                        ...prev,
                                        open: true,
                                        name: uploadRecoveryDialog.suggestedName || prev.name,
                                        file: null,
                                    }))
                                }}
                            >
                                Upload lại bằng PDF
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Visibility Dialog ────────────────────────────────────── */}
            {visibilityDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
                    <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-800 space-y-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cài đặt quyền xem</h2>
                        <VisibilityPicker
                            user={user}
                            visibility={visibilityDialog.visibility}
                            onChange={(v) => setVisibilityDialog((s) => ({
                                ...s,
                                visibility: v,
                                selectedOfficePersonIds: (v === "team" || v === "office") ? (s.selectedOfficePersonIds ?? []) : [],
                            }))}
                        />
                        {(visibilityDialog.visibility === "team" || visibilityDialog.visibility === "office") && officeSelectablePeople.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Nhân viên trực thuộc phòng ban
                                </p>
                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setVisibilityRoleFilter([])}
                                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                    visibilityRoleFilter.length === 0
                                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                        : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                }`}
                                            >
                                                Tất cả vai trò
                                            </button>
                                            {officeRoleOptions
                                                .filter((role) => role !== "all")
                                                .map((role) => {
                                                    const selected = visibilityRoleFilter.includes(role)
                                                    return (
                                                        <button
                                                            key={`visibility-role-${role}`}
                                                            type="button"
                                                            onClick={() =>
                                                                setVisibilityRoleFilter((prev) =>
                                                                    prev.includes(role)
                                                                        ? prev.filter((item) => item !== role)
                                                                        : [...prev, role]
                                                                )
                                                            }
                                                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                                selected
                                                                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                                    : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                            }`}
                                                        >
                                                            {role}
                                                        </button>
                                                    )
                                                })}
                                        </div>
                                        <Input
                                            value={visibilityMemberSearch}
                                            onChange={(e) => setVisibilityMemberSearch(e.target.value)}
                                            placeholder="Tìm tên hoặc email..."
                                        />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>{filteredVisibilityPeople.length} nhân sự phù hợp</span>
                                        <span>
                                            Đã chọn {(visibilityDialog.selectedOfficePersonIds ?? []).length}
                                        </span>
                                    </div>
                                </div>
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 p-2 space-y-2 bg-white/60 dark:bg-gray-900/20">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setVisibilityDialog((s) => ({
                                                    ...s,
                                                    selectedOfficePersonIds: Array.from(
                                                        new Set([
                                                            ...(s.selectedOfficePersonIds ?? []),
                                                            ...filteredVisibilityPeople.map((person) => person.id),
                                                        ])
                                                    ),
                                                }))
                                            }
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Chọn tất cả theo bộ lọc
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVisibilityDialog((s) => ({ ...s, selectedOfficePersonIds: [] }))}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:text-gray-200"
                                        >
                                            Bỏ chọn
                                        </button>
                                    </div>
                                    {filteredVisibilityPeople.map((person) => {
                                        const selected = (visibilityDialog.selectedOfficePersonIds ?? []).includes(person.id)
                                        return (
                                            <button
                                                key={person.id}
                                                type="button"
                                                onClick={() => setVisibilityDialog((s) => {
                                                    const selectedIds = s.selectedOfficePersonIds ?? []
                                                    const exists = selectedIds.includes(person.id)
                                                    return {
                                                        ...s,
                                                        selectedOfficePersonIds: exists
                                                            ? selectedIds.filter((id) => id !== person.id)
                                                            : [...selectedIds, person.id],
                                                    }
                                                })}
                                                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                                                    selected
                                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                        : "border-gray-300 text-gray-600 hover:border-blue-300 dark:border-gray-600 dark:text-gray-300"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div>
                                                        <p className="font-medium">{person.name}</p>
                                                        <p className="text-xs opacity-75">{person.email}</p>
                                                    </div>
                                                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] dark:bg-gray-700">
                                                        {person.role}
                                                    </span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Chọn &quot;Tất cả&quot; để chia sẻ cho toàn bộ phòng ban, hoặc chọn từng nhân viên cụ thể.
                                </p>
                            </div>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" className="bg-transparent"
                                onClick={() => {
                                    setVisibilityDialog(buildDefaultVisibilityDialog(user))
                                    setVisibilityRoleFilter([])
                                    setVisibilityMemberSearch("")
                                }}>Huỷ</Button>
                            <Button onClick={() => void handleSaveVisibility()}>Lưu</Button>
                        </div>
                    </div>
                </div>
            )}

            </> /* end activeTab === "all" */}

            {/* ── Quiz Create Dialog ───────────────────────────────────── */}
            {quizCreateDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
                    <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800 sm:max-h-[90vh]">
                        <div className="flex items-center justify-between border-b border-gray-200 px-4 pb-4 pt-4 dark:border-gray-700 sm:px-6 sm:pt-5">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {quizCreateDialog.existingQuizId
                                        ? `Sửa quiz · ${quizCreateDialog.documentName}`
                                        : quizCreateDialog.isNewDocument
                                            ? "Tạo quiz"
                                            : `Tạo quiz · ${quizCreateDialog.documentName}`}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tạo bài kiểm tra trắc nghiệm cho tài liệu học</p>
                            </div>
                            <button onClick={() => setQuizCreateDialog(defaultQuizCreate())} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 space-y-4 px-4 py-4 sm:px-6">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                                    Tên bài kiểm tra <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    autoFocus
                                    placeholder="Nhập tên bài kiểm tra..."
                                    value={quizCreateDialog.title}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        setQuizCreateDialog((s) => ({
                                            ...s,
                                            title: value,
                                            ...(s.isNewDocument ? { documentName: value } : {}),
                                        }))
                                    }}
                                />
                            </div>
                            <Input placeholder="Mô tả (tuỳ chọn)" value={quizCreateDialog.description}
                                onChange={(e) => setQuizCreateDialog((s) => ({ ...s, description: e.target.value }))} />
                            <div className="flex flex-wrap items-center gap-2">
                                <Timer className="w-4 h-4 text-gray-400" />
                                <Input type="number" min={5} placeholder="Thời lượng (phút)" className="w-40"
                                    value={quizCreateDialog.durationMinutes}
                                    onChange={(e) => setQuizCreateDialog((s) => ({ ...s, durationMinutes: e.target.value }))} />
                                <span className="text-sm text-gray-500">phút</span>
                                <Input type="number" min={5} placeholder="Thời gian/câu" className="w-40"
                                    value={quizCreateDialog.timePerQuestionSeconds}
                                    onChange={(e) => setQuizCreateDialog((s) => ({ ...s, timePerQuestionSeconds: e.target.value }))} />
                                <span className="text-sm text-gray-500">giây/câu</span>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                                    Deadline làm bài (tuỳ chọn)
                                </label>
                                <Input
                                    type="datetime-local"
                                    value={quizCreateDialog.deadlineAt}
                                    onChange={(e) => setQuizCreateDialog((s) => ({ ...s, deadlineAt: e.target.value }))}
                                />
                            </div>

                            {/* Auto-generate section */}
                            {!quizCreateDialog.isNewDocument && (
                                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <GraduationCap className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                                        <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">Tạo câu hỏi tự động bằng AI</p>
                                    </div>
                                    <p className="text-xs text-violet-600 dark:text-violet-400">
                                        AI sẽ đọc nội dung tài liệu và tự động sinh câu hỏi trắc nghiệm. Bạn có thể chỉnh sửa sau khi tạo.
                                    </p>
                                    <div
                                        className={`rounded-lg border px-3 py-2 text-xs ${
                                            canAutoGenerateByFormat
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                                                : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                                        }`}
                                    >
                                        {canAutoGenerateByFormat ? (
                                            <>
                                                Hỗ trợ tạo tự động: <strong>PPTX</strong> và <strong>PDF có text</strong> (bôi đen/copy được).
                                                Nếu PDF là ảnh scan hoặc font mã hoá lỗi, vui lòng tạo thủ công.
                                            </>
                                        ) : (
                                            <>
                                                Định dạng hiện tại <strong>{quizCreateDocType?.toUpperCase() ?? "không xác định"}</strong> chưa hỗ trợ tạo tự động.
                                                Vui lòng dùng <strong>Thêm câu hỏi thủ công</strong>.
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={30}
                                            placeholder="Số câu"
                                            className="w-28 h-8 text-sm"
                                            value={quizCreateDialog.autoQuestionCount ?? ""}
                                            onChange={(e) => setQuizCreateDialog((s) => ({ ...s, autoQuestionCount: e.target.value }))}
                                        />
                                        <span className="text-xs text-violet-600 dark:text-violet-400">câu hỏi (tối đa 30)</span>
                                        <Button
                                            size="sm"
                                            disabled={quizCreateDialog.isGenerating || !canAutoGenerateByFormat}
                                            onClick={() => void handleAutoGenerateQuiz()}
                                            className="ml-auto bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
                                        >
                                            {quizCreateDialog.isGenerating ? (
                                                <><span className="animate-spin mr-1.5">⏳</span>Đang tạo...</>
                                            ) : (
                                                <><GraduationCap className="w-3.5 h-3.5 mr-1.5" />Tạo tự động</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Câu hỏi ({quizCreateDialog.questions.length})</p>
                                    <Button size="sm" variant="outline" className="bg-transparent text-xs h-8"
                                        onClick={handleAddQuizQuestion}>
                                        <Plus className="w-3.5 h-3.5 mr-1" />Thêm câu hỏi thủ công
                                    </Button>
                                </div>
                                {quizCreateDialog.questions.map((q, qi) => (
                                    <div key={qi} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3 bg-gray-50 dark:bg-gray-900/30">
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs font-bold text-gray-400 mt-2.5 w-5 flex-shrink-0">Q{qi + 1}</span>
                                            <Input placeholder="Nội dung câu hỏi" value={q.text}
                                                onChange={(e) => setQuizCreateDialog((s) => {
                                                    const questions = [...s.questions]
                                                    questions[qi] = { ...questions[qi]!, text: e.target.value }
                                                    return { ...s, questions }
                                                })} />
                                            {quizCreateDialog.questions.length > 1 && (
                                                <button onClick={() => handleRemoveQuizQuestion(qi)}
                                                    className="text-red-400 hover:text-red-600 mt-2 flex-shrink-0">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {q.options.map((opt, oi) => (
                                                <div key={oi} className={`flex items-center gap-2 p-2 rounded-lg border ${q.correctIndex === oi ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-200 dark:border-gray-700"}`}>
                                                    <button onClick={() => setQuizCreateDialog((s) => {
                                                        const questions = [...s.questions]
                                                        questions[qi] = { ...questions[qi]!, correctIndex: oi }
                                                        return { ...s, questions }
                                                    })} className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${q.correctIndex === oi ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                                                        {q.correctIndex === oi && <span className="text-white text-xs">✓</span>}
                                                    </button>
                                                    <span className="text-xs font-bold text-gray-400 flex-shrink-0">{["A","B","C","D"][oi]}</span>
                                                    <input className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-white"
                                                        placeholder={`Đáp án ${["A","B","C","D"][oi]}`} value={opt}
                                                        onChange={(e) => setQuizCreateDialog((s) => {
                                                            const questions = [...s.questions]
                                                            const options = [...questions[qi]!.options] as [string,string,string,string]
                                                            options[oi] = e.target.value
                                                            questions[qi] = { ...questions[qi]!, options }
                                                            return { ...s, questions }
                                                        })} />
                                                </div>
                                            ))}
                                        </div>
                                        <Input placeholder="Giải thích đáp án (tuỳ chọn)" className="text-xs"
                                            value={q.explanation}
                                            onChange={(e) => setQuizCreateDialog((s) => {
                                                const questions = [...s.questions]
                                                questions[qi] = { ...questions[qi]!, explanation: e.target.value }
                                                return { ...s, questions }
                                            })} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
                            <Button variant="outline" className="bg-transparent" onClick={() => setQuizCreateDialog(defaultQuizCreate())}>Huỷ</Button>
                            <Button disabled={isSubmitting} onClick={() => void handleSaveQuiz()} className="bg-violet-600 hover:bg-violet-700">
                                <ClipboardCheck className="w-4 h-4 mr-2" />
                                {isSubmitting ? "Đang lưu..." : (quizCreateDialog.existingQuizId ? "Cập nhật" : "Tạo quiz")}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Quiz Take Modal ──────────────────────────────────────── */}
            {quizTakeModal.open && quizTakeModal.quiz && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
                    <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800 sm:max-h-[90vh]">
                        {!quizTakeModal.isSubmitted ? (
                            <>
                                {/* Header + timer */}
                                <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 pb-4 pt-4 dark:border-gray-700 sm:items-center sm:px-6 sm:pt-5">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{quizTakeModal.quiz.title}</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Câu {quizTakeModal.currentQuestion + 1}/{quizTakeModal.quiz.questions.length}
                                        </p>
                                    </div>
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-mono font-bold ${quizTakeModal.timeLeftSeconds < 60 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"}`}>
                                        <Timer className="w-4 h-4" />
                                        {String(Math.floor(quizTakeModal.timeLeftSeconds / 60)).padStart(2, "0")}:{String(quizTakeModal.timeLeftSeconds % 60).padStart(2, "0")}
                                    </div>
                                </div>

                                {/* Question */}
                                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                                    {(() => {
                                        const displayedQuestionIndex = quizTakeModal.currentQuestion
                                        const originalQuestionIndex = quizTakeModal.questionOrder[displayedQuestionIndex] ?? displayedQuestionIndex
                                        const q = quizTakeModal.quiz.questions[originalQuestionIndex]!
                                        const optionOrder = quizTakeModal.optionOrderByQuestion[originalQuestionIndex] ?? [0, 1, 2, 3]
                                        return (
                                            <div className="space-y-4">
                                                <p className="text-base font-medium text-gray-900 dark:text-white">{q.text}</p>
                                                <div className="space-y-3">
                                                    {optionOrder.map((originalOptionIndex, displayedOptionIndex) => {
                                                        const opt = q.options[originalOptionIndex] ?? ""
                                                        const selected = quizTakeModal.answers[originalQuestionIndex] === originalOptionIndex
                                                        return (
                                                            <button key={`${originalQuestionIndex}-${originalOptionIndex}`} onClick={() => setQuizTakeModal((prev) => {
                                                                const answers = [...prev.answers]
                                                                answers[originalQuestionIndex] = originalOptionIndex
                                                                return { ...prev, answers }
                                                            })}
                                                                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${selected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600"}`}>
                                                                <span className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-xs font-bold ${selected ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 text-gray-400"}`}>
                                                                    {["A","B","C","D"][displayedOptionIndex]}
                                                                </span>
                                                                <span className="text-sm text-gray-800 dark:text-gray-200">{opt}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                                {/* Progress dots */}
                                                <div className="flex gap-1.5 flex-wrap pt-2">
                                                    {quizTakeModal.questionOrder.map((originalIndex, i) => (
                                                        <button
                                                            key={i}
                                                            disabled={!canNavigateToQuestion(i, quizTakeModal)}
                                                            onClick={() => moveToQuizQuestion(i)}
                                                            className={`w-7 h-7 rounded-full text-xs font-medium transition-all ${
                                                                i === quizTakeModal.currentQuestion
                                                                    ? "bg-blue-600 text-white"
                                                                    : quizTakeModal.answers[originalIndex] !== -1
                                                                        ? "bg-green-500 text-white"
                                                                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                                        >
                                                            {i + 1}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>

                                {/* Navigation */}
                                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
                                    <Button
                                        variant="outline"
                                        className="bg-transparent"
                                        disabled={!canNavigateToQuestion(quizTakeModal.currentQuestion - 1, quizTakeModal)}
                                        onClick={() => moveToQuizQuestion(quizTakeModal.currentQuestion - 1)}
                                    >
                                        <ChevronLeft className="w-4 h-4 mr-1" />Trước
                                    </Button>
                                    {quizTakeModal.currentQuestion < quizTakeModal.quiz.questions.length - 1 ? (
                                        <Button onClick={() => moveToQuizQuestion(quizTakeModal.currentQuestion + 1)}>
                                            Tiếp <ChevronRight className="w-4 h-4 ml-1" />
                                        </Button>
                                    ) : (
                                        <Button disabled={quizTakeModal.isSubmitting} onClick={() => void handleSubmitQuiz()}
                                            className="bg-green-600 hover:bg-green-700">
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            {quizTakeModal.isSubmitting ? "Đang nộp..." : "Nộp bài"}
                                        </Button>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Result screen */
                            <div className="flex flex-1 flex-col items-center justify-center p-4 text-center sm:p-8">
                                {(() => {
                                    const result = quizTakeModal.result
                                    const didPass = (result?.score ?? 0) >= QUIZ_PASS_SCORE
                                    const currentDoc = documentsData.find((doc) => doc.id === quizTakeModal.documentId)
                                    return (
                                        <>
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                                    didPass ? "bg-green-100 dark:bg-green-900/30" :
                                    (result?.score ?? 0) >= 50 ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-red-100 dark:bg-red-900/30"
                                }`}>
                                    <Trophy className={`w-10 h-10 ${
                                        didPass ? "text-green-600" :
                                        (result?.score ?? 0) >= 50 ? "text-yellow-500" : "text-red-500"
                                    }`} />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                                    {result?.score}/100 điểm
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400">
                                    {result?.correctAnswers}/{result?.totalQuestions} câu đúng · Lần làm {result?.attemptRound ?? 1}
                                </p>
                                {!didPass && (
                                    <p className="mt-2 max-w-md text-sm font-medium text-red-600 dark:text-red-400">
                                        Chưa đạt yêu cầu {QUIZ_PASS_SCORE}%. Bạn cần làm lại bài kiểm tra ngay để hoàn thành.
                                    </p>
                                )}
                                <div className="mb-6" />
                                {/* Per-question review */}
                                {result?.reviewQuestions && (
                                    <div className="w-full space-y-3 text-left max-h-64 overflow-y-auto">
                                        {result.reviewQuestions.map((rq, i) => {
                                            const myAns = result.answers[i]
                                            const correct = rq.correctIndex!
                                            const isCorrect = myAns === correct
                                            return (
                                                <div key={i} className={`rounded-xl border p-3 ${isCorrect ? "border-green-300 bg-green-50 dark:bg-green-900/10" : "border-red-300 bg-red-50 dark:bg-red-900/10"}`}>
                                                    <div className="flex items-start gap-2 mb-1">
                                                        {isCorrect ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{rq.text}</p>
                                                    </div>
                                                    <p className="text-xs text-gray-500 pl-6">
                                                        Đáp án đúng: <strong>{["A","B","C","D"][correct]} — {rq.options[correct]}</strong>
                                                        {!isCorrect && myAns >= 0 && <> · Bạn chọn: {["A","B","C","D"][myAns]}</>}
                                                    </p>
                                                    {rq.explanation && <p className="text-xs text-blue-600 dark:text-blue-400 pl-6 mt-1">{rq.explanation}</p>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                {didPass ? (
                                    <Button className="mt-6" onClick={() => setQuizTakeModal(defaultQuizTake())}>Đóng</Button>
                                ) : (
                                    <Button
                                        className="mt-6 bg-blue-600 text-white hover:bg-blue-700"
                                        onClick={() => currentDoc && handleOpenQuizTake(currentDoc)}
                                    >
                                        <ClipboardCheck className="mr-2 h-4 w-4" />
                                        Làm lại ngay
                                    </Button>
                                )}
                                        </>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Quiz Results Modal (Leader) ──────────────────────────── */}
            {quizResultsModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
                    <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800 sm:max-h-[85vh]">
                        <div className="flex items-center justify-between border-b border-gray-200 px-4 pb-4 pt-4 dark:border-gray-700 sm:px-6 sm:pt-5">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Kết quả quiz</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{quizResultsModal.documentName}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 bg-transparent text-xs"
                                    disabled={quizResultsModal.isLoading}
                                    onClick={handleExportQuizResultsExcel}
                                >
                                    <FileDown className="mr-1.5 h-3.5 w-3.5" />
                                    Xuất Excel
                                </Button>
                                <button onClick={() => setQuizResultsModal((s) => ({ ...s, open: false }))}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                            <div className="mb-3 inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
                                <button
                                    type="button"
                                    onClick={() => setQuizResultsTab("results")}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                        quizResultsTab === "results"
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                            : "text-gray-600 dark:text-gray-300"
                                    }`}
                                >
                                    Kết quả quiz
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setQuizResultsTab("reset_history")}
                                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                        quizResultsTab === "reset_history"
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                            : "text-gray-600 dark:text-gray-300"
                                    }`}
                                >
                                    Lịch sử reset
                                </button>
                            </div>
                            {quizResultsModal.isLoading ? (
                                <p className="text-sm text-gray-500 text-center py-8">Đang tải...</p>
                            ) : quizResultsTab === "reset_history" ? (
                                <div className="space-y-2">
                                    {(() => {
                                        const now = Date.now()
                                        const filteredResets = quizResultsModal.resets.filter((reset) => {
                                            if (quizResetPersonFilter !== "all" && reset.personId !== quizResetPersonFilter) return false
                                            const resetAtMs = new Date(reset.resetAt).getTime()
                                            if (!Number.isFinite(resetAtMs)) return false
                                            if (quizResetTimeFilter === "today") {
                                                const d = new Date(resetAtMs)
                                                const n = new Date(now)
                                                return (
                                                    d.getFullYear() === n.getFullYear() &&
                                                    d.getMonth() === n.getMonth() &&
                                                    d.getDate() === n.getDate()
                                                )
                                            }
                                            if (quizResetTimeFilter === "7d") return resetAtMs >= now - 7 * 24 * 60 * 60 * 1000
                                            if (quizResetTimeFilter === "30d") return resetAtMs >= now - 30 * 24 * 60 * 60 * 1000
                                            if (quizResetTimeFilter === "90d") return resetAtMs >= now - 90 * 24 * 60 * 60 * 1000
                                            return true
                                        })
                                        const personOptions = Array.from(
                                            new Map(
                                                quizResultsModal.resets.map((reset) => [reset.personId, reset.personName ?? "Unknown"])
                                            ).entries()
                                        )
                                        return (
                                            <>
                                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                                                    <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Bộ lọc lịch sử reset</p>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        <select
                                                            value={quizResetPersonFilter}
                                                            onChange={(event) => setQuizResetPersonFilter(event.target.value)}
                                                            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                                        >
                                                            <option value="all">Tất cả nhân viên</option>
                                                            {personOptions.map(([id, name]) => (
                                                                <option key={id} value={id}>{name}</option>
                                                            ))}
                                                        </select>
                                                        <select
                                                            value={quizResetTimeFilter}
                                                            onChange={(event) => setQuizResetTimeFilter(event.target.value as "all" | "today" | "7d" | "30d" | "90d")}
                                                            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                                        >
                                                            <option value="all">Toàn thời gian</option>
                                                            <option value="today">Hôm nay</option>
                                                            <option value="7d">7 ngày gần đây</option>
                                                            <option value="30d">30 ngày gần đây</option>
                                                            <option value="90d">90 ngày gần đây</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                {filteredResets.length === 0 ? (
                                                    <div className="text-center py-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                                        <RotateCcw className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">Không có dữ liệu reset theo bộ lọc.</p>
                                                    </div>
                                                ) : (
                                                    filteredResets.map((reset) => (
                                                        <div
                                                            key={reset.id}
                                                            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30"
                                                        >
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                                {reset.personName ?? "Unknown"}
                                                            </p>
                                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                                Được reset bởi <span className="font-medium">{reset.resetByPersonName ?? "Unknown"}</span>
                                                            </p>
                                                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                                {new Date(reset.resetAt).toLocaleString("vi-VN")}
                                                            </p>
                                                        </div>
                                                    ))
                                                )}
                                            </>
                                        )
                                    })()}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(() => {
                                        const personRoleById = new Map(people.map((person) => [person.id, person.role]))
                                        const roleLabelByGroup: Record<Exclude<QuizResultsRoleFilter, "all">, string> = {
                                            store_manager: "Quản lí cửa hàng",
                                            store_lead: "Cửa hàng trưởng",
                                            store_technician: "Kỹ thuật viên",
                                            trainer: "Trainer",
                                            other: "Khác",
                                        }
                                        const getRoleGroupByPersonId = (personId: string): Exclude<QuizResultsRoleFilter, "all"> => {
                                            const roleFromStatus = quizResultsModal.learningStatuses.find((item) => item.personId === personId)?.personRole
                                            const roleFromAttempt = quizResultsModal.attempts.find((item) => item.personId === personId)?.personRole
                                            const role = roleFromStatus ?? roleFromAttempt ?? personRoleById.get(personId)
                                            if (!role) return "other"
                                            const group = getRoleGroup(role)
                                            if (group === "store_manager" || group === "store_lead" || group === "store_technician" || group === "trainer") {
                                                return group
                                            }
                                            return "other"
                                        }

                                        const roleGroupsInResult = new Set<Exclude<QuizResultsRoleFilter, "all">>()
                                        quizResultsModal.learningStatuses.forEach((item) => roleGroupsInResult.add(getRoleGroupByPersonId(item.personId)))
                                        quizResultsModal.attempts.forEach((item) => roleGroupsInResult.add(getRoleGroupByPersonId(item.personId)))
                                        const roleOptionOrder: Exclude<QuizResultsRoleFilter, "all">[] = ["store_manager", "store_lead", "store_technician", "trainer", "other"]
                                        const roleOptions = roleOptionOrder.filter((group) => roleGroupsInResult.has(group))
                                        const statusByPersonId = new Map(quizResultsModal.learningStatuses.map((item) => [item.personId, item]))
                                        const supervisorOptions = Array.from(
                                            new Map(
                                                quizResultsModal.learningStatuses
                                                    .filter((item) => item.supervisorUserId && item.supervisorName)
                                                    .map((item) => [item.supervisorUserId as string, item.supervisorName as string])
                                            ).entries()
                                        ).sort((a, b) => a[1].localeCompare(b[1], "vi"))
                                        const openStatusListDetail = (title: string, rows: LearningStatusRow[]) => {
                                            setLearningStatusListSearch("")
                                            setSelectedLearningStatusListDetail({ title, rows })
                                        }
                                        const renderStatusName = (item: LearningStatusRow, className: string) => (
                                            <p key={item.personId} className={`px-1 py-0.5 text-xs font-medium ${className}`}>
                                                {item.personName}
                                            </p>
                                        )

                                        const allowedRoleOptionsByActor: Record<string, Exclude<QuizResultsRoleFilter, "all">[]> = {
                                            store_trainer: ["store_manager", "store_lead", "store_technician"],
                                            store_manager: ["store_lead", "store_technician"],
                                            store_lead: ["store_technician"],
                                        }
                                        const actorRoleOptions =
                                            allowedRoleOptionsByActor[user?.role ?? ""] ??
                                            roleOptionOrder.filter((group) => group !== "trainer")
                                        const scopedRoleOptions = actorRoleOptions.filter((group) => roleOptions.includes(group) || group === "store_lead" || group === "store_technician")
                                        const effectiveRoleFilter =
                                            quizResultsRoleFilter === "all" || scopedRoleOptions.includes(quizResultsRoleFilter)
                                                ? quizResultsRoleFilter
                                                : "all"
                                        const roleMatched = (personId: string) =>
                                            effectiveRoleFilter === "all" || getRoleGroupByPersonId(personId) === effectiveRoleFilter
                                        const supervisorMatched = (personId: string) =>
                                            quizResultsSupervisorFilter === "all" ||
                                            statusByPersonId.get(personId)?.supervisorUserId === quizResultsSupervisorFilter

                                        const scopedLearningStatuses = quizResultsModal.learningStatuses.filter((item) => roleMatched(item.personId) && supervisorMatched(item.personId))
                                        const scopedAttempts = quizResultsModal.attempts.filter((attempt) => roleMatched(attempt.personId) && supervisorMatched(attempt.personId))
                                        const activeAttempts = scopedAttempts.filter((attempt) => attempt.isActiveAttempt !== false)
                                        const needsRetakeAttempts = activeAttempts.filter((attempt) => attempt.score < QUIZ_PASS_SCORE)
                                        const totalRetakeCount = activeAttempts.reduce((sum, attempt) => sum + getQuizRetakeCount(attempt), 0)

                                        const completed = scopedLearningStatuses.filter((item) => item.status === "completed")
                                        const inProgress = scopedLearningStatuses.filter((item) => item.status === "in_progress")
                                        const notStarted = scopedLearningStatuses.filter((item) => item.status === "not_started")
                                        const submittedPersonIdSet = new Set(activeAttempts.map((attempt) => attempt.personId))
                                        const readyButNotSubmitted = completed.filter((item) => !submittedPersonIdSet.has(item.personId))
                                        const notEligibleForQuiz = [...inProgress, ...notStarted]
                                        return (
                                            <>
                                                <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                                                    <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">Lọc theo vai trò</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuizResultsRoleFilter("all")}
                                                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                                effectiveRoleFilter === "all"
                                                                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                                    : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                            }`}
                                                        >
                                                            Tất cả
                                                        </button>
                                                        {scopedRoleOptions.map((group) => (
                                                            <button
                                                                key={group}
                                                                type="button"
                                                                onClick={() => setQuizResultsRoleFilter(group)}
                                                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                                    effectiveRoleFilter === group
                                                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                                        : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                                                                }`}
                                                            >
                                                                {roleLabelByGroup[group]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3">
                                                        <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                            Lọc theo người phụ trách
                                                        </label>
                                                        <select
                                                            value={quizResultsSupervisorFilter}
                                                            onChange={(event) => setQuizResultsSupervisorFilter(event.target.value)}
                                                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                                        >
                                                            <option value="all">Tất cả người phụ trách</option>
                                                            {supervisorOptions.map(([supervisorId, supervisorName]) => (
                                                                <option key={supervisorId} value={supervisorId}>{supervisorName}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Trạng thái học nhân viên</h3>
                                                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đã học", completed)}
                                                            className="text-center px-3 py-2 rounded-xl bg-green-50 transition hover:ring-2 hover:ring-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-green-900/20"
                                                        >
                                                            <p className="text-lg font-bold text-green-700 dark:text-green-300">{completed.length}</p>
                                                            <p className="text-xs text-green-600 dark:text-green-400">Đã học</p>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đang học", inProgress)}
                                                            className="text-center px-3 py-2 rounded-xl bg-amber-50 transition hover:ring-2 hover:ring-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-amber-900/20"
                                                        >
                                                            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{inProgress.length}</p>
                                                            <p className="text-xs text-amber-600 dark:text-amber-400">Đang học</p>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa học", notStarted)}
                                                            className="text-center px-3 py-2 rounded-xl bg-gray-100 transition hover:ring-2 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700/40"
                                                        >
                                                            <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{notStarted.length}</p>
                                                            <p className="text-xs text-gray-600 dark:text-gray-400">Chưa học</p>
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đã học", completed)}
                                                            className="rounded-xl border border-green-200 bg-green-50/70 p-3 text-left transition hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-green-800 dark:bg-green-900/10"
                                                        >
                                                            <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2">Đã học</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {completed.length === 0 ? (
                                                                    <p className="text-xs text-green-700/70 dark:text-green-300/70">Chưa có</p>
                                                                ) : completed.map((item) => renderStatusName(item, "text-green-900 dark:text-green-200"))}
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đang học", inProgress)}
                                                            className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left transition hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-amber-900/10"
                                                        >
                                                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Đang học</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {inProgress.length === 0 ? (
                                                                    <p className="text-xs text-amber-700/70 dark:text-amber-300/70">Chưa có</p>
                                                                ) : inProgress.map((item) => renderStatusName(item, "text-amber-900 dark:text-amber-200"))}
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa học", notStarted)}
                                                            className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-left transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:border-gray-700 dark:bg-gray-900/30"
                                                        >
                                                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Chưa học</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {notStarted.length === 0 ? (
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Chưa có</p>
                                                                ) : notStarted.map((item) => renderStatusName(item, "text-gray-800 dark:text-gray-200"))}
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="pt-2">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Tiến độ làm bài kiểm tra</h3>
                                                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đã nộp", activeAttempts.map((item) => statusByPersonId.get(item.personId)).filter(Boolean) as LearningStatusRow[])}
                                                            className="text-center px-3 py-2 rounded-xl bg-blue-50 transition hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-blue-900/20"
                                                        >
                                                            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{activeAttempts.length}</p>
                                                            <p className="text-xs text-blue-600 dark:text-blue-400">Đã nộp</p>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa nộp (đã học)", readyButNotSubmitted)}
                                                            className="text-center px-3 py-2 rounded-xl bg-amber-50 transition hover:ring-2 hover:ring-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-amber-900/20"
                                                        >
                                                            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{readyButNotSubmitted.length}</p>
                                                            <p className="text-xs text-amber-600 dark:text-amber-400">Chưa nộp (đã học)</p>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa đủ điều kiện", notEligibleForQuiz)}
                                                            className="text-center px-3 py-2 rounded-xl bg-gray-100 transition hover:ring-2 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-700/40"
                                                        >
                                                            <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{notEligibleForQuiz.length}</p>
                                                            <p className="text-xs text-gray-600 dark:text-gray-400">Chưa đủ điều kiện</p>
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Đã nộp", activeAttempts.map((item) => statusByPersonId.get(item.personId)).filter(Boolean) as LearningStatusRow[])}
                                                            className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-left transition hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-800 dark:bg-blue-900/10"
                                                        >
                                                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">Đã nộp</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {activeAttempts.length === 0 ? (
                                                                    <p className="text-xs text-blue-700/70 dark:text-blue-300/70">Chưa có</p>
                                                                ) : activeAttempts.map((item) => {
                                                                    const status = statusByPersonId.get(item.personId)
                                                                    return status
                                                                        ? renderStatusName(status, "text-blue-900 dark:text-blue-200")
                                                                        : <p key={item.id} className="px-1 py-0.5 text-xs font-medium text-blue-900 dark:text-blue-200">{item.personName ?? "Unknown"}</p>
                                                                })}
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa nộp (đã học)", readyButNotSubmitted)}
                                                            className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left transition hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-amber-900/10"
                                                        >
                                                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Chưa nộp (đã học)</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {readyButNotSubmitted.length === 0 ? (
                                                                    <p className="text-xs text-amber-700/70 dark:text-amber-300/70">Chưa có</p>
                                                                ) : readyButNotSubmitted.map((item) => renderStatusName(item, "text-amber-900 dark:text-amber-200"))}
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusListDetail("Chưa đủ điều kiện", notEligibleForQuiz)}
                                                            className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-left transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:border-gray-700 dark:bg-gray-900/30"
                                                        >
                                                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Chưa đủ điều kiện</p>
                                                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                                                {notEligibleForQuiz.length === 0 ? (
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Chưa có</p>
                                                                ) : notEligibleForQuiz.map((item) => renderStatusName(item, "text-gray-800 dark:text-gray-200"))}
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="pt-2">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Kết quả quiz</h3>
                                                    {scopedAttempts.length === 0 ? (
                                                        <div className="text-center py-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                                            <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">Chưa có nhân viên nào làm bài.</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                                                                <div className="text-center px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                                                                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{activeAttempts.length}</p>
                                                                    <p className="text-xs text-blue-600 dark:text-blue-400">Đã nộp</p>
                                                                </div>
                                                                <div className="text-center px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20">
                                                                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                                                                        {activeAttempts.length > 0
                                                                            ? Math.round(activeAttempts.reduce((s, a) => s + a.score, 0) / activeAttempts.length)
                                                                            : 0}
                                                                    </p>
                                                                    <p className="text-xs text-green-600 dark:text-green-400">Điểm TB</p>
                                                                </div>
                                                                <div className="text-center px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-900/20">
                                                                    <p className="text-lg font-bold text-violet-700 dark:text-violet-300">
                                                                        {activeAttempts.filter((a) => a.score >= QUIZ_PASS_SCORE).length}
                                                                    </p>
                                                                    <p className="text-xs text-violet-600 dark:text-violet-400">Đạt ≥{QUIZ_PASS_SCORE}</p>
                                                                </div>
                                                                <div className="text-center px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20">
                                                                    <p className="text-lg font-bold text-red-700 dark:text-red-300">{needsRetakeAttempts.length}</p>
                                                                    <p className="text-xs text-red-600 dark:text-red-400">Cần làm lại</p>
                                                                </div>
                                                            </div>
                                                            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                                                                Tổng số lần làm lại đã ghi nhận: <span className="font-semibold text-gray-700 dark:text-gray-200">{totalRetakeCount}</span>
                                                            </p>
                                                            {scopedAttempts.map((att) => {
                                                                const isExpanded = expandedAttemptIds.has(att.id)
                                                                const incorrectQuestions = getIncorrectAttemptQuestions(att)
                                                                const hasReviewQuestions = (att.reviewQuestions?.length ?? 0) > 0
                                                                return (
                                                                    <div key={att.id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30">
                                                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${att.score >= QUIZ_PASS_SCORE ? "bg-green-500" : att.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}>
                                                                                    {att.personName?.[0] ?? "?"}
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                                        {att.personName ?? "Unknown"}
                                                                                    </p>
                                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                                        Lần {att.attemptRound ?? 1} · Làm lại {getQuizRetakeCount(att)} lần · {att.correctAnswers}/{att.totalQuestions} câu · {new Date(att.submittedAt).toLocaleDateString("vi-VN")}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                {att.isActiveAttempt !== false && att.score < QUIZ_PASS_SCORE && (
                                                                                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300">
                                                                                        Cần làm lại
                                                                                    </span>
                                                                                )}
                                                                                {att.isActiveAttempt === false && (
                                                                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                                                                                        Đã reset
                                                                                    </span>
                                                                                )}
                                                                                <span className={`text-base font-bold ${att.score >= QUIZ_PASS_SCORE ? "text-green-600" : att.score >= 50 ? "text-yellow-500" : "text-red-500"}`}>
                                                                                    {att.score}đ
                                                                                </span>
                                                                                <Button
                                                                                    type="button"
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    className="h-8 bg-transparent"
                                                                                    onClick={() => toggleAttemptDetail(att.id)}
                                                                                >
                                                                                    {isExpanded ? "Thu gọn" : "Chi tiết"}
                                                                                </Button>
                                                                                {canResetTeamLearning && att.isActiveAttempt !== false && (
                                                                                    <Button
                                                                                        type="button"
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        className="h-8 bg-transparent"
                                                                                        disabled={resettingAttemptPersonId === att.personId}
                                                                                        onClick={() => void handleResetQuizAttemptForPerson(att.personId)}
                                                                                    >
                                                                                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                                                                        {resettingAttemptPersonId === att.personId ? "Đang reset..." : "Reset"}
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {isExpanded && (
                                                                            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                                                                                <div className="mb-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                                                                                    <div>
                                                                                        <p className="text-gray-500 dark:text-gray-400">Điểm lần làm</p>
                                                                                        <p className="font-semibold text-gray-900 dark:text-white">{att.score}đ</p>
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-gray-500 dark:text-gray-400">Số câu đúng</p>
                                                                                        <p className="font-semibold text-gray-900 dark:text-white">{att.correctAnswers}/{att.totalQuestions}</p>
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-gray-500 dark:text-gray-400">Thời gian nộp</p>
                                                                                        <p className="font-semibold text-gray-900 dark:text-white">{new Date(att.submittedAt).toLocaleString("vi-VN")}</p>
                                                                                    </div>
                                                                                </div>
                                                                                {!hasReviewQuestions ? (
                                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Chưa có dữ liệu câu hỏi để đối chiếu đáp án sai.</p>
                                                                                ) : incorrectQuestions.length === 0 ? (
                                                                                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                                                                                        Lần làm này không sai câu nào.
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="space-y-2">
                                                                                        <p className="text-xs font-semibold text-red-600 dark:text-red-300">
                                                                                            Sai {incorrectQuestions.length} câu:
                                                                                        </p>
                                                                                        {incorrectQuestions.map(({ question, questionIndex, selectedIndex, correctIndex }) => (
                                                                                            <div key={`${att.id}-${questionIndex}`} className="rounded-lg border border-red-200 bg-red-50/80 p-3 dark:border-red-900/60 dark:bg-red-900/10">
                                                                                                <p className="text-xs font-semibold text-gray-900 dark:text-white">
                                                                                                    Câu {questionIndex + 1}: {question.text}
                                                                                                </p>
                                                                                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                                                                    Bạn chọn: <span className="font-semibold text-red-600 dark:text-red-300">
                                                                                                        {selectedIndex >= 0 ? `${["A", "B", "C", "D"][selectedIndex] ?? selectedIndex + 1} - ${question.options[selectedIndex] ?? ""}` : "Chưa chọn"}
                                                                                                    </span>
                                                                                                </p>
                                                                                                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                                                                                                    Đáp án đúng: <span className="font-semibold text-green-700 dark:text-green-300">
                                                                                                        {["A", "B", "C", "D"][correctIndex] ?? correctIndex + 1} - {question.options[correctIndex] ?? ""}
                                                                                                    </span>
                                                                                                </p>
                                                                                                {question.explanation && (
                                                                                                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-300">{question.explanation}</p>
                                                                                                )}
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                        {selectedLearningStatusListDetail && (() => {
                            const normalizedSearch = learningStatusListSearch.trim().toLowerCase()
                            const filteredRows = normalizedSearch
                                ? selectedLearningStatusListDetail.rows.filter((item) =>
                                    item.personName.toLowerCase().includes(normalizedSearch) ||
                                    (item.personEmail ?? "").toLowerCase().includes(normalizedSearch)
                                )
                                : selectedLearningStatusListDetail.rows
                            return (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
                                <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {selectedLearningStatusListDetail.title}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {filteredRows.length}/{selectedLearningStatusListDetail.rows.length} nhân viên
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedLearningStatusListDetail(null)
                                                setLearningStatusListSearch("")
                                            }}
                                            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                            aria-label="Đóng danh sách chi tiết"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="relative mb-3">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <Input
                                            value={learningStatusListSearch}
                                            onChange={(event) => setLearningStatusListSearch(event.target.value)}
                                            placeholder="Tìm theo tên hoặc email..."
                                            className="h-10 pl-9"
                                        />
                                    </div>
                                    {selectedLearningStatusListDetail.rows.length === 0 ? (
                                        <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Chưa có nhân viên trong nhóm này.
                                        </p>
                                    ) : filteredRows.length === 0 ? (
                                        <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                            Không tìm thấy nhân viên phù hợp.
                                        </p>
                                    ) : (
                                        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                                            {filteredRows.map((item) => (
                                                <div key={item.personId} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/70">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">{item.personName}</p>
                                                            {item.personEmail && (
                                                                <p className="break-words text-xs text-gray-500 dark:text-gray-400">{item.personEmail}</p>
                                                            )}
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">{item.personRole ?? "Chưa có vai trò"}</p>
                                                        </div>
                                                        {canResetTeamLearning && item.status !== "not_started" && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 shrink-0 bg-transparent px-2 text-xs"
                                                                disabled={resettingLearningPersonId === item.personId}
                                                                onClick={() => void handleResetLearningProgressForPerson(item.personId, item.personName)}
                                                            >
                                                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                                                {resettingLearningPersonId === item.personId ? "Đang reset" : "Cho học lại"}
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                                                        Phụ trách: <span className="font-medium">{item.supervisorName ?? "Chưa gán người phụ trách"}</span>
                                                    </p>
                                                    {(item.storeBranchNames?.length ?? 0) > 0 && (
                                                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                            Cửa hàng: {item.storeBranchNames?.join(", ")}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            )
                        })()}
                    </div>
                </div>
            )}

        </div>
    )
}

// ── VisibilityPicker component ───────────────────────────────────────

function VisibilityPicker({
    user, visibility, onChange
}: {
    user: UserAccount | null
    visibility: DocVisibility
    onChange: (visibility: DocVisibility) => void
}) {
    const isCeoOrAdmin = user?.role === "ceo" || user?.role === "admin"
    const isVanHanhLeader = user?.role === "leader" && user?.department === "Vận hành"
    const showGroupPicker = isCeoOrAdmin || isVanHanhLeader

    if (!showGroupPicker) {
        // Regular leader: auto "team", no choice
        return (
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ai có thể xem?</p>
                <div className="flex items-center gap-2 p-3 rounded-xl border border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                    <Globe className="w-4 h-4" />
                    <div>
                        <p className="text-sm font-medium">Phòng ban của bạn</p>
                        <p className="text-xs opacity-70">Chỉ nhân viên cùng phòng ban với leader tạo tài liệu</p>
                    </div>
                </div>
            </div>
        )
    }

    const officeLabel = isCeoOrAdmin ? "Tất cả nhân viên văn phòng" : "Nhân viên văn phòng (Vận hành)"
    const officeDesc = isCeoOrAdmin ? "Tất cả các phòng ban trừ cửa hàng" : "Nhân viên trong phòng Vận hành"
    const officeValue: DocVisibility = isCeoOrAdmin ? "office" : "team"

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Ai có thể xem?</p>
            <div className="flex flex-col gap-3 sm:flex-row">
                <button
                    type="button"
                    onClick={() => onChange(officeValue)}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        visibility === officeValue
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-300"
                    }`}
                >
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <div className="text-left">
                        <p className="text-sm font-medium">Nhân viên văn phòng</p>
                        <p className="text-xs opacity-70">{officeDesc}</p>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => onChange("store")}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        visibility === "store"
                            ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                            : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-teal-300"
                    }`}
                >
                    <Store className="w-4 h-4 flex-shrink-0" />
                    <div className="text-left">
                        <p className="text-sm font-medium">Nhân viên cửa hàng</p>
                        <p className="text-xs opacity-70">Nhân viên thuộc phòng Cửa hàng</p>
                    </div>
                </button>
            </div>
            {isCeoOrAdmin && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Văn phòng: tất cả phòng ban trừ Cửa hàng · Cửa hàng: nhân viên thuộc team Cửa hàng
                </p>
            )}
        </div>
    )
}
