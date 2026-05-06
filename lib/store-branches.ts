export const STORE_REGIONS = ["Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Nha Trang", "Vũng Tàu", "Hải Phòng"] as const;

export type StoreRegion = (typeof STORE_REGIONS)[number];

export type StoreBranch = {
  id: number;
  name: string;
  city: string;
  address: string;
};

export const STORE_BRANCHES: StoreBranch[] = [
  { id: 1, name: "Vincom Center Bà Triệu", city: "Hà Nội", address: "191 Bà Triệu, Quận Hai Bà Trưng, TP.Hà Nội" },
  { id: 2, name: "Vinhomes Westpoint - W2 01S01", city: "Hà Nội", address: "Số 1 Đỗ Đức Dục, Quận Nam Từ Liêm, TP.Hà Nội" },
  { id: 3, name: "Face Wash Fox - Hanoi Centre", city: "Hà Nội", address: "175 Nguyễn Thái Học, Hà Nội" },
  { id: 4, name: "Đảo Ngọc Ngũ Xã", city: "Hà Nội", address: "58A Nam Tràng, Trúc Bạch, Ba Đình, Hà Nội" },
  { id: 5, name: "Kosmo Tây Hồ", city: "Hà Nội", address: "Kosmo Tây Hồ, Xuân La, Bắc Từ Liêm, Hà Nội" },
  { id: 6, name: "Smart City", city: "Hà Nội", address: "Vinhome Smart City, Tây Mỗ, Hà Nội" },
  { id: 7, name: "Vinhomes SkyLake", city: "Hà Nội", address: "Vincom Plaza Skylake, Nam Từ Liêm, Hà Nội" },
  { id: 8, name: "Vincom Phạm Ngọc Thạch", city: "Hà Nội", address: "Vincom Center Phạm Ngọc Thạch, Đống Đa, Hà Nội" },
  { id: 9, name: "Face Wash Fox - Starlake", city: "Hà Nội", address: "Khu đô thị Tây Hồ Tây, Hà Nội" },
  { id: 10, name: "Vinhome Green Bay - Đại Lộ Thăng Long", city: "Hà Nội", address: "Số 7 Đại Lộ Thăng Long, Hà Nội" },
  { id: 11, name: "Hanoi Tower", city: "Hà Nội", address: "69 Thợ Nhuộm, Hoàn Kiếm, Hà Nội" },
  { id: 48, name: "Times City", city: "Hà Nội", address: "458 Minh Khai, Vĩnh Tuy, Hà Nội" },
  { id: 49, name: "Lotte Hanoi", city: "Hà Nội", address: "54 Liễu Giai, Ba Đình, Hà Nội" },
  { id: 50, name: "Vincom Plaza Bắc Từ Liêm", city: "Hà Nội", address: "234 Phạm Văn Đồng, Phú Diễn, Hà Nội" },
  { id: 54, name: "Aeon Mall Hà Đông", city: "Hà Nội", address: "Dương Nội, Hà Đông, Hà Nội" },

  { id: 12, name: "Parc Mall", city: "Hồ Chí Minh", address: "547 - 549 Tạ Quang Bửu, Quận 8" },
  { id: 13, name: "Vincom Center Landmark 81 - Lầu 3", city: "Hồ Chí Minh", address: "720A Điện Biên Phủ, Bình Thạnh" },
  { id: 14, name: "Vincom Mega Mall Thảo Điền - Lầu 3", city: "Hồ Chí Minh", address: "161 Võ Nguyên Giáp, Thảo Điền, Thủ Đức" },
  { id: 15, name: "The Sun Avenue - SAV3", city: "Hồ Chí Minh", address: "28 Mai Chí Thọ, An Phú, Thủ Đức" },
  { id: 16, name: "Vincom Plaza - Phan Văn Trị", city: "Hồ Chí Minh", address: "12 Phan Văn Trị, Gò Vấp" },
  { id: 17, name: "Vincom Plaza - Quang Trung", city: "Hồ Chí Minh", address: "190 Quang Trung, Gò Vấp" },
  { id: 18, name: "Vincom Plaza - Lê Văn Việt", city: "Hồ Chí Minh", address: "50 Lê Văn Việt, Hiệp Phú, Thủ Đức" },
  { id: 19, name: "Vista Verde", city: "Hồ Chí Minh", address: "2 Phan Văn Đáng, Thạnh Mỹ Lợi, Thủ Đức" },
  { id: 20, name: "Crescent Mall", city: "Hồ Chí Minh", address: "101 Tôn Dật Tiên, Quận 7" },
  { id: 21, name: "Botanica - Phổ Quang", city: "Hồ Chí Minh", address: "104 Phổ Quang, Tân Bình" },
  { id: 22, name: "The Everrich Infinity", city: "Hồ Chí Minh", address: "290 An Dương Vương, Quận 5" },
  { id: 23, name: "Hoa Lan - Phú Nhuận", city: "Hồ Chí Minh", address: "140 Hoa Lan, Phú Nhuận" },
  { id: 24, name: "Võ Thị Sáu", city: "Hồ Chí Minh", address: "100 Võ Thị Sáu, Quận 1" },
  { id: 25, name: "MVillage - Trương Định", city: "Hồ Chí Minh", address: "14 Trương Định, Quận 3" },
  { id: 26, name: "AEON MALL TÂN PHÚ", city: "Hồ Chí Minh", address: "30 Tân Thắng, Tân Phú" },
  { id: 27, name: "Riviera Point - Quận 7", city: "Hồ Chí Minh", address: "Nguyễn Văn Tưởng, Quận 7" },
  { id: 28, name: "The Symphony - Midtown M6", city: "Hồ Chí Minh", address: "Midtown Phú Mỹ Hưng, Quận 7" },
  { id: 29, name: "Estella Height - Thủ Đức", city: "Hồ Chí Minh", address: "88 Song Hành, An Phú, Thủ Đức" },
  { id: 30, name: "SC VivoCity", city: "Hồ Chí Minh", address: "1058 Nguyễn Văn Linh, Quận 7" },
  { id: 31, name: "AEON MALL Bình Tân", city: "Hồ Chí Minh", address: "1 Đường Số 17A, Bình Tân" },
  { id: 32, name: "NOWZONE Fashion Mall", city: "Hồ Chí Minh", address: "235 Nguyễn Văn Cừ, Quận 1" },
  { id: 34, name: "1B Sương Nguyệt Ánh", city: "Hồ Chí Minh", address: "1B Sương Nguyệt Ánh, Quận 1" },
  { id: 35, name: "MVillage - Thi Sách", city: "Hồ Chí Minh", address: "26 Thi Sách, Quận 1" },
  { id: 38, name: "Vincom 3/2 - L4-03", city: "Hồ Chí Minh", address: "3C Đường 3/2, Quận 10" },
  { id: 39, name: "Face Wash Fox - Marina", city: "Hồ Chí Minh", address: "2 Tôn Đức Thắng, Quận 1" },
  { id: 40, name: "Lumiere", city: "Hồ Chí Minh", address: "275 Võ Nguyên Giáp, Thủ Đức" },
  { id: 45, name: "Đảo Kim Cương", city: "Hồ Chí Minh", address: "01 Trần Quý Kiên, Bình Trưng" },
  { id: 46, name: "Vincom Saigonres", city: "Hồ Chí Minh", address: "188 Nguyễn Xí, Bình Thạnh" },
  { id: 47, name: "Saigon Pearl", city: "Hồ Chí Minh", address: "92 Nguyễn Hữu Cảnh, Bình Thạnh" },
  { id: 51, name: "Face Wash Fox - Vincom Mega Mall Grand Park", city: "Hồ Chí Minh", address: "Vinhomes Grand Park, TP.HCM" },
  { id: 55, name: "Face Wash Fox - Thiso Mall", city: "Hồ Chí Minh", address: "10 Mai Chí Thọ, Thủ Thiêm, TP.HCM" },

  { id: 41, name: "177 Trần Phú", city: "Đà Nẵng", address: "177 Trần Phú, Hải Châu, Đà Nẵng" },
  { id: 42, name: "Joi Boutique Bãi Trước", city: "Vũng Tàu", address: "04 Thống Nhất, Phường 1, Vũng Tàu" },
  { id: 44, name: "Gold Coast Nha Trang", city: "Nha Trang", address: "01 Trần Hưng Đạo, Lộc Thọ, Nha Trang" }
  ,
  { id: 52, name: "Aeon Mall Hải Phòng", city: "Hải Phòng", address: "10 Võ Nguyên Giáp, Lê Chân, Hải Phòng" },
  { id: 53, name: "Vincom Imperia Hải Phòng", city: "Hải Phòng", address: "1 Bạch Đằng, Hồng Bàng, Hải Phòng" }
];

