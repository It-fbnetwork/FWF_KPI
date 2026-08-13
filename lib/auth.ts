export type UserRole =
  | "ceo"
  | "leader"
  | "employee"
  | "admin"
  | "store_staff"
  | "store_trainer"
  | "store_manager"
  | "store_lead"
  | "store_technician";

export type StoreRole = "store_trainer" | "store_manager" | "store_lead" | "store_technician" | "store_staff";

export type Department =
  | "Hành chính - Nhân sự"
  | "IT"
  | "Sales"
  | "Marketing"
  | "Kế toán"
  | "Vận hành"
  | "Cửa hàng";

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  personId?: string;
  role: UserRole;
  department: Department;
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
  verified: boolean;
};

export const COMPANY_DOMAIN = "@facewashfox.com";

export const departments: Department[] = [
  "Hành chính - Nhân sự",
  "IT",
  "Marketing",
  "Sales",
  "Kế toán",
  "Vận hành",
  "Cửa hàng"
];

export const registrationRoles: UserRole[] = [
  "employee",
  "leader",
  "ceo",
  "admin",
  "store_trainer",
  "store_manager",
  "store_lead",
  "store_technician"
];

export const storeRegistrationRoles: StoreRole[] = ["store_trainer", "store_manager", "store_lead", "store_technician"];

export function isAdminLikeRole(role: UserRole | null | undefined) {
  return role === "admin" || role === "ceo";
}

export function requiresApprovalRole(role: UserRole | null | undefined) {
  return role === "admin" || role === "ceo" || role === "leader";
}

const storeRoleRank: Record<StoreRole, number> = {
  store_trainer: 4,
  store_manager: 3,
  store_lead: 2,
  store_technician: 1,
  store_staff: 1,
};

export function isStoreRole(role: UserRole | null | undefined): role is StoreRole {
  return (
    role === "store_trainer" ||
    role === "store_manager" ||
    role === "store_lead" ||
    role === "store_technician" ||
    role === "store_staff"
  );
}

export function normalizeTestViewerRole(role: UserRole | string | null | undefined): UserRole | null {
  if (!role) return null;
  if (role === "store_staff") return "store_technician";
  return role as UserRole;
}

export function canUserViewTest(
  userRole: UserRole | string | null | undefined,
  targetRoles?: Array<UserRole | string> | null
) {
  const viewerRole = normalizeTestViewerRole(userRole);
  if (!viewerRole || !targetRoles?.length) return false;
  return targetRoles.some((role) => normalizeTestViewerRole(role) === viewerRole);
}

export function canManageStoreRole(managerRole: UserRole | null | undefined, targetRole: UserRole | null | undefined) {
  if (!isStoreRole(managerRole) || !isStoreRole(targetRole)) {
    return false;
  }

  return storeRoleRank[managerRole] > storeRoleRank[targetRole];
}

export const seededUsers: UserAccount[] = [
  {
    id: "u-people-0",
    name: "Kiều Anh",
    email: "anh@facewashfox.com",
    password: "123",
    personId: "people_0",
    role: "employee",
    department: "Marketing",
    verified: true
  },

  {
    id: "u-people-3",
    name: "Minh Hieu",
    email: "hieu@facewashfox.com",
    password: "123",
    personId: "people_3",
    role: "leader",
    department: "Marketing",
    verified: true
  }
];

export function isCompanyEmail(email: string) {
  return email.trim().toLowerCase().endsWith(COMPANY_DOMAIN);
}
