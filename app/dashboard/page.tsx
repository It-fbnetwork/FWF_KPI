"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { Pie, PieChart, Cell } from "recharts"
import { CalendarDays, ChevronDown, Search, GraduationCap, ChevronRight, CheckCircle2, XCircle } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useDirectory } from "@/components/directory-provider"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspace, type TimePeriod } from "@/components/workspace-context"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, getTeamById } from "@/lib/people"

type QuizReportAttempt = {
    quizId: string
    documentId: string
    documentName: string
    quizTitle: string
    score: number
    correctAnswers: number
    totalQuestions: number
    submittedAt: string
}

type QuizReportRow = {
    personId: string
    personName: string
    teamId: string
    teamName: string
    totalAttempts: number
    averageScore: number
    highestScore: number
    lastAttemptAt: string
    attempts: QuizReportAttempt[]
}

type ViewMode = "employee" | "project"
type PeriodFilter = "all" | TimePeriod

const STATUS_META = {
    pending: {
        label: "Chờ thực hiện",
        color: "#6b7280",
        tailwind: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    },
    inProgress: {
        label: "Đang thực hiện",
        color: "#2596f3",
        tailwind: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
    },
    completed: {
        label: "Hoàn thành",
        color: "#2fb36c",
        tailwind: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200",
    },
    failed: {
        label: "Không hoàn thành",
        color: "#ef4444",
        tailwind: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
    },
} as const

const chartConfig = {
    pending: { label: STATUS_META.pending.label, color: STATUS_META.pending.color },
    inProgress: { label: STATUS_META.inProgress.label, color: STATUS_META.inProgress.color },
    completed: { label: STATUS_META.completed.label, color: STATUS_META.completed.color },
    failed: { label: STATUS_META.failed.label, color: STATUS_META.failed.color },
}

function getProgressLabel(progress: number) {
    if (progress <= 20) {
        return "Cần xem lại"
    }

    if (progress <= 50) {
        return "Ổn định"
    }

    if (progress <= 80) {
        return "Tốt"
    }

    return "Tuyệt vời"
}

function getProgressMeta(progress: number) {
    if (progress <= 20) {
        return {
            label: "Cần xem lại",
            percentageClass: "text-red-600 dark:text-red-300",
            barClass: "bg-red-500",
        }
    }

    if (progress <= 50) {
        return {
            label: "Ổn định",
            percentageClass: "text-amber-600 dark:text-amber-300",
            barClass: "bg-amber-400",
        }
    }

    if (progress <= 80) {
        return {
            label: "Tốt",
            percentageClass: "text-blue-600 dark:text-blue-300",
            barClass: "bg-blue-500",
        }
    }

    return {
        label: "Tuyệt vời",
        percentageClass: "text-green-600 dark:text-green-300",
        barClass: "bg-green-500",
    }
}

