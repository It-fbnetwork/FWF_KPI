"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { subscribeToPersonChannel } from "@/lib/client/realtime"
import NotesSection from "@/components/notes-section"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/components/auth-provider"
import { useDirectory } from "@/components/directory-provider"
import { type NewTaskInput, type Task, type TimePeriod, useWorkspace } from "@/components/workspace-context"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, getTeamById } from "@/lib/people"
import {
    Share,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    CheckCircle,
    BarChart3,
    Calendar,
    MessageSquare,
    Plus,
    MoreHorizontal,
    Edit3,
    Users,
    Zap,
    Paperclip,
    FileText,
    X,
    Copy,
    Link2,
    Trash2,
} from "lucide-react"

interface Note {
    id: string
    title: string
    description: string
    completed: boolean
}

interface ScheduleItem {
    id: string
    dateKey: string
    title: string
    description: string
    startTime: string
    endTime: string
    attendeeIds: string[]
}

type ScheduleFormState = {
    title: string
    description: string
    startTime: string
    endTime: string
    attendeeIds: string[]
    teamFilter: string
}

type SharePermission = "Can view" | "Can comment" | "Can edit"
type GeneralAccess = "Restricted" | "Team" | "Anyone with link"

interface SharedMember {
    personId: string
    permission: SharePermission
}

const TASK_STATUS_OPTIONS = {
    Pending: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
    "In Progress": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    Completed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
} as const

const TASK_STATUS_LABELS: Record<keyof typeof TASK_STATUS_OPTIONS, string> = {
    Pending: "Chờ thực hiện",
    "In Progress": "Đang thực hiện",
    Completed: "Hoàn thành",
}

const SHARE_PERMISSION_LABELS: Record<SharePermission, string> = {
    "Can view": "Có thể xem",
    "Can comment": "Có thể bình luận",
    "Can edit": "Có thể chỉnh sửa",
}

const GENERAL_ACCESS_LABELS: Record<GeneralAccess, string> = {
    Restricted: "Hạn chế",
    Team: "Nhóm",
    "Anyone with link": "Bất kỳ ai có liên kết",
}

function formatPeriodLabel(period: TimePeriod) {
    switch (period) {
        case "This Week":
            return "Tuần này"
        case "Last Week":
            return "Tuần trước"
        case "This Month":
            return "Tháng này"
    }
}

