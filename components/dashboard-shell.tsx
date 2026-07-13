"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { Department, UserRole } from "@/lib/auth";

type RoleKey = UserRole;
type SectionKey = "overview" | "board" | "kpi" | "reports" | "audit";
type TaskStatus = "To do" | "In progress" | "Pending review" | "Overdue";

type EmployeeTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: "Low" | "Medium" | "High";
  progress: number;
  note: string;
  issueKey: string;
  comments: number;
};

type TaskForm = {
  title: string;
  status: TaskStatus;
  priority: "Low" | "Medium" | "High";
  progress: number;
  note: string;
};

type TeamTask = {
  id: string;
  title: string;
  assignee: string;
  status: TaskStatus;
  progress: number;
  note: string;
  issueKey: string;
  reporter: string;
  priority: "Low" | "Medium" | "High";
  comments: number;
};

const sections: { id: SectionKey; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "board", label: "Task Board" },
  { id: "kpi", label: "KPI Monitor" },
  { id: "reports", label: "Reports" },
  { id: "audit", label: "Audit Trail" }
];

const sectionAccess: Record<RoleKey, SectionKey[]> = {
  ceo: ["overview", "board", "kpi", "reports", "audit"],
  leader: ["overview", "board", "kpi", "audit"],
  employee: ["overview", "board", "kpi"],
  store_staff: ["overview", "board", "kpi"],
  store_trainer: ["overview", "board", "kpi", "audit"],
  store_manager: ["overview", "board", "kpi", "audit"],
  store_lead: ["overview", "board", "kpi"],
  store_technician: ["overview", "board", "kpi"],
  admin: ["overview", "board", "kpi", "reports", "audit"]
};

const roles: { id: RoleKey; label: string }[] = [
  { id: "ceo", label: "CEO" },
  { id: "leader", label: "Leader" },
  { id: "employee", label: "Nhân viên" },
  { id: "store_staff", label: "Nhân viên cửa hàng" },
  { id: "store_trainer", label: "Trainer" },
  { id: "store_manager", label: "Quản lí khu vực" },
  { id: "store_lead", label: "Cửa hàng trưởng" },
  { id: "store_technician", label: "Kỹ thuật viên" },
  { id: "admin", label: "Admin" }
];

const roleData: Record<
  RoleKey,
  {
    heroTitle: string;
    heroDescription: string;
    heroOnTime: string;
    heroKpi: string;
    heroPending: string;
    metricTasks: string;
    metricDept: string;
    metricRisk: string;
    metricApproval: string;
  }
