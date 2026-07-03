import type { UserAccount } from "@/lib/auth";

export interface Person {
  id: string;
  name: string;
  role: string;
  imageURL: string;
  email: string;
  workingHours: {
    start: string; // 24-hour format like "09:00"
    end: string; // 24-hour format like "17:00"
    timezone: string;
  };
  team: string;
  userId?: string;
  authRole?: UserAccount["role"];
  department?: UserAccount["department"];
  storeRegion?: string;
  storeBranchIds?: number[];
  storeLeadUserId?: string;
}

export const personDisplayRoles = [
  "Nhân viên",
  "Nhân viên cửa hàng",
  "Kỹ thuật viên",
  "Cửa hàng trưởng",
  "Quản lí cửa hàng",
  "Trainer",
  "Leader",
  "Admin",
  "CEO",
] as const;

export const teams = [
  {
    id: "dev",
    name: "IT",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  {
    id: "qa",
    name: "Kế toán",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  },
  {
    id: "design",
    name: "Hành chính - Nhân sự",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  },
  {
    id: "product",
    name: "Vận hành",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  },
  {
    id: "marketing",
    name: "Marketing",
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  },
  {
    id: "sales",
    name: "Sales",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  },
  {
    id: "store",
    name: "Cửa hàng",
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  },
];

export const people: Person[] = [
  {
    id: "people_0",
    name: "Kiều Anh",
    role: "Nhân viên",
    imageURL:
      "https://res.cloudinary.com/ds574fco0/image/upload/v1753690876/people/0_riwhwx.jpg",
    email: "anh@facewashfox.com",
    workingHours: { start: "09:00", end: "17:00", timezone: "UTC" },
    team: "marketing",
  },
  {
    id: "people_1",
    name: "Quốc Trọng",
    role: "Nhân viên",
    imageURL:
      "https://res.cloudinary.com/ds574fco0/image/upload/v1753690877/people/1_ndgrxc.jpg",
    email: "trong@facewashfox.com",
    workingHours: { start: "08:00", end: "16:00", timezone: "UTC" },
    team: "marketing",
  },
  {
    id: "people_2",
    name: "Quảng Lâm",
    role: "Nhân viên",
    imageURL:
      "https://res.cloudinary.com/ds574fco0/image/upload/v1753690877/people/2_qz3dx8.jpg",
    email: "lam@facewashfox.com",
    workingHours: { start: "10:00", end: "18:00", timezone: "UTC" },
    team: "marketing",
  },

  {
    id: "people_3",
    name: "Minh Hiếu",
    role: "Leader",
    imageURL:
      "https://res.cloudinary.com/ds574fco0/image/upload/v1753690877/people/2_qz3dx8.jpg",
    email: "hieu@facewashfox.com",
    workingHours: { start: "10:00", end: "18:00", timezone: "UTC" },
    team: "marketing",
  },
];

// Utility function to check if person is currently working
export const isPersonWorking = (person: Person): boolean => {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // Get HH:MM format

  return (
    currentTime >= person.workingHours.start &&
    currentTime <= person.workingHours.end
  );
};

// Utility function to get team by id
export const getTeamById = (teamId: string, sourceTeams = teams) => {
  return sourceTeams.find((team) => team.id === teamId);
};

function normalizeIdentityValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getEmailLocalPart(email: string) {
  return normalizeIdentityValue(email).split("@")[0] ?? "";
}

export function findPersonForAuthUser(
  user: Pick<UserAccount, "email" | "name" | "personId"> | null | undefined,
  sourcePeople = people
) {
  if (!user) {
    return null;
  }

  if (user.personId) {
    const matchedById = sourcePeople.find((person) => person.id === user.personId);
    if (matchedById) {
      return matchedById;
    }
  }

  const normalizedName = normalizeIdentityValue(user.name);
  const emailLocalPart = getEmailLocalPart(user.email);

  return (
    sourcePeople.find((person) => {
      return (
        normalizeIdentityValue(person.name) === normalizedName ||
        getEmailLocalPart(person.email) === emailLocalPart
      );
    }) ?? null
  );
}
