"use client"

import type React from "react"
import type { Route } from "next"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { subscribeToPersonChannel } from "@/lib/client/realtime"
import { Button } from "./ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "./ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "./ui/separator"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { useDirectory } from "@/components/directory-provider"
import { useWorkspace } from "@/components/workspace-context"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, getTeamById } from "@/lib/people"
import {
    STORE_BRANCHES_BY_REGION,
    STORE_REGIONS,
    getStoreBranchesByRegions,
    getStoreRegionsForBranchIds,
    type StoreRegion,
} from "@/lib/store-branches"
import {
    Plus,
    Bell,
    ChevronDown,
    BarChart3,
    MessageSquare,
    FileText,
    Receipt,
    Settings,
    HelpCircle,
    User,
    LogOut,
    Folder,
    LayoutTemplateIcon as Template,
    Import,
    CheckCircle,
    Users,
    ClipboardCheck,
    Menu,
    X as XIcon,
    Upload,
} from "lucide-react"

type SidebarPath = "/" | "/dashboard" | "/projects" | "/people" | "/chats" | "/documents" | "/recipts" | "/tests"

interface SidebarItem {
    name: string
    icon: typeof BarChart3
    path: SidebarPath
}

type ProfileFormState = {
    name: string
    email: string
    imageURL: string
    storeRegion: StoreRegion
    storeRegions: StoreRegion[]
    storeBranchIds: number[]
    start: string
    end: string
    timezone: string
}

type ApprovalRequest = {
    id: string
    email: string
    name: string
    role: "admin" | "ceo" | "leader" | "employee" | "store_staff" | "store_trainer" | "store_manager" | "store_lead" | "store_technician"
    department: string
    createdAt: string
}

const roleDisplayLabel: Record<ApprovalRequest["role"], string> = {
    admin: "Quản trị viên",
    ceo: "CEO",
    leader: "Trưởng nhóm",
    employee: "Nhân viên",
    store_staff: "Nhân viên cửa hàng",
    store_trainer: "Đào tạo viên",
    store_manager: "Quản lí khu vực",
    store_lead: "Cửa hàng trưởng",
    store_technician: "Kỹ thuật viên"
}

type RealtimeNotification = {
    id: string
    title: string
    message: string
    time: string
    unread: boolean
    occurredAt: string
}

type RealtimeEventPayload = {
    type?: string
    actorId?: string
    action?: "created" | "updated" | "deleted" | "assigned" | "reminder" | "requested" | "approved" | "rejected"
    entityType?: "task" | "project" | "schedule" | "document" | "quiz" | "learning_progress" | "person" | "profile" | "approval"
    entityLabel?: string
    entityId?: string
    targetPersonIds?: string[]
    occurredAt?: string
}

type StoredNotification = RealtimeEventPayload & {
    id: string
    unread: boolean
    createdAt: string
}

type NotificationTab = "all" | "unread"