> = {
  ceo: {
    heroTitle: "Toàn công ty đang có 26 task cần chú ý",
    heroDescription:
      "Ưu tiên xử lý khối lượng quá hạn ở Marketing, theo dõi backlog review ở IT và cân bằng tải team Sales Ops trước cuối tuần.",
    heroOnTime: "89%",
    heroKpi: "84.6",
    heroPending: "17",
    metricTasks: "248",
    metricDept: "3/5 đạt chuẩn",
    metricRisk: "08",
    metricApproval: "11"
  },
  leader: {
    heroTitle: "Team của bạn có 7 task trọng số cao trong tuần này",
    heroDescription:
      "Tập trung dọn queue pending review, giải quyết 2 task sắp quá hạn và giữ KPI team trên ngưỡng 85 điểm.",
    heroOnTime: "91%",
    heroKpi: "86.2",
    heroPending: "6",
    metricTasks: "64",
    metricDept: "Team ổn định",
    metricRisk: "03",
    metricApproval: "06"
  },
  employee: {
    heroTitle: "Hôm nay bạn có thể tự quản lý task và cập nhật tiến độ",
    heroDescription:
      "Nhân viên có thể thêm task mới, sửa nội dung, ghi chú tiến độ và xóa task của mình ngay trên dashboard cá nhân.",
    heroOnTime: "96%",
    heroKpi: "88.9",
    heroPending: "2",
    metricTasks: "12",
    metricDept: "KPI cá nhân tốt",
    metricRisk: "01",
    metricApproval: "02"
  },
  store_staff: {
    heroTitle: "Hôm nay bạn có thể tự quản lý task cửa hàng và cập nhật tiến độ",
    heroDescription:
      "Nhân viên cửa hàng có thể thêm task mới, sửa nội dung, ghi chú tiến độ và xóa task cá nhân ngay trên dashboard.",
    heroOnTime: "95%",
    heroKpi: "87.8",
    heroPending: "3",
    metricTasks: "14",
    metricDept: "Vận hành cửa hàng ổn định",
    metricRisk: "01",
    metricApproval: "02"
  },
  store_trainer: {
    heroTitle: "Trainer theo dõi toàn bộ cụm cửa hàng phụ trách",
    heroDescription: "Ưu tiên kiểm tra tiến độ đào tạo, chất lượng vận hành và phân bổ coaching theo từng chi nhánh.",
    heroOnTime: "93%",
    heroKpi: "87.4",
    heroPending: "5",
    metricTasks: "41",
    metricDept: "Đang kiểm soát tốt",
    metricRisk: "02",
    metricApproval: "03"
  },
  store_manager: {
    heroTitle: "Quản lí khu vực đang điều phối nhiều chi nhánh",
    heroDescription: "Tập trung xử lý các đầu việc quá hạn tại từng điểm bán và giữ KPI vận hành đồng đều.",
    heroOnTime: "90%",
    heroKpi: "84.1",
    heroPending: "7",
    metricTasks: "36",
    metricDept: "Cần tối ưu phân ca",
    metricRisk: "03",
    metricApproval: "02"
  },
  store_lead: {
    heroTitle: "Cửa hàng trưởng kiểm soát vận hành tại chi nhánh",
    heroDescription: "Bám sát checklist mở/đóng ca và theo dõi tiến độ đội kỹ thuật viên theo ngày.",
    heroOnTime: "91%",
    heroKpi: "85.2",
    heroPending: "4",
    metricTasks: "24",
    metricDept: "Ổn định",
    metricRisk: "02",
    metricApproval: "01"
  },
  store_technician: {
    heroTitle: "Kỹ thuật viên quản lý task cá nhân theo ca",
    heroDescription: "Cập nhật tiến độ công việc hàng ngày và xử lý các đầu việc phát sinh đúng SLA.",
    heroOnTime: "94%",
    heroKpi: "86.1",
    heroPending: "3",
    metricTasks: "16",
    metricDept: "KPI cá nhân tốt",
    metricRisk: "01",
    metricApproval: "01"
  },
  admin: {
    heroTitle: "Hệ thống đang có 4 rule phân quyền cần rà soát",
    heroDescription:
      "Ưu tiên chuẩn hóa role matrix, kiểm tra tài khoản mới theo phòng ban và khóa những thay đổi workflow chưa được duyệt.",
    heroOnTime: "System 99.2%",
    heroKpi: "Ops 87.4",
    heroPending: "4",
    metricTasks: "32",
    metricDept: "6 phòng ban",
    metricRisk: "04",
    metricApproval: "09"
  }
};

const departments = [
  { name: "IT", lead: "Minh Pham", score: 88, late: "5%", workload: "Ổn định" },
  { name: "Marketing", lead: "Lan Tran", score: 76, late: "18%", workload: "Quá tải" },
  { name: "Sales Ops", lead: "Tuan Le", score: 84, late: "7%", workload: "Cần cân bằng" },
  { name: "Finance", lead: "Ha Do", score: 90, late: "3%", workload: "Ổn định" }
];

const alerts = [
  "Marketing đổi deadline 4 lần trong 10 ngày ở campaign Q2 launch.",
  "2 task trọng số cao của IT đang chờ review quá 48 giờ.",
  "Sales Ops có 1 nhân sự ôm 37% workload toàn team.",
  "Một task cấp director bị reopen lần 3 do thiếu acceptance criteria."
];

const boardColumns: {
  title: TaskStatus;
  tasks: { name: string; owner: string; meta: string; progress: number }[];
}[] = [
  {
    title: "To do",
    tasks: [
      { name: "Setup KPI template Q2", owner: "Ha Do", meta: "Finance · High", progress: 20 },
      { name: "Review campaign backlog", owner: "Lan Tran", meta: "Marketing · Medium", progress: 10 }
    ]
  },
  {
    title: "In progress",
    tasks: [
      { name: "Website KPI launch dashboard", owner: "Trang Nguyen", meta: "IT · Critical", progress: 72 },
      { name: "Department score calibration", owner: "Minh Pham", meta: "IT · High", progress: 58 }
    ]
  },
  {
    title: "Pending review",
    tasks: [
      { name: "Sales Ops SLA cleanup", owner: "Tuan Le", meta: "Sales Ops · High", progress: 94 },
      { name: "Monthly KPI export", owner: "Ha Do", meta: "Finance · Medium", progress: 100 }
    ]
  },
  {
    title: "Overdue",
    tasks: [
      { name: "April campaign approval", owner: "Lan Tran", meta: "Marketing · Critical", progress: 65 },
      { name: "Task permission audit", owner: "Bao Nguyen", meta: "Admin · High", progress: 41 }
    ]
  }
];

