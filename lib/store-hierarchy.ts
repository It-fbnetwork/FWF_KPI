import { canManageStoreRole, isAdminLikeRole, isStoreRole, type UserAccount } from "@/lib/auth";
import type { Person } from "@/lib/people";
import { getStoreRegionsForBranchIds, type StoreRegion } from "@/lib/store-branches";

type ActorUser = Pick<UserAccount, "id" | "role" | "department" | "storeRegion" | "storeBranchIds">;

function isStoreTeamPerson(person: Person) {
  return person.team === "store" || person.department === "Cửa hàng";
}

function sharesBranch(actorBranches: Set<number>, person: Person) {
  return Boolean(
    actorBranches.size > 0 && (person.storeBranchIds ?? []).some((branchId) => actorBranches.has(branchId))
  );
}

function sharesRegion(actorRegion: string | undefined, person: Person) {
  if (!actorRegion) return false;
  if (person.storeRegion === actorRegion) return true;
  const branchRegions = getStoreRegionsForBranchIds(person.storeBranchIds);
  return branchRegions.includes(actorRegion as StoreRegion);
}

function isInActorStoreScope(actorUser: ActorUser, actorBranches: Set<number>, person: Person) {
  if (!person.authRole || !isStoreTeamPerson(person)) return false;
  if (actorBranches.size > 0) return sharesBranch(actorBranches, person);
  // Chỉ trainer được xem theo khu vực khi chưa gán chi nhánh cụ thể.
  if (actorUser.role === "store_trainer" && actorUser.storeRegion) {
    return sharesRegion(actorUser.storeRegion, person);
  }
  return false;
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
      if (isInActorStoreScope(actorUser, actorBranches, candidate)) managed.add(candidate.id);
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