export default function DashboardPage() {
    const { user } = useAuth()
    const { people, teams } = useDirectory()
    const { currentUserId, projects, projectTasks } = useWorkspace()
    const [viewMode, setViewMode] = useState<ViewMode>("employee")
    const [selectedEntityId, setSelectedEntityId] = useState<string>("all")
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [quizReport, setQuizReport] = useState<QuizReportRow[]>([])
    const [quizReportLoading, setQuizReportLoading] = useState(true)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [quizSearchQuery, setQuizSearchQuery] = useState("")
    const [showParticipantModal, setShowParticipantModal] = useState(false)
    const isAdminUser = isAdminLikeRole(user?.role)
    const currentUser =
        findPersonForAuthUser(user, people) ??
        people.find((person) => person.id === currentUserId) ?? {
            id: user?.id ?? "guest-user",
            name: user?.name ?? "Guest User",
            role: isAdminUser ? "Admin" : "Member",
            email: user?.email ?? "",
            imageURL: "/placeholder.svg",
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            team: isAdminUser ? "all" : "product",
        }
    const canViewAllData =
        isAdminUser ||
        user?.role === "leader" ||
        currentUser.role.toLowerCase() === "leader"
    const accessibleMemberIds = useMemo(
        () =>
            canViewAllData
                ? isAdminUser
                    ? people.map((person) => person.id)
                    : people.filter((person) => person.team === currentUser.team).map((person) => person.id)
                : [currentUserId],
        [canViewAllData, currentUser.team, currentUserId, isAdminUser, people],
    )
    const scopedProjects = useMemo(() => {
        const projectIds = new Set(
            Object.entries(projectTasks).flatMap(([projectId, taskGroups]) => {
                const hasAccessibleTask = (Object.values(taskGroups) as typeof taskGroups[TimePeriod][])
                    .flat()
                    .some((task) => accessibleMemberIds.includes(task.assigneeId))

                return hasAccessibleTask ? [projectId] : []
            }),
        )

        return projects.filter((project) => projectIds.has(project.id))
    }, [accessibleMemberIds, projectTasks, projects])

    const flattenedTasks = useMemo(() => {
        return Object.entries(projectTasks).flatMap(([projectId, taskGroups]) =>
            (Object.entries(taskGroups) as [TimePeriod, typeof taskGroups[TimePeriod]][]).flatMap(
                ([period, tasks]) =>
                    tasks.map((task) => ({
                        ...task,
                        timePeriod: period,
                    })),
            ),
        )
    }, [projectTasks])
    const scopedTasks = useMemo(
        () => flattenedTasks.filter((task) => accessibleMemberIds.includes(task.assigneeId)),
        [accessibleMemberIds, flattenedTasks],
    )

    const employeeOptions = useMemo(() => {
        const assigneeIds = Array.from(new Set(scopedTasks.map((task) => task.assigneeId)))
        return assigneeIds
            .map((assigneeId) => people.find((person) => person.id === assigneeId))
            .filter(Boolean)
    }, [scopedTasks])

    useEffect(() => {
        setSelectedEntityId("all")
    }, [viewMode])

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/learning/report", { credentials: "include", cache: "no-store" })
                if (!res.ok) return
                const data = (await res.json()) as { rows: QuizReportRow[] }
                setQuizReport(data.rows ?? [])
            } catch { /* ignore */ } finally {
                setQuizReportLoading(false)
            }
        }
        void load()
    }, [])

    const filteredTasks = useMemo(() => {
        return scopedTasks.filter((task) => {
            if (selectedEntityId !== "all") {
                if (viewMode === "employee" && task.assigneeId !== selectedEntityId) {
                    return false
                }

                if (viewMode === "project" && task.projectId !== selectedEntityId) {
                    return false
                }
            }

            if (selectedPeriod !== "all" && task.timePeriod !== selectedPeriod) {
                return false
            }

            const searchValue = searchQuery.trim().toLowerCase()
            if (!searchValue) {
                return true
            }

            const person = people.find((item) => item.id === task.assigneeId)
            const project = scopedProjects.find((item) => item.id === task.projectId)

            return [
                task.name,
                task.description,
                person?.name,
                project?.name,
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(searchValue))
        })
    }, [scopedProjects, scopedTasks, searchQuery, selectedEntityId, selectedPeriod, viewMode])

    const statusBuckets = useMemo(() => {
        return filteredTasks.reduce(
            (acc, task) => {
                if (task.status === "Completed") {
                    acc.completed += 1
                } else if (task.status === "In Progress") {
                    acc.inProgress += 1
                } else if (task.timePeriod === "Last Week") {
                    acc.failed += 1
                } else {
                    acc.pending += 1
                }

                return acc
            },
            { pending: 0, inProgress: 0, completed: 0, failed: 0 },
        )
    }, [filteredTasks])

    const chartData = useMemo(
        () =>
            Object.entries(statusBuckets).map(([key, value]) => ({
                key,
                value,
                fill: chartConfig[key as keyof typeof chartConfig].color,
                label: chartConfig[key as keyof typeof chartConfig].label,
            })),
        [statusBuckets],
    )

    const totalTasks = filteredTasks.length

    const tableRows = useMemo(() => {
        if (viewMode === "employee") {
            const grouped = filteredTasks.reduce<Record<string, typeof filteredTasks>>((acc, task) => {
                if (!acc[task.assigneeId]) {
                    acc[task.assigneeId] = []
                }
                acc[task.assigneeId].push(task)
                return acc
            }, {})

            return Object.entries(grouped).map(([assigneeId, tasks]) => {
                const person = people.find((item) => item.id === assigneeId)
                const team = person ? getTeamById(person.team, teams) : undefined

                return {
                    key: assigneeId,
                    title: person?.name || "Unknown",
                    subtitle: team?.name || "-",
                    pending: tasks.filter((task) => task.status === "Pending" && task.timePeriod !== "Last Week").length,
                    inProgress: tasks.filter((task) => task.status === "In Progress").length,
                    completed: tasks.filter((task) => task.status === "Completed").length,
                    failed: tasks.filter((task) => task.status === "Pending" && task.timePeriod === "Last Week").length,
                    progress: tasks.length === 0 ? 0 : Math.round(tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / tasks.length),
                    total: tasks.length,
                }
            })
        }

        const grouped = filteredTasks.reduce<Record<string, typeof filteredTasks>>((acc, task) => {
            if (!acc[task.projectId]) {
                acc[task.projectId] = []
            }
            acc[task.projectId].push(task)
            return acc
        }, {})

        return Object.entries(grouped).map(([projectId, tasks]) => {
            const project = scopedProjects.find((item) => item.id === projectId)

            return {
                key: projectId,
                title: project?.name || "Unknown Project",
                subtitle: tasks[0]?.executionPeriod || "-",
                pending: tasks.filter((task) => task.status === "Pending" && task.timePeriod !== "Last Week").length,
                inProgress: tasks.filter((task) => task.status === "In Progress").length,
                completed: tasks.filter((task) => task.status === "Completed").length,
                failed: tasks.filter((task) => task.status === "Pending" && task.timePeriod === "Last Week").length,
                progress: tasks.length === 0 ? 0 : Math.round(tasks.reduce((sum, task) => sum + (task.progress ?? 0), 0) / tasks.length),
                total: tasks.length,
            }
        })
    }, [filteredTasks, scopedProjects, viewMode])

    const totalsRow = useMemo(
        () => ({
            pending: tableRows.reduce((sum, row) => sum + row.pending, 0),
            inProgress: tableRows.reduce((sum, row) => sum + row.inProgress, 0),
            completed: tableRows.reduce((sum, row) => sum + row.completed, 0),
            failed: tableRows.reduce((sum, row) => sum + row.failed, 0),
            progress: tableRows.length === 0 ? 0 : Math.round(tableRows.reduce((sum, row) => sum + row.progress, 0) / tableRows.length),
            total: tableRows.reduce((sum, row) => sum + row.total, 0),
        }),
        [tableRows],
    )

    // Accessible people (scoped by permission)
    const accessiblePeople = useMemo(
        () => people.filter((p) => accessibleMemberIds.includes(p.id)),
        [people, accessibleMemberIds]
    )
    const participantPersonIds = useMemo(
        () => new Set(quizReport.map((r) => r.personId)),
        [quizReport]
    )
    const nonParticipants = useMemo(
        () => accessiblePeople.filter((p) => !participantPersonIds.has(p.id)),
        [accessiblePeople, participantPersonIds]
    )

    return (
        <div className="min-h-full bg-gray-100/80 p-6 dark:bg-gray-950">
            <div className="mx-auto max-w-7xl space-y-5">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                        Báo cáo tình hình thực hiện mục tiêu/chỉ tiêu
                    </h1>
                </div>

                <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Xem theo</span>
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <input
                                        type="radio"
                                        checked={viewMode === "project"}
                                        onChange={() => setViewMode("project")}
                                    />
                                    Dự án
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <input
                                        type="radio"
                                        checked={viewMode === "employee"}
                                        onChange={() => setViewMode("employee")}
                                    />
                                    Nhân viên
                                </label>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {viewMode === "employee" ? "Nhân viên" : "Mục tiêu/Chỉ tiêu"}
                                </span>
                                <Select value={selectedEntityId} onValueChange={setSelectedEntityId}>
                                    <SelectTrigger className="w-[190px] bg-white dark:bg-gray-900">
                                        <SelectValue placeholder="Tất cả" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả</SelectItem>
                                        {viewMode === "employee"
                                            ? employeeOptions.map((person) => (
                                                  <SelectItem key={person!.id} value={person!.id}>
                                                      {person!.name}
                                                  </SelectItem>
                                              ))
                                            : scopedProjects.map((project) => (
                                                  <SelectItem key={project.id} value={project.id}>
                                                      {project.name}
                                                  </SelectItem>
                                              ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-full min-w-[220px] flex-1 sm:w-[280px]">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder="Tìm kiếm"
                                    className="pl-9"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kỳ thực hiện</span>
                                <Select value={selectedPeriod} onValueChange={(value: PeriodFilter) => setSelectedPeriod(value)}>
                                    <SelectTrigger className="w-[170px] bg-white dark:bg-gray-900">
                                        <SelectValue placeholder="Tất cả" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Tất cả</SelectItem>
                                        <SelectItem value="This Week">Tuần này</SelectItem>
                                        <SelectItem value="Last Week">Tuần trước</SelectItem>
                                        <SelectItem value="This Month">Tháng này</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                                <CalendarDays className="h-4 w-4" />
                            </button>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
                    <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xl text-gray-900 dark:text-white">
                                Biểu đồ báo cáo tình hình thực hiện mục tiêu theo {viewMode === "employee" ? "nhân viên" : "dự án"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex h-[90%] justify-center ">
                            <div className=" flex h-full justify-center grid gap-8 xl:grid-cols-[0.7fr_1.3fr] xl:items-center">
                                <div className="flex items-center justify-center">
                                    <ChartContainer
                                        config={chartConfig}
                                        className="mx-auto h-[220px] w-full max-w-[280px]"
                                    >
                                        <PieChart>
                                            <ChartTooltip content={(props) => <ChartTooltipContent {...(props as any)} hideLabel />} />
                                            <Pie
                                                data={chartData}
                                                dataKey="value"
                                                nameKey="label"
                                                innerRadius={52}
                                                outerRadius={74}
                                                strokeWidth={0}
                                            >
                                                {chartData.map((entry) => (
                                                    <Cell key={entry.key} fill={entry.fill} />
                                                ))}
                                            </Pie>
                                            <text
                                                x="50%"
                                                y="50%"
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                className="fill-gray-900 dark:fill-white"
                                            >
                                                <tspan x="50%" dy="-0.4em" className="text-sm font-medium fill-gray-500 dark:fill-gray-400">
                                                    Tổng
                                                </tspan>
                                                <tspan x="50%" dy="1.2em" className="text-xl font-bold">
                                                    {totalTasks}
                                                </tspan>
                                            </text>
                                        </PieChart>
                                    </ChartContainer>
                                </div>

                                <div className=" flex justify-center items-center grid gap-4 sm:grid-cols-2">
                                    {chartData.map((item) => {
                                        const percentage = totalTasks === 0 ? 0 : Math.round((item.value / totalTasks) * 100)

                                        return (
                                            <div
                                                key={item.key}
                                                className=" min-h-[96px] items-center justify-center justify-between gap-4 rounded-xl border border-gray-200 px-5 py-4 dark:border-gray-800"
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <span
                                                        className="h-3 w-3 shrink-0 rounded-full"
                                                        style={{ backgroundColor: item.fill }}
                                                    />
                                                    <span className="text-[14px] font-semibold leading-7 text-gray-700 dark:text-gray-200 text-100">
                                                        {item.label}
                                                    </span>
                                                </div>
                                                <Badge
                                                    variant="secondary"
                                                    className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold text-[14px]"
                                                >
                                                    {item.value} task · {percentage}%
                                                </Badge>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xl text-gray-900 dark:text-white">
                                Tổng quan cập nhật
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Tổng số dự án</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{scopedProjects.length}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Task đang lọc</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totalTasks}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Nhân viên tham gia</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                                    {new Set(filteredTasks.map((task) => task.assigneeId)).size}
                                </p>
                            </div>
                            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Tỷ lệ hoàn thành</p>
                                <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                                    {tableRows.length === 0 ? 0 : totalsRow.progress}%
                                </p>
                                <div className="mt-3">
                                    <Progress value={tableRows.length === 0 ? 0 : totalsRow.progress} className="h-2" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-xl text-gray-900 dark:text-white">
                                Bảng báo cáo chi tiết
                            </CardTitle>
                            <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
                                {selectedPeriod === "all" ? "Tất cả kỳ" : selectedPeriod}
                                <ChevronDown className="h-4 w-4" />
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800/80">
                                        <tr className="text-left text-gray-600 dark:text-gray-300">
                                            <th className="px-5 py-4 font-semibold">
                                                {viewMode === "employee" ? "Nhân viên" : "Dự án"}
                                            </th>
                                            <th className="px-5 py-4 font-semibold">
                                                {viewMode === "employee" ? "Vị trí công việc" : "Kỳ gần nhất"}
                                            </th>
                                            <th className="px-5 py-4 font-semibold">Chờ thực hiện</th>
                                            <th className="px-5 py-4 font-semibold">Đang thực hiện</th>
                                            <th className="px-5 py-4 font-semibold">Hoàn thành</th>
                                            <th className="px-5 py-4 font-semibold">Không hoàn thành</th>
                                            <th className="px-5 py-4 font-semibold">Tiến độ</th>
                                            <th className="px-5 py-4 font-semibold">Tổng số</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                        <tr className="bg-blue-50/70 dark:bg-blue-950/20">
                                            <td className="px-5 py-4 font-semibold text-gray-900 dark:text-white">Tổng</td>
                                            <td className="px-5 py-4 text-gray-500 dark:text-gray-400">-</td>
                                            <td className="px-5 py-4 text-gray-700 dark:text-gray-200">{totalsRow.pending}</td>
                                            <td className="px-5 py-4 text-blue-600 dark:text-blue-300">{totalsRow.inProgress}</td>
                                            <td className="px-5 py-4 text-green-600 dark:text-green-300">{totalsRow.completed}</td>
                                            <td className="px-5 py-4 text-red-600 dark:text-red-300">{totalsRow.failed}</td>
                                            <td className="px-5 py-4">
                                                <div className="min-w-[160px] space-y-2">
                                                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                        <span>Trung bình</span>
                                                        <span className={getProgressMeta(totalsRow.progress).percentageClass}>{totalsRow.progress}%</span>
                                                    </div>
                                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${getProgressMeta(totalsRow.progress).barClass}`}
                                                            style={{ width: `${Math.max(0, Math.min(100, totalsRow.progress))}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 font-semibold text-gray-900 dark:text-white">{totalsRow.total}</td>
                                        </tr>

                                        {tableRows.map((row) => (
                                            <tr key={row.key} className="bg-white dark:bg-gray-900">
                                                <td className="px-5 py-4 font-medium text-gray-900 dark:text-white">
                                                    {row.title}
                                                </td>
                                                <td className="px-5 py-4 text-gray-500 dark:text-gray-400">
                                                    {row.subtitle}
                                                </td>
                                                <td className="px-5 py-4 text-gray-700 dark:text-gray-200">{row.pending}</td>
                                                <td className="px-5 py-4 text-blue-600 dark:text-blue-300">{row.inProgress}</td>
                                                <td className="px-5 py-4 text-green-600 dark:text-green-300">{row.completed}</td>
                                                <td className="px-5 py-4 text-red-600 dark:text-red-300">{row.failed}</td>
                                                <td className="px-5 py-4">
                                                    <div className="min-w-[160px] space-y-2">
                                                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                            <span>{getProgressMeta(row.progress).label}</span>
                                                            <span className={getProgressMeta(row.progress).percentageClass}>{row.progress}%</span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${getProgressMeta(row.progress).barClass}`}
                                                                style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 font-medium text-gray-900 dark:text-white">{row.total}</td>
                                            </tr>
                                        ))}

                                        {tableRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={8}
                                                    className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                                                >
                                                    Không có dữ liệu phù hợp với bộ lọc hiện tại.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ── Quiz / E-learning Report ─────────────────────────── */}
                <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <GraduationCap className="h-5 w-5 text-violet-500" />
                                <CardTitle className="text-xl text-gray-900 dark:text-white">
                                    Báo cáo kết quả kiểm tra học liệu
                                </CardTitle>
                            </div>
                            <div className="relative w-full sm:w-[240px]">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <Input
                                    value={quizSearchQuery}
                                    onChange={(e) => setQuizSearchQuery(e.target.value)}
                                    placeholder="Tìm nhân viên..."
                                    className="pl-9 h-9"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                        {quizReportLoading ? (
                            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
                                Đang tải dữ liệu...
                            </div>
                        ) : quizReport.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 text-center">
                                <GraduationCap className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Chưa có kết quả kiểm tra nào</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Kết quả sẽ hiển thị khi nhân viên hoàn thành các bài kiểm tra học liệu.
                                </p>
                            </div>
                        ) : (() => {
                            const filtered = quizReport.filter((row) =>
                                !quizSearchQuery.trim() ||
                                row.personName.toLowerCase().includes(quizSearchQuery.trim().toLowerCase()) ||
                                row.teamName.toLowerCase().includes(quizSearchQuery.trim().toLowerCase())
                            )

                            // Summary stats
                            const totalDone = filtered.reduce((s, r) => s + r.totalAttempts, 0)
                            const avgScore = filtered.length === 0 ? 0 : Math.round(filtered.reduce((s, r) => s + r.averageScore, 0) / filtered.length)
                            const passCount = filtered.filter((r) => r.averageScore >= 80).length

                            return (
                                <div className="space-y-4">
                                    {/* Summary cards */}
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <button
                                            onClick={() => setShowParticipantModal(true)}
                                            className="rounded-xl bg-violet-50 dark:bg-violet-900/20 px-4 py-3 text-left w-full hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors group"
                                        >
                                            <p className="text-xs text-violet-600 dark:text-violet-400">Nhân viên tham gia</p>
                                            <p className="mt-1 text-2xl font-bold text-violet-700 dark:text-violet-300">{filtered.length}</p>
                                            <p className="mt-1 text-[10px] text-violet-500 dark:text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Xem chi tiết →
                                            </p>
                                        </button>
                                        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
                                            <p className="text-xs text-blue-600 dark:text-blue-400">Tổng lượt làm</p>
                                            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">{totalDone}</p>
                                        </div>
                                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                                            <p className="text-xs text-amber-600 dark:text-amber-400">Điểm TB toàn bộ</p>
                                            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">{avgScore}</p>
                                        </div>
                                        <div className="rounded-xl bg-green-50 dark:bg-green-900/20 px-4 py-3">
                                            <p className="text-xs text-green-600 dark:text-green-400">Đạt ≥ 80 điểm</p>
                                            <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-300">{passCount}</p>
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-gray-50 dark:bg-gray-800/80">
                                                    <tr className="text-left text-gray-600 dark:text-gray-300">
                                                        <th className="w-8 px-3 py-3" />
                                                        <th className="px-5 py-3 font-semibold">Nhân viên</th>
                                                        <th className="px-5 py-3 font-semibold">Phòng ban</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Bài đã làm</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Điểm TB</th>
                                                        <th className="px-5 py-3 font-semibold text-center">Điểm cao nhất</th>
                                                        <th className="px-5 py-3 font-semibold">Xếp loại</th>
                                                        <th className="px-5 py-3 font-semibold">Lần cuối</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                                    {filtered.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                Không tìm thấy nhân viên phù hợp.
                                                            </td>
                                                        </tr>
                                                    ) : filtered.map((row) => {
                                                        const isExpanded = expandedRows.has(row.personId)
                                                        const scoreColor = row.averageScore >= 80
                                                            ? "text-green-600 dark:text-green-400"
                                                            : row.averageScore >= 50
                                                                ? "text-amber-600 dark:text-amber-400"
                                                                : "text-red-500 dark:text-red-400"
                                                        const rank = row.averageScore >= 80 ? "Xuất sắc" : row.averageScore >= 60 ? "Khá" : row.averageScore >= 40 ? "Trung bình" : "Cần cải thiện"
                                                        const rankColor = row.averageScore >= 80
                                                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                                            : row.averageScore >= 60
                                                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                                                : row.averageScore >= 40
                                                                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                                                                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"

                                                        return (
                                                            <Fragment key={row.personId}>
                                                                <tr
                                                                    key={row.personId}
                                                                    className="bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                                                    onClick={() => setExpandedRows((prev) => {
                                                                        const next = new Set(prev)
                                                                        if (next.has(row.personId)) next.delete(row.personId)
                                                                        else next.add(row.personId)
                                                                        return next
                                                                    })}
                                                                >
                                                                    <td className="px-3 py-4 text-gray-400">
                                                                        <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                                    </td>
                                                                    <td className="px-5 py-4 font-medium text-gray-900 dark:text-white">
                                                                        <div className="flex items-center gap-2.5">
                                                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${row.averageScore >= 80 ? "bg-green-500" : row.averageScore >= 60 ? "bg-blue-500" : row.averageScore >= 40 ? "bg-amber-500" : "bg-red-500"}`}>
                                                                                {row.personName.split(" ").slice(-1)[0]?.[0] ?? "?"}
                                                                            </div>
                                                                            {row.personName}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400">{row.teamName || row.teamId}</td>
                                                                    <td className="px-5 py-4 text-center font-semibold text-gray-900 dark:text-white">{row.totalAttempts}</td>
                                                                    <td className={`px-5 py-4 text-center text-lg font-bold ${scoreColor}`}>{row.averageScore}</td>
                                                                    <td className={`px-5 py-4 text-center font-semibold ${scoreColor}`}>{row.highestScore}</td>
                                                                    <td className="px-5 py-4">
                                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${rankColor}`}>
                                                                            {rank}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 text-xs">
                                                                        {new Date(row.lastAttemptAt).toLocaleDateString("vi-VN")}
                                                                    </td>
                                                                </tr>

                                                                {/* Expanded detail rows */}
                                                                {isExpanded && row.attempts.map((att, i) => (
                                                                    <tr key={`${row.personId}-${i}`} className="bg-gray-50/80 dark:bg-gray-800/40">
                                                                        <td className="px-3 py-3" />
                                                                        <td colSpan={2} className="px-5 py-3">
                                                                            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                                                {att.score >= 80
                                                                                    ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                                                    : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                                                                                <span className="font-medium truncate max-w-[200px]" title={att.documentName}>{att.documentName}</span>
                                                                                <span className="text-xs text-gray-400">— {att.quizTitle}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-5 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                                                                            {att.correctAnswers}/{att.totalQuestions} câu
                                                                        </td>
                                                                        <td className={`px-5 py-3 text-center font-bold ${att.score >= 80 ? "text-green-600" : att.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
                                                                            {att.score}
                                                                        </td>
                                                                        <td className="px-5 py-3 text-center">
                                                                            <div className="flex items-center justify-center">
                                                                                <div className="h-1.5 w-24 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                                                    <div
                                                                                        className={`h-full rounded-full ${att.score >= 80 ? "bg-green-500" : att.score >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                                                                        style={{ width: `${att.score}%` }}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-5 py-3" />
                                                                        <td className="px-5 py-3 text-xs text-gray-400">
                                                                            {new Date(att.submittedAt).toLocaleDateString("vi-VN")}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </Fragment>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}
                    </CardContent>
                </Card>
            </div>

            {/* ── Participant Detail Modal ────────────────────────────── */}
            {showParticipantModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Chi tiết tham gia kiểm tra</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {quizReport.length} đã tham gia · {nonParticipants.length} chưa tham gia
                                </p>
                            </div>
                            <button
                                onClick={() => setShowParticipantModal(false)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 transition-colors"
                            >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
                            {(() => {
                                const officeParticipants = quizReport.filter((row) => {
                                    const p = people.find((p) => p.id === row.personId)
                                    return p?.role !== "Nhân viên cửa hàng"
                                })
                                const storeParticipants = quizReport.filter((row) => {
                                    const p = people.find((p) => p.id === row.personId)
                                    return p?.role === "Nhân viên cửa hàng"
                                })
                                const officeNonParticipants = nonParticipants.filter((p) => p.role !== "Nhân viên cửa hàng")
                                const storeNonParticipants = nonParticipants.filter((p) => p.role === "Nhân viên cửa hàng")

                                const renderParticipantRow = (row: QuizReportRow) => {
                                    const scoreColor = row.averageScore >= 80
                                        ? "text-green-600 dark:text-green-400"
                                        : row.averageScore >= 50
                                            ? "text-amber-600 dark:text-amber-400"
                                            : "text-red-500 dark:text-red-400"
                                    const avatarBg = row.averageScore >= 80 ? "bg-green-500" : row.averageScore >= 60 ? "bg-blue-500" : row.averageScore >= 40 ? "bg-amber-500" : "bg-red-500"
                                    return (
                                        <div key={row.personId} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5">
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarBg}`}>
                                                {row.personName.split(" ").slice(-1)[0]?.[0] ?? "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.personName}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{row.teamName || row.teamId} · {row.totalAttempts} bài</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className={`text-base font-bold ${scoreColor}`}>{row.averageScore}<span className="text-xs font-normal text-gray-400">đ</span></p>
                                                <p className="text-[10px] text-gray-400">TB</p>
                                            </div>
                                        </div>
                                    )
                                }

                                const renderNonParticipantRow = (person: (typeof nonParticipants)[number]) => {
                                    const team = getTeamById(person.team, teams)
                                    return (
                                        <div key={person.id} className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5">
                                            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0">
                                                {person.name.split(" ").slice(-1)[0]?.[0] ?? "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{person.name}</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500">{team?.name ?? person.team}</p>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex-shrink-0">
                                                Chưa làm bài
                                            </span>
                                        </div>
                                    )
                                }

                                return (
                                    <>
                                        {/* Đã tham gia */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                    Đã tham gia ({quizReport.length})
                                                </h3>
                                            </div>
                                            {quizReport.length === 0 ? (
                                                <p className="text-xs text-gray-400 pl-6">Chưa có nhân viên nào làm bài.</p>
                                            ) : (
                                                <div className="space-y-4">
                                                    {officeParticipants.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 pl-1">
                                                                Nhân viên văn phòng ({officeParticipants.length})
                                                            </p>
                                                            <div className="space-y-2">{officeParticipants.map(renderParticipantRow)}</div>
                                                        </div>
                                                    )}
                                                    {storeParticipants.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 pl-1">
                                                                Nhân viên cửa hàng ({storeParticipants.length})
                                                            </p>
                                                            <div className="space-y-2">{storeParticipants.map(renderParticipantRow)}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Chưa tham gia */}
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <XCircle className="h-4 w-4 text-gray-400" />
                                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                    Chưa tham gia ({nonParticipants.length})
                                                </h3>
                                            </div>
                                            {nonParticipants.length === 0 ? (
                                                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 pl-6">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Tất cả nhân viên đã hoàn thành ít nhất 1 bài kiểm tra!
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {officeNonParticipants.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 pl-1">
                                                                Nhân viên văn phòng ({officeNonParticipants.length})
                                                            </p>
                                                            <div className="space-y-2">{officeNonParticipants.map(renderNonParticipantRow)}</div>
                                                        </div>
                                                    )}
                                                    {storeNonParticipants.length > 0 && (
                                                        <div>
                                                            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 pl-1">
                                                                Nhân viên cửa hàng ({storeNonParticipants.length})
                                                            </p>
                                                            <div className="space-y-2">{storeNonParticipants.map(renderNonParticipantRow)}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <GraduationCap className="h-3.5 w-3.5" />
                                Tỷ lệ tham gia: <span className="font-semibold text-gray-900 dark:text-white ml-1">
                                    {accessiblePeople.length === 0 ? 0 : Math.round((quizReport.length / accessiblePeople.length) * 100)}%
                                </span>
                                <div className="flex-1 mx-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-violet-500 transition-all"
                                        style={{ width: `${accessiblePeople.length === 0 ? 0 : Math.round((quizReport.length / accessiblePeople.length) * 100)}%` }}
                                    />
                                </div>
                                <span>{quizReport.length}/{accessiblePeople.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
