"use client"

import { useEffect, useMemo, useState } from "react"
import { subscribeToPersonChannel } from "@/lib/client/realtime"
import { useAuth } from "@/components/auth-provider"
import { useDirectory } from "@/components/directory-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, getTeamById, isPersonWorking, personDisplayRoles, type Person } from "@/lib/people"
import {
    ChevronDown,
    Clock,
    CheckCircle2,
    History,
    Filter,
    Grid3X3,
    List,
    Mail,
    Moon,
    Pencil,
    Search,
    Trash2,
    UserPlus,
    Users,
    XCircle,
} from "lucide-react"

type ViewMode = "list" | "grid" | "teams"

type PersonFormState = {
    name: string
    role: string
    email: string
    team: string
    imageURL: string
    storeLeadUserId: string
    storeManagerUserId: string
    start: string
    end: string
    timezone: string
}

type AccountHistoryFilter = "week" | "month" | "custom"

type AccountHistoryItem = {
    id: string
    email: string
    name: string
    role: "admin" | "ceo" | "leader" | "employee"
    department: string
    status: "otp_pending" | "pending" | "approved" | "rejected"
    createdAt: string
    updatedAt: string
    otpVerifiedAt?: string
    expiresAt?: string
    approvedAt?: string
    rejectedAt?: string
}

const DEFAULT_FORM: PersonFormState = {
    name: "",
    role: personDisplayRoles[0],
    email: "",
    team: "marketing",
    imageURL: "",
    storeLeadUserId: "",
    storeManagerUserId: "",
    start: "09:00",
    end: "17:00",
    timezone: "UTC+7",
}

