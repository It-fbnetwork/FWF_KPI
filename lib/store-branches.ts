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
  { id: 3, name: "Face Wash Fox - Hanoi Centre", city: "Hà Nội", address: "Tầng hầm B2, tòa nhà Tiến Bộ Plaza, 175 P. Nguyễn Thái Học, Cát Linh, Ô Chợ Dừa, Hà Nội, Việt Nam" },
  { id: 4, name: "Đảo Ngọc Ngũ Xã", city: "Hà Nội", address: "Tầng lửng Shophouse, số 58A Nam Tràng, Phường Trúc Bạch, Quận Ba Đình, TP Hà Nội" },
  { id: 5, name: "Kosmo Tây Hồ", city: "Hà Nội", address: "Chung cư Newtatco, Shophouse S17, Kosmo Tây Hồ, Xuân La, Bắc Từ Liêm, Hà Nội" },
  { id: 6, name: "Smart City", city: "Hà Nội", address: "Shophouse SA1.01.S18 Vinhome Smart City, phường Tây Mỗ, thành phố Hà Nội, Việt Nam." },
  { id: 7, name: "Vinhomes SkyLake", city: "Hà Nội", address: "L2-07, Tầng L2, Vincom Plaza Skylake, Khu đô thị mới Cầu Giấy, P Mỹ Đình 1, Quận Nam Từ Liêm" },
  { id: 8, name: "Vincom Phạm Ngọc Thạch", city: "Hà Nội", address: "L4-04, Tầng 04, Vincom Center Phạm Ngọc Thạch, 02 Phạm Ngọc Thạch, P Kim Liên, Quận Đống Đa" },
  { id: 9, name: "Face Wash Fox - Starlake", city: "Hà Nội", address: "Shophouse 903B - TM1 - 3, tầng 1, Tòa nhà 903, lô H9-CT1, Khu trung tâm Khu đô thị Tây Hồ Tây, Phường Xuân Đỉnh Hà Nội, Khu đô thị Tây Hồ Tây, Hanoi City, Hà Nội 100000" },
  { id: 10, name: "Vinhome Green Bay - Đại Lộ Thăng Long", city: "Hà Nội", address: "Số 7 Đại Lộ Thăng Long, Hà Nội" },
  { id: 11, name: "Hanoi Tower", city: "Hà Nội", address: "69 Thợ Nhuộm - Hanoi Centre - 175 Nguyễn Thái Học ( Tiến bộ Plaza)" },
  { id: 48, name: "Times City", city: "Hà Nội", address: "Vinhomes Park Hill Times City - 458 Phố Minh Khai, Phường Vĩnh Tuy Ha Noi, Hanoi City, 100000, Việt Nam" },
  { id: 49, name: "Lotte Liễu Giai", city: "Hà Nội", address: "Tầng 2, Lotte Department Store, Tòa nhà Lotte Center, 54 Liễu Giai, quận Ba Đình, Hà Nội, Việt Nam" },
  { id: 50, name: "Vincom Plaza Bắc Từ Liêm", city: "Hà Nội", address: "Gian hàng B1-08, tầng B1, số 234 Phạm Văn Đồng, P. Phú Diễn" },
  { id: 54, name: "Aeon Mall Hà Đông", city: "Hà Nội", address: "T105-1 Tổ dân phố Hoàng Văn Thụ, Phường Dương Nội, Thành phố Hà Nội" },

  { id: 12, name: "Parc Mall", city: "Hồ Chí Minh", address: "Tầng G, Glam Beautique, Lô [COS-03], 547 - 549 Tạ Quang Bửu, P.4, Quận 8" },
  { id: 13, name: "Vincom Center Landmark 81 - Lầu 3", city: "Hồ Chí Minh", address: "720A Điện Biên Phủ, Quận Bình Thạnh, TP.Hồ Chí Minh" },
  { id: 14, name: "Vincom Mega Mall Thảo Điền - Lầu 3", city: "Hồ Chí Minh", address: "161 Võ Nguyên Giáp, Phường Thảo Điền, TP.Thủ Đức" },
  { id: 15, name: "The Sun Avenue - SAV3", city: "Hồ Chí Minh", address: "28 Mai Chí Thọ, Phường An Phú, TP.Thủ Đức" },
  { id: 16, name: "Vincom Plaza - Phan Văn Trị", city: "Hồ Chí Minh", address: "Lầu 3, 12 Phan Văn Trị, Phường 5, Quận Gò Vấp, TP.Hồ Chí Minh" },
  { id: 17, name: "Vincom Plaza - Quang Trung", city: "Hồ Chí Minh", address: "Lầu 1, 190 Quang Trung, Phường 10, Quận Gò Vấp, TP.Hồ Chí Minh" },
  { id: 18, name: "Vincom Plaza - Lê Văn Việt", city: "Hồ Chí Minh", address: "Lầu 3, 50 Lê Văn Việt, Phường Hiệp Phú, TP.Thủ Đức" },
  { id: 19, name: "Vista Verde", city: "Hồ Chí Minh", address: "2 Phan Văn Đáng, Phường Thạnh Mỹ Lợi, TP.Thủ Đức" },
  { id: 20, name: "Crescent Mall", city: "Hồ Chí Minh", address: "101 Tôn Dật Tiên, Phường Tân Phú, Quận 7, TP.Hồ Chí Minh" },
  { id: 21, name: "Botanica - Phổ Quang", city: "Hồ Chí Minh", address: "104 Phổ Quang, Phường 2, Quận Tân Bình, TP.Hồ Chí Minh" },
  { id: 22, name: "The Everrich Infinity", city: "Hồ Chí Minh", address: "290 An Dương Vương, Phường 4, Quận 5, TP. Hồ Chí Minh" },
  { id: 23, name: "Hoa Lan - Phú Nhuận", city: "Hồ Chí Minh", address: "89 Hoa Lan, Phường 2, Cầu Kiệu, Hồ Chí Minh 70000, Việt Nam" },
  { id: 24, name: "Võ Thị Sáu", city: "Hồ Chí Minh", address: "100 đường Võ Thị Sáu, Phường Tân Định, Quận 1" },
  { id: 25, name: "MVillage - Trương Định", city: "Hồ Chí Minh", address: "14 Trương Định, Toà nhà M – Village, Phường 6, Quận 3, TP. Hồ Chí Minh" },
  { id: 26, name: "AEON MALL TÂN PHÚ", city: "Hồ Chí Minh", address: "Tầng 2, Lô S14 TTTM Aeon Mall Celadon Tân Phú, Số 30 đường Tân Thắng, phường Sơn Kỳ, quận Tân Phú, TP. Hồ Chí Minh" },
  { id: 27, name: "Riviera Point - Quận 7", city: "Hồ Chí Minh", address: "Toà 3, Đường số 2, Nguyễn Văn Tưởng, P. An Phú, Quận 7, TP. Hồ Chí Minh" },
  { id: 28, name: "The Symphony - Midtown M6", city: "Hồ Chí Minh", address: "Tòa M6, Midtown Phú Mỹ Hưng, Đường 16, Tân Phú, Quận 7" },
  { id: 29, name: "Estella Height - Thủ Đức", city: "Hồ Chí Minh", address: "Tầng 3, Estella Height, 88 Song Hành, An Phú, Thủ Đức" },
  { id: 30, name: "SC VivoCity", city: "Hồ Chí Minh", address: "Tầng 2, SC VivoCity, 1058 Nguyễn Văn Linh, Tân Phong, Quận 7" },
  { id: 31, name: "AEON MALL Bình Tân", city: "Hồ Chí Minh", address: "Tầng trệt, Aeon Mall Bình Tân, 1 Đ. Số 17A, Bình Trị Đông B, Bình Tân" },
  { id: 32, name: "NOWZONE Fashion Mall", city: "Hồ Chí Minh", address: "TTTM Nowzone – Lầu 1-118, 235, Nguyễn Văn Cừ, P.Nguyễn Cư Trinh, Q.1, HCM" },
  { id: 33, name: "Saigon Centre", city: "Hồ Chí Minh", address: "Tầng 6 – Số 65 Lê Lợi, P. Bến Nghé, Quận 1" },
  { id: 34, name: "1B Sương Nguyệt Ánh", city: "Hồ Chí Minh", address: "1B Sương Nguyệt Ánh, P. Bến Thành, Quận 1" },
  { id: 35, name: "MVillage - Thi Sách", city: "Hồ Chí Minh", address: "Số 26 Thi Sách, P. Bến Nghé, Quận 1" },
  { id: 38, name: "Vincom 3/2 - L4-03", city: "Hồ Chí Minh", address: "L4-03, 3C Đường 3/2, P. 10, Quận 10" },
  { id: 39, name: "Face Wash Fox - Marina", city: "Hồ Chí Minh", address: "Tầng 3 - L2.03, 2 Tôn Đức Thắng, Phường Sài Gòn, Quận 1, Hồ Chí Minh 700000" },
  { id: 40, name: "Lumiere", city: "Hồ Chí Minh", address: "275 Võ Nguyên Giáp, An Phú, Thủ Đức, Hồ Chí Minh 700000" },
  { id: 45, name: "Đảo Kim Cương", city: "Hồ Chí Minh", address: "Shophouse B2.1G, Tháp 3 (Brilliant), Dự án Đảo Kim Cương, Số 01 Trần Quý Kiên, Phường Bình Trưng" },
  { id: 46, name: "Vincom Saigonres", city: "Hồ Chí Minh", address: "188 Đ. Nguyễn Xí, Phường 26, Bình Thạnh, Hồ Chí Minh, Việt Nam" },
  { id: 47, name: "Saigon Pearl", city: "Hồ Chí Minh", address: "92 Nguyễn Hữu Cảnh, Saigon Pearl, Bình Thạnh, Hồ Chí Minh 700000, Việt Nam" },
  { id: 51, name: "Face Wash Fox - Vincom Mega Mall Grand Park", city: "Hồ Chí Minh", address: "Đường D2A, Khu đô thị, Vinhomes Grand Park, Thành phố Hồ Chí Minh, 700000" },
  { id: 55, name: "Face Wash Fox - Thiso Mall", city: "Hồ Chí Minh", address: "L1-17A, 10 Mai Chí Thọ, Thủ Thiêm, An Khánh, Hồ Chí Minh." },

  { id: 41, name: "177 Trần Phú", city: "Đà Nẵng", address: "177 Trần Phú, P. Hải Châu, TP. Đà Nẵng" },
  { id: 56, name: "Aeon Đà Nẵng", city: "Đà Nẵng", address: "46 Điện Biên Phủ, Thanh Khê, Đà Nẵng 550000, Việt Nam" },
  { id: 42, name: "Joi Boutique Bãi Trước", city: "Vũng Tàu", address: "Số 04 Thống Nhất, Phường 1, TP Vũng Tàu" },
  { id: 44, name: "Gold Coast Nha Trang", city: "Nha Trang", address: "Tầng 04, Số 01 Trần Hưng Đạo, P. Lộc Thọ, TP Nha Trang, Khánh Hòa" },
  { id: 52, name: "Aeon Mall Hải Phòng", city: "Hải Phòng", address: "Glam Beautique - Tầng 1 10 Võ Nguyên Giáp, Phường, Lê Chân, Hải Phòng Hải Phòng, Haiphong City, 04067" },
  { id: 53, name: "Vincom Imperia Hải Phòng", city: "Hải Phòng", address: "1 Bạch Đằng, Phường, Hồng Bàng, Hải Phòng 04067, Vietnam" }
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
export const STORE_BRANCH_BY_ID = new Map(STORE_BRANCHES.map((branch) => [branch.id, branch]));

export function getStoreRegionsForBranchIds(branchIds: number[] | undefined) {
  const regions = new Set<StoreRegion>();
  for (const branchId of branchIds ?? []) {
    const branch = STORE_BRANCH_BY_ID.get(branchId);
    if (branch && STORE_REGIONS.includes(branch.city as StoreRegion)) {
      regions.add(branch.city as StoreRegion);
    }
  }
  return Array.from(regions);
}

export function getStoreBranchesByRegions(regions: StoreRegion[]) {
  const regionSet = new Set(regions);
  return STORE_BRANCHES.filter((branch) => regionSet.has(branch.city as StoreRegion));
}

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