const formulas = [
  { label: "Hoàn thành đúng hạn", weight: "30%", note: "Đạt 95% trở lên nhận tối đa điểm." },
  { label: "Tỷ lệ hoàn thành task", weight: "20%", note: "Task đóng đủ acceptance criteria mới được tính." },
  { label: "Overdue / Reopen", weight: "25%", note: "Trễ hạn và reopen làm giảm điểm tự động." },
  { label: "Chất lượng từ quản lý", weight: "15%", note: "Điểm review cuối kỳ hoặc theo milestone." },
  { label: "Chủ động phối hợp", weight: "10%", note: "Đánh giá thủ công theo thái độ phối hợp." }
];

const leaders = [
  { name: "Trang Nguyen", role: "IT", score: 92, status: "Top performer" },
  { name: "Ha Do", role: "Finance", score: 90, status: "Ổn định" },
  { name: "Lan Tran", role: "Marketing", score: 74, status: "Cần hỗ trợ backlog" },
  { name: "Bao Nguyen", role: "Admin", score: 71, status: "Nhiều task bị đổi deadline" }
];

const timelineItems = [
  "15:18 · Minh Pham approve task Website KPI launch dashboard và chấm quality score 4/5.",
  "14:42 · Lan Tran đổi deadline April campaign approval từ 29 Mar sang 02 Apr, có ghi lý do.",
  "13:55 · Bao Nguyen cập nhật permission matrix cho vai trò Department Manager.",
  "11:10 · Tuan Le reopen task Sales Ops SLA cleanup vì thiếu checklist bàn giao."
];

const defaultEmployeeTasks: EmployeeTask[] = [
  {
    id: "task-1",
    issueKey: "IT-21",
    title: "Cập nhật wireframe dashboard KPI",
    status: "In progress",
    priority: "High",
    progress: 72,
    note: "Đang hoàn thiện phần card KPI cho phòng IT.",
    comments: 2
  },
  {
    id: "task-2",
    issueKey: "IT-24",
    title: "Chuẩn hóa danh sách backlog tuần",
    status: "To do",
    priority: "Medium",
    progress: 20,
    note: "Chờ leader xác nhận ưu tiên cuối cùng.",
    comments: 1
  }
];

const defaultTeamTasks: TeamTask[] = [
  {
    id: "team-1",
    issueKey: "IT-12",
    title: "Hoàn thiện tài liệu requirement sprint 2",
    assignee: "Minh Pham",
    status: "Pending review",
    progress: 90,
    note: "Đang chờ leader review acceptance criteria.",
    reporter: "Lan Tran",
    priority: "High",
    comments: 3
  },
  {
    id: "team-2",
    issueKey: "IT-16",
    title: "Đồng bộ API KPI với dashboard",
    assignee: "Lan Anh",
    status: "In progress",
    progress: 55,
    note: "Team IT đang chờ backend confirm field mapping.",
    reporter: "Minh Pham",
    priority: "High",
    comments: 4
  },
  {
    id: "team-3",
    issueKey: "IT-19",
    title: "Rà soát backlog bug nội bộ",
    assignee: "Bao Nguyen",
    status: "To do",
    progress: 15,
    note: "Task của nhóm, nhân viên chỉ được theo dõi tiến độ.",
    reporter: "System Admin",
    priority: "Medium",
    comments: 1
  }
];

function cls(...classes: Array<string | false>) {
  return classes.filter(Boolean).join(" ");
}