export default function PeoplePage() {
    const { user } = useAuth()
    const { people, teams, refresh } = useDirectory()
    const [searchQuery, setSearchQuery] = useState("")
    const [viewMode, setViewMode] = useState<ViewMode>("list")
    const [selectedTeam, setSelectedTeam] = useState<string>("all")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingPerson, setEditingPerson] = useState<Person | null>(null)
    const [personForm, setPersonForm] = useState<PersonFormState>(DEFAULT_FORM)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
    const [accountHistory, setAccountHistory] = useState<AccountHistoryItem[]>([])
    const [isHistoryLoading, setIsHistoryLoading] = useState(false)
    const [historyFilter, setHistoryFilter] = useState<AccountHistoryFilter>("week")
    const [customStartDate, setCustomStartDate] = useState("")
    const [customEndDate, setCustomEndDate] = useState("")
    const isAdmin = isAdminLikeRole(user?.role)
    const isStoreTrainer = user?.role === "store_trainer" && user?.department === "Cửa hàng"
    const isStoreManager = user?.role === "store_manager" && user?.department === "Cửa hàng"
    const canManagePeople = isAdmin || isStoreTrainer || isStoreManager
    const currentUser = findPersonForAuthUser(user, people)
    const currentTeamId = currentUser?.team ?? ""
    const managerBranchIds = new Set(user?.storeBranchIds ?? [])
    const isManagedStoreLeadPerson = (person: Person) =>
        isStoreManager &&
        person.authRole === "store_lead" &&
        person.department === "Cửa hàng" &&
        (person.storeBranchIds ?? []).some((branchId) => managerBranchIds.has(branchId))
    const managedStoreLeadUserIds = new Set(
        people
            .filter(isManagedStoreLeadPerson)
            .map((person) => person.userId)
            .filter((userId): userId is string => Boolean(userId))
    )
    const isTechnicianUnderManagedLead = (person: Person) =>
        isStoreManager &&
        person.authRole === "store_technician" &&
        Boolean(person.storeLeadUserId && managedStoreLeadUserIds.has(person.storeLeadUserId))
    const storeManagerOptions = people.filter((person) => {
        if (!person.userId) {
            return false
        }
        if (person.authRole !== "store_manager" || person.department !== "Cửa hàng") {
            return false
        }

        if (isStoreManager) {
            return person.userId === user?.id
        }

        return isAdmin || isStoreTrainer
    })
    const storeLeadOptions = people.filter((person) => {
        if (!person.userId) {
            return false
        }
        if (person.authRole !== "store_lead" || person.department !== "Cửa hàng") {
            return false
        }

        if (isStoreManager) {
            return isManagedStoreLeadPerson(person)
        }

        return isAdmin || isStoreTrainer
    })
    const canEditTechnicianSupervisor =
        Boolean(editingPerson) &&
        editingPerson?.authRole === "store_technician" &&
        personForm.team === "store" &&
        personForm.role === "Kỹ thuật viên"
    const canEditStoreLeadManager =
        Boolean(editingPerson) &&
        editingPerson?.authRole === "store_lead" &&
        personForm.team === "store" &&
        personForm.role === "Cửa hàng trưởng"
    const accessiblePeople = isAdmin
        ? people
        : isStoreManager
            ? people.filter(
                (person) =>
                    person.id === currentUser?.id ||
                    isManagedStoreLeadPerson(person) ||
                    isTechnicianUnderManagedLead(person)
            )
        : currentTeamId
            ? people.filter((person) => person.team === currentTeamId)
            : []
    const visibleTeams = isAdmin ? teams : teams.filter((team) => team.id === currentTeamId)
    const trainerManagedRoleSet = useMemo(
        () => new Set(["Quản lí cửa hàng", "Cửa hàng trưởng", "Kỹ thuật viên", "Nhân viên cửa hàng"]),
        []
    )
    const canTrainerManagePerson = (person: Person) =>
        isStoreTrainer &&
        person.team === "store" &&
        person.id !== currentUser?.id &&
        trainerManagedRoleSet.has(person.role)
    const managerManagedRoleSet = useMemo(
        () => new Set(["Cửa hàng trưởng", "Kỹ thuật viên"]),
        []
    )
    const canManagerManagePerson = (person: Person) =>
        isStoreManager &&
        person.team === "store" &&
        person.id !== currentUser?.id &&
        managerManagedRoleSet.has(person.role) &&
        (isManagedStoreLeadPerson(person) || isTechnicianUnderManagedLead(person))
    const canEditPerson = (person: Person) => isAdmin || canTrainerManagePerson(person) || canManagerManagePerson(person)
    const availablePersonRoles = useMemo(() => {
        if (isStoreTrainer) {
            return personDisplayRoles.filter((role) => trainerManagedRoleSet.has(role))
        }
        if (isStoreManager) {
            return personDisplayRoles.filter((role) => managerManagedRoleSet.has(role))
        }
        return personDisplayRoles
    }, [isStoreManager, isStoreTrainer, managerManagedRoleSet, trainerManagedRoleSet])

    const filteredPeople = accessiblePeople.filter((person) => {
        const matchesSearch =
            person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.email.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesTeam = selectedTeam === "all" || person.team === selectedTeam
        return matchesSearch && matchesTeam
    })

    const peopleByTeams = teams.reduce(
        (acc, team) => {
            acc[team.id] = filteredPeople.filter((person) => person.team === team.id)
            return acc
        },
        {} as Record<string, Person[]>,
    )

    useEffect(() => {
        if (!isAdmin || !isHistoryDialogOpen) {
            return
        }

        setIsHistoryLoading(true)
        fetch("/api/admin/account-history", {
            credentials: "include",
            cache: "no-store",
        })
            .then(async (response) => {
                const payload = (await response.json()) as {
                    ok: boolean
                    history?: AccountHistoryItem[]
                    message?: string
                }

                if (!response.ok || !payload.ok) {
                    throw new Error(payload.message || "Không thể tải lịch sử tài khoản.")
                }

                setAccountHistory(payload.history ?? [])
            })
            .catch((error) => {
                toast({
                    title: "Không thể tải lịch sử tài khoản",
                    description: error instanceof Error ? error.message : "Vui lòng thử lại sau.",
                    variant: "destructive",
                })
            })
            .finally(() => {
                setIsHistoryLoading(false)
            })
    }, [isAdmin, isHistoryDialogOpen])

    useEffect(() => {
        if (!isAdmin || !user?.personId || !isHistoryDialogOpen) {
            return
        }

        return subscribeToPersonChannel(user.personId, (message) => {
            const payload = message.data as { type?: string } | undefined
            if (payload?.type !== "approval.updated") {
                return
            }

            setIsHistoryLoading(true)
            fetch("/api/admin/account-history", {
                credentials: "include",
                cache: "no-store",
            })
                .then(async (response) => {
                    const nextPayload = (await response.json()) as {
                        ok: boolean
                        history?: AccountHistoryItem[]
                    }

                    if (response.ok && nextPayload.ok) {
                        setAccountHistory(nextPayload.history ?? [])
                    }
                })
                .finally(() => {
                    setIsHistoryLoading(false)
                })
        })
    }, [isAdmin, isHistoryDialogOpen, user?.personId])

    const getHistoryActionDate = (item: AccountHistoryItem) => {
        if (item.status === "approved") {
            return item.approvedAt ?? item.updatedAt
        }

        if (item.status === "rejected") {
            return item.rejectedAt ?? item.updatedAt
        }

        if (item.status === "pending") {
            return item.otpVerifiedAt ?? item.createdAt
        }

        return item.createdAt
    }

    const getHistoryStatusMeta = (status: AccountHistoryItem["status"]) => {
        switch (status) {
            case "approved":
                return {
                    label: "Đã duyệt",
                    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
                    icon: CheckCircle2,
                }
            case "rejected":
                return {
                    label: "Từ chối",
                    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
                    icon: XCircle,
                }
            case "pending":
                return {
                    label: "Chờ duyệt",
                    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
                    icon: History,
                }
            default:
                return {
                    label: "Chờ xác thực OTP",
                    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
                    icon: History,
                }
        }
    }

    const filteredAccountHistory = useMemo(() => {
        const now = new Date()

        return accountHistory.filter((item) => {
            const actionDate = new Date(getHistoryActionDate(item))
            if (Number.isNaN(actionDate.getTime())) {
                return false
            }

            if (historyFilter === "week") {
                const diffMs = now.getTime() - actionDate.getTime()
                return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000
            }

            if (historyFilter === "month") {
                return (
                    actionDate.getFullYear() === now.getFullYear() &&
                    actionDate.getMonth() === now.getMonth()
                )
            }

            if (!customStartDate || !customEndDate) {
                return true
            }

            const startDate = new Date(`${customStartDate}T00:00:00`)
            const endDate = new Date(`${customEndDate}T23:59:59`)
            return actionDate >= startDate && actionDate <= endDate
        })
    }, [accountHistory, customEndDate, customStartDate, historyFilter])

    const formatHistoryDate = (value?: string) => {
        if (!value) {
            return "-"
        }

        const date = new Date(value)
        if (Number.isNaN(date.getTime())) {
            return "-"
        }

        return new Intl.DateTimeFormat("vi-VN", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date)
    }

    const updatePersonForm = <K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) => {
        setPersonForm((prev) => ({ ...prev, [key]: value }))
    }

    const openCreateDialog = () => {
        setEditingPerson(null)
        setPersonForm({
            ...DEFAULT_FORM,
            team: isStoreTrainer ? "store" : teams[0]?.id ?? "marketing",
            role: isStoreTrainer ? "Kỹ thuật viên" : DEFAULT_FORM.role,
        })
        setIsDialogOpen(true)
    }

    const openEditDialog = (person: Person) => {
        setEditingPerson(person)
        const normalizedRole = personDisplayRoles.includes(person.role as (typeof personDisplayRoles)[number])
            ? person.role
            : personDisplayRoles[0]
        setPersonForm({
            name: person.name,
            role: normalizedRole,
            email: person.email,
            team: person.team,
            imageURL: person.imageURL === "/placeholder.svg" ? "" : person.imageURL,
            storeLeadUserId: person.storeLeadUserId ?? "",
            storeManagerUserId: storeManagerOptions.find((manager) =>
                (person.storeBranchIds ?? []).some((branchId) => (manager.storeBranchIds ?? []).includes(branchId))
            )?.userId ?? "",
            start: person.workingHours.start,
            end: person.workingHours.end,
            timezone: person.workingHours.timezone,
        })
        setIsDialogOpen(true)
    }

    const handleSubmitPerson = async () => {
        if (!personForm.name.trim() || !personForm.role.trim() || !personForm.email.trim() || !personForm.team.trim()) {
            toast({
                title: "Thiếu thông tin",
                description: "Vui lòng nhập tên, email, vai trò và team.",
                variant: "destructive",
            })
            return
        }
        if (canEditTechnicianSupervisor && !personForm.storeLeadUserId) {
            toast({
                title: "Thiếu cửa hàng trưởng",
                description: "Vui lòng chọn cửa hàng trưởng quản lí kỹ thuật viên.",
                variant: "destructive",
            })
            return
        }
        if (canEditStoreLeadManager && !personForm.storeManagerUserId) {
            toast({
                title: "Thiếu quản lí cửa hàng",
                description: "Vui lòng chọn quản lí cửa hàng phụ trách cửa hàng trưởng.",
                variant: "destructive",
            })
            return
        }

        setIsSubmitting(true)

        try {
            const response = await fetch(editingPerson ? `/api/people/${editingPerson.id}` : "/api/people", {
                method: editingPerson ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: personForm.name,
                    role: personForm.role,
                    email: personForm.email,
                    team: personForm.team,
                    imageURL: personForm.imageURL,
                    storeLeadUserId: canEditTechnicianSupervisor ? personForm.storeLeadUserId : undefined,
                    storeManagerUserId: canEditStoreLeadManager ? personForm.storeManagerUserId : undefined,
                    workingHours: {
                        start: personForm.start,
                        end: personForm.end,
                        timezone: personForm.timezone,
                    },
                }),
            })

            const payload = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Không thể lưu nhân sự.")
            }

            await refresh()
            setIsDialogOpen(false)
            setEditingPerson(null)
            setPersonForm(DEFAULT_FORM)
            toast({
                title: editingPerson ? "Cập nhật nhân sự thành công" : "Thêm nhân sự thành công",
                description: editingPerson
                    ? "Thông tin nhân sự đã được cập nhật."
                    : "Nhân sự mới đã được thêm vào hệ thống.",
            })
        } catch (error) {
            toast({
                title: "Không thể lưu nhân sự",
                description: error instanceof Error ? error.message : "Server từ chối thao tác này.",
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeletePerson = async (person: Person) => {
        const confirmed = window.confirm(`Xóa nhân sự ${person.name}? Thao tác này sẽ xóa cả dữ liệu liên quan.`)
        if (!confirmed) {
            return
        }

        try {
            const response = await fetch(`/api/people/${person.id}`, {
                method: "DELETE",
                credentials: "include",
            })
            const payload = (await response.json()) as { ok: boolean; message?: string }
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || "Không thể xóa nhân sự.")
            }

            await refresh()
            toast({
                title: "Xóa nhân sự thành công",
                description: `${person.name} đã được xóa khỏi hệ thống.`,
            })
        } catch (error) {
            toast({
                title: "Không thể xóa nhân sự",
                description: error instanceof Error ? error.message : "Server từ chối thao tác này.",
                variant: "destructive",
            })
        }
    }

    const PersonCard = ({ person, compact = false }: { person: Person; compact?: boolean }) => {
        const team = getTeamById(person.team, teams)
        const isWorking = isPersonWorking(person)

        return (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                <CardContent className={`${compact ? "p-4" : "p-6"}`}>
                    <div className="flex items-start space-x-4">
                        <div className="relative">
                            <Avatar className={`${compact ? "w-10 h-10" : "w-12 h-12"}`}>
                                <AvatarImage src={person.imageURL || "/placeholder.svg"} />
                                <AvatarFallback className="bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white">
                                    {person.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")}
                                </AvatarFallback>
                            </Avatar>
                            {!isWorking && (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
                                    <Moon className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                                <h3
                                    className={`${compact ? "text-sm" : "text-base"} font-semibold text-gray-900 dark:text-white truncate`}
                                >
                                    {person.name}
                                </h3>
                                <div className="flex items-start gap-2">
                                    <div className="flex shrink-0 flex-col items-end gap-2">
                                        {team && <Badge className={`${team.color} text-xs`}>{team.name}</Badge>}
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">
                                            {person.role}
                                        </Badge>
                                    </div>
                                    {canEditPerson(person) && (
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-500"
                                                onClick={() => openEditDialog(person)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-500"
                                                onClick={() => handleDeletePerson(person)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="mt-1 space-y-1">
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                    <Mail className="w-3 h-3 mr-1" />
                                    <span className="truncate">{person.email}</span>
                                </div>
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                    <Clock className="w-3 h-3 mr-1" />
                                    <span>
                                        {person.workingHours.start} - {person.workingHours.end} {person.workingHours.timezone}
                                    </span>
                                    {isWorking ? (
                                        <span className="ml-2 text-green-600 dark:text-green-400">• Online</span>
                                    ) : (
                                        <span className="ml-2 text-gray-400 dark:text-gray-500">• Offline</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const listContent = (
        <div className="space-y-4">
            {filteredPeople.map((person) => (
                <PersonCard key={person.id} person={person} />
            ))}
        </div>
    )

    const gridContent = (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPeople.map((person) => (
                <PersonCard key={person.id} person={person} compact />
            ))}
        </div>
    )

    const teamsContent = (
        <div className="space-y-6">
            {visibleTeams.map((team) => {
                const teamPeople = peopleByTeams[team.id]
                if (teamPeople.length === 0) return null

                return (
                    <div key={team.id}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{team.name}</h3>
                                <Badge className={team.color}>
                                    {teamPeople.length} member{teamPeople.length !== 1 ? "s" : ""}
                                </Badge>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {teamPeople.map((person) => (
                                <PersonCard key={person.id} person={person} compact />
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    )

    return (
        <div className="p-3 sm:p-4 lg:p-6">
            <div className="mb-6">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">People</h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Manage your team members and view their availability
                        </p>
                    </div>
                    {canManagePeople ? (
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            {isAdmin ? (
                                <Button variant="outline" onClick={() => setIsHistoryDialogOpen(true)}>
                                    <History className="mr-2 h-4 w-4" />
                                    Lịch sử tài khoản
                                </Button>
                            ) : null}
                            <Button onClick={openCreateDialog} className="w-full sm:w-auto">
                                <UserPlus className="mr-2 h-4 w-4" />
                                Thêm nhân sự
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                        <Input
                            placeholder="Search people by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-full border-gray-300 bg-transparent text-gray-700 dark:border-gray-600 dark:text-gray-300 sm:w-auto"
                            >
                                <Filter className="w-4 h-4 mr-2" />
                                {selectedTeam === "all"
                                    ? isAdmin
                                        ? "All Teams"
                                        : getTeamById(currentTeamId, teams)?.name ?? "My Team"
                                    : getTeamById(selectedTeam, teams)?.name}
                                <ChevronDown className="w-4 h-4 ml-2" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                            <DropdownMenuItem
                                onClick={() => setSelectedTeam("all")}
                                className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                {isAdmin ? "All Teams" : getTeamById(currentTeamId, teams)?.name ?? "My Team"}
                            </DropdownMenuItem>
                            {visibleTeams.map((team) => (
                                <DropdownMenuItem
                                    key={team.id}
                                    onClick={() => setSelectedTeam(team.id)}
                                    className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    {team.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex w-full items-center border border-gray-300 dark:border-gray-600 rounded-lg p-1 bg-white dark:bg-gray-800 sm:w-auto">
                        <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="h-8 px-3">
                            <List className="w-4 h-4" />
                        </Button>
                        <Button variant={viewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("grid")} className="h-8 px-3">
                            <Grid3X3 className="w-4 h-4" />
                        </Button>
                        <Button variant={viewMode === "teams" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("teams")} className="h-8 px-3">
                            <Users className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {filteredPeople.length} of {accessiblePeople.length} people
                    {selectedTeam !== "all" && ` in ${getTeamById(selectedTeam, teams)?.name}`}
                </p>
            </div>

            <div className="min-h-[400px]">
                {filteredPeople.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No people found</h3>
                        <p className="text-gray-600 dark:text-gray-400">Try adjusting your search or filter criteria</p>
                    </div>
                ) : (
                    <>
                        {viewMode === "list" && listContent}
                        {viewMode === "grid" && gridContent}
                        {viewMode === "teams" && teamsContent}
                    </>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{editingPerson ? "Chỉnh sửa nhân sự" : "Thêm nhân sự mới"}</DialogTitle>
                        <DialogDescription>
                            {editingPerson
                                ? "Cập nhật thông tin nhân sự trong hệ thống."
                                : "Tạo hồ sơ nhân sự mới để admin quản lý trong data."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="person-name">Họ và tên</Label>
                            <Input id="person-name" value={personForm.name} onChange={(event) => updatePersonForm("name", event.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="person-email">Email</Label>
                            <Input id="person-email" type="email" value={personForm.email} onChange={(event) => updatePersonForm("email", event.target.value)} />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="person-role">Role hiển thị</Label>
                                <Select value={personForm.role} onValueChange={(value) => updatePersonForm("role", value)}>
                                    <SelectTrigger id="person-role">
                                        <SelectValue placeholder="Chọn role hiển thị" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availablePersonRoles.map((role) => (
                                            <SelectItem key={role} value={role}>
                                                {role}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Team</Label>
                                <Select
                                    value={personForm.team}
                                    onValueChange={(value) => updatePersonForm("team", value)}
                                    disabled={isStoreTrainer}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn team" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(isStoreTrainer ? teams.filter((team) => team.id === "store") : teams).map((team) => (
                                            <SelectItem key={team.id} value={team.id}>
                                                {team.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {canEditTechnicianSupervisor && (
                            <div className="grid gap-2">
                                <Label htmlFor="technician-supervisor">Cửa hàng trưởng quản lí</Label>
                                <Select value={personForm.storeLeadUserId} onValueChange={(value) => updatePersonForm("storeLeadUserId", value)}>
                                    <SelectTrigger id="technician-supervisor">
                                        <SelectValue placeholder="Chọn cửa hàng trưởng" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {storeLeadOptions.map((lead) => (
                                            <SelectItem key={lead.userId} value={lead.userId as string}>
                                                {lead.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {canEditStoreLeadManager && (
                            <div className="grid gap-2">
                                <Label htmlFor="store-lead-manager">Quản lí cửa hàng phụ trách</Label>
                                <Select value={personForm.storeManagerUserId} onValueChange={(value) => updatePersonForm("storeManagerUserId", value)}>
                                    <SelectTrigger id="store-lead-manager">
                                        <SelectValue placeholder="Chọn quản lí cửa hàng" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {storeManagerOptions.map((manager) => (
                                            <SelectItem key={manager.userId} value={manager.userId as string}>
                                                {manager.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="grid gap-2">
                            <Label htmlFor="person-image">Avatar URL</Label>
                            <Input id="person-image" value={personForm.imageURL} onChange={(event) => updatePersonForm("imageURL", event.target.value)} placeholder="https://..." />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="grid gap-2">
                                <Label htmlFor="person-start">Bắt đầu</Label>
                                <Input id="person-start" value={personForm.start} onChange={(event) => updatePersonForm("start", event.target.value)} placeholder="09:00" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="person-end">Kết thúc</Label>
                                <Input id="person-end" value={personForm.end} onChange={(event) => updatePersonForm("end", event.target.value)} placeholder="17:00" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="person-timezone">Timezone</Label>
                                <Input id="person-timezone" value={personForm.timezone} onChange={(event) => updatePersonForm("timezone", event.target.value)} placeholder="UTC+7" />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                            Hủy
                        </Button>
                        <Button onClick={handleSubmitPerson} disabled={isSubmitting}>
                            {isSubmitting ? "Đang lưu..." : editingPerson ? "Cập nhật" : "Thêm nhân sự"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Lịch sử tài khoản</DialogTitle>
                        <DialogDescription>
                            Theo dõi các tài khoản đã được duyệt thành công hoặc bị từ chối.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div className="grid gap-2">
                                <Label htmlFor="history-filter">Lọc theo thời gian</Label>
                                <Select value={historyFilter} onValueChange={(value: AccountHistoryFilter) => setHistoryFilter(value)}>
                                    <SelectTrigger id="history-filter" className="w-full sm:w-[180px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="week">Tuần này</SelectItem>
                                        <SelectItem value="month">Tháng này</SelectItem>
                                        <SelectItem value="custom">Khoảng ngày</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {historyFilter === "custom" ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="grid gap-2">
                                        <Label htmlFor="history-start">Từ ngày</Label>
                                        <Input
                                            id="history-start"
                                            type="date"
                                            value={customStartDate}
                                            onChange={(event) => setCustomStartDate(event.target.value)}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="history-end">Đến ngày</Label>
                                        <Input
                                            id="history-end"
                                            type="date"
                                            value={customEndDate}
                                            onChange={(event) => setCustomEndDate(event.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                            <div className="hidden grid-cols-[minmax(0,1.6fr)_160px_180px] gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 sm:grid">
                                <span>Tài khoản</span>
                                <span>Trạng thái</span>
                                <span>Thời điểm xử lý</span>
                            </div>

                            <div className="max-h-[420px] overflow-y-auto">
                                {isHistoryLoading ? (
                                    <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                                        Đang tải lịch sử tài khoản...
                                    </div>
                                ) : filteredAccountHistory.length === 0 ? (
                                    <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                                        Không có dữ liệu lịch sử trong bộ lọc hiện tại.
                                    </div>
                                ) : (
                                    filteredAccountHistory.map((item) => (
                                        <div
                                            key={item.id}
                                            className="grid grid-cols-1 gap-2 border-b border-gray-100 px-4 py-4 last:border-b-0 dark:border-gray-800 sm:grid-cols-[minmax(0,1.6fr)_160px_180px] sm:gap-4"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-gray-900 dark:text-white">{item.name}</p>
                                                <p className="truncate text-sm text-gray-600 dark:text-gray-400">{item.email}</p>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                                    {item.role.toUpperCase()} · {item.department}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400 sm:hidden">Trạng thái:</span>
                                                {(() => {
                                                    const statusMeta = getHistoryStatusMeta(item.status)
                                                    const StatusIcon = statusMeta.icon

                                                    return (
                                                <Badge
                                                    className={statusMeta.className}
                                                >
                                                    <StatusIcon className="mr-1 h-3.5 w-3.5" />
                                                    {statusMeta.label}
                                                </Badge>
                                                    )
                                                })()}
                                            </div>
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                <span className="mr-1 text-xs text-gray-500 dark:text-gray-400 sm:hidden">Thời điểm:</span>
                                                {formatHistoryDate(getHistoryActionDate(item))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>
                            Đóng
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
