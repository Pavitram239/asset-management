export const USER_DEPARTMENTS = {
  KITCHEN: "kitchen",
  ACCOUNTS: "accounts",
  DECORATION: "decoration",
  ALL: "all",
};

export const PRODUCT_STATUS = {
  IN_DEPT: "In department",
  NOT_IN_DEPT: "Not in Department",
  OUT_OF_CAMPUS: "Out of campus",
};

export const WARRANTY_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
};

export const PRODUCT_SORT_BY = {
  NEWEST_FIRST: "newest",
  OLDEST_FIRST: "oldest",
  ASCENDING: "a-z",
  DESCENDING: "z-a",
};

export const FIELDS = [
  { name: "invoice", type: "file", label: "Invoice" },
  { name: "warrantyDate", type: "date", label: "Warranty Date" },
  { name: "customerCare", type: "text", label: "Customer Care" },
  { name: "power", type: "text", label: "Power" },
  { name: "capacity", type: "text", label: "Capacity" },
  { name: "serialNumber", type: "text", label: "Serial Number" },
];
