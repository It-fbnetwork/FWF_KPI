import { canManageStoreRole, isAdminLikeRole, isStoreRole, type UserAccount } from "@/lib/auth";
import type { Person } from "@/lib/people";

type ActorUser = Pick<UserAccount, "id" | "role" | "department" | "storeRegion" | "storeBranchIds">;

function isStoreTeamPerson(person: Person) {
  return person.team === "store" || person.department === "Cửa hàng";
}

function sharesBranch(actorBranches: Set<number>, person: Person) {
  return Boolean(
    actorBranches.size > 0 && (person.storeBranchIds ?? []).some((branchId) => actorBranches.has(branchId))
  );
}

/**
 * Same hierarchy rules as dashboard/reports (getSessionActor → teamMembers).
 * Used by People page so CHT / quản lí cửa hàng see the same nhân viên as Tổng quan.
 */
export function getManagedPersonIdsFromPeople(
  actorUser: ActorUser,
  actorPerson: Person,
  allPeople: Person[]
): Set<string> {
  const managed = new Set<string>();
  managed.add(actorPerson.id);

  if (isAdminLikeRole(actorUser.role)) {
    allPeople.forEach((person) => managed.add(person.id));
    return managed;
  }

  const actorRole = actorUser.role;
  const actorIsStoreRole = isStoreRole(actorRole);
  const actorBranches = new Set(actorUser.storeBranchIds ?? actorPerson.storeBranchIds ?? []);

  for (const candidate of allPeople) {
    if (!candidate.authRole || !candidate.userId) continue;
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

    if (!isStoreTeamPerson(candidate)) continue;
    if (!isStoreRole(candidate.authRole)) continue;
    if (!canManageStoreRole(actorRole, candidate.authRole)) continue;

    if (actorRole === "store_trainer") {
      // Trainer không gán chi nhánh/khu vực — phạm vi toàn hệ thống cửa hàng.
      managed.add(candidate.id);
      continue;
    }

    if (actorRole === "store_manager") {
      // Quản lí khu vực chỉ thấy CHT + KTV thuộc đúng các cửa hàng đã chọn (storeBranchIds).
      if (actorBranches.size === 0) continue;
      const isManagedStoreRole =
        candidate.authRole === "store_lead" ||
        candidate.authRole === "store_technician" ||
        candidate.authRole === "store_staff";
      if (!isManagedStoreRole) continue;
      if (!sharesBranch(actorBranches, candidate)) continue;
      managed.add(candidate.id);
      continue;
    }

    if (actorRole === "store_lead") {
      if (candidate.authRole !== "store_technician" && candidate.authRole !== "store_staff") continue;
      if (!sharesBranch(actorBranches, candidate)) continue;
      // CHT chỉ thấy KTV cùng chi nhánh và thuộc quyền quản lý trực tiếp (hoặc chưa gán CHT).
      const reportsToActor = !candidate.storeLeadUserId || candidate.storeLeadUserId === actorUser.id;
      if (reportsToActor) {
        managed.add(candidate.id);
      }
    }
  }

  return managed;
}

export function getAccessiblePeopleForActor(
  actorUser: ActorUser | null | undefined,
  actorPerson: Person | null | undefined,
  allPeople: Person[]
): Person[] {
  if (!actorUser || !actorPerson) return [];

  const managedIds = getManagedPersonIdsFromPeople(actorUser, actorPerson, allPeople);
  return allPeople.filter((person) => managedIds.has(person.id));
}