function formatRelativeTime(isoDate: string) {
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))

    if (deltaSeconds < 60) {
        return "Vừa xong"
    }

    const deltaMinutes = Math.floor(deltaSeconds / 60)
    if (deltaMinutes < 60) {
        return `${deltaMinutes} phút trước`
    }

    const deltaHours = Math.floor(deltaMinutes / 60)
    if (deltaHours < 24) {
        return `${deltaHours} giờ trước`
    }

    const deltaDays = Math.floor(deltaHours / 24)
    return `${deltaDays} ngày trước`
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { projects, addProject } = useWorkspace()
    const { user, logout, refreshSession } = useAuth()
    const { people, teams, refresh } = useDirectory()
    const [newProjectName, setNewProjectName] = useState("")
    const [newProjectColor, setNewProjectColor] = useState("bg-blue-200")
    const [newProjectMemberIds, setNewProjectMemberIds] = useState<string[]>([])
    const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
    const [isProjectSubmitting, setIsProjectSubmitting] = useState(false)
    const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false)
    const [isProfileSubmitting, setIsProfileSubmitting] = useState(false)
    const [isAvatarUploading, setIsAvatarUploading] = useState(false)
    const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([])
    const [notifications, setNotifications] = useState<RealtimeNotification[]>([])
    const [notificationTab, setNotificationTab] = useState<NotificationTab>("all")
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
    const [notificationCursor, setNotificationCursor] = useState<string | null>(null)
    const [hasMoreNotifications, setHasMoreNotifications] = useState(false)
    const [isLoadingMoreNotifications, setIsLoadingMoreNotifications] = useState(false)
    const [approvalActionKey, setApprovalActionKey] = useState<string | null>(null)
    const [isSigningOut, setIsSigningOut] = useState(false)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const avatarFileInputRef = useRef<HTMLInputElement | null>(null)
    const selectedProjectId = searchParams.get("projectId")
    const isAdminUser = isAdminLikeRole(user?.role)
    const todayLabel = useMemo(
        () =>
            new Intl.DateTimeFormat("vi-VN", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
            }).format(new Date()),
        [],
    )

    const currentUser =
        findPersonForAuthUser(user, people) ?? {
            id: user?.id ?? "guest-user",
            name: user?.name ?? "Khách",
            role: "Nhân viên",
            email: user?.email ?? "",
            imageURL: "/placeholder.svg",
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            team: "product",
        }
    const currentStoreRegion = ((currentUser.storeRegion ?? user?.storeRegion ?? "Hồ Chí Minh") as StoreRegion)
    const currentStoreBranchIds = currentUser.storeBranchIds ?? user?.storeBranchIds ?? []
    const currentStoreRegions = getStoreRegionsForBranchIds(currentStoreBranchIds)
    const initialStoreRegions = currentStoreRegions.length > 0 ? currentStoreRegions.slice(0, 2) : [currentStoreRegion]
    const [profileForm, setProfileForm] = useState<ProfileFormState>({
        name: currentUser.name,
        email: currentUser.email,
        imageURL: currentUser.imageURL === "/placeholder.svg" ? "" : currentUser.imageURL,
        storeRegion: currentStoreRegion,
        storeRegions: initialStoreRegions,
        storeBranchIds: currentStoreBranchIds,
        start: currentUser.workingHours.start,
        end: currentUser.workingHours.end,
        timezone: currentUser.workingHours.timezone,
    })
    const [profileStoreBranchSearchQuery, setProfileStoreBranchSearchQuery] = useState("")
    const canUpdateOwnStoreLocation =
        user?.department === "Cửa hàng" &&
        (user?.role === "store_technician" || user?.role === "store_manager" || user?.role === "store_lead")
    const isProfileStoreManager = user?.department === "Cửa hàng" && user?.role === "store_manager"
    const isProfileStoreLead = user?.department === "Cửa hàng" && user?.role === "store_lead"
    const canProfileSelectMultipleStores = isProfileStoreManager || isProfileStoreLead
    const profileStoreBranchSelectionLimit = canProfileSelectMultipleStores ? 5 : 1
    const profileRegionBranches = useMemo(
        () => isProfileStoreManager
            ? getStoreBranchesByRegions(profileForm.storeRegions)
            : STORE_BRANCHES_BY_REGION[profileForm.storeRegion] ?? [],
        [isProfileStoreManager, profileForm.storeRegion, profileForm.storeRegions],
    )
    const filteredProfileRegionBranches = useMemo(() => {
        const normalizedQuery = profileStoreBranchSearchQuery.trim().toLowerCase()
        if (!normalizedQuery) return profileRegionBranches
        return profileRegionBranches.filter((branch) =>
            `${branch.name} ${branch.address}`.toLowerCase().includes(normalizedQuery)
        )
    }, [profileRegionBranches, profileStoreBranchSearchQuery])

    const canAccessELearning =
        user?.department === "Cửa hàng" || user?.role === "admin" || user?.role === "ceo"
    const isStoreSidebarUser =
        !isAdminLikeRole(user?.role) &&
        (user?.department === "Cửa hàng" || user?.role?.startsWith("store_"))
    const sidebarItems: SidebarItem[] = isStoreSidebarUser
        ? [
            { name: "Tổng quan", icon: BarChart3, path: "/dashboard" },
            { name: "Nhân sự", icon: Users, path: "/people" },
            { name: "E-learning", icon: FileText, path: "/documents" },
            { name: "Tin nhắn", icon: MessageSquare, path: "/chats" },
        ]
        : [
            { name: "Tổng quan", icon: BarChart3, path: "/dashboard" },
            { name: "Nhóm", icon: FileText, path: "/projects" },
            { name: "Việc của tôi", icon: CheckCircle, path: "/" },
            { name: "Nhân sự", icon: Users, path: "/people" },
            { name: "Tin nhắn", icon: MessageSquare, path: "/chats" },
            ...(canAccessELearning ? [{ name: "E-learning", icon: FileText, path: "/documents" } as SidebarItem] : []),
            { name: "Biên nhận", icon: Receipt, path: "/recipts" },
        ]
    const isOperationsLeader = user?.role === "leader" && user?.department === "Vận hành"
    if (isOperationsLeader) {
        sidebarItems.splice(3, 0, { name: "Tạo bài kiểm tra", icon: ClipboardCheck, path: "/tests" })
    }

    const colorOptions = [
        { name: "Xanh dương", value: "bg-blue-200 dark:bg-blue-800" },
        { name: "Hồng", value: "bg-pink-200 dark:bg-pink-800" },
        { name: "Xanh lá", value: "bg-green-200 dark:bg-green-800" },
        { name: "Vàng", value: "bg-yellow-200 dark:bg-yellow-800" },
        { name: "Tím", value: "bg-purple-200 dark:bg-purple-800" },
        { name: "Đỏ", value: "bg-red-200 dark:bg-red-800" },
    ]

    const buildNotification = useCallback((event: RealtimeEventPayload, id: string, unread: boolean) => {
        if (!event.type || !event.occurredAt) {
            return null
        }
        const actorName =
            people.find((person) => person.id === event.actorId)?.name ??
            (event.actorId === "system" ? "Hệ thống" : "Thành viên")
        const entityLabel = event.entityLabel?.trim() || "mục công việc"

        let title = "Thông báo mới"
        let message = `${actorName} vừa cập nhật hệ thống.`

        if (event.type === "workspace.updated") {
            if (event.entityType === "task" && event.action === "assigned") {
                title = "Việc được giao"
                message = `${actorName} đã giao việc "${entityLabel}" cho bạn.`
            } else if (event.entityType === "task" && event.action === "created") {
                title = "Việc mới"
                message = `${actorName} vừa tạo việc "${entityLabel}".`
            } else if (event.entityType === "project" && event.action === "created") {
                title = "Nhóm mới"
                message = `${actorName} vừa tạo nhóm "${entityLabel}".`
            } else {
                title = "Không gian làm việc cập nhật"
                message = `${actorName} vừa cập nhật "${entityLabel}".`
            }
        } else if (event.type === "schedule.updated") {
            if (event.action === "created") {
                title = "Lịch mới"
                message = `${actorName} vừa tạo lịch "${entityLabel}".`
            } else if (event.action === "deleted") {
                title = "Lịch đã xoá"
                message = `${actorName} vừa xoá một lịch liên quan đến bạn.`
            } else {
                title = "Lịch cập nhật"
                message = `${actorName} vừa cập nhật lịch "${entityLabel}".`
            }
        } else if (event.type === "directory.updated") {
            if (event.entityType === "profile") {
                title = "Hồ sơ cá nhân"
                message = `${actorName} vừa cập nhật hồ sơ cá nhân.`
            } else if (event.action === "created") {
                title = "Thành viên mới"
                message = `${actorName} vừa thêm thành viên "${entityLabel}".`
            } else if (event.action === "deleted") {
                title = "Thành viên đã xoá"
                message = `${actorName} vừa xoá một thành viên khỏi hệ thống.`
            } else {
                title = "Danh bạ cập nhật"
                message = `${actorName} vừa cập nhật thông tin thành viên.`
            }
        } else if (event.type === "learning.updated") {
            if (event.action === "reminder") {
                title = "Nhắc nhở học tập"
                message = entityLabel
            } else if (event.entityType === "quiz" && event.action === "created") {
                title = "Quiz mới"
                message = `${actorName} vừa tạo quiz cho "${entityLabel}".`
            } else if (event.entityType === "quiz" && event.action === "deleted") {
                title = "Quiz đã xoá"
                message = `${actorName} vừa xoá quiz của "${entityLabel}".`
            } else if (event.entityType === "quiz") {
                title = "Quiz cập nhật"
                message = `${actorName} vừa cập nhật quiz của "${entityLabel}".`
            } else if (event.entityType === "document") {
                title = event.action === "deleted" ? "Tài liệu đã xoá" : "Tài liệu cập nhật"
                message = `${actorName} vừa ${event.action === "deleted" ? "xoá" : "cập nhật"} tài liệu "${entityLabel}".`
            } else if (event.entityType === "learning_progress") {
                title = "Tiến độ học tập"
                message = `${actorName} vừa cập nhật tiến độ học của "${entityLabel}".`
            } else {
                title = "E-learning cập nhật"
                message = `${actorName} vừa cập nhật dữ liệu học tập.`
            }
        } else if (event.type === "approval.updated") {
            if (event.action === "requested") {
                title = "Yêu cầu duyệt mới"
                message = "Có tài khoản mới vừa xác thực OTP và đang chờ duyệt."
            } else if (event.action === "approved") {
                title = "Yêu cầu đã duyệt"
                message = `${actorName} vừa duyệt tài khoản ${entityLabel}.`
            } else if (event.action === "rejected") {
                title = "Yêu cầu bị từ chối"
                message = `${actorName} vừa từ chối tài khoản ${entityLabel}.`
            }
        }

        const nextNotification: RealtimeNotification = {
            id,
            title,
            message,
            time: formatRelativeTime(event.occurredAt),
            unread,
            occurredAt: event.occurredAt,
        }
        return nextNotification
    }, [people])

    const loadNotifications = useCallback(async (options?: { append?: boolean }) => {
        const isAppend = Boolean(options?.append)
        const query = new URLSearchParams({
            limit: "20",
            unreadOnly: notificationTab === "unread" ? "true" : "false",
        })
        if (isAppend && notificationCursor) {
            query.set("cursor", notificationCursor)
        }

        if (isAppend) {
            setIsLoadingMoreNotifications(true)
        }

        const response = await fetch(`/api/notifications?${query.toString()}`, {
            credentials: "include",
            cache: "no-store",
        })

        if (!response.ok) {
            if (!isAppend) {
                setNotifications([])
                setUnreadNotificationCount(0)
                setNotificationCursor(null)
                setHasMoreNotifications(false)
            }
            setIsLoadingMoreNotifications(false)
            return
        }

        const payload = (await response.json()) as {
            ok: boolean
            notifications?: StoredNotification[]
            unreadCount?: number
            hasMore?: boolean
            nextCursor?: string | null
        }
        if (!payload.ok) {
            if (!isAppend) {
                setNotifications([])
                setUnreadNotificationCount(0)
                setNotificationCursor(null)
                setHasMoreNotifications(false)
            }
            setIsLoadingMoreNotifications(false)
            return
        }

        const items = (payload.notifications ?? [])
            .map((item) => buildNotification(item, item.id, item.unread))
            .filter((item): item is RealtimeNotification => Boolean(item))
        setNotifications((previous) => (isAppend ? [...previous, ...items] : items))
        setUnreadNotificationCount(payload.unreadCount ?? 0)
        setNotificationCursor(payload.nextCursor ?? null)
        setHasMoreNotifications(Boolean(payload.hasMore))
        setIsLoadingMoreNotifications(false)
    }, [buildNotification, notificationCursor, notificationTab])

    const loadApprovalRequests = useCallback(async () => {
        if (!isAdminUser) {
            setApprovalRequests([])
            return
        }

        const response = await fetch("/api/admin/approval-requests", {
            credentials: "include",
            cache: "no-store",
        })

        if (!response.ok) {
            setApprovalRequests([])
            return
        }

        const payload = (await response.json()) as { ok: boolean; requests?: ApprovalRequest[] }
        setApprovalRequests(payload.ok ? payload.requests ?? [] : [])
    }, [isAdminUser])

    const currentTeamPeople = useMemo(
        () => people.filter((person) => person.team === currentUser.team),
        [currentUser.team],
    )

    const visibleProjects = useMemo(
        () => projects.filter((project) => project.memberIds.includes(currentUser.id)),
        [currentUser.id, projects],
    )

    const handleAddProject = async () => {
        if (newProjectName.trim()) {
            setIsProjectSubmitting(true)
            try {
                const newProject = await addProject({
                    name: newProjectName.trim(),
                    color: newProjectColor,
                    memberIds: Array.from(new Set([currentUser.id, ...newProjectMemberIds])),
                })
                setNewProjectName("")
                setNewProjectColor("bg-blue-200 dark:bg-blue-800")
                setNewProjectMemberIds([])
                setIsProjectDialogOpen(false)
                router.push(`/?projectId=${newProject.id}`)
            } finally {
                setIsProjectSubmitting(false)
            }
        }
    }

    const handleSignOut = async () => {
        setIsSigningOut(true)
        await logout()
        router.replace("/login" as Route)
    }

    const handleApprovalAction = async (requestId: string, action: "approve" | "reject") => {
        setApprovalActionKey(`${action}:${requestId}`)
        try {
            const response = await fetch("/api/admin/approval-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ requestId, action }),
            })

            const payload = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !payload.ok) {
                toast({
                    title: action === "approve" ? "Không thể duyệt tài khoản" : "Không thể từ chối tài khoản",
                    description: payload.message ?? (action === "approve" ? "Yêu cầu duyệt thất bại." : "Yêu cầu từ chối thất bại."),
                    variant: "destructive",
                })
                return
            }

            await Promise.all([loadApprovalRequests(), refresh(), refreshSession()])
            toast({
                title: action === "approve" ? "Duyệt tài khoản thành công" : "Đã từ chối tài khoản",
                description:
                    action === "approve"
                        ? "Tài khoản đã được kích hoạt và email thông báo đã được xử lý."
                        : "Yêu cầu đã được từ chối và email thông báo đã được xử lý.",
            })
        } finally {
            setApprovalActionKey(null)
        }
    }

    const openProfileDialog = () => {
        const nextStoreRegion = ((currentUser.storeRegion ?? user?.storeRegion ?? "Hồ Chí Minh") as StoreRegion)
        const nextStoreBranchIds = currentUser.storeBranchIds ?? user?.storeBranchIds ?? []
        const nextStoreRegions = getStoreRegionsForBranchIds(nextStoreBranchIds)
        setProfileStoreBranchSearchQuery("")
        setProfileForm({
            name: currentUser.name,
            email: currentUser.email,
            imageURL: currentUser.imageURL === "/placeholder.svg" ? "" : currentUser.imageURL,
            storeRegion: nextStoreRegion,
            storeRegions: nextStoreRegions.length > 0 ? nextStoreRegions.slice(0, 2) : [nextStoreRegion],
            storeBranchIds: nextStoreBranchIds,
            start: currentUser.workingHours.start,
            end: currentUser.workingHours.end,
            timezone: currentUser.workingHours.timezone,
        })
        setIsProfileDialogOpen(true)
    }

    const updateProfileForm = <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => {
        setProfileForm((prev) => ({ ...prev, [key]: value }))
    }

    const handleSaveProfile = async () => {
        if (!profileForm.name.trim() || !profileForm.email.trim()) {
            toast({
                title: "Thiếu thông tin",
                description: "Vui lòng nhập họ tên và email công ty.",
                variant: "destructive",
            })
            return
        }
        if (canUpdateOwnStoreLocation) {
            if (isProfileStoreManager && (profileForm.storeRegions.length === 0 || profileForm.storeRegions.length > 2)) {
                toast({
                    title: "Thiếu khu vực",
                    description: "Quản lí khu vực cần chọn từ 1 đến 2 khu vực.",
                    variant: "destructive",
                })
                return
            }
            if (canProfileSelectMultipleStores && (profileForm.storeBranchIds.length === 0 || profileForm.storeBranchIds.length > 5)) {
                toast({
                    title: "Thiếu cửa hàng",
                    description: "Vai trò này cần chọn từ 1 đến 5 cửa hàng đang phụ trách.",
                    variant: "destructive",
                })
                return
            }
            if (!canProfileSelectMultipleStores && profileForm.storeBranchIds.length !== 1) {
                toast({
                    title: "Thiếu cửa hàng",
                    description: "Kỹ thuật viên cần chọn đúng 1 cửa hàng đang phụ trách.",
                    variant: "destructive",
                })
                return
            }
        }

        setIsProfileSubmitting(true)

        try {
            const response = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: profileForm.name,
                    email: profileForm.email,
                    imageURL: profileForm.imageURL,
                    storeRegion: canUpdateOwnStoreLocation
                        ? isProfileStoreManager
                            ? profileForm.storeRegions[0]
                            : profileForm.storeRegion
                        : undefined,
                    storeRegions: canUpdateOwnStoreLocation && isProfileStoreManager ? profileForm.storeRegions : undefined,
                    storeBranchIds: canUpdateOwnStoreLocation ? profileForm.storeBranchIds : undefined,
                    workingHours: {
                        start: profileForm.start,
                        end: profileForm.end,
                        timezone: profileForm.timezone,
                    },
                }),
            })

            const payload = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Không thể cập nhật hồ sơ.")
            }

            await Promise.all([refresh(), refreshSession()])
            setIsProfileDialogOpen(false)
            toast({
                title: "Cập nhật hồ sơ thành công",
                description: "Thông tin tài khoản của bạn đã được lưu.",
            })
        } catch (error) {
            toast({
                title: "Không thể cập nhật hồ sơ",
                description: error instanceof Error ? error.message : "Server từ chối thao tác này.",
                variant: "destructive",
            })
        } finally {
            setIsProfileSubmitting(false)
        }
    }

    const handleAvatarFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith("image/")) {
            toast({
                title: "File không hợp lệ",
                description: "Vui lòng chọn file ảnh.",
                variant: "destructive",
            })
            event.target.value = ""
            return
        }

        setIsAvatarUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", file)
            const response = await fetch("/api/profile/avatar-upload", {
                method: "POST",
                body: formData,
                credentials: "include",
            })
            const payload = (await response.json()) as { ok: boolean; url?: string; message?: string }
            if (!response.ok || !payload.ok || !payload.url) {
                throw new Error(payload.message || "Không thể upload ảnh đại diện.")
            }
            updateProfileForm("imageURL", payload.url)
            toast({
                title: "Tải ảnh lên thành công",
                description: "Ảnh đại diện đã được chọn. Nhấn \"Lưu thay đổi\" để cập nhật hồ sơ.",
            })
        } catch (error) {
            toast({
                title: "Tải ảnh lên thất bại",
                description: error instanceof Error ? error.message : "Không thể upload ảnh đại diện.",
                variant: "destructive",
            })
        } finally {
            setIsAvatarUploading(false)
            event.target.value = ""
        }
    }

    useEffect(() => {
        void loadApprovalRequests()
    }, [loadApprovalRequests, user?.id])

    useEffect(() => {
        void loadNotifications()
    }, [loadNotifications, notificationTab, user?.id])

    useEffect(() => {
        if (!user?.personId) {
            return
        }

        return subscribeToPersonChannel(user.personId, (message) => {
            const payload = message.data as RealtimeEventPayload | undefined
            if (!payload?.type) {
                return
            }

            if (payload?.type === "approval.updated") {
                void loadApprovalRequests()
            }

            if (
                payload.type === "directory.updated" ||
                payload.type === "workspace.updated" ||
                payload.type === "schedule.updated" ||
                (payload.type === "learning.updated" && payload.entityType !== "learning_progress")
            ) {
                void refreshSession().catch(() => {
                    // Ignore transient realtime refresh failures.
                })
            }

            void loadNotifications()
        })
    }, [loadApprovalRequests, loadNotifications, refreshSession, user?.personId])

    // Close sidebar on mobile when navigating
    const navigateTo = (path: Parameters<typeof router.push>[0]) => {
        router.push(path)
        setIsSidebarOpen(false)
    }

    const mobileBottomNavItems = sidebarItems.slice(0, 5)

    return (
        <div className="flex h-dvh bg-gray-50 dark:bg-gray-900">
            {/* Mobile overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-20 bg-black/50 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="flex items-center justify-between p-4 md:p-6">
                    <h1 className="text-xl font-bold tracking-tight text-orange-500 md:text-2xl">Face Wash Fox</h1>
                    <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden" onClick={() => setIsSidebarOpen(false)}>
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 px-4">
                    {sidebarItems.map((item) => {
                        const isActive =
                            item.path === "/"
                                ? pathname === "/" && !selectedProjectId
                                : pathname === item.path

                        return (
                        <button
                            key={item.name}
                            onClick={() => navigateTo(item.path as Parameters<typeof router.push>[0])}
                            className={`w-full flex items-center px-3 py-2.5 mb-1 text-sm font-medium rounded-lg transition-colors ${isActive
                                ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                }`}
                        >
                            <item.icon className="w-4 h-4 mr-3 flex-shrink-0" />
                            {item.name}
                        </button>
                        )
                    })}
                </nav>

                {!isStoreSidebarUser && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">Nhóm</span>
                            <Dialog open={isProjectDialogOpen} onOpenChange={setIsProjectDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-white dark:bg-gray-800">
                                    <DialogHeader>
                                        <DialogTitle className="text-gray-900 dark:text-white">Thêm nhóm mới</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="project-name" className="text-gray-700 dark:text-gray-300">
                                                Tên nhóm
                                            </Label>
                                            <Input
                                                id="project-name"
                                                value={newProjectName}
                                                onChange={(e) => setNewProjectName(e.target.value)}
                                                placeholder="Nhập tên nhóm"
                                                className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-gray-700 dark:text-gray-300">Màu nhóm</Label>
                                            <div className="flex space-x-2 mt-2">
                                                {colorOptions.map((color) => (
                                                    <button
                                                        key={color.value}
                                                        onClick={() => setNewProjectColor(color.value)}
                                                        className={`w-8 h-8 rounded-full ${color.value} border-2 ${newProjectColor === color.value
                                                            ? "border-gray-800 dark:border-gray-200"
                                                            : "border-gray-300 dark:border-gray-600"
                                                            }`}
                                                        title={color.name}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-gray-700 dark:text-gray-300">Thành viên nhóm</Label>
                                            <div className="mt-3 space-y-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                                {currentTeamPeople.map((person) => {
                                                    const isChecked =
                                                        person.id === currentUser.id || newProjectMemberIds.includes(person.id)

                                                    return (
                                                        <label
                                                            key={person.id}
                                                            className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <Checkbox
                                                                    checked={isChecked}
                                                                    disabled={person.id === currentUser.id}
                                                                    onCheckedChange={(checked) => {
                                                                        if (person.id === currentUser.id) {
                                                                            return
                                                                        }

                                                                        setNewProjectMemberIds((prev) =>
                                                                            checked
                                                                                ? [...prev, person.id]
                                                                                : prev.filter((memberId) => memberId !== person.id),
                                                                        )
                                                                    }}
                                                                />
                                                                <Avatar className="h-8 w-8">
                                                                    <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                                                    <AvatarFallback>
                                                                        {person.name
                                                                            .split(" ")
                                                                            .map((part) => part[0])
                                                                            .join("")}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{person.name}</p>
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">{person.role}</p>
                                                                </div>
                                                            </div>
                                                            {person.id === currentUser.id && <Badge variant="secondary">Chủ sở hữu</Badge>}
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex justify-end space-x-2">
                                            <Button variant="outline" onClick={() => setIsProjectDialogOpen(false)}>
                                                Hủy
                                            </Button>
                                            <Button onClick={handleAddProject} loading={isProjectSubmitting}>
                                                {isProjectSubmitting ? "Đang tạo..." : "Tạo nhóm"}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                        {visibleProjects.map((project) => (
                            <button
                                key={project.id}
                                onClick={() => router.push(`/?projectId=${project.id}`)}
                                className={`w-full flex items-center mb-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                                    pathname === "/" && selectedProjectId === project.id
                                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                }`}
                            >
                                <div className={`w-3 h-3 rounded-full ${project.color} mr-2`} />
                                <span className="text-sm">{project.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <button className="w-full flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <Settings className="w-4 h-4 mr-3" />
                            Cài đặt
                        </button>
                        <button className="w-full flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <HelpCircle className="w-4 h-4 mr-3" />
                            Trợ giúp và hỗ trợ
                            <Badge
                                variant="secondary"
                                className="ml-auto bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
                            >
                                8
                            </Badge>
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <header className="app-shell-header shrink-0 border-b border-gray-200 bg-white px-3 pb-3 pt-[max(3.75rem,calc(env(safe-area-inset-top,0px)+0.75rem))] dark:border-gray-700 dark:bg-gray-800 md:px-6 md:py-4 md:pt-4">
                    <div className="flex items-center justify-between gap-2">
                        {/* Left: hamburger (mobile) + date (desktop) */}
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                            <button
                                className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 md:hidden"
                                onClick={() => setIsSidebarOpen(true)}
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                            <div className="hidden rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-900 md:block">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hôm nay</p>
                                <p className="text-base font-semibold text-gray-900 dark:text-white">{todayLabel}</p>
                            </div>
                            {/* App name on mobile */}
                            <span className="truncate text-sm font-bold text-orange-500 sm:text-base md:hidden">Face Wash Fox</span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-4">
                            {/* New Team button - desktop only */}
                            <div className="hidden items-center md:flex">
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 rounded-r-none"
                                    onClick={() => setIsProjectDialogOpen(true)}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Nhóm mới
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 rounded-l-none border-l border-blue-500 dark:border-blue-600 px-2">
                                            <ChevronDown className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                                        <DropdownMenuItem className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                                            <Folder className="w-4 h-4 mr-2" />Thư mục mới
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                                            <Template className="w-4 h-4 mr-2" />Từ mẫu có sẵn
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">
                                            <Import className="w-4 h-4 mr-2" />Nhập nhóm
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* New Team button - mobile compact */}
                            <Button
                                size="icon"
                                className="bg-blue-600 hover:bg-blue-700 h-9 w-9 md:hidden"
                                onClick={() => setIsProjectDialogOpen(true)}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>

                            <ThemeToggle />

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="relative">
                                        <Bell className="w-4 h-4" />
                                        {(approvalRequests.length > 0 || unreadNotificationCount > 0) && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-[min(20rem,calc(100vw-1rem))] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                    align="end"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">Thông báo</h3>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-gray-600 dark:text-gray-300"
                                                onClick={() => {
                                                    void fetch("/api/notifications", {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json" },
                                                        credentials: "include",
                                                        body: JSON.stringify({}),
                                                    }).then(() => loadNotifications())
                                                }}
                                            >
                                                Đánh dấu đã đọc
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant={notificationTab === "all" ? "default" : "outline"}
                                                onClick={() => setNotificationTab("all")}
                                            >
                                                Tất cả
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant={notificationTab === "unread" ? "default" : "outline"}
                                                onClick={() => setNotificationTab("unread")}
                                            >
                                                Chưa đọc
                                            </Button>
                                        </div>
                                        <Separator className="bg-gray-200 dark:bg-gray-700" />
                                        <div className="space-y-3 max-h-80 overflow-y-auto">
                                            {approvalRequests.map((request) => (
                                                <div
                                                    key={request.id}
                                                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20"
                                                >
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        Yêu cầu duyệt {roleDisplayLabel[request.role]}
                                                    </p>
                                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                                        {request.name} · {request.email}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {request.department}
                                                    </p>
                                                    <div className="mt-3 flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            loading={approvalActionKey === `approve:${request.id}`}
                                                            onClick={() => void handleApprovalAction(request.id, "approve")}
                                                        >
                                                            Duyệt
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            loading={approvalActionKey === `reject:${request.id}`}
                                                            onClick={() => void handleApprovalAction(request.id, "reject")}
                                                        >
                                                            Từ chối
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                            {notifications.map((notification) => (
                                                <div
                                                    key={notification.id}
                                                    className={`p-3 rounded-lg ${notification.unread ? "bg-blue-50 dark:bg-blue-900/20" : "bg-gray-50 dark:bg-gray-700"
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{notification.title}</p>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{notification.message}</p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{notification.time}</p>
                                                        </div>
                                                        {notification.unread && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1"></div>}
                                                    </div>
                                                </div>
                                            ))}
                                            {approvalRequests.length === 0 && notifications.length === 0 ? (
                                                <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                    Chưa có thông báo mới.
                                                </p>
                                            ) : null}
                                            {hasMoreNotifications ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full"
                                                    loading={isLoadingMoreNotifications}
                                                    onClick={() => void loadNotifications({ append: true })}
                                                >
                                                    {isLoadingMoreNotifications ? "Đang tải..." : "Tải thêm"}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Avatar className="w-8 h-8 cursor-pointer">
                                        <AvatarImage src={currentUser.imageURL || "/placeholder.svg"} />
                                        <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
                                            {currentUser.name
                                                .split(" ")
                                                .map((n: string) => n[0])
                                                .join("")}
                                        </AvatarFallback>
                                    </Avatar>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-[min(16rem,calc(100vw-1rem))] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                    align="end"
                                >
                                    <div className="space-y-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar className="h-12 w-12 shrink-0">
                                                <AvatarImage src={currentUser.imageURL || "/placeholder.svg"} />
                                                <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
                                                    {currentUser.name
                                                        .split(" ")
                                                        .map((n: string) => n[0])
                                                        .join("")}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold text-gray-900 dark:text-white">{currentUser.name}</p>
                                                <p className="truncate text-sm text-gray-600 dark:text-gray-300" title={currentUser.email}>
                                                    {currentUser.email}
                                                </p>
                                            </div>
                                        </div>
                                        <Separator className="bg-gray-200 dark:bg-gray-700" />
                                        <div className="space-y-2">
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                onClick={openProfileDialog}
                                            >
                                                <User className="w-4 h-4 mr-2" />
                                                Cài đặt hồ sơ
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                <Settings className="w-4 h-4 mr-2" />
                                                Cài đặt tài khoản
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                            >
                                                <HelpCircle className="w-4 h-4 mr-2" />
                                                Trợ giúp và hỗ trợ
                                            </Button>
                                        </div>
                                        <Separator className="bg-gray-200 dark:bg-gray-700" />
                                        <Button
                                            variant="ghost"
                                            loading={isSigningOut}
                                            className="w-full justify-start text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            onClick={handleSignOut}
                                        >
                                            <LogOut className="w-4 h-4 mr-2" />
                                            Đăng xuất
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="app-page-content flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 pb-[calc(5rem+env(safe-area-inset-bottom))] dark:bg-gray-900 md:pb-0">
                    {children}
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="app-mobile-bottom-nav fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                {mobileBottomNavItems.map((item) => {
                    const isActive = item.path === "/" ? pathname === "/" && !selectedProjectId : pathname === item.path
                    return (
                        <button
                            key={item.name}
                            onClick={() => navigateTo(item.path as Parameters<typeof router.push>[0])}
                            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"}`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500"}`} />
                            <span className="max-w-[56px] truncate">{item.name}</span>
                        </button>
                    )
                })}
                {sidebarItems.length > mobileBottomNavItems.length && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-gray-500 dark:text-gray-400"
                    >
                        <Menu className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                        <span>Thêm</span>
                    </button>
                )}
            </nav>

            <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
                <DialogContent className="sm:max-w-xl bg-white dark:bg-gray-800">
                    <DialogHeader>
                        <DialogTitle className="text-gray-900 dark:text-white">Cài đặt hồ sơ</DialogTitle>
                        <DialogDescription>
                            Bạn có thể tự cập nhật thông tin tài khoản cá nhân tại đây.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="profile-name">Họ và tên</Label>
                            <Input id="profile-name" value={profileForm.name} onChange={(event) => updateProfileForm("name", event.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="profile-email">Email</Label>
                            <Input id="profile-email" type="email" value={profileForm.email} onChange={(event) => updateProfileForm("email", event.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="profile-image">Đường dẫn ảnh đại diện</Label>
                            <Input id="profile-image" value={profileForm.imageURL} onChange={(event) => updateProfileForm("imageURL", event.target.value)} placeholder="https://..." />
                            <div className="flex items-center gap-2">
                                <input
                                    ref={avatarFileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    onChange={handleAvatarFileSelect}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => avatarFileInputRef.current?.click()}
                                    disabled={isAvatarUploading || isProfileSubmitting}
                                >
                                    <Upload className="mr-2 h-4 w-4" />
                                    {isAvatarUploading ? "Đang tải lên..." : "Chọn ảnh từ máy"}
                                </Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label>Vai trò</Label>
                                <Input value={currentUser.role} disabled />
                            </div>
                            <div className="grid gap-2">
                                <Label>Nhóm</Label>
                                <Input value={getTeamById(currentUser.team, teams)?.name ?? currentUser.team} disabled />
                            </div>
                        </div>
                        {canUpdateOwnStoreLocation ? (
                            <div className="grid gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                <div className="grid gap-2">
                                    {isProfileStoreManager ? (
                                        <>
                                            <Label>Khu vực quản lí (chọn tối đa 2)</Label>
                                            <div className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700 sm:grid-cols-2">
                                                {STORE_REGIONS.map((region) => {
                                                    const checked = profileForm.storeRegions.includes(region)
                                                    const disabled = !checked && profileForm.storeRegions.length >= 2
                                                    return (
                                                        <label
                                                            key={region}
                                                            className={`flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${disabled ? "opacity-50" : ""}`}
                                                        >
                                                            <Checkbox
                                                                checked={checked}
                                                                disabled={disabled}
                                                                onCheckedChange={(nextChecked) => {
                                                                    setProfileStoreBranchSearchQuery("")
                                                                    setProfileForm((prev) => {
                                                                        const nextRegions = nextChecked === true
                                                                            ? prev.storeRegions.includes(region) || prev.storeRegions.length >= 2
                                                                                ? prev.storeRegions
                                                                                : [...prev.storeRegions, region]
                                                                            : prev.storeRegions.filter((item) => item !== region)
                                                                        const allowedBranchIds = new Set(getStoreBranchesByRegions(nextRegions).map((branch) => branch.id))
                                                                        return {
                                                                            ...prev,
                                                                            storeRegion: nextRegions[0] ?? prev.storeRegion,
                                                                            storeRegions: nextRegions,
                                                                            storeBranchIds: prev.storeBranchIds.filter((branchId) => allowedBranchIds.has(branchId)),
                                                                        }
                                                                    })
                                                                }}
                                                            />
                                                            <span>{region}</span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Label htmlFor="profile-store-region">Khu vực</Label>
                                            <select
                                                id="profile-store-region"
                                                value={profileForm.storeRegion}
                                                onChange={(event) => {
                                                    setProfileStoreBranchSearchQuery("")
                                                    updateProfileForm("storeRegion", event.target.value as StoreRegion)
                                                    updateProfileForm("storeBranchIds", [])
                                                }}
                                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-gray-900 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:text-white"
                                            >
                                                {STORE_REGIONS.map((region) => (
                                                    <option key={region} value={region}>
                                                        {region}
                                                    </option>
                                                ))}
                                            </select>
                                        </>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label>{canProfileSelectMultipleStores ? "Cửa hàng phụ trách (chọn tối đa 5)" : "Cửa hàng phụ trách"}</Label>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Đã chọn {profileForm.storeBranchIds.length}/{profileStoreBranchSelectionLimit}
                                        </span>
                                    </div>
                                    <Input
                                        value={profileStoreBranchSearchQuery}
                                        onChange={(event) => setProfileStoreBranchSearchQuery(event.target.value)}
                                        placeholder="Tìm theo tên cửa hàng..."
                                    />
                                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                                        {profileRegionBranches.length === 0 ? (
                                            <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                Không có cửa hàng khả dụng trong khu vực này.
                                            </p>
                                        ) : filteredProfileRegionBranches.length === 0 ? (
                                            <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                Không tìm thấy cửa hàng phù hợp.
                                            </p>
                                        ) : filteredProfileRegionBranches.map((branch) => {
                                            const checked = profileForm.storeBranchIds.includes(branch.id)
                                            const disabled = !checked && profileForm.storeBranchIds.length >= profileStoreBranchSelectionLimit
                                            return (
                                                <label
                                                    key={branch.id}
                                                    className={`flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 ${disabled ? "opacity-50" : ""}`}
                                                >
                                                    <Checkbox
                                                        checked={checked}
                                                        disabled={disabled}
                                                        onCheckedChange={(nextChecked) => {
                                                            updateProfileForm(
                                                                "storeBranchIds",
                                                                nextChecked === true
                                                                    ? canProfileSelectMultipleStores
                                                                        ? profileForm.storeBranchIds.includes(branch.id) || profileForm.storeBranchIds.length >= profileStoreBranchSelectionLimit
                                                                            ? profileForm.storeBranchIds
                                                                            : [...profileForm.storeBranchIds, branch.id]
                                                                        : [branch.id]
                                                                    : profileForm.storeBranchIds.filter((id) => id !== branch.id),
                                                            )
                                                        }}
                                                    />
                                                    <span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{branch.name}</span>
                                                        <br />
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">{branch.address}</span>
                                                    </span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="grid gap-2">
                                <Label htmlFor="profile-start">Bắt đầu</Label>
                                <Input id="profile-start" value={profileForm.start} onChange={(event) => updateProfileForm("start", event.target.value)} placeholder="09:00" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="profile-end">Kết thúc</Label>
                                <Input id="profile-end" value={profileForm.end} onChange={(event) => updateProfileForm("end", event.target.value)} placeholder="17:00" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="profile-timezone">Múi giờ</Label>
                                <Input id="profile-timezone" value={profileForm.timezone} onChange={(event) => updateProfileForm("timezone", event.target.value)} placeholder="UTC+7" />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProfileDialogOpen(false)} disabled={isProfileSubmitting}>
                            Hủy
                        </Button>
                        <Button onClick={handleSaveProfile} loading={isProfileSubmitting} disabled={isProfileSubmitting}>
                            {isProfileSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
