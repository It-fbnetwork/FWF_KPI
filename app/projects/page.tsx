"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { BarChart3, CheckCircle2, Clock3, FolderOpen, Users } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useDirectory } from "@/components/directory-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkspace, type TimePeriod } from "@/components/workspace-context"
import { isAdminLikeRole } from "@/lib/auth"
import { findPersonForAuthUser, getTeamById } from "@/lib/people"

type ProjectSummary = {
    id: string
    name: string
    color: string
    totalTasks: number
    inProgress: number
    completed: number
    pending: number
    contributors: string[]
    latestPeriod: TimePeriod | null
}

function formatPeriodLabel(period: TimePeriod | null) {
    switch (period) {
        case "This Week":
            return "Tuần này"
        case "Last Week":
            return "Tuần trước"
        case "This Month":
            return "Tháng này"
        default:
            return "-"
    }
}

export default function ProjectsPage() {
    const router = useRouter()
    const { user } = useAuth()
    const { people, teams } = useDirectory()
    const { currentUserId, projects, projectTasks } = useWorkspace()
    const isAdmin = isAdminLikeRole(user?.role)

    const currentUser =
        findPersonForAuthUser(user, people) ??
        people.find((person) => person.id === currentUserId) ?? {
            id: user?.id ?? "guest-user",
            name: user?.name ?? "Khách",
            role: "Thành viên",
            email: user?.email ?? "",
            imageURL: "/placeholder.svg",
            workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
            team: "product",
        }

    const teamMemberIds = useMemo(
        () =>
            isAdmin
                ? people.map((person) => person.id)
                : people.filter((person) => person.team === currentUser.team).map((person) => person.id),
        [currentUser.team, isAdmin, people],
    )

    const visibleProjects = useMemo<ProjectSummary[]>(() => {
        return projects
            .map((project) => {
                const taskGroups = projectTasks[project.id]
                const orderedPeriods: TimePeriod[] = ["This Week", "Last Week", "This Month"]
                const visibleMembers = project.memberIds.filter((memberId) => teamMemberIds.includes(memberId))

                if (!isAdmin && !project.memberIds.includes(currentUserId)) {
                    return null
                }

                const allProjectTasks = taskGroups ? orderedPeriods.flatMap((period) => taskGroups[period]) : []
                const visibleProjectTasks = allProjectTasks.filter((task) => visibleMembers.includes(task.assigneeId))
                const latestPeriod =
                    taskGroups
                        ? orderedPeriods.find((period) =>
                            taskGroups[period].some((task) => visibleMembers.includes(task.assigneeId)),
                        ) ?? null
                        : null

                return {
                    id: project.id,
                    name: project.name,
                    color: project.color,
                    totalTasks: visibleProjectTasks.length,
                    inProgress: visibleProjectTasks.filter((task) => task.status === "In Progress").length,
                    completed: visibleProjectTasks.filter((task) => task.status === "Completed").length,
                    pending: visibleProjectTasks.filter((task) => task.status === "Pending").length,
                    contributors: visibleMembers,
                    latestPeriod,
                }
            })
            .filter(Boolean) as ProjectSummary[]
    }, [currentUserId, isAdmin, projectTasks, projects, teamMemberIds])

    const totals = useMemo(
        () => ({
            projects: visibleProjects.length,
            tasks: visibleProjects.reduce((sum, project) => sum + project.totalTasks, 0),
            completed: visibleProjects.reduce((sum, project) => sum + project.completed, 0),
            contributors: new Set(visibleProjects.flatMap((project) => project.contributors)).size,
        }),
        [visibleProjects],
    )

    return (
        <div className="p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Nhóm</h1>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">
                            {isAdmin
                                ? "Theo dõi tất cả nhóm đang tồn tại trong hệ thống và các thành viên thuộc từng nhóm."
                                : `Theo dõi các nhóm bạn đang tham gia cùng những thành viên được cấp quyền hiển thị trong nhóm ${getTeamById(currentUser.team, teams)?.name ?? ""}.`}
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <CardContent className="p-5">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nhóm hiển thị</p>
                            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totals.projects}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <CardContent className="p-5">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Tổng số việc</p>
                            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totals.tasks}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <CardContent className="p-5">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Việc đã hoàn thành</p>
                            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totals.completed}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <CardContent className="p-5">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Người tham gia</p>
                            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totals.contributors}</p>
                        </CardContent>
                    </Card>
                </div>

                {visibleProjects.length === 0 ? (
                    <Card className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                        <CardContent className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            Không có nhóm nào phù hợp với phạm vi quyền hiện tại.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-2">
                        {visibleProjects.map((project) => (
                            <Card
                                key={project.id}
                                className="border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="mb-3 flex items-center gap-3">
                                                <span className={`h-3 w-3 rounded-full ${project.color}`} />
                                                <CardTitle className="text-xl text-gray-900 dark:text-white">
                                                    {project.name}
                                                </CardTitle>
                                            </div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Kỳ gần nhất: {formatPeriodLabel(project.latestPeriod)}
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push(`/?projectId=${project.id}`)}
                                        >
                                            <FolderOpen className="mr-2 h-4 w-4" />
                                            Mở nhóm
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                <BarChart3 className="h-4 w-4" />
                                                <span className="text-sm">Tổng số việc</span>
                                            </div>
                                            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                                                {project.totalTasks}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
                                            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                <Users className="h-4 w-4" />
                                                <span className="text-sm">Thành viên</span>
                                            </div>
                                            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                                                {project.contributors.length}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                            <Clock3 className="mr-1 h-3 w-3" />
                                            Đang thực hiện: {project.inProgress}
                                        </Badge>
                                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                            <CheckCircle2 className="mr-1 h-3 w-3" />
                                            Hoàn thành: {project.completed}
                                        </Badge>
                                        <Badge className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">
                                            Chờ thực hiện: {project.pending}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Thành viên</p>
                                        <div className="flex flex-wrap gap-2">
                                            {project.contributors.map((assigneeId) => {
                                                const person = people.find((item) => item.id === assigneeId)

                                                return (
                                                    <Badge key={assigneeId} variant="secondary">
                                                        {person?.name ?? assigneeId}
                                                    </Badge>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