function Panel({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cls(
        "rounded-[28px] border border-[rgba(55,45,33,0.12)] bg-[rgba(255,252,247,0.78)] p-5 shadow-float backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  tag
}: {
  eyebrow: string;
  title: string;
  tag?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">{eyebrow}</p>
        <h3 className="text-xl font-semibold text-text">{title}</h3>
      </div>
      {tag ? (
        <span className="inline-flex rounded-full bg-[rgba(42,49,66,0.07)] px-3 py-2 text-xs text-ink">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

function getStatusTone(status: TaskStatus) {
  switch (status) {
    case "To do":
      return "bg-slate-100 text-slate-700";
    case "In progress":
      return "bg-sky-100 text-sky-700";
    case "Pending review":
      return "bg-amber-100 text-amber-700";
    case "Overdue":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getPriorityTone(priority: "Low" | "Medium" | "High") {
  switch (priority) {
    case "High":
      return "text-rose-600";
    case "Medium":
      return "text-amber-600";
    case "Low":
      return "text-emerald-600";
    default:
      return "text-slate-600";
  }
}

function JiraTaskTable({
  title,
  caption,
  tasks,
  isReadOnly,
  onEdit,
  onDelete
}: {
  title: string;
  caption: string;
  tasks: Array<
    | EmployeeTask
    | (TeamTask & {
        assignee: string;
      })
  >;
  isReadOnly: boolean;
  onEdit?: (task: EmployeeTask) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 border-b border-[rgba(55,45,33,0.1)] pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Task Workspace</p>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted">{caption}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl border border-[rgba(55,45,33,0.12)] bg-white px-4 py-2 text-sm text-muted">
              Search work
            </div>
            <div className="rounded-xl border border-[rgba(55,45,33,0.12)] bg-white px-4 py-2 text-sm">Filter</div>
            <div className="rounded-xl border border-[rgba(55,45,33,0.12)] bg-white px-4 py-2 text-sm">Group</div>
            <div className="rounded-xl border border-[rgba(55,45,33,0.12)] bg-white px-4 py-2 text-sm">
              {isReadOnly ? "Read only" : "Editable"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[980px] w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-sm text-muted">
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Work</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Assignee</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Reporter</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Priority</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Status</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Progress</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Comments</th>
              <th className="border-b border-[rgba(55,45,33,0.1)] px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const assignee = "assignee" in task ? task.assignee : "Bạn";
              const reporter = "reporter" in task ? task.reporter : "Bạn";

              return (
                <tr key={task.id} className="bg-white/65 align-top">
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="rounded-md bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                        {task.issueKey}
                      </span>
                      <div>
                        <div className="font-medium text-text">{task.title}</div>
                        <div className="mt-1 text-sm leading-6 text-muted">{task.note}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4 text-sm">{assignee}</td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4 text-sm">{reporter}</td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4">
                    <span className={cls("text-sm font-medium", getPriorityTone(task.priority))}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4">
                    <span className={cls("rounded-md px-2 py-1 text-xs font-semibold", getStatusTone(task.status))}>
                      {task.status}
                    </span>
                  </td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4">
                    <div className="flex min-w-24 items-center gap-3">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4 text-sm">
                    {task.comments} comment{task.comments > 1 ? "s" : ""}
                  </td>
                  <td className="border-b border-[rgba(55,45,33,0.08)] px-4 py-4">
                    {isReadOnly ? (
                      <span className="rounded-full bg-ink/5 px-3 py-2 text-xs text-ink">Chỉ xem</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onEdit?.(task as EmployeeTask)}
                          className="rounded-full border border-[rgba(55,45,33,0.12)] px-3 py-2 text-xs"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => onDelete?.(task.id)}
                          className="rounded-full border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger"
                        >
                          Xóa
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function DashboardShell() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [section, setSection] = useState<SectionKey>("overview");
  const [tasks, setTasks] = useState<EmployeeTask[]>(defaultEmployeeTasks);
  const [teamTasks] = useState<TeamTask[]>(defaultTeamTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: "",
    status: "To do",
    priority: "Medium",
    progress: 0,
    note: ""
  });

  const role = (user?.role ?? "employee") as RoleKey;
  const activeRole = roleData[role];
  const department = (user?.department ?? "IT") as Department;
  const availableSections = sections.filter((item) => sectionAccess[role].includes(item.id));
  const isEmployee = role === "employee" || role === "store_staff" || role === "store_technician";

  const taskSummary = useMemo(() => {
    const total = tasks.length;
    const doneLike = tasks.filter((task) => task.progress >= 80).length;
    const overdue = tasks.filter((task) => task.status === "Overdue").length;
    return { total, doneLike, overdue, teamTotal: teamTasks.length };
  }, [tasks, teamTasks.length]);

  const focusTask = tasks[0] ?? defaultEmployeeTasks[0];

  function handleLogout() {
    logout();
    router.replace("/login" as Route);
  }

  function resetForm() {
    setTaskForm({
      title: "",
      status: "To do",
      priority: "Medium",
      progress: 0,
      note: ""
    });
    setEditingId(null);
  }

  function submitTask() {
    if (!taskForm.title.trim()) {
      return;
    }

    if (editingId) {
      setTasks((current) =>
        current.map((task) =>
          task.id === editingId ? { ...task, ...taskForm, title: taskForm.title.trim() } : task
        )
      );
      resetForm();
      return;
    }

    setTasks((current) => [
      {
        id: `task-${Date.now()}`,
        issueKey: `IT-${Math.floor(30 + Math.random() * 50)}`,
        ...taskForm,
        title: taskForm.title.trim(),
        comments: 0
      },
      ...current
    ]);
    resetForm();
  }

  function startEdit(task: EmployeeTask) {
    setEditingId(task.id);
    setTaskForm({
      title: task.title,
      status: task.status,
      priority: task.priority,
      progress: task.progress,
      note: task.note
    });
  }

  function deleteTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
    if (editingId === id) {
      resetForm();
    }
  }

  return (
    <div className="min-h-screen p-4 text-text lg:p-6">
      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="rounded-[30px] border border-[rgba(55,45,33,0.12)] bg-[rgba(255,252,247,0.78)] p-6 shadow-float backdrop-blur-xl xl:sticky xl:top-6 xl:h-[calc(100vh-48px)]">
          <div className="mb-8 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-[linear-gradient(135deg,#2a3142,#dd6b4d)] font-bold text-white">
              FWF
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Task + KPI Suite</p>
              <h1 className="text-2xl font-semibold">Command Center</h1>
            </div>
          </div>

          <nav className="grid gap-2">
            {availableSections.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cls(
                  "rounded-full border px-4 py-3 text-left transition",
                  section === item.id
                    ? "border-transparent bg-[linear-gradient(135deg,#2a3142,#dd6b4d)] text-white"
                    : "border-[rgba(55,45,33,0.12)] bg-[rgba(255,255,255,0.65)] text-text"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-[20px] bg-[linear-gradient(180deg,rgba(42,49,66,0.94),rgba(61,78,105,0.95))] p-5 text-white xl:mt-auto">
            <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-white/70">Pilot Scope</p>
            <strong className="text-lg">{isEmployee ? "My Task Workspace" : "IT, Marketing, Sales Ops"}</strong>
            <p className="mt-2 text-sm text-white/76">
              {isEmployee
                ? "Bạn có thể thêm, sửa, xóa task, ghi chú và cập nhật tiến độ trực tiếp."
                : "Theo dõi tiến độ, KPI và cảnh báo quá hạn trong cùng một màn hình."}
            </p>
          </div>
        </aside>

        <main className="grid gap-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Internal Preview</p>
              <h2 className="text-3xl font-semibold leading-tight">
                Hệ thống quản lý task và giám sát KPI đa phòng ban
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                Đăng nhập bằng <strong className="text-text">{user?.email}</strong> · {user?.name} ·{" "}
                {department} · Vai trò {roles.find((item) => item.id === role)?.label}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <span className="rounded-full border border-[rgba(55,45,33,0.12)] bg-[rgba(255,255,255,0.65)] px-4 py-3">
                Vai trò: {roles.find((item) => item.id === role)?.label}
              </span>
              <button className="rounded-full border border-[rgba(55,45,33,0.12)] bg-[rgba(255,255,255,0.65)] px-4 py-3">
                Xuất báo cáo
              </button>
              <button
                onClick={handleLogout}
                className="rounded-full bg-[linear-gradient(135deg,#2a3142,#dd6b4d)] px-4 py-3 text-white"
              >
                Đăng xuất
              </button>
            </div>
          </header>

          <Panel className="bg-[linear-gradient(120deg,rgba(255,249,240,0.88),rgba(255,237,209,0.76))]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Today Focus</p>
                <h3 className="text-3xl font-semibold leading-tight">{activeRole.heroTitle}</h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{activeRole.heroDescription}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "On-time rate", value: activeRole.heroOnTime },
                  { label: "KPI trung bình", value: activeRole.heroKpi },
                  { label: "Pending review", value: activeRole.heroPending }
                ].map((item) => (
                  <div key={item.label} className="rounded-[22px] bg-white/60 p-4">
                    <span className="text-sm text-muted">{item.label}</span>
                    <strong className="mt-2 block text-3xl">{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {section === "overview" ? (
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
                {[
                  {
                    label: "Total tasks",
                    value: isEmployee ? String(taskSummary.total) : activeRole.metricTasks,
                    note: isEmployee ? "Số task cá nhân đang quản lý" : "38 task đang mở, 12 task trễ hạn",
                    tone: "from-[rgba(221,107,77,0.18)]"
                  },
                  {
                    label: "Department KPI",
                    value: isEmployee ? String(taskSummary.teamTotal) : activeRole.metricDept,
                    note: isEmployee ? "Task nhóm chỉ được xem, không được thao tác" : `Tài khoản thuộc phòng ${department}`,
                    tone: "from-[rgba(45,117,165,0.16)]"
                  },
                  {
                    label: "Completed focus",
                    value: isEmployee ? String(taskSummary.doneLike) : activeRole.metricRisk,
                    note: isEmployee ? "Task đã đạt tiến độ từ 80% trở lên" : "4 task đổi deadline, 2 task bị reopen",
                    tone: "from-[rgba(217,157,50,0.18)]"
                  },
                  {
                    label: "Need attention",
                    value: isEmployee ? String(taskSummary.overdue) : activeRole.metricApproval,
                    note: isEmployee ? "Task cá nhân đang ở trạng thái overdue" : "Chờ quản lý xác nhận chất lượng và chấm điểm",
                    tone: "from-[rgba(42,49,66,0.14)]"
                  }
                ].map((item) => (
                  <Panel
                    key={item.label}
                    className={`bg-gradient-to-b ${item.tone} to-[rgba(255,255,255,0.72)]`}
                  >
                    <span className="text-sm text-muted">{item.label}</span>
                    <strong className="mt-2 block text-3xl">{item.value}</strong>
                    <p className="mt-2 text-sm text-muted">{item.note}</p>
                  </Panel>
                ))}
              </div>

              {isEmployee ? (
                <div className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
                  <Panel>
                    <SectionTitle eyebrow="My Actions" title="Tạo hoặc chỉnh sửa task cá nhân" tag="Employee CRUD" />
                    <div className="mt-5 grid gap-4">
                      <label className="grid gap-2">
                        <span className="text-sm font-medium">Tên task</span>
                        <input
                          value={taskForm.title}
                          onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                          className="rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/75 px-4 py-3 outline-none"
                          placeholder="Ví dụ: Chuẩn bị báo cáo KPI tuần"
                        />
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-medium">Trạng thái</span>
                          <select
                            value={taskForm.status}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                status: event.target.value as TaskStatus
                              }))
                            }
                            className="rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/75 px-4 py-3 outline-none"
                          >
                            {boardColumns.map((column) => (
                              <option key={column.title} value={column.title}>
                                {column.title}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-sm font-medium">Ưu tiên</span>
                          <select
                            value={taskForm.priority}
                            onChange={(event) =>
                              setTaskForm((current) => ({
                                ...current,
                                priority: event.target.value as EmployeeTask["priority"]
                              }))
                            }
                            className="rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/75 px-4 py-3 outline-none"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </label>
                      </div>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium">Tiến độ: {taskForm.progress}%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={taskForm.progress}
                          onChange={(event) =>
                            setTaskForm((current) => ({
                              ...current,
                              progress: Number(event.target.value)
                            }))
                          }
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-sm font-medium">Ghi chú</span>
                        <textarea
                          value={taskForm.note}
                          onChange={(event) => setTaskForm((current) => ({ ...current, note: event.target.value }))}
                          className="min-h-28 rounded-2xl border border-[rgba(55,45,33,0.12)] bg-white/75 px-4 py-3 outline-none"
                          placeholder="Ghi chú tiến độ, blocker, việc cần hỗ trợ..."
                        />
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={submitTask}
                          className="rounded-full bg-[linear-gradient(135deg,#2a3142,#dd6b4d)] px-5 py-3 text-white"
                        >
                          {editingId ? "Lưu chỉnh sửa" : "Thêm task"}
                        </button>
                        <button
                          onClick={resetForm}
                          className="rounded-full border border-[rgba(55,45,33,0.12)] bg-white/70 px-5 py-3"
                        >
                          Xóa form
                        </button>
                      </div>
                    </div>
                  </Panel>

                  <Panel>
                    <SectionTitle eyebrow="My Tasks" title="Danh sách task cá nhân" tag={`${taskSummary.total} task`} />
                    <div className="mt-5 grid gap-3">
                      {tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <strong className="text-lg">{task.title}</strong>
                              <div className="mt-1 text-sm text-muted">
                                {task.status} · {task.priority} · {task.progress}%
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEdit(task)}
                                className="rounded-full border border-[rgba(55,45,33,0.12)] px-3 py-2 text-sm"
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="rounded-full border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <p className="mt-3 text-sm leading-7 text-muted">{task.note || "Chưa có ghi chú."}</p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {isEmployee ? (
                <Panel>
                  <SectionTitle eyebrow="Team Tasks" title="Task trong nhóm chỉ để theo dõi" tag={`${taskSummary.teamTotal} task`} />
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {teamTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong className="text-lg">{task.title}</strong>
                            <div className="mt-1 text-sm text-muted">
                              {task.assignee} · {task.status} · {task.progress}%
                            </div>
                          </div>
                          <span className="rounded-full bg-ink/5 px-3 py-2 text-xs text-ink">Read only</span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-muted">{task.note}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : (
                <div className="grid gap-5 2xl:grid-cols-2">
                  <Panel>
                    <SectionTitle eyebrow="Cross Department" title="Hiệu suất theo phòng ban" tag="Updated 15:30" />
                    <div className="mt-5 grid gap-3">
                      {departments.map((dept) => (
                        <div
                          key={dept.name}
                          className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <strong className="text-lg">{dept.name}</strong>
                              <div className="text-sm text-muted">Lead: {dept.lead}</div>
                            </div>
                            <strong className="text-xl">{dept.score}</strong>
                          </div>
                          <div className="mt-2 text-sm text-muted">
                            Trễ hạn {dept.late} · Workload {dept.workload}
                          </div>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                              style={{ width: `${dept.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel>
                    <SectionTitle eyebrow="Escalation" title="Cảnh báo cần quyết định" tag="Need action" />
                    <div className="mt-5 grid gap-3">
                      {alerts.map((item) => (
                        <div
                          key={item}
                          className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4 text-sm leading-7 text-text"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              )}
            </div>
          ) : null}

          {section === "board" ? (
            isEmployee ? (
              <div className="grid gap-5">
                <JiraTaskTable
                  title="Task cá nhân có thể chỉnh sửa"
                  caption="Bố cục list view lấy cảm hứng từ Jira: toolbar phía trên, bảng issue ở dưới và thao tác inline cho task cá nhân."
                  tasks={tasks}
                  isReadOnly={false}
                  onEdit={startEdit}
                  onDelete={deleteTask}
                />

                <JiraTaskTable
                  title="Task trong nhóm chỉ xem"
                  caption="Nhân viên vẫn theo dõi được công việc của nhóm trong cùng cấu trúc bảng, nhưng không có quyền thao tác."
                  tasks={teamTasks}
                  isReadOnly={true}
                />
              </div>
            ) : (
              <Panel>
                <SectionTitle eyebrow="Workflow" title="Bảng task theo trạng thái" tag="Q2 Pilot" />
                <div className="mt-5 grid gap-4 2xl:grid-cols-4">
                  {boardColumns.map((column) => (
                    <div
                      key={column.title}
                      className="rounded-[24px] border border-[rgba(55,45,33,0.08)] bg-[rgba(247,240,230,0.88)] p-4"
                    >
                      <h4 className="text-lg font-semibold">{column.title}</h4>
                      <div className="mt-4 grid gap-3">
                        {column.tasks.map((task) => (
                          <article
                            key={task.name}
                            className="grid gap-3 rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/75 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <strong className="text-base">{task.name}</strong>
                              <span className="rounded-full bg-ink/5 px-3 py-2 text-xs text-ink">
                                {task.progress}%
                              </span>
                            </div>
                            <div className="text-sm text-muted">{task.owner}</div>
                            <div className="text-sm text-muted">{task.meta}</div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )
          ) : null}

          {section === "kpi" ? (
            <div className="grid gap-5 2xl:grid-cols-2">
              <Panel>
                <SectionTitle eyebrow="Score Engine" title="Công thức KPI đang áp dụng" tag="Template active" />
                <div className="mt-5 grid gap-3">
                  {formulas.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <strong className="text-base">{item.label}</strong>
                        <span className="rounded-full bg-ink/5 px-3 py-2 text-xs text-ink">{item.weight}</span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-muted">{item.note}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle
                  eyebrow={isEmployee ? "My Performance" : "Leaderboard"}
                  title={isEmployee ? "Tóm tắt hiệu suất cá nhân" : "Nhân sự nổi bật và cần hỗ trợ"}
                  tag={isEmployee ? "Based on your tasks" : "Auto + Manual"}
                />
                <div className="mt-5 grid gap-3">
                  {isEmployee ? (
                    <>
                      <div className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4">
                        <strong className="text-lg">Task đang quản lý: {taskSummary.total}</strong>
                        <div className="mt-2 text-sm text-muted">Bạn có thể tự tạo và cập nhật toàn bộ task cá nhân.</div>
                      </div>
                      <div className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4">
                        <strong className="text-lg">Task nhóm đang theo dõi: {taskSummary.teamTotal}</strong>
                        <div className="mt-2 text-sm text-muted">Task nhóm chỉ hiển thị để theo dõi, không có quyền sửa hay xóa.</div>
                      </div>
                      <div className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4">
                        <strong className="text-lg">Tiến độ cao: {taskSummary.doneLike}</strong>
                        <div className="mt-2 text-sm text-muted">Số task đã đạt từ 80% tiến độ trở lên.</div>
                      </div>
                      <div className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4">
                        <strong className="text-lg">Task overdue: {taskSummary.overdue}</strong>
                        <div className="mt-2 text-sm text-muted">Overdue ảnh hưởng trực tiếp tới KPI đúng hạn.</div>
                      </div>
                    </>
                  ) : (
                    leaders.map((person) => (
                      <div
                        key={person.name}
                        className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <strong className="text-lg">{person.name}</strong>
                            <div className="text-sm text-muted">{person.role}</div>
                          </div>
                          <strong className="text-xl">{person.score}</strong>
                        </div>
                        <div className="mt-2 text-sm text-muted">{person.status}</div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          ) : null}

          {section === "reports" && sectionAccess[role].includes("reports") ? (
            <div className="grid gap-5 2xl:grid-cols-[2fr_1fr_1fr]">
              <Panel className="bg-[linear-gradient(145deg,rgba(42,49,66,0.96),rgba(78,72,60,0.94))] text-white">
                <SectionTitle eyebrow="Executive View" title="Báo cáo nhanh cho sếp" tag="Board meeting ready" />
                <div className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                  {[
                    { label: "Đúng hạn", value: "221" },
                    { label: "Trễ hạn", value: "27" },
                    { label: "Reopen", value: "9" },
                    { label: "Top bottleneck", value: "Review queue" }
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-sm text-white/70">{item.label}</span>
                      <strong className="mt-2 block text-3xl">{item.value}</strong>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Department Heatmap</p>
                <h3 className="text-xl font-semibold">Marketing đang đỏ</h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Tỷ lệ trễ hạn 18%, approval chậm và workload lệch vào 2 nhân sự chính.
                </p>
              </Panel>

              <Panel>
                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">Suggested Action</p>
                <h3 className="text-xl font-semibold">3 việc nên xử lý ngay</h3>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted">
                  <li>Chốt reviewer cố định cho chiến dịch tháng 4</li>
                  <li>Khóa rule đổi deadline không lý do</li>
                  <li>Thêm cảnh báo task reopen quá 2 lần</li>
                </ul>
              </Panel>
            </div>
          ) : null}

          {section === "audit" && sectionAccess[role].includes("audit") ? (
            <Panel>
              <SectionTitle eyebrow="Auditability" title="Lịch sử thay đổi gần nhất" tag="Immutable logs" />
              <div className="mt-5 grid gap-3">
                {timelineItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-[20px] border border-[rgba(55,45,33,0.08)] bg-white/70 p-4 text-sm leading-7 text-text"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
        </main>

        <aside className="rounded-[30px] border border-[rgba(55,45,33,0.12)] bg-[rgba(255,252,247,0.78)] p-6 shadow-float backdrop-blur-xl xl:sticky xl:top-6 xl:h-[calc(100vh-48px)]">
          <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-muted">
            {isEmployee ? "Task Focus" : "Task Focus"}
          </p>
          <h3 className="text-2xl font-semibold">{isEmployee ? focusTask.title : "Website KPI launch dashboard"}</h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            {isEmployee ? (
              <>
                Owner <strong className="text-text">{user?.name}</strong> · Department{" "}
                <strong className="text-text">{department}</strong>
              </>
            ) : (
              <>
                Assignee <strong className="text-text">Trang Nguyen</strong> · Reviewer{" "}
                <strong className="text-text">Minh Pham</strong>
              </>
            )}
          </p>

          <div className="mt-6 grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Tiến độ</span>
              <strong>{isEmployee ? `${focusTask.progress}%` : "72%"}</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#2d75a5,#dd6b4d)]"
                style={{ width: `${isEmployee ? focusTask.progress : 72}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <div>
              <span className="text-sm text-muted">{isEmployee ? "Trạng thái" : "Deadline"}</span>
              <strong className="mt-2 block text-lg">{isEmployee ? focusTask.status : "03 Apr 2026"}</strong>
            </div>
            <div>
              <span className="text-sm text-muted">{isEmployee ? "Ghi chú" : "KPI impact"}</span>
              <strong className="mt-2 block text-lg leading-7">
                {isEmployee ? focusTask.note || "Chưa có ghi chú." : "5 điểm trọng số, có review bắt buộc"}
              </strong>
            </div>
            <div>
              <span className="text-sm text-muted">{isEmployee ? "Hành động được phép" : "Checklist"}</span>
              {isEmployee ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted">
                  <li>Thêm task mới cho công việc cá nhân</li>
                  <li>Sửa nội dung, trạng thái và tiến độ task</li>
                  <li>Xóa task không còn áp dụng</li>
                  <li>Ghi chú blocker hoặc cập nhật tiến độ</li>
                  <li>Task nhóm chỉ được xem để theo dõi phối hợp</li>
                </ul>
              ) : (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted">
                  <li>Chốt chart tổng quan cho sếp</li>
                  <li>Hiển thị KPI theo phòng ban</li>
                  <li>Thêm cảnh báo overdue và reopen</li>
                  <li>Khóa dữ liệu audit không cho sửa</li>
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