export default function MyTaskPage() {
    const vietnamNow = useMemo(() => {
        const now = new Date()
        return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }))
    }, [])
    const searchParams = useSearchParams()
    const { user } = useAuth()
    const { people, teams } = useDirectory()
    const { currentUserId, projectTasks, projects, addTask, updateTask, updateTaskAssignee } = useWorkspace()
    const [notes, setNotes] = useState<Note[]>([
        {
            id: "1",
            title: "Trang giới thiệu website",
            description: "Cần xác định rõ mục tiêu của trang trước khi triển khai nội dung.",
            completed: false,
        },
        {
            id: "2",
            title: "Sửa biểu tượng trên nền tối",
            description:
                "Ưu tiên biểu tượng dễ nhận diện, rõ nghĩa và không quá phức tạp.",
            completed: false,
        },
        {
            id: "3",
            title: "Trao đổi cải thiện luồng người dùng",
            description: "Xác định mục tiêu chính của luồng để tối ưu thứ tự thao tác.",
            completed: true,
        },
    ])

    const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>("This Week")
    const [selectedDate, setSelectedDate] = useState(17)
    const [currentWeekStart, setCurrentWeekStart] = useState(15)
    const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
    const [isTeamTasksOpen, setIsTeamTasksOpen] = useState(false)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [taskDraft, setTaskDraft] = useState<Task | null>(null)
    const [isCreatingTask, setIsCreatingTask] = useState(false)
    const [isUpdatingTask, setIsUpdatingTask] = useState(false)
    const [shareSearchQuery, setShareSearchQuery] = useState("")
    const [sharePermission, setSharePermission] = useState<SharePermission>("Can view")
    const [generalAccess, setGeneralAccess] = useState<GeneralAccess>("Restricted")
    const [sharedMembers, setSharedMembers] = useState<SharedMember[]>([
        { personId: "people_1", permission: "Can edit" },
        { personId: "people_4", permission: "Can comment" },
    ])
    const [shareFeedback, setShareFeedback] = useState("")
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false)
    const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
    const [isScheduleLoading, setIsScheduleLoading] = useState(false)
    const [isScheduleSubmitting, setIsScheduleSubmitting] = useState(false)
    const [scheduleData, setScheduleData] = useState<Record<string, ScheduleItem[]>>({})
    const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({
        title: "",
        description: "",
        startTime: "09:00",
        endTime: "10:00",
        attendeeIds: [],
        teamFilter: "all",
    })

    const handleAddNote = (note: Omit<Note, "id">) => {
        const newNote = {
            ...note,
            id: Date.now().toString(),
        }
        setNotes([...notes, newNote])
    }

    const handleUpdateNote = (id: string, updates: Partial<Note>) => {
        setNotes(notes.map((note) => (note.id === id ? { ...note, ...updates } : note)))
    }

    const handleDeleteNote = (id: string) => {
        setNotes(notes.filter((note) => note.id !== id))
    }

    const handleChangeAssignee = async (taskId: number, newAssigneeId: string) => {
        await updateTaskAssignee(taskId, newAssigneeId, selectedProjectId ?? undefined)
    }

    const handleChangeStatus = async (taskId: number, newStatus: keyof typeof TASK_STATUS_OPTIONS, projectId?: string) => {
        await updateTask(
            taskId,
            {
                status: newStatus,
                statusColor: TASK_STATUS_OPTIONS[newStatus],
            },
            projectId ?? selectedProjectId ?? undefined,
        )

        if (selectedTask?.id === taskId && taskDraft) {
            const nextTask = {
                ...taskDraft,
                status: newStatus,
                statusColor: TASK_STATUS_OPTIONS[newStatus],
            }
            setSelectedTask(nextTask)
            setTaskDraft(nextTask)
        }
    }

    const getCurrentWeekDays = () => {
        const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        return days.map((day, index) => ({
            day,
            date: currentWeekStart + index,
        }))
    }

    const navigateWeek = (direction: "prev" | "next") => {
        setCurrentWeekStart((prev) => (direction === "next" ? prev + 7 : prev - 7))
    }

    const selectedProjectId = searchParams.get("projectId")
    const selectedProject = projects.find((project) => project.id === selectedProjectId)
    const defaultProjectId = selectedProjectId ?? projects[0]?.id ?? ""
    const isAdminUser = isAdminLikeRole(user?.role)
    const currentUser =
        findPersonForAuthUser(user, people) ??
        people.find((person) => person.id === currentUserId) ?? {
            id: user?.id ?? "guest-user",
            name: user?.name ?? "Khách",
            role: isAdminUser ? "Quản trị viên" : "Thành viên",
            email: user?.email ?? "",
            imageURL: "/placeholder.svg",
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            team: isAdminUser ? "all" : "product",
        }
    const unknownPerson = {
        id: "unknown-person",
        name: "Không xác định",
        role: "Nhân viên",
        email: "",
        imageURL: "/placeholder.svg",
        workingHours: { start: "09:00", end: "17:00", timezone: "UTC+7" },
        team: currentUser.team,
    }
    const currentTeam = getTeamById(currentUser.team, teams)
    const currentTeamPeople = useMemo(
        () =>
            isAdminUser
                ? people
                : people.filter((person) => person.team === currentUser.team),
        [currentUser.team, isAdminUser, people],
    )
    const currentTeamMemberIds = useMemo(() => currentTeamPeople.map((person) => person.id), [currentTeamPeople])
    const canManageAllTasks =
        isAdminUser ||
        user?.role === "leader" ||
        currentUser.role.toLowerCase() === "leader"
    const isCeoUser = user?.role === "ceo"
    const isLeaderUser = user?.role === "leader" || currentUser.role.toLowerCase() === "leader"
    const canManageSchedule = isCeoUser || isLeaderUser
    const greetingLabel = `${isAdminUser ? "Quản trị viên" : currentTeam?.name ?? "Nhóm"} · ${currentUser.name}`
    const greetingText = useMemo(() => {
        const hour = vietnamNow.getHours()

        if (hour < 12) {
            return "Chào buổi sáng!"
        }

        if (hour < 18) {
            return "Chào buổi chiều!"
        }

        return "Chào buổi tối!"
    }, [vietnamNow])
    const todayLabel = useMemo(
        () =>
            new Intl.DateTimeFormat("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                weekday: "long",
                day: "numeric",
                month: "long",
            }).format(vietnamNow),
        [vietnamNow],
    )
    const [newTaskForm, setNewTaskForm] = useState<NewTaskInput>({
        projectId: defaultProjectId,
        timePeriod: "This Week",
        name: "",
        assigneeId: currentUserId,
        status: "Pending",
        executionPeriod: "Tuần 1 (01/03 - 07/03/2026)",
        audience: "Cá nhân",
        weight: "20%",
        resultMethod: "Nhập thủ công",
        target: "",
        progress: 0,
        kpis: [],
        childGoal: "",
        parentGoal: "",
        description: "",
        attachments: [],
    })

    const updateNewTaskForm = <K extends keyof NewTaskInput>(key: K, value: NewTaskInput[K]) => {
        setNewTaskForm((prev) => ({ ...prev, [key]: value }))
    }

    const currentTasks = useMemo(() => {
        if (selectedProjectId && projectTasks[selectedProjectId]) {
            return projectTasks[selectedProjectId][selectedTimePeriod].filter(
                (task) => task.assigneeId === currentUserId,
            )
        }

        return Object.values(projectTasks)
            .flatMap((taskGroups) => taskGroups[selectedTimePeriod])
            .filter((task) => task.assigneeId === currentUserId)
    }, [currentUserId, projectTasks, selectedProjectId, selectedTimePeriod])
    const teamTasks = useMemo(() => {
        if (!canManageAllTasks) {
            return []
        }

        if (selectedProjectId && projectTasks[selectedProjectId]) {
            return projectTasks[selectedProjectId][selectedTimePeriod].filter(
                (task) => currentTeamMemberIds.includes(task.assigneeId) && task.assigneeId !== currentUserId,
            )
        }

        return Object.values(projectTasks)
            .flatMap((taskGroups) => taskGroups[selectedTimePeriod])
            .filter((task) => currentTeamMemberIds.includes(task.assigneeId) && task.assigneeId !== currentUserId)
    }, [canManageAllTasks, currentTeamMemberIds, currentUserId, projectTasks, selectedProjectId, selectedTimePeriod])

    const currentScheduleKey = new Date(
        vietnamNow.getFullYear(),
        vietnamNow.getMonth(),
        selectedDate,
    ).toISOString().slice(0, 10)
    const currentScheduleItems = scheduleData[currentScheduleKey] || []
    const selectedTaskAssignee = taskDraft ? people.find((person) => person.id === taskDraft.assigneeId) : null
    const selectedTaskProject = selectedTask ? projects.find((project) => project.id === selectedTask.projectId) : null
    const taskDetailAssignees = canManageAllTasks ? currentTeamPeople : [currentUser]
    const shareLink = useMemo(() => {
        const projectPath = selectedProjectId ? `/?projectId=${selectedProjectId}` : "/"

        if (typeof window === "undefined") {
            return projectPath
        }

        return new URL(projectPath, window.location.origin).toString()
    }, [selectedProjectId])
    const shareablePeople = useMemo(() => {
        const searchValue = shareSearchQuery.trim().toLowerCase()

        return people.filter((person) => {
            if (person.id === currentUserId) {
                return false
            }

            if (!searchValue) {
                return true
            }

            return [person.name, person.email].some((value) => value.toLowerCase().includes(searchValue))
        })
    }, [currentUserId, shareSearchQuery])
    const getScheduleDateKey = (dateNumber: number) => {
        const scheduleDate = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), dateNumber)
        return scheduleDate.toISOString().slice(0, 10)
    }
    const scheduleTeamOptions = useMemo(
        () => (isCeoUser ? teams : teams.filter((team) => team.id === currentUser.team)),
        [currentUser.team, isCeoUser, teams],
    )
    const availableSchedulePeople = useMemo(() => {
        if (isCeoUser) {
            if (scheduleForm.teamFilter === "all") {
                return people
            }

            return people.filter((person) => person.team === scheduleForm.teamFilter)
        }

        return currentTeamPeople
    }, [currentTeamPeople, isCeoUser, people, scheduleForm.teamFilter])

    const handleOpenAddTask = () => {
        setNewTaskForm({
            projectId: selectedProjectId ?? projects[0]?.id ?? "",
            timePeriod: selectedTimePeriod,
            name: "",
            assigneeId: currentUserId,
            status: "Pending",
            executionPeriod: "Tuần 1 (01/03 - 07/03/2026)",
            audience: "Cá nhân",
            weight: "20%",
            resultMethod: "Nhập thủ công",
            target: "",
            progress: 0,
            kpis: [],
            childGoal: "",
            parentGoal: "",
            description: "",
            attachments: [],
        })
        setIsAddTaskOpen(true)
    }

    const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])

        updateNewTaskForm(
            "attachments",
            files.map((file) => ({
                id: `${file.name}-${file.size}-${file.lastModified}`,
                name: file.name,
                size: file.size,
                type: file.type,
            })),
        )
    }

    const handleRemoveAttachment = (attachmentId: string) => {
        updateNewTaskForm(
            "attachments",
            newTaskForm.attachments.filter((attachment) => attachment.id !== attachmentId),
        )
    }

    const handleSubmitTask = async () => {
        if (!newTaskForm.name.trim() || !newTaskForm.projectId || isCreatingTask) {
            return
        }

        setIsCreatingTask(true)
        try {
            const createdTask = await addTask({
                ...newTaskForm,
                name: newTaskForm.name.trim(),
                childGoal: newTaskForm.childGoal.trim(),
                parentGoal: newTaskForm.parentGoal.trim(),
                description: newTaskForm.description.trim(),
            })

            setIsAddTaskOpen(false)
            setSelectedTask(createdTask)
        } finally {
            setIsCreatingTask(false)
        }
    }

    const handleOpenTask = (task: Task) => {
        setSelectedTask(task)
        setTaskDraft(task)
    }

    const updateTaskDraft = <K extends keyof Task>(key: K, value: Task[K]) => {
        setTaskDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    }

    const handleSubmitTaskUpdate = async () => {
        if (!selectedTask || !taskDraft || isUpdatingTask) {
            return
        }

        const normalizedStatus = taskDraft.status as keyof typeof TASK_STATUS_OPTIONS
        const normalizedStatusColor = TASK_STATUS_OPTIONS[normalizedStatus] ?? TASK_STATUS_OPTIONS.Pending
        const normalizedTask = {
            ...taskDraft,
            name: taskDraft.name.trim(),
            executionPeriod: taskDraft.executionPeriod.trim(),
            audience: taskDraft.audience.trim(),
            weight: taskDraft.weight.trim(),
            resultMethod: taskDraft.resultMethod.trim(),
            target: (taskDraft.target ?? "").trim(),
            progress: Math.min(100, Math.max(0, Number(taskDraft.progress ?? 0))),
            childGoal: taskDraft.childGoal.trim(),
            parentGoal: taskDraft.parentGoal.trim(),
            description: taskDraft.description.trim(),
            kpis: taskDraft.kpis.map((kpi) => kpi.trim()).filter(Boolean),
            status: normalizedStatus,
            statusColor: normalizedStatusColor,
        }

        setIsUpdatingTask(true)
        try {
            const updatedTask = await updateTask(
                selectedTask.id,
                {
                    assigneeId: normalizedTask.assigneeId,
                    name: normalizedTask.name,
                    executionPeriod: normalizedTask.executionPeriod,
                    audience: normalizedTask.audience,
                    weight: normalizedTask.weight,
                    resultMethod: normalizedTask.resultMethod,
                    target: normalizedTask.target,
                    progress: normalizedTask.progress,
                    childGoal: normalizedTask.childGoal,
                    parentGoal: normalizedTask.parentGoal,
                    description: normalizedTask.description,
                    kpis: normalizedTask.kpis,
                    attachments: normalizedTask.attachments,
                    status: normalizedTask.status,
                    statusColor: normalizedTask.statusColor,
                },
                selectedTask.projectId,
            )

            if (!updatedTask) {
                return
            }

            setSelectedTask(updatedTask)
            setTaskDraft(updatedTask)
            toast({
                title: "Cập nhật thành công",
                description: "Nội dung việc đã được cập nhật và đang chờ phản hồi từ trưởng nhóm.",
            })
        } finally {
            setIsUpdatingTask(false)
        }
    }

    const handleAddSharedMember = (personId: string) => {
        setSharedMembers((prev) => {
            const existingMember = prev.find((member) => member.personId === personId)

            if (existingMember) {
                return prev.map((member) =>
                    member.personId === personId ? { ...member, permission: sharePermission } : member,
                )
            }

            return [...prev, { personId, permission: sharePermission }]
        })
        setShareSearchQuery("")
        setShareFeedback("Đã cập nhật quyền truy cập.")
    }

    const handleUpdateSharedMemberPermission = (personId: string, permission: SharePermission) => {
        setSharedMembers((prev) =>
            prev.map((member) => (member.personId === personId ? { ...member, permission } : member)),
        )
        setShareFeedback("Đã cập nhật quyền.")
    }

    const handleRemoveSharedMember = (personId: string) => {
        setSharedMembers((prev) => prev.filter((member) => member.personId !== personId))
        setShareFeedback("Đã xóa thành viên khỏi danh sách chia sẻ.")
    }

    const handleCopyShareLink = async () => {
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareLink)
            } else if (typeof document !== "undefined") {
                const textArea = document.createElement("textarea")
                textArea.value = shareLink
                textArea.setAttribute("readonly", "true")
                textArea.style.position = "absolute"
                textArea.style.left = "-9999px"
                document.body.appendChild(textArea)
                textArea.select()
                document.execCommand("copy")
                document.body.removeChild(textArea)
            }

            setShareFeedback("Đã sao chép liên kết chia sẻ.")
        } catch {
            setShareFeedback("Không thể tự động sao chép. Vui lòng sao chép liên kết thủ công.")
        }
    }

    const formatScheduleTimeRange = (startTime: string, endTime: string) => {
        const formatTime = (value: string) => {
            const [hours = "00", minutes = "00"] = value.split(":")
            return `${hours}:${minutes}`
        }

        return `${formatTime(startTime)} đến ${formatTime(endTime)}`
    }

    const refreshSchedules = async () => {
        setIsScheduleLoading(true)
        try {
            const query = selectedProjectId ? `?projectId=${selectedProjectId}` : ""
            const response = await fetch(`/api/schedules${query}`, {
                credentials: "include",
                cache: "no-store",
            })

            const payload = (await response.json()) as {
                ok: boolean
                schedules?: Array<{
                    id: string
                    projectId: string
                    dateKey: string
                    title: string
                    description: string
                    startTime: string
                    endTime: string
                    attendeeIds: string[]
                }>
                message?: string
            }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Không thể tải lịch họp.")
            }

            const groupedSchedules = (payload.schedules ?? []).reduce<Record<string, ScheduleItem[]>>((acc, schedule) => {
                if (!acc[schedule.dateKey]) {
                    acc[schedule.dateKey] = []
                }

                acc[schedule.dateKey].push({
                    id: schedule.id,
                    dateKey: schedule.dateKey,
                    title: schedule.title,
                    description: schedule.description,
                    startTime: schedule.startTime,
                    endTime: schedule.endTime,
                    attendeeIds: schedule.attendeeIds,
                })

                return acc
            }, {})

            setScheduleData(groupedSchedules)
        } catch (error) {
            toast({
                title: "Không thể tải lịch họp",
                description: error instanceof Error ? error.message : "Vui lòng thử lại sau.",
                variant: "destructive",
            })
        } finally {
            setIsScheduleLoading(false)
        }
    }

    useEffect(() => {
        void refreshSchedules()
    }, [selectedProjectId])

    useEffect(() => {
        if (!currentUser?.id) {
            return
        }

        return subscribeToPersonChannel(currentUser.id, (message) => {
            const payload = message.data as { type?: string; projectId?: string } | undefined
            if (payload?.type !== "schedule.updated") {
                return
            }

            if ((payload.projectId ?? "general") !== (selectedProjectId ?? "general")) {
                return
            }

            void refreshSchedules()
        })
    }, [currentUser?.id, selectedProjectId])

    const resetScheduleForm = () => {
        setScheduleForm({
            title: "",
            description: "",
            startTime: "09:00",
            endTime: "10:00",
            attendeeIds: [],
            teamFilter: isCeoUser ? "all" : currentUser.team,
        })
        setEditingScheduleId(null)
    }

    const openCreateScheduleDialog = () => {
        resetScheduleForm()
        setIsScheduleDialogOpen(true)
    }

    const openEditScheduleDialog = (item: ScheduleItem) => {
        setEditingScheduleId(item.id)
        setScheduleForm({
            title: item.title,
            description: item.description,
            startTime: item.startTime,
            endTime: item.endTime,
            attendeeIds: item.attendeeIds,
            teamFilter: isCeoUser ? "all" : currentUser.team,
        })
        setIsScheduleDialogOpen(true)
    }

    const handleToggleScheduleAttendee = (personId: string) => {
        setScheduleForm((prev) => ({
            ...prev,
            attendeeIds: prev.attendeeIds.includes(personId)
                ? prev.attendeeIds.filter((id) => id !== personId)
                : [...prev.attendeeIds, personId],
        }))
    }

    const handleSaveSchedule = async () => {
        if (!canManageSchedule || isScheduleSubmitting) {
            return
        }

        if (!scheduleForm.title.trim() || !scheduleForm.description.trim() || scheduleForm.attendeeIds.length === 0) {
            toast({
                title: "Thiếu thông tin buổi họp",
                description: "Cần nhập tên, nội dung và chọn ít nhất một người tham gia.",
                variant: "destructive",
            })
            return
        }

        if (scheduleForm.startTime >= scheduleForm.endTime) {
            toast({
                title: "Thời gian không hợp lệ",
                description: "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
                variant: "destructive",
            })
            return
        }

        setIsScheduleSubmitting(true)
        try {
            const payload = {
                projectId: selectedProjectId,
                dateKey: currentScheduleKey,
                title: scheduleForm.title.trim(),
                description: scheduleForm.description.trim(),
                startTime: scheduleForm.startTime,
                endTime: scheduleForm.endTime,
                attendeeIds: scheduleForm.attendeeIds,
            }

            const response = await fetch(
                editingScheduleId ? `/api/schedules/${editingScheduleId}` : "/api/schedules",
                {
                    method: editingScheduleId ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(payload),
                },
            )

            const result = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !result.ok) {
                throw new Error(result.message || "Không thể lưu lịch họp.")
            }

            await refreshSchedules()

            toast({
                title: editingScheduleId ? "Cập nhật lịch thành công" : "Tạo lịch thành công",
                description: editingScheduleId
                    ? "Buổi họp đã được cập nhật."
                    : "Buổi họp mới đã được thêm vào lịch.",
            })
            setIsScheduleDialogOpen(false)
            resetScheduleForm()
        } catch (error) {
            toast({
                title: "Không thể lưu lịch họp",
                description: error instanceof Error ? error.message : "Vui lòng thử lại sau.",
                variant: "destructive",
            })
        } finally {
            setIsScheduleSubmitting(false)
        }
    }

    const handleDeleteSchedule = async (scheduleId: string) => {
        if (!canManageSchedule) {
            return
        }

        const confirmed = window.confirm("Xóa lịch họp này?")
        if (!confirmed) {
            return
        }

        try {
            const response = await fetch(`/api/schedules/${scheduleId}`, {
                method: "DELETE",
                credentials: "include",
            })
            const result = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !result.ok) {
                throw new Error(result.message || "Không thể xóa lịch họp.")
            }

            await refreshSchedules()
            toast({
                title: "Đã xóa lịch họp",
                description: "Buổi họp đã được gỡ khỏi lịch.",
            })
        } catch (error) {
            toast({
                title: "Không thể xóa lịch họp",
                description: error instanceof Error ? error.message : "Vui lòng thử lại sau.",
                variant: "destructive",
            })
        }
    }

    return (
        <div className="p-6">
            {/* Welcome Section */}
            <div className="mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{todayLabel}</p>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {greetingText} {greetingLabel},
                </h2>

                <div className="flex items-center space-x-6 mb-6">
                    <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 bg-transparent"
                            >
                                <Share className="w-4 h-4 mr-2" />
                                Chia sẻ
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl bg-white dark:bg-gray-800">
                            <DialogHeader>
                                <DialogTitle className="text-gray-900 dark:text-white">
                                    Chia sẻ {selectedProject ? selectedProject.name : "không gian làm việc"}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 py-2">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">Liên kết chia sẻ</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Sao chép liên kết trực tiếp đến {selectedProject ? "dự án này" : "không gian làm việc này"}.
                                            </p>
                                        </div>
                                        <Button type="button" variant="outline" onClick={handleCopyShareLink}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Sao chép
                                        </Button>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                                        <Link2 className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                                        <p className="truncate text-sm text-gray-700 dark:text-gray-300">{shareLink}</p>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                                    <div className="space-y-2">
                                        <Label htmlFor="share-search">Mời thành viên</Label>
                                        <Input
                                            id="share-search"
                                            value={shareSearchQuery}
                                            onChange={(event) => setShareSearchQuery(event.target.value)}
                                            placeholder="Tìm theo tên hoặc email"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Quyền</Label>
                                        <Select
                                            value={sharePermission}
                                            onValueChange={(value: SharePermission) => setSharePermission(value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Can view">{SHARE_PERMISSION_LABELS["Can view"]}</SelectItem>
                                                <SelectItem value="Can comment">{SHARE_PERMISSION_LABELS["Can comment"]}</SelectItem>
                                                <SelectItem value="Can edit">{SHARE_PERMISSION_LABELS["Can edit"]}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                    {shareablePeople.map((person) => {
                                        const existingMember = sharedMembers.find((member) => member.personId === person.id)

                                        return (
                                            <div
                                                key={person.id}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900"
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                        <AvatarFallback>
                                                            {person.name
                                                                .split(" ")
                                                                .map((part) => part[0])
                                                                .join("")}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                            {person.name}
                                                        </p>
                                                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                            {person.email}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant={existingMember ? "secondary" : "outline"}
                                                    size="sm"
                                                    onClick={() => handleAddSharedMember(person.id)}
                                                >
                                                    {existingMember ? "Cập nhật quyền" : "Thêm"}
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">Quyền truy cập chung</p>
                                        <div className="w-48">
                                            <Select
                                                value={generalAccess}
                                                onValueChange={(value: GeneralAccess) =>
                                                    setGeneralAccess(value)
                                                }
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Restricted">{GENERAL_ACCESS_LABELS.Restricted}</SelectItem>
                                                    <SelectItem value="Team">{GENERAL_ACCESS_LABELS.Team}</SelectItem>
                                                    <SelectItem value="Anyone with link">{GENERAL_ACCESS_LABELS["Anyone with link"]}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {generalAccess === "Restricted" &&
                                            "Chỉ những người được thêm bên dưới mới có thể mở màn hình này."}
                                        {generalAccess === "Team" &&
                                            "Mọi người trong nhóm của bạn có thể mở màn hình này bằng liên kết."}
                                        {generalAccess === "Anyone with link" &&
                                            "Bất kỳ ai có liên kết đều có thể mở màn hình này."}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Người có quyền truy cập</p>
                                    <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarImage src={currentUser.imageURL || "/placeholder.svg"} />
                                                    <AvatarFallback>
                                                        {currentUser.name
                                                            .split(" ")
                                                            .map((part: string) => part[0])
                                                            .join("")}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{currentUser.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{currentUser.email}</p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary">Chủ sở hữu</Badge>
                                        </div>

                                        {sharedMembers.length > 0 ? (
                                            sharedMembers.map((member) => {
                                                const person = people.find((item) => item.id === member.personId)

                                                if (!person) {
                                                    return null
                                                }

                                                return (
                                                    <div
                                                        key={member.personId}
                                                        className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900"
                                                    >
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <Avatar className="h-9 w-9">
                                                                <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                                <AvatarFallback>
                                                                    {person.name
                                                                        .split(" ")
                                                                        .map((part) => part[0])
                                                                        .join("")}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                                    {person.name}
                                                                </p>
                                                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                                    {person.email}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-40">
                                                                <Select
                                                                    value={member.permission}
                                                                    onValueChange={(value: SharePermission) =>
                                                                        handleUpdateSharedMemberPermission(member.personId, value)
                                                                    }
                                                                >
                                                                    <SelectTrigger>
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="Can view">{SHARE_PERMISSION_LABELS["Can view"]}</SelectItem>
                                                                        <SelectItem value="Can comment">{SHARE_PERMISSION_LABELS["Can comment"]}</SelectItem>
                                                                        <SelectItem value="Can edit">{SHARE_PERMISSION_LABELS["Can edit"]}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-9 w-9"
                                                                onClick={() => handleRemoveSharedMember(member.personId)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                Chưa có cộng tác viên nào.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {shareFeedback && (
                                    <p className="text-sm text-green-600 dark:text-green-400">{shareFeedback}</p>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleOpenAddTask}
                                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 bg-transparent"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Thêm việc
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-white dark:bg-gray-800">
                            <DialogHeader>
                                <DialogTitle className="text-gray-900 dark:text-white">Tạo việc mới</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-6 py-2 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="task-name">Tên việc</Label>
                                    <Input
                                        id="task-name"
                                        value={newTaskForm.name}
                                        onChange={(event) => updateNewTaskForm("name", event.target.value)}
                                        placeholder="Nhập tên việc"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Dự án</Label>
                                    <Select
                                        value={newTaskForm.projectId}
                                        onValueChange={(value) => updateNewTaskForm("projectId", value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn dự án" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {projects.map((project) => (
                                                <SelectItem key={project.id} value={project.id}>
                                                    {project.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Khoảng thời gian</Label>
                                    <Select
                                        value={newTaskForm.timePeriod}
                                        onValueChange={(value: TimePeriod) => updateNewTaskForm("timePeriod", value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn khoảng thời gian" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="This Week">Tuần này</SelectItem>
                                            <SelectItem value="Last Week">Tuần trước</SelectItem>
                                            <SelectItem value="This Month">Tháng này</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Người thực hiện</Label>
                                    <Select
                                        value={newTaskForm.assigneeId}
                                        onValueChange={(value) => updateNewTaskForm("assigneeId", value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn người thực hiện" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currentTeamPeople.map((person) => (
                                                <SelectItem key={person.id} value={person.id}>
                                                    {person.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Trạng thái</Label>
                                    <Select
                                        value={newTaskForm.status}
                                        onValueChange={(value: Task["status"]) => updateNewTaskForm("status", value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn trạng thái" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Pending">Chờ thực hiện</SelectItem>
                                            <SelectItem value="In Progress">Đang thực hiện</SelectItem>
                                            <SelectItem value="Completed">Hoàn thành</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="execution-period">Thời gian hết hạn</Label>
                                    <Input
                                        id="execution-period"
                                        value={newTaskForm.executionPeriod}
                                        onChange={(event) => updateNewTaskForm("executionPeriod", event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="audience">Đối tượng</Label>
                                    <Input
                                        id="audience"
                                        value={newTaskForm.audience}
                                        onChange={(event) => updateNewTaskForm("audience", event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="weight">Trọng số</Label>
                                    <Input
                                        id="weight"
                                        value={newTaskForm.weight}
                                        onChange={(event) => updateNewTaskForm("weight", event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="result-method">Cách tính kết quả</Label>
                                    <Input
                                        id="result-method"
                                        value={newTaskForm.resultMethod}
                                        onChange={(event) => updateNewTaskForm("resultMethod", event.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="kpis">Thêm mục tiêu</Label>
                                    <Input
                                        id="kpis"
                                        value={newTaskForm.kpis.join(", ")}
                                        onChange={(event) =>
                                            updateNewTaskForm(
                                                "kpis",
                                                event.target.value
                                                    .split(",")
                                                    .map((item) => item.trim())
                                                    .filter(Boolean),
                                            )
                                        }
                                        placeholder="KPI 1, KPI 2"
                                    />
                                </div>
                               
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="description">Mô tả</Label>
                                    <Textarea
                                        id="description"
                                        value={newTaskForm.description}
                                        onChange={(event) => updateNewTaskForm("description", event.target.value)}
                                        placeholder="Mô tả chi tiết việc cần làm và kết quả mong đợi"
                                    />
                                </div>
                                <div className="space-y-3 md:col-span-2">
                                    <Label htmlFor="task-attachments">Tệp đính kèm</Label>
                                    <label
                                        htmlFor="task-attachments"
                                        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-blue-500 dark:hover:bg-gray-800"
                                    >
                                        <Paperclip className="mb-2 h-5 w-5 text-gray-500 dark:text-gray-400" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            Tải tệp lên cho việc này
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            Có thể chọn một hoặc nhiều file
                                        </span>
                                    </label>
                                    <Input
                                        id="task-attachments"
                                        type="file"
                                        multiple
                                        className="hidden"
                                        onChange={handleAttachmentChange}
                                    />
                                    {newTaskForm.attachments.length > 0 && (
                                        <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                            {newTaskForm.attachments.map((attachment) => (
                                                <div
                                                    key={attachment.id}
                                                    className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                                {attachment.name}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                {(attachment.size / 1024).toFixed(1)} KB
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleRemoveAttachment(attachment.id)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsAddTaskOpen(false)} disabled={isCreatingTask}>
                                    Hủy
                                </Button>
                                <Button onClick={handleSubmitTask} loading={isCreatingTask}>
                                    {isCreatingTask ? "Đang tạo..." : "Tạo việc"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Stats */}
                <div className="flex items-center space-x-8 mb-8">
                    <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">12hrs</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">Giờ tiết kiệm</span>
                    </div>
                    <div className="flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">24</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">Dự án hoàn thành</span>
                    </div>
                    <div className="flex items-center">
                        <Zap className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">7</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">Dự án đang thực hiện</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-y-6">
                {/* My Projects - Full Width */}
                <div className="lg:col-span-3">
                    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                                    <BarChart3 className="w-5 h-5 mr-2" />
                                    {selectedProject ? `Việc trong ${selectedProject.name}` : "Việc của tôi"}
                                </CardTitle>
                                <div className="flex items-center space-x-2">
                                    {canManageAllTasks && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setIsTeamTasksOpen(true)}
                                            className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-transparent"
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            Việc của nhóm
                                        </Button>
                                    )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-transparent"
                                            >
                                                {formatPeriodLabel(selectedTimePeriod)}
                                                <ChevronDown className="w-4 h-4 ml-2" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                            <DropdownMenuItem
                                                onClick={() => setSelectedTimePeriod("This Week")}
                                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                Tuần này
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setSelectedTimePeriod("Last Week")}
                                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                Tuần trước
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => setSelectedTimePeriod("This Month")}
                                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                Tháng này
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-300">
                                        Xem tất cả
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-2">
                                    <div className="col-span-6 flex items-center">
                                        <Edit3 className="w-4 h-4 mr-2" />
                                        Tên việc
                                    </div>
                                    <div className="col-span-3 flex items-center">
                                        <Users className="w-4 h-4 mr-2" />
                                        Người thực hiện
                                    </div>
                                    <div className="col-span-3 flex items-center">
                                        <Zap className="w-4 h-4 mr-2" />
                                        Trạng thái
                                    </div>
                                </div>

                                {/* Task Rows */}
                                {currentTasks.map((task) => {
                                    const assignee = people.find((p) => p.id === task.assigneeId) ?? unknownPerson
                                    return (
                                        <div
                                            key={task.id}
                                            className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                                            onClick={() => handleOpenTask(task)}
                                        >
                                            <div className="col-span-6">
                                                <div className="flex items-center">
                                                    <CheckCircle className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{task.name}</span>
                                                    <div className="flex items-center ml-4 space-x-2">
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                                                            <MessageSquare className="w-3 h-3 mr-1" />
                                                            {task.comments}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                                                            ♥ {task.likes}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="mt-2 max-w-md">
                                                    <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                        <span>{task.target || "Chưa đặt mục tiêu"}</span>
                                                        <span>{task.progress ?? 0}%</span>
                                                    </div>
                                                    <Progress value={task.progress ?? 0} className="h-2" />
                                                </div>
                                            </div>
                                            <div className="col-span-3">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <div className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded p-1">
                                                            <Avatar className="w-6 h-6 mr-2">
                                                                <AvatarImage src={assignee.imageURL || "/placeholder.svg"} />
                                                                <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white">
                                                                    {assignee.name
                                                                        .split(" ")
                                                                        .map((n) => n[0])
                                                                        .join("")}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span className="text-sm text-gray-700 dark:text-gray-300">{assignee.name}</span>
                                                            <ChevronDown className="w-3 h-3 ml-1" />
                                                        </div>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                                        {currentTeamPeople.map((person) => (
                                                            <DropdownMenuItem
                                                                key={person.id}
                                                                onClick={() => handleChangeAssignee(task.id, person.id)}
                                                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Avatar className="w-5 h-5 mr-2">
                                                                    <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                                    <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white">
                                                                        {person.name
                                                                            .split(" ")
                                                                            .map((n) => n[0])
                                                                            .join("")}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm">{person.name}</span>
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{person.email}</span>
                                                                </div>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                            <div className="col-span-3">
                                                <Select
                                                    value={task.status}
                                                    onValueChange={(value: keyof typeof TASK_STATUS_OPTIONS) =>
                                                        handleChangeStatus(task.id, value)
                                                    }
                                                >
                                                    <SelectTrigger className="w-[150px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.keys(TASK_STATUS_OPTIONS).map((status) => (
                                                            <SelectItem key={status} value={status}>
                                                                {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_OPTIONS]}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )
                                })}
                                {currentTasks.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                        Không có việc nào trong màn hình này. Thêm việc mới để bắt đầu theo dõi.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Schedule */}
                    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                                    <Calendar className="w-5 h-5 mr-2" />
                                    Lịch
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    {canManageSchedule ? (
                                        <Button variant="outline" size="sm" onClick={openCreateScheduleDialog}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Tạo lịch
                                        </Button>
                                    ) : null}
                                    <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Calendar Week View with Navigation */}
                            <div className="flex items-center justify-between mb-4">
                                <Button variant="ghost" size="icon" onClick={() => navigateWeek("prev")}>
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <div className="grid grid-cols-7 gap-1 text-center text-xs flex-1 mx-2">
                                    {getCurrentWeekDays().map(({ day, date }, index) => (
                                        <div key={day} className="py-2">
                                            <div className="text-gray-500 dark:text-gray-400">{day}</div>
                                            <button
                                                onClick={() => setSelectedDate(date)}
                                                className={`mt-1 w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs transition-colors ${selectedDate === date
                                                        ? "bg-purple-500 text-white"
                                                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    }`}
                                            >
                                                {date}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => navigateWeek("next")}>
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Schedule Items */}
                            <div className="space-y-3 min-h-[192px]">
                                {currentScheduleItems.length > 0 ? (
                                    currentScheduleItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {formatScheduleTimeRange(item.startTime, item.endTime)}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <div className="flex -space-x-1 cursor-pointer">
                                                    {item.attendeeIds.map((attendeeId) => {
                                                        const attendee = people.find((p) => p.id === attendeeId) ?? unknownPerson
                                                        return (
                                                            <Avatar key={attendeeId} className="w-5 h-5 border border-white dark:border-gray-800">
                                                                <AvatarImage src={attendee.imageURL || "/placeholder.svg"} />
                                                                <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white">
                                                                    {attendee.name
                                                                        .split(" ")
                                                                        .map((n) => n[0])
                                                                        .join("")}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        )
                                                    })}
                                                </div>
                                                {canManageSchedule ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="w-6 h-6">
                                                                <MoreHorizontal className="w-3 h-3" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                                            <DropdownMenuItem
                                                                onClick={() => openEditScheduleDialog(item)}
                                                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Edit3 className="mr-2 h-4 w-4" />
                                                                Sửa lịch
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleDeleteSchedule(item.id)}
                                                                className="text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Xóa lịch
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))
                                ) : isScheduleLoading ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">Đang tải lịch họp...</p>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">Chưa có lịch nào trong ngày này</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Dialog
                        open={isScheduleDialogOpen}
                        onOpenChange={(open) => {
                            setIsScheduleDialogOpen(open)
                            if (!open) {
                                resetScheduleForm()
                            }
                        }}
                    >
                        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-white dark:bg-gray-800">
                            <DialogHeader>
                                <DialogTitle className="text-gray-900 dark:text-white">
                                    {editingScheduleId ? "Chỉnh sửa lịch họp" : "Tạo lịch họp"}
                                </DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="schedule-title">Tên buổi họp</Label>
                                    <Input
                                        id="schedule-title"
                                        value={scheduleForm.title}
                                        onChange={(event) =>
                                            setScheduleForm((prev) => ({ ...prev, title: event.target.value }))
                                        }
                                        placeholder="Ví dụ: Họp kickoff dự án"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="schedule-description">Nội dung buổi họp</Label>
                                    <Textarea
                                        id="schedule-description"
                                        value={scheduleForm.description}
                                        onChange={(event) =>
                                            setScheduleForm((prev) => ({ ...prev, description: event.target.value }))
                                        }
                                        placeholder="Mô tả nội dung chính của buổi họp"
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="schedule-start-time">Giờ bắt đầu</Label>
                                        <Input
                                            id="schedule-start-time"
                                            type="time"
                                            value={scheduleForm.startTime}
                                            onChange={(event) =>
                                                setScheduleForm((prev) => ({ ...prev, startTime: event.target.value }))
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="schedule-end-time">Giờ kết thúc</Label>
                                        <Input
                                            id="schedule-end-time"
                                            type="time"
                                            value={scheduleForm.endTime}
                                            onChange={(event) =>
                                                setScheduleForm((prev) => ({ ...prev, endTime: event.target.value }))
                                            }
                                        />
                                    </div>
                                </div>
                                {isCeoUser ? (
                                    <div className="grid gap-2">
                                        <Label>Lọc thành viên theo nhóm</Label>
                                        <Select
                                            value={scheduleForm.teamFilter}
                                            onValueChange={(value) =>
                                                setScheduleForm((prev) => ({ ...prev, teamFilter: value }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Chọn nhóm" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Tất cả nhóm</SelectItem>
                                                {scheduleTeamOptions.map((team) => (
                                                    <SelectItem key={team.id} value={team.id}>
                                                        {team.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ) : null}
                                <div className="grid gap-2">
                                    <Label>Người tham gia</Label>
                                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                        {availableSchedulePeople.map((person) => {
                                            const isSelected = scheduleForm.attendeeIds.includes(person.id)
                                            return (
                                                <button
                                                    key={person.id}
                                                    type="button"
                                                    onClick={() => handleToggleScheduleAttendee(person.id)}
                                                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                                                        isSelected
                                                            ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                                                            : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700/40"
                                                    }`}
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <Avatar className="h-9 w-9">
                                                            <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                            <AvatarFallback>
                                                                {person.name
                                                                    .split(" ")
                                                                    .map((part) => part[0])
                                                                    .join("")}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                                                {person.name}
                                                            </p>
                                                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                                {person.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {isSelected ? (
                                                        <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    ) : null}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {isCeoUser
                                            ? "CEO có thể chọn tất cả thành viên trong hệ thống và lọc theo từng nhóm."
                                            : `Trưởng nhóm chỉ có thể chọn thành viên trong nhóm ${currentTeam?.name ?? "của mình"}.`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsScheduleDialogOpen(false)
                                        resetScheduleForm()
                                    }}
                                    disabled={isScheduleSubmitting}
                                >
                                    Hủy
                                </Button>
                                <Button onClick={handleSaveSchedule} loading={isScheduleSubmitting}>
                                    {isScheduleSubmitting
                                        ? "Đang lưu..."
                                        : editingScheduleId
                                            ? "Cập nhật lịch"
                                            : "Tạo lịch"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Notes */}
                    <NotesSection
                        notes={notes}
                        onAddNote={handleAddNote}
                        onUpdateNote={handleUpdateNote}
                        onDeleteNote={handleDeleteNote}
                    />
                </div>
            </div>

            <Sheet
                open={isTeamTasksOpen}
                onOpenChange={setIsTeamTasksOpen}
            >
                <SheetContent side="right" className="w-full max-w-5xl overflow-y-auto bg-white dark:bg-gray-900 sm:max-w-5xl">
                    <SheetHeader className="border-b border-gray-200 pb-4 dark:border-gray-700">
                        <div className="pr-10">
                            <div className="mb-2 flex items-center gap-2">
                                <Badge variant="secondary">{formatPeriodLabel(selectedTimePeriod)}</Badge>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {currentTeam?.name ?? "Nhóm của bạn"}
                                </span>
                            </div>
                            <SheetTitle className="flex items-center text-2xl font-bold text-gray-900 dark:text-white">
                                <Users className="mr-2 h-6 w-6" />
                                Việc của nhóm
                            </SheetTitle>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                Quản lý việc của mọi người trong {currentTeam?.name ?? "nhóm của bạn"} mà không trộn vào danh sách cá nhân.
                            </p>
                        </div>
                    </SheetHeader>
                    <div className="space-y-4 py-6">
                        <div className="grid grid-cols-12 gap-4 border-b border-gray-200 pb-2 text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            <div className="col-span-6 flex items-center">
                                <Edit3 className="mr-2 h-4 w-4" />
                                Tên việc
                            </div>
                            <div className="col-span-3 flex items-center">
                                <Users className="mr-2 h-4 w-4" />
                                Người thực hiện
                            </div>
                            <div className="col-span-3 flex items-center">
                                <Zap className="mr-2 h-4 w-4" />
                                Trạng thái
                            </div>
                        </div>

                        {teamTasks.map((task) => {
                            const assignee = people.find((p) => p.id === task.assigneeId) ?? unknownPerson
                            return (
                                <div
                                    key={task.id}
                                    className="grid grid-cols-12 gap-4 items-center rounded-lg border-b border-gray-100 py-3 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
                                    onClick={() => {
                                        handleOpenTask(task)
                                        setIsTeamTasksOpen(false)
                                    }}
                                >
                                    <div className="col-span-6">
                                        <div className="flex items-center">
                                            <CheckCircle className="mr-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{task.name}</span>
                                            <div className="ml-4 flex items-center space-x-2">
                                                <span className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                                    <MessageSquare className="mr-1 h-3 w-3" />
                                                    {task.comments}
                                                </span>
                                                <span className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                                    ♥ {task.likes}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 max-w-md">
                                            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                <span>{task.target || "Chưa đặt mục tiêu"}</span>
                                                <span>{task.progress ?? 0}%</span>
                                            </div>
                                            <Progress value={task.progress ?? 0} className="h-2" />
                                        </div>
                                    </div>
                                    <div className="col-span-3">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <div className="flex cursor-pointer items-center rounded p-1 hover:bg-gray-50 dark:hover:bg-gray-700">
                                                    <Avatar className="mr-2 h-6 w-6">
                                                        <AvatarImage src={assignee.imageURL || "/placeholder.svg"} />
                                                        <AvatarFallback className="bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-white">
                                                            {assignee.name
                                                                .split(" ")
                                                                .map((n) => n[0])
                                                                .join("")}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">{assignee.name}</span>
                                                    <ChevronDown className="ml-1 h-3 w-3" />
                                                </div>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                                {currentTeamPeople.map((person) => (
                                                    <DropdownMenuItem
                                                        key={person.id}
                                                        onClick={() => handleChangeAssignee(task.id, person.id)}
                                                        className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <Avatar className="mr-2 h-5 w-5">
                                                            <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                            <AvatarFallback className="bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-white">
                                                                {person.name
                                                                    .split(" ")
                                                                    .map((n) => n[0])
                                                                    .join("")}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm">{person.name}</span>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{person.email}</span>
                                                        </div>
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <div className="col-span-3">
                                        <Select
                                            value={task.status}
                                            onValueChange={(value: keyof typeof TASK_STATUS_OPTIONS) =>
                                                handleChangeStatus(task.id, value)
                                            }
                                        >
                                            <SelectTrigger className="w-[150px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.keys(TASK_STATUS_OPTIONS).map((status) => (
                                                    <SelectItem key={status} value={status}>
                                                        {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_OPTIONS]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )
                        })}

                        {teamTasks.length === 0 && (
                            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                Không có việc nhóm nào trong màn hình này.
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <Sheet
                open={Boolean(selectedTask)}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedTask(null)
                        setTaskDraft(null)
                    }
                }}
            >
                <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto bg-white dark:bg-gray-900 sm:max-w-2xl">
                    {selectedTask && taskDraft && (
                        <>
                            <SheetHeader className="border-b border-gray-200 pb-4 dark:border-gray-700">
                                <div className="pr-10">
                                    <div className="mb-2 flex items-center gap-2">
                                        <Badge className={taskDraft.statusColor}>
                                            {TASK_STATUS_LABELS[taskDraft.status as keyof typeof TASK_STATUS_OPTIONS]}
                                        </Badge>
                                        {selectedTaskProject && (
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {selectedTaskProject.name}
                                            </span>
                                        )}
                                    </div>
                                    <SheetTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {taskDraft.name}
                                    </SheetTitle>
                                </div>
                            </SheetHeader>
                            <div className="grid gap-8 py-6">
                                <div className="grid gap-6 md:grid-cols-[150px_1fr]">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Kỳ thực hiện</p>
                                    <Input
                                        value={taskDraft.executionPeriod}
                                        onChange={(event) => updateTaskDraft("executionPeriod", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Trạng thái</p>
                                    <Select
                                        value={taskDraft.status}
                                        onValueChange={(value: keyof typeof TASK_STATUS_OPTIONS) => {
                                            updateTaskDraft("status", value)
                                            updateTaskDraft("statusColor", TASK_STATUS_OPTIONS[value])
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn trạng thái" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.keys(TASK_STATUS_OPTIONS).map((status) => (
                                                <SelectItem key={status} value={status}>
                                                    {TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_OPTIONS]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Người thực hiện</p>
                                    <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                                        {canManageAllTasks ? (
                                            <Select
                                                value={taskDraft.assigneeId}
                                                onValueChange={(value) => updateTaskDraft("assigneeId", value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Chọn người thực hiện" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {taskDetailAssignees.map((person) => (
                                                        <SelectItem key={person.id} value={person.id}>
                                                            {person.name} · {person.email}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarImage src={selectedTaskAssignee?.imageURL || "/placeholder.svg"} />
                                                    <AvatarFallback>
                                                        {selectedTaskAssignee?.name
                                                            ?.split(" ")
                                                            .map((part) => part[0])
                                                            .join("") || "NA"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {selectedTaskAssignee?.name || "Không xác định"}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {selectedTaskAssignee?.email || ""}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Đối tượng</p>
                                    <Input
                                        value={taskDraft.audience}
                                        onChange={(event) => updateTaskDraft("audience", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Trọng số</p>
                                    <Input
                                        value={taskDraft.weight}
                                        onChange={(event) => updateTaskDraft("weight", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Cách tính kết quả</p>
                                    <Input
                                        value={taskDraft.resultMethod}
                                        onChange={(event) => updateTaskDraft("resultMethod", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Mục tiêu</p>
                                    <Input
                                        value={taskDraft.target ?? ""}
                                        onChange={(event) => updateTaskDraft("target", event.target.value)}
                                        placeholder="Ví dụ: 200 conversations / tuần"
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tiến độ (%)</p>
                                    <div className="space-y-3">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={taskDraft.progress ?? 0}
                                            onChange={(event) =>
                                                updateTaskDraft(
                                                    "progress",
                                                    Math.min(100, Math.max(0, Number(event.target.value || 0))),
                                                )
                                            }
                                        />
                                        <div className="space-y-2">
                                            <Progress value={taskDraft.progress ?? 0} className="h-2" />
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Hoàn thành {taskDraft.progress ?? 0}% mục tiêu hiện tại
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">KPIs</p>
                                    <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                                        <Input
                                            value={taskDraft.kpis.join(", ")}
                                            onChange={(event) =>
                                                updateTaskDraft(
                                                    "kpis",
                                                    event.target.value
                                                        .split(",")
                                                        .map((item) => item.trim())
                                                        .filter(Boolean),
                                                )
                                            }
                                        />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Mục tiêu con</p>
                                    <Input
                                        value={taskDraft.childGoal}
                                        onChange={(event) => updateTaskDraft("childGoal", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Mục tiêu cha</p>
                                    <Input
                                        value={taskDraft.parentGoal}
                                        onChange={(event) => updateTaskDraft("parentGoal", event.target.value)}
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Mô tả</p>
                                    <Textarea
                                        value={taskDraft.description}
                                        onChange={(event) => updateTaskDraft("description", event.target.value)}
                                        className="min-h-28"
                                    />
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tệp đính kèm</p>
                                    <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                                        {taskDraft.attachments.length > 0 ? (
                                            <div className="space-y-2">
                                                {taskDraft.attachments.map((attachment) => (
                                                    <div
                                                        key={attachment.id}
                                                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                    {attachment.name}
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {(attachment.size / 1024).toFixed(1)} KB
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {attachment.type || "Tệp"}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-700 dark:text-gray-300">-</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setSelectedTask(null)
                                            setTaskDraft(null)
                                        }}
                                        disabled={isUpdatingTask}
                                    >
                                        Hủy
                                    </Button>
                                    <Button onClick={handleSubmitTaskUpdate} loading={isUpdatingTask}>
                                        {isUpdatingTask ? "Đang cập nhật..." : "Cập nhật việc"}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