export const STORE_BRANCHES_BY_REGION = STORE_REGIONS.reduce<Record<StoreRegion, StoreBranch[]>>((acc, region) => {
  acc[region] = STORE_BRANCHES.filter((branch) => branch.city === region);
  return acc;
}, {
  "Hồ Chí Minh": [],
  "Hà Nội": [],
  "Đà Nẵng": [],
  "Nha Trang": [],
  "Vũng Tàu": [],
  "Hải Phòng": []
});

export const STORE_BRANCH_ID_SET = new Set(STORE_BRANCHES.map((branch) => branch.id));

export const STORE_AREAS = {
  north: {
    id: "north",
    label: "Miền Bắc",
    cities: ["Hà Nội", "Hải Phòng"] as const
  },
  central: {
    id: "central",
    label: "Miền Trung",
    cities: ["Đà Nẵng", "Nha Trang"] as const
  },
  south: {
    id: "south",
    label: "Miền Nam",
    cities: ["Hồ Chí Minh", "Vũng Tàu"] as const
  }
} as const;

export type StoreAreaId = keyof typeof STORE_AREAS;

export const STORE_AREA_OPTIONS = (Object.values(STORE_AREAS) as Array<(typeof STORE_AREAS)[StoreAreaId]>).map((area) => ({
  id: area.id,
  label: `${area.label} (${area.cities.join(", ")})`,
  cities: [...area.cities]
}));

export function getBranchIdsByArea(areaId: StoreAreaId) {
  const area = STORE_AREAS[areaId];
  if (!area) return [];
  const citySet = new Set(area.cities);
  return STORE_BRANCHES.filter((branch) => citySet.has(branch.city as (typeof area.cities)[number])).map((branch) => branch.id);
}
