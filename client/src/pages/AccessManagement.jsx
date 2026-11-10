import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import customFetch from "../utils/customFetch";
import { useDashboardContext } from "./DashboardLayout";
import { hasPermission } from "../utils/permissions";
import DesignIcon from "../components/DesignIcon";
import Modal from "../components/Modal";

const Input = ({ label, help, ...props }) => (
  <label className="form-row">
    <span className="form-label">{label}</span>
    <input className="form-input" {...props} />
    {help && <span className="caption">{help}</span>}
  </label>
);

const Select = ({ label, help, children, ...props }) => (
  <label className="form-row">
    <span className="form-label">{label}</span>
    <select className="form-select" aria-label={label} {...props}>
      {children}
    </select>
    {help && <span className="caption">{help}</span>}
  </label>
);

const FormSection = ({ title, subtitle, onSubmit, children, busy, submitText = "Save" }) => (
  <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
    <div>
      <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>{title}</h3>
      {subtitle && <p className="caption" style={{ marginTop: '4px' }}>{subtitle}</p>}
    </div>
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {children}
      <button className="btn" disabled={busy} style={{ alignSelf: 'flex-start', minWidth: '130px' }}>
        {busy ? "Saving…" : submitText}
      </button>
    </form>
  </section>
);

Input.propTypes = { label: PropTypes.string.isRequired, help: PropTypes.string };
Select.propTypes = {
  label: PropTypes.string.isRequired,
  help: PropTypes.string,
  children: PropTypes.node,
};
FormSection.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  children: PropTypes.node,
  busy: PropTypes.bool,
  submitText: PropTypes.string,
};

const dataOf = (event) =>
  Object.fromEntries(new FormData(event.currentTarget).entries());

const PERMISSION_LABELS = {
  // Assets & Products
  "asset.read": { label: "View Assets", desc: "Browse and view physical asset records" },
  "asset.create": { label: "Add Assets", desc: "Register physical assets and print QR codes" },
  "asset.update": { label: "Edit Assets", desc: "Update asset status, metadata, and custody" },
  "asset.delete": { label: "Delete Assets", desc: "Permanently delete physical asset records" },
  "asset.file.read": { label: "Download Attachments", desc: "View invoices, warranties, and file attachments" },

  // Requisitions & Approvals
  "requisition.create": { label: "Request Equipment", desc: "Submit asset and equipment requisition requests" },
  "requisition.read": { label: "View Requisitions", desc: "Inspect department or workspace asset requisitions" },
  "requisition.approve": { label: "Approve Requisitions", desc: "Authorize or reject submitted asset requests" },
  "requisition.fulfill": { label: "Issue & Return Assets", desc: "Handover physical assets and inspect returned units" },

  // Catalog & Categories
  "catalog.read": { label: "View Catalog", desc: "Browse catalog definitions and item specifications" },
  "catalog.manage": { label: "Manage Catalog", desc: "Create, edit, or archive catalog product models" },
  "catalog.requestable.read": { label: "View Requisitions", desc: "Browse items eligible for internal requests" },
  "category.manage": { label: "Manage Categories", desc: "Configure physical asset categories & schema" },
  "unit.manage": { label: "Manage Units", desc: "Configure measurement units (pcs, boxes, sets)" },

  // Inventory & Stock
  "inventory.read": { label: "View Stock & Ledger", desc: "Inspect warehouse stock balances and ledger postings" },
  "inventory.opening": { label: "Set Opening Balances", desc: "Post initial inventory balances for stock accounts" },
  "location.manage": { label: "Manage Locations", desc: "Add and organize campus facilities, rooms, and shelves" },

  // Team & Departments
  "membership.manage": { label: "Manage Members", desc: "Add members, change statuses, and invite colleagues" },
  "department.manage": { label: "Manage Departments", desc: "Create and manage organizational custody units" },
  "directory.read": { label: "View Team Directory", desc: "Access the company team directory and employee list" },

  // Company & Ownership
  "organization.create": { label: "Create Companies", desc: "Spawn new standalone company organizations" },
  "organization.manage": { label: "Company Settings", desc: "Configure company currency, timezone, and name" },
  "ownership.manage": { label: "Ownership Transfers", desc: "Appoint or transfer legal company owners" },

  // Governance & Security
  "role.manage": { label: "Manage Roles", desc: "Define standard roles and assign permission bundles" },
  "access.manage": { label: "Assign Access & Grants", desc: "Assign roles to members and configure scopes" },
  "audit.read": { label: "View Audit Logs", desc: "Review the tamper-evident security and activity ledger" },
  "statistics.read": { label: "View Analytics", desc: "Access high-level workspace statistics and metrics" },
};

const ROLE_PRESETS = [
  {
    name: "Inventory Manager",
    icon: "📦",
    desc: "Full custody over assets, catalog, stock & categories",
    permissions: [
      "asset.read", "asset.create", "asset.update", "asset.delete", "asset.file.read",
      "catalog.read", "catalog.manage", "catalog.requestable.read", "category.manage", "unit.manage",
      "inventory.read", "inventory.opening", "location.manage",
      "directory.read",
    ],
  },
  {
    name: "Asset Auditor / Inspector",
    icon: "🔍",
    desc: "Read-only audit access to assets, stock ledger & audit logs",
    permissions: [
      "asset.read", "asset.file.read",
      "catalog.read", "catalog.requestable.read",
      "inventory.read",
      "audit.read", "statistics.read",
      "directory.read",
    ],
  },
  {
    name: "Warehouse Storekeeper",
    icon: "🏬",
    desc: "Day-to-day asset check-in, tagging, stock updates & store issuance",
    permissions: [
      "asset.read", "asset.create", "asset.update", "asset.file.read",
      "requisition.read", "requisition.fulfill",
      "catalog.read", "catalog.requestable.read",
      "inventory.read",
      "directory.read",
    ],
  },
  {
    name: "Team Lead / Custodian",
    icon: "👥",
    desc: "Manage team custody, departments, requisition approvals & equipment",
    permissions: [
      "asset.read", "asset.file.read",
      "requisition.read", "requisition.approve", "requisition.create",
      "department.manage", "directory.read",
      "catalog.requestable.read",
    ],
  },
  {
    name: "Workspace Admin",
    icon: "🛡️",
    desc: "Full administrative access across all workspace functions",
    permissions: "ALL",
  },
];

const getRoleCategoryBadges = (role) => {
  const cats = [];
  if (!role?.permissions) return cats;
  if (role.permissions.some((p) => p.startsWith("asset."))) cats.push("Assets");
  if (role.permissions.some((p) => p.startsWith("requisition."))) cats.push("Requisitions");
  if (role.permissions.some((p) => p.startsWith("catalog.") || p.startsWith("category.") || p.startsWith("unit."))) cats.push("Catalog");
  if (role.permissions.some((p) => p.startsWith("inventory.") || p.startsWith("location."))) cats.push("Inventory");
  if (role.permissions.some((p) => p.startsWith("membership.") || p.startsWith("department.") || p.startsWith("directory."))) cats.push("Team");
  if (role.permissions.some((p) => p.startsWith("organization.") || p.startsWith("ownership."))) cats.push("Workspace");
  if (role.permissions.some((p) => p.startsWith("role.") || p.startsWith("access.") || p.startsWith("audit.") || p.startsWith("statistics."))) cats.push("Governance");
  return cats;
};

const AUDIT_ACTION_MAP = {
  "organization.create": { label: "Create Workspace", icon: "🏢", cat: "Workspace", bg: "#f0fdf4", color: "#166534" },
  "organization.update": { label: "Update Workspace", icon: "⚙️", cat: "Workspace", bg: "#f0fdf4", color: "#166534" },
  "organization.status": { label: "Change Status", icon: "🔄", cat: "Workspace", bg: "#fef3c7", color: "#92400e" },
  "membership.create": { label: "Add Member", icon: "👤", cat: "Team", bg: "#eff6ff", color: "#1e40af" },
  "membership.update": { label: "Update Member", icon: "✏️", cat: "Team", bg: "#eff6ff", color: "#1e40af" },
  "membership.invite": { label: "Invite Colleague", icon: "✉️", cat: "Team", bg: "#eff6ff", color: "#1e40af" },
  "department.create": { label: "Add Department", icon: "🏬", cat: "Team", bg: "#eff6ff", color: "#1e40af" },
  "department.update": { label: "Update Department", icon: "🏢", cat: "Team", bg: "#eff6ff", color: "#1e40af" },
  "role.create": { label: "Create Role", icon: "🛡️", cat: "Access", bg: "#faf5ff", color: "#6b21a8" },
  "role.update": { label: "Update Role", icon: "🛠️", cat: "Access", bg: "#faf5ff", color: "#6b21a8" },
  "role.assign": { label: "Assign Role", icon: "🔑", cat: "Access", bg: "#faf5ff", color: "#6b21a8" },
  "role.revoke": { label: "Revoke Role", icon: "🚫", cat: "Access", bg: "#fef2f2", color: "#991b1b" },
  "ownership.appoint": { label: "Appoint Owner", icon: "👑", cat: "Governance", bg: "#fffbeb", color: "#b45309" },
  "requisition.create": { label: "Submit Requisition", icon: "📝", cat: "Requisitions", bg: "#f0fdfa", color: "#0f766e" },
  "requisition.approve": { label: "Approve Requisition", icon: "✅", cat: "Requisitions", bg: "#f0fdf4", color: "#166534" },
  "requisition.reject": { label: "Reject Requisition", icon: "❌", cat: "Requisitions", bg: "#fef2f2", color: "#991b1b" },
  "requisition.fulfill": { label: "Issue Asset", icon: "📦", cat: "Requisitions", bg: "#eff6ff", color: "#1e40af" },
  "requisition.return": { label: "Return Inspection", icon: "🔄", cat: "Requisitions", bg: "#f0fdfa", color: "#0f766e" },
  "asset.create": { label: "Register Asset", icon: "🏷️", cat: "Assets", bg: "#f0fdfa", color: "#0f766e" },
  "asset.update": { label: "Update Asset", icon: "🔧", cat: "Assets", bg: "#f0fdfa", color: "#0f766e" },
  "asset.delete": { label: "Delete Asset", icon: "🗑️", cat: "Assets", bg: "#fef2f2", color: "#991b1b" },
  "migration.legacy_inventory": { label: "Inventory Migration", icon: "⚡", cat: "System", bg: "#f1f5f9", color: "#475569" },
};

const getAuditActionMeta = (action) => {
  if (AUDIT_ACTION_MAP[action]) return AUDIT_ACTION_MAP[action];
  const parts = (action || "").split(".");
  const label = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return { label: label || action, icon: "⚡", cat: parts[0] ? (parts[0].charAt(0).toUpperCase() + parts[0].slice(1)) : "System", bg: "#f1f5f9", color: "#334155" };
};

const getGrantCategory = (permission) => {
  if (permission.startsWith("requisition.")) return "requisitions";
  if (permission.startsWith("asset.") || permission.startsWith("inventory.") || permission.startsWith("catalog.") || permission.startsWith("category.") || permission.startsWith("unit.") || permission.startsWith("location.")) {
    return "assets";
  }
  if (permission.startsWith("membership.") || permission.startsWith("department.") || permission.startsWith("directory.")) {
    return "team";
  }
  if (permission.startsWith("organization.") || permission.startsWith("ownership.")) {
    return "workspace";
  }
  if (permission.startsWith("role.") || permission.startsWith("access.") || permission.startsWith("audit.") || permission.startsWith("statistics.")) {
    return "governance";
  }
  return "other";
};

const renderTargetBadge = (target, data) => {
  if (!target) return <span style={{ color: "var(--text-secondary-color)" }}>—</span>;
  if (target === data?.organization?.id) {
    return (
      <span
        className="status-pill status-neutral"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
        title={`Company ID: ${target}`}
      >
        🏢 <strong>{data.organization.name}</strong>
      </span>
    );
  }
  const member = data?.memberships?.find((m) => m.id === target);
  if (member) {
    return (
      <span
        className="status-pill status-neutral"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}
        title={`User ID: ${target}`}
      >
        👤 <strong>{member.name}</strong>
      </span>
    );
  }
  const role = data?.roles?.find((r) => r.id === target);
  if (role) {
    return (
      <span
        className="status-pill status-neutral"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "#faf5ff", color: "#6b21a8", border: "1px solid #e9d5ff" }}
        title={`Role ID: ${target}`}
      >
        🛡️ <strong>{role.name}</strong>
      </span>
    );
  }
  const dept = data?.departments?.find((d) => d.code === target);
  if (dept) {
    return (
      <span
        className="status-pill status-neutral"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}
        title={`Dept Code: ${target}`}
      >
        🏬 <strong>{dept.name || dept.code}</strong>
      </span>
    );
  }
  if (typeof target === "string" && target.length === 36 && target.includes("-")) {
    return (
      <code
        style={{ fontSize: "11px", background: "var(--grey-100)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-secondary-color)" }}
        title={target}
      >
        🏷️ #{target.slice(0, 8)}…
      </code>
    );
  }
  return <span style={{ fontSize: "12px", color: "var(--text-color)" }}>{target}</span>;
};

const renderActorBadge = (actorId, actorName, data) => {
  if (actorName) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "var(--primary-500)",
            color: "white",
            fontSize: "10px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {actorName.charAt(0).toUpperCase()}
        </span>
        <span style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-color)" }}>{actorName}</span>
      </div>
    );
  }
  const member = data?.memberships?.find((m) => m.id === actorId);
  if (member) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "var(--primary-500)",
            color: "white",
            fontSize: "10px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {(member.name || "U").charAt(0).toUpperCase()}
        </span>
        <span style={{ fontWeight: 500, fontSize: "12px", color: "var(--text-color)" }}>{member.name}</span>
      </div>
    );
  }
  return (
    <span className="caption" style={{ fontStyle: "italic", fontSize: "11px", color: "var(--text-secondary-color)" }}>
      ⚡ System / Setup
    </span>
  );
};

export default function AccessManagement() {
  const { user, activeOrganizationId, refreshAccess } = useDashboardContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const activeTab = ["members", "departments", "roles", "organization", "security"].includes(urlTab) ? urlTab : "members";
  const setActiveTab = (tab) => {
    setSearchParams({ tab });
  };
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddDeptModal, setShowAddDeptModal] = useState(false);
  const [memberFilter, setMemberFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [showAdvancedGrants, setShowAdvancedGrants] = useState(false);
  const [roleNameInput, setRoleNameInput] = useState("");
  const [presetNotice, setPresetNotice] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState("all");
  const [auditCategoryFilter, setAuditCategoryFilter] = useState("all");
  const [pendingOwnerAppointment, setPendingOwnerAppointment] = useState(null);

  const [roleId, setRoleId] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [events, setEvents] = useState(null);
  const [effective, setEffective] = useState(null);
  const [inspectedMemberId, setInspectedMemberId] = useState("");
  const [inspectedGrantSearch, setInspectedGrantSearch] = useState("");
  const [grantsCategoryFilter, setGrantsCategoryFilter] = useState("all");
  const [grantsSearch, setGrantsSearch] = useState("");
  const [selectedAuditDetail, setSelectedAuditDetail] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const commandKeys = useRef(new Map());
  const writing = useRef(false);

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      setData((await customFetch.get("/access/management")).data);
      setError("");
    } catch (e) {
      setError(e.response?.data?.msg || "Unable to load access settings");
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    setError("");
    try {
      const res = await customFetch.get("/access/audit");
      setEvents(res.data.events);
    } catch (e) {
      setError(e.response?.data?.msg || "Unable to load audit log");
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security" && events === null && !loadingAudit && hasPermission(user, "audit.read")) {
      loadAudit();
    }
  }, [activeTab, events, loadingAudit, user, loadAudit]);

  const run = async (method, path, body) => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ownership = path.startsWith("/ownership/");
      const intent = JSON.stringify({ method, path, body, activeOrganizationId });
      if (ownership && !commandKeys.current.has(intent)) {
        commandKeys.current.set(intent, crypto.randomUUID());
      }
      await customFetch.request({
        method,
        url: ownership ? path : "/access" + path,
        data: body,
        ...(ownership
          ? { headers: { "Idempotency-Key": commandKeys.current.get(intent) } }
          : {}),
      });
      if (ownership) commandKeys.current.delete(intent);
      setNotice("Changes saved successfully.");
      await load();
      refreshAccess();
      return true;
    } catch (e) {
      setError(e.response?.data?.msg || "Unable to save changes");
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const submit =
    (method, path, convert = (x) => x) =>
    (event) => {
      event.preventDefault();
      run(method, path, convert(dataOf(event)));
    };

  const can = (p) => hasPermission(user, p);

  if (!activeOrganizationId) {
    return (
      <div className="panel empty-state">
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '8px' }}>
          <DesignIcon name="users" />
        </div>
        <h2>Access Management</h2>
        <p>You must have an active company workspace selected to configure permissions, roles, and members.</p>
        <Link to="/dashboard/workspaces" className="btn" style={{ marginTop: '8px' }}>
          Go to Workspaces
        </Link>
      </div>
    );
  }

  const hasAccessPermission = [
    'access.manage',
    'role.manage',
    'department.manage',
    'membership.manage',
    'organization.manage',
    'ownership.manage',
    'audit.read',
  ].some((p) => can(p));

  if (!hasAccessPermission) {
    return (
      <div className="panel empty-state">
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#991b1b', marginBottom: '8px' }}>
          <DesignIcon name="close" />
        </div>
        <h2>Access Denied</h2>
        <p>You do not have administrative permission to view or manage company access settings.</p>
        <Link to="/dashboard" className="btn" style={{ marginTop: '8px' }}>
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (!data) return <p role="status">{error || "Loading access settings…"}</p>;

  const memberOptions = data.memberships
    .filter((m) => m.id !== user._id)
    .map((m) => (
      <option key={m.id} value={m.id}>
        {m.name} ({m.email})
      </option>
    ));

  const departmentOptions = data.departments
    .filter((d) => d.active)
    .map((d) => (
      <option key={d.code} value={d.code}>
        {d.name}
      </option>
    ));

  const selectedMember = selectedMemberId
    ? data.memberships.find((m) => m.id === selectedMemberId)
    : null;
  const memberAssignments = selectedMemberId
    ? (data.assignments || []).filter((a) => a.user_id === selectedMemberId)
    : [];
  const memberGrants = selectedMemberId
    ? (data.directGrants || []).filter((g) => g.user_id === selectedMemberId)
    : [];

  const scopeFields = (
    <div className="field-grid">
      <Select label="Scope *" name="scope">
        <option value="organization">Organization (All assets & locations)</option>
        <option value="department">Department specific</option>
        <option value="location">Location & descendants</option>
        <option value="self">Self (Assigned assets only)</option>
      </Select>
      <Select label="Location (for Location scope)" name="locationId">
        <option value="">None</option>
        {(data.locations || [])
          .filter((loc) => loc.active)
          .map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
      </Select>
      <Select label="Department (for Department scope)" name="department">
        <option value="">None</option>
        {departmentOptions}
      </Select>
    </div>
  );

  // Group permissions logically into clear categories
  const permissionCategories = [
    {
      title: "📦 Assets & Products",
      keys: ["asset.read", "asset.create", "asset.update", "asset.delete", "asset.file.read"],
    },
    {
      title: "📝 Requisitions & Approvals",
      keys: ["requisition.create", "requisition.read", "requisition.approve", "requisition.fulfill"],
    },
    {
      title: "📋 Catalog & Categories",
      keys: ["catalog.read", "catalog.manage", "catalog.requestable.read", "category.manage", "unit.manage"],
    },
    {
      title: "🏬 Inventory & Stock",
      keys: ["inventory.read", "inventory.opening", "location.manage"],
    },
    {
      title: "👥 Team & Departments",
      keys: ["membership.manage", "department.manage", "directory.read"],
    },
    {
      title: "🏢 Workspace & Ownership",
      keys: ["organization.create", "organization.manage", "ownership.manage"],
    },
    {
      title: "🔒 Governance & Audit",
      keys: ["role.manage", "access.manage", "audit.read", "statistics.read"],
    },
  ];

  const categorizedKeys = new Set(permissionCategories.flatMap((c) => c.keys));
  const remainingKeys = data.permissions.filter((p) => !categorizedKeys.has(p));
  if (remainingKeys.length > 0) {
    permissionCategories.push({
      title: "⚙️ Additional Permissions",
      keys: remainingKeys,
    });
  }

  const applyPreset = (preset) => {
    const newPerms =
      preset.permissions === "ALL"
        ? [...data.permissions]
        : preset.permissions.filter((p) => data.permissions.includes(p));
    setSelectedPermissions(newPerms);
    if (!roleNameInput.trim()) {
      setRoleNameInput(preset.name);
    }
    setPresetNotice(
      `Applied "${preset.name}" preset (${newPerms.length} permissions selected)`
    );
  };

  const sectionHeaders = {
    members: {
      title: "Team Members",
      subtitle: `${data.organization.name} · Manage workspace members, department assignments, and access status.`,
    },
    departments: {
      title: "Departments",
      subtitle: `${data.organization.name} · Organize operational divisions, department codes, and asset custody units.`,
    },
    roles: {
      title: "Roles & Permissions",
      subtitle: `${data.organization.name} · Define standard roles, assign permission packages, and manage member scope.`,
    },
    organization: {
      title: "Company & Ownership",
      subtitle: `${data.organization.name} · Configure baseline currency, timezone, and legal company ownership.`,
    },
    security: {
      title: "Audit & Security Log",
      subtitle: `${data.organization.name} · Tamper-evident ledger of authorization events and effective access audit.`,
    },
  };

  const currentHeader = sectionHeaders[activeTab] || sectionHeaders.members;

  return (
    <>
      <div className="page-heading">
        <h2>{currentHeader.title}</h2>
        <p>{currentHeader.subtitle}</p>
      </div>

      {error && (
        <div role="alert" className="form-error" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={load} style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12px' }}>
            Reload Settings
          </button>
        </div>
      )}

      {notice && (
        <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DesignIcon name="check" />
          <span>{notice}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: TEAM MEMBERS                                            */}
      {/* ============================================================== */}
      {activeTab === "members" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Active Members ({data.memberships.length})</h3>
                <p className="caption" style={{ margin: 0, marginTop: '2px' }}>Colleagues with authorized access to this company workspace.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Filter by name or email…"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  style={{
                    minHeight: '36px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--grey-200)',
                    background: 'var(--background-secondary-color)',
                    color: 'var(--text-color)',
                    fontSize: '13px',
                    width: '220px',
                  }}
                />
                {can("membership.manage") && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAddMemberModal(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 16px' }}
                  >
                    <DesignIcon name="plus" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>
            </div>

            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Assigned Roles</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.memberships
                    .filter((m) => {
                      if (!memberFilter.trim()) return true;
                      const q = memberFilter.toLowerCase();
                      return (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q);
                    })
                    .map((m) => {
                      const isSelf = m.id === user._id;
                      const assignments = (data.assignments || []).filter((a) => a.user_id === m.id);
                      const grants = (data.directGrants || []).filter((g) => g.user_id === m.id);

                      return (
                        <tr key={m.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-500)', color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>
                                {(m.name || 'U').charAt(0).toUpperCase()}
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                                {m.name} {isSelf && <small style={{ color: 'var(--accent)', fontWeight: 500 }}>(You)</small>}
                              </span>
                            </div>
                          </td>
                          <td>{m.email}</td>
                          <td>
                            {can("membership.manage") && !isSelf ? (
                              <form
                                style={{ display: 'flex', gap: '6px', alignItems: 'center', margin: 0 }}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  run("patch", `/members/${m.id}`, dataOf(e));
                                }}
                              >
                                <select
                                  name="department"
                                  defaultValue={m.department || ""}
                                  style={{ minHeight: '34px', padding: '4px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--grey-200)', background: 'var(--background-secondary-color)', color: 'var(--text-color)' }}
                                >
                                  <option value="">None (Unassigned)</option>
                                  {departmentOptions}
                                </select>
                                <button className="btn btn-secondary" disabled={busy} style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}>
                                  Save
                                </button>
                              </form>
                            ) : (
                              <span style={{ color: m.department ? 'var(--text-color)' : 'var(--text-secondary-color)' }}>
                                {m.department || "—"}
                              </span>
                            )}
                          </td>
                          <td>
                            {assignments.length === 0 && grants.length === 0 ? (
                              <span className="caption" style={{ fontStyle: 'italic' }}>No role assigned</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {assignments.map((a) => {
                                  const role = data.roles.find((r) => r.id === a.role_id);
                                  const scopeLabel = a.scope === 'organization' ? 'Org' : a.scope === 'department' ? (a.department_code || 'Dept') : a.scope === 'location' ? 'Loc' : 'Self';
                                  return (
                                    <span
                                      key={a.id}
                                      className="status-pill status-neutral"
                                      style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <strong style={{ color: 'var(--text-color)' }}>{role?.name || a.role_id}</strong>
                                      <span style={{ opacity: 0.65, fontSize: '10px' }}>({scopeLabel})</span>
                                    </span>
                                  );
                                })}
                                {grants.length > 0 && (
                                  <span
                                    className="status-pill status-neutral"
                                    style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--grey-100)', color: 'var(--grey-700)' }}
                                    title={grants.map(g => g.permission_id).join(', ')}
                                  >
                                    +{grants.length} direct
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-pill ${m.active ? 'status-success' : 'status-muted'}`}>
                              {m.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {can("access.manage") && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => setSelectedMemberId(m.id)}
                                  style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  title="Manage member roles and scope"
                                >
                                  <span>Roles</span>
                                  <span style={{ background: 'var(--grey-200)', borderRadius: '10px', padding: '0 5px', fontSize: '10px', fontWeight: 600 }}>
                                    {assignments.length}
                                  </span>
                                </button>
                              )}
                              {can("membership.manage") && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={busy || isSelf}
                                  onClick={() => run("patch", `/members/${m.id}`, { active: !m.active })}
                                  style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                                >
                                  {m.active ? "Deactivate" : "Activate"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Add Member Modal Dialog */}
          {showAddMemberModal && (
            <Modal open onClose={() => setShowAddMemberModal(false)} variant="fields">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Add Team Member</h3>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Grant workspace membership to an existing registered AssetOS user.
                  </p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await run("post", "/members", dataOf(e));
                    if (ok) setShowAddMemberModal(false);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                  <Input
                    label="Registered Email Address *"
                    name="email"
                    type="email"
                    placeholder="colleague@example.com"
                    required
                    autoFocus
                  />
                  <Select label="Initial Department" name="department">
                    <option value="">None (Unassigned)</option>
                    {departmentOptions}
                  </Select>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setShowAddMemberModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn" disabled={busy}>
                      {busy ? "Adding…" : "Add Member"}
                    </button>
                  </div>
                </form>
              </div>
            </Modal>
          )}

          {/* Member Roles Management Modal */}
          {selectedMember && (
            <Modal open onClose={() => setSelectedMemberId(null)} variant="fields">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                    Manage Roles: {selectedMember.name}
                  </h3>
                  <p className="caption" style={{ marginTop: '2px' }}>
                    {selectedMember.email} · {selectedMember.department ? `Department: ${selectedMember.department}` : 'No department'}
                  </p>
                </div>

                {/* Current Assignments */}
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
                    Assigned Roles ({memberAssignments.length})
                  </h4>
                  {memberAssignments.length === 0 ? (
                    <p className="caption" style={{ margin: 0, padding: '10px 12px', background: 'var(--background-color)', borderRadius: '6px', border: '1px solid var(--grey-200)' }}>
                      No roles assigned to this member yet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {memberAssignments.map((a) => {
                        const role = data.roles.find((r) => r.id === a.role_id);
                        const location = (data.locations || []).find((l) => l.id === a.location_id);
                        const isSelf = selectedMember.id === user._id;

                        return (
                          <div
                            key={a.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              background: 'var(--background-color)',
                              border: '1px solid var(--grey-200)',
                              borderRadius: '8px',
                              gap: '10px',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '13px', display: 'block', color: 'var(--text-color)' }}>
                                {role?.name || a.role_id}
                              </strong>
                              <span className="caption" style={{ display: 'block' }}>
                                Scope: <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{a.scope}</span>
                                {a.department_code && ` (${a.department_code})`}
                                {location?.name && ` (${location.name})`}
                              </span>
                            </div>
                            {can("access.manage") && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={busy || isSelf}
                                onClick={() => run("delete", `/assignments/${a.id}`)}
                                style={{ minHeight: '30px', padding: '2px 10px', fontSize: '11px' }}
                                title={isSelf ? "You cannot revoke your own role" : "Revoke role"}
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Direct Grants if any */}
                {memberGrants.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600 }}>
                      Direct Grants ({memberGrants.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {memberGrants.map((g) => (
                        <div
                          key={g.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: 'var(--background-color)',
                            border: '1px solid var(--grey-200)',
                            borderRadius: '6px',
                          }}
                        >
                          <code style={{ fontSize: '12px' }}>{g.permission_id}</code>
                          {can("access.manage") && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={busy || selectedMember.id === user._id}
                              onClick={() => run("delete", `/grants/${g.id}`)}
                              style={{ minHeight: '26px', padding: '1px 8px', fontSize: '10px' }}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assign New Role Form */}
                {can("access.manage") && (
                  <div style={{ paddingTop: '12px', borderTop: '1px solid var(--grey-200)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600 }}>
                      + Assign Another Role
                    </h4>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const formData = dataOf(e);
                        await run("post", "/assignments", {
                          userId: selectedMember.id,
                          roleId: formData.roleId,
                          scope: formData.scope,
                          locationId: formData.locationId || undefined,
                          department: formData.department || undefined,
                        });
                      }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
                    >
                      <Select label="Role *" name="roleId" required>
                        <option value="">Select a role…</option>
                        {data.roles
                          .filter((r) => r.active)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </Select>
                      {scopeFields}
                      <button type="submit" className="btn" disabled={busy} style={{ alignSelf: 'flex-start' }}>
                        {busy ? "Assigning…" : "Assign Role"}
                      </button>
                    </form>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedMemberId(null)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: DEPARTMENTS                                             */}
      {/* ============================================================== */}
      {activeTab === "departments" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Company Departments ({data.departments.length})</h3>
                <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                  Organizational divisions used for physical asset custody, inventory assignments, and teams.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Filter departments…"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  style={{
                    minHeight: '36px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--grey-200)',
                    background: 'var(--background-secondary-color)',
                    color: 'var(--text-color)',
                    fontSize: '13px',
                    width: '200px',
                  }}
                />
                {can("department.manage") && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAddDeptModal(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 16px' }}
                  >
                    <DesignIcon name="plus" />
                    <span>Create Department</span>
                  </button>
                )}
              </div>
            </div>

            {data.departments.length === 0 ? (
              <div className="panel empty-state" style={{ padding: '36px 20px', border: '1px dashed var(--grey-300)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-600)', marginBottom: '8px' }}>
                  <DesignIcon name="users" />
                </div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>No departments created yet</h4>
                <p className="caption" style={{ maxWidth: '420px', margin: '6px auto 16px' }}>
                  Departments allow you to assign custody of physical assets (e.g. IT, Operations, Marketing) and organize team members.
                </p>
                {can("department.manage") && (
                  <button type="button" className="btn" onClick={() => setShowAddDeptModal(true)}>
                    <DesignIcon name="plus" /> Create Department
                  </button>
                )}
              </div>
            ) : (
              <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Department Name</th>
                      <th>Code</th>
                      <th>Assigned Members</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.departments
                      .filter((d) => {
                        if (!deptFilter.trim()) return true;
                        const q = deptFilter.toLowerCase();
                        return (d.name || "").toLowerCase().includes(q) || (d.code || "").toLowerCase().includes(q);
                      })
                      .map((d) => {
                        const memberCount = data.memberships.filter((m) => m.department === d.code).length;
                        return (
                          <tr key={d.code}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '6px', background: 'var(--primary-100)', color: 'var(--primary-700)', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>
                                  {d.code.substring(0, 3).toUpperCase()}
                                </span>
                                <div>
                                  <strong style={{ fontSize: '14px', color: 'var(--text-color)', display: 'block' }}>{d.name}</strong>
                                </div>
                              </div>
                            </td>
                            <td>
                              <code style={{ background: 'var(--background-color)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', border: '1px solid var(--grey-200)' }}>
                                {d.code}
                              </code>
                            </td>
                            <td>
                              <span style={{ fontSize: '13px', color: memberCount > 0 ? 'var(--text-color)' : 'var(--text-secondary-color)' }}>
                                {memberCount === 1 ? '1 member' : `${memberCount} members`}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill ${d.active ? 'status-success' : 'status-muted'}`}>
                                {d.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              {can("department.manage") && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    run("patch", `/departments/${encodeURIComponent(d.code)}`, { active: !d.active })
                                  }
                                  style={{ minHeight: '34px', padding: '4px 12px', fontSize: '12px' }}
                                >
                                  {d.active ? "Deactivate" : "Activate"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Create Department Modal Dialog */}
          {showAddDeptModal && (
            <Modal open onClose={() => setShowAddDeptModal(false)} variant="fields">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Create Department</h3>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Add an organizational division for inventory custody and member groupings.
                  </p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await run("post", "/departments", dataOf(e));
                    if (ok) setShowAddDeptModal(false);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                  <Input
                    label="Department Code *"
                    name="code"
                    placeholder="e.g. IT, OPS, FIN, HR"
                    maxLength={100}
                    required
                    autoFocus
                    help="Unique short identifier for assets and records."
                  />
                  <Input
                    label="Department Name *"
                    name="name"
                    placeholder="e.g. Information Technology"
                    maxLength={200}
                    required
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setShowAddDeptModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn" disabled={busy}>
                      {busy ? "Creating…" : "Create Department"}
                    </button>
                  </div>
                </form>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ROLES & PERMISSIONS                                      */}
      {/* ============================================================== */}
      {activeTab === "roles" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Defined Roles ({data.roles.length})</h3>
                <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                  Standard authorization roles and permission packages configured for this workspace.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="Filter roles…"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{
                    minHeight: '36px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--grey-200)',
                    background: 'var(--background-secondary-color)',
                    color: 'var(--text-color)',
                    fontSize: '13px',
                    width: '200px',
                  }}
                />
                {can("role.manage") && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditingRole({ id: null, name: "", permissions: [] });
                      setRoleNameInput("");
                      setSelectedPermissions([]);
                      setPresetNotice("");
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 16px' }}
                  >
                    <DesignIcon name="plus" />
                    <span>Create Role</span>
                  </button>
                )}
              </div>
            </div>

            <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Role Name</th>
                    <th>Assigned Members</th>
                    <th>Permissions</th>
                    <th>Covers</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roles
                    .filter((r) => {
                      if (!roleFilter.trim()) return true;
                      return (r.name || "").toLowerCase().includes(roleFilter.toLowerCase());
                    })
                    .map((r) => {
                      const memberCount = (data.assignments || []).filter((a) => a.role_id === r.id).length;
                      const categories = getRoleCategoryBadges(r);

                      return (
                        <tr key={r.id}>
                          <td>
                            <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{r.name}</strong>
                          </td>
                          <td>
                            <span style={{ fontSize: '13px', color: memberCount > 0 ? 'var(--text-color)' : 'var(--text-secondary-color)' }}>
                              {memberCount === 1 ? '1 member' : `${memberCount} members`}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color)' }}>
                              {r.permissions.length} actions
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {categories.map((cat) => (
                                <span
                                  key={cat}
                                  className="status-pill status-neutral"
                                  style={{ fontSize: '10px', padding: '1px 6px' }}
                                >
                                  {cat}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span className={`status-pill ${r.active ? 'status-success' : 'status-muted'}`}>
                              {r.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {can("role.manage") && (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                      setEditingRole(r);
                                      setRoleNameInput(r.name || "");
                                      setSelectedPermissions(r.permissions || []);
                                      setPresetNotice("");
                                    }}
                                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      run("patch", `/roles/${r.id}`, { active: !r.active })
                                    }
                                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                                  >
                                    {r.active ? "Deactivate" : "Activate"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Collapsible Advanced: Direct Grants & Standalone Permissions */}
          <section className="panel" style={{ padding: '16px 20px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexWrap: 'wrap', gap: '10px' }}
              onClick={() => setShowAdvancedGrants((prev) => !prev)}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                  Advanced: Direct Permission Grants ({data.directGrants?.length || 0})
                </h4>
                <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                  Grant individual standalone permissions directly to a member without a pre-defined role.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ minHeight: '30px', padding: '2px 10px', fontSize: '11px' }}
              >
                {showAdvancedGrants ? "Hide Direct Grants ▲" : "Manage Direct Grants ▼"}
              </button>
            </div>

            {showAdvancedGrants && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '16px', borderTop: '1px solid var(--grey-200)' }}>
                {can("access.manage") && (
                  <FormSection
                    title="Direct Permission Grant"
                    subtitle="Grant a single standalone permission without a role."
                    busy={busy}
                    submitText="Grant Permission"
                    onSubmit={submit("post", "/grants")}
                  >
                    <Select label="Member *" name="userId" required>
                      <option value="">Choose member</option>
                      {memberOptions}
                    </Select>
                    <Select label="Permission *" name="permission">
                      {data.permissions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                    {scopeFields}
                  </FormSection>
                )}

                {data.directGrants && data.directGrants.length > 0 && (
                  <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Permission</th>
                          <th>Scope</th>
                          <th>Scope Target</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.directGrants.map((item) => {
                          const member = data.memberships.find((m) => m.id === item.user_id);
                          const location = (data.locations || []).find((l) => l.id === item.location_id);
                          const isSelf = item.user_id === user._id;

                          return (
                            <tr key={item.id}>
                              <td>
                                <strong>{member?.name || item.user_id}</strong>
                                <span className="caption" style={{ display: 'block' }}>{member?.email}</span>
                              </td>
                              <td>
                                <code style={{ fontSize: '12px' }}>{item.permission_id}</code>
                              </td>
                              <td>
                                <span className="status-pill status-neutral" style={{ textTransform: 'capitalize' }}>
                                  {item.scope}
                                </span>
                              </td>
                              <td>
                                {item.department_code || location?.name || "Entire Organization"}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={busy || isSelf}
                                  onClick={() => run("delete", `/grants/${item.id}`)}
                                  style={{ minHeight: '32px', padding: '2px 10px', fontSize: '11px' }}
                                >
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Role Editor Modal Dialog */}
          {editingRole && (
            <Modal open onClose={() => setEditingRole(null)} variant="role-editor">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0', maxHeight: '82vh', overflowY: 'auto' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                    {editingRole.id ? `Edit Role: ${editingRole.name}` : "Create New Role"}
                  </h3>
                  <p className="caption" style={{ marginTop: '2px' }}>
                    Define standard role permissions or choose a 1-click starter preset below.
                  </p>
                </div>

                {/* 1-Click Starter Presets */}
                <div style={{ background: 'var(--background-color)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--grey-200)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-color)' }}>
                      ⚡ Quick Starter Presets:
                    </span>
                    {presetNotice && (
                      <span style={{ fontSize: '11px', color: 'var(--primary-600)', fontWeight: 600 }}>
                        ✓ {presetNotice}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {ROLE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => applyPreset(preset)}
                        style={{ minHeight: '30px', padding: '3px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        title={preset.desc}
                      >
                        <span>{preset.icon}</span>
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const isEdit = !!editingRole.id;
                    const ok = await run(
                      isEdit ? "patch" : "post",
                      isEdit ? `/roles/${editingRole.id}` : "/roles",
                      { name: roleNameInput.trim(), permissions: selectedPermissions }
                    );
                    if (ok) setEditingRole(null);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                  <label className="form-row">
                    <span className="form-label">Role Name *</span>
                    <input
                      className="form-input"
                      name="name"
                      required
                      maxLength={200}
                      placeholder="e.g. Asset Auditor, Warehouse Storekeeper"
                      value={roleNameInput}
                      onChange={(e) => setRoleNameInput(e.target.value)}
                      autoFocus
                    />
                  </label>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <span className="form-label" style={{ margin: 0, fontWeight: 600 }}>
                        Permissions Package ({selectedPermissions.length} of {data.permissions.length} selected)
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: '28px', padding: '2px 10px', fontSize: '11px' }}
                          onClick={() => setSelectedPermissions(data.permissions)}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ minHeight: '28px', padding: '2px 10px', fontSize: '11px' }}
                          onClick={() => setSelectedPermissions([])}
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    <div className="permission-category-grid" style={{ maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
                      {permissionCategories.map((cat) => {
                        const availableInCat = cat.keys.filter((k) => data.permissions.includes(k));
                        if (!availableInCat.length) return null;
                        const selectedInCat = availableInCat.filter((k) => selectedPermissions.includes(k));
                        const allCatSelected = availableInCat.length > 0 && selectedInCat.length === availableInCat.length;

                        return (
                          <div key={cat.title} className="permission-category-card">
                            <div className="permission-category-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <h4>{cat.title}</h4>
                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: selectedInCat.length > 0 ? 'var(--primary-100)' : 'var(--grey-100)', color: selectedInCat.length > 0 ? 'var(--primary-700)' : 'var(--text-secondary-color)', fontWeight: 600 }}>
                                  {selectedInCat.length}/{availableInCat.length}
                                </span>
                              </div>
                              <button
                                type="button"
                                style={{ background: 'transparent', border: 0, color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                                onClick={() => {
                                  if (allCatSelected) {
                                    setSelectedPermissions((prev) => prev.filter((p) => !availableInCat.includes(p)));
                                  } else {
                                    setSelectedPermissions((prev) => Array.from(new Set([...prev, ...availableInCat])));
                                  }
                                }}
                              >
                                {allCatSelected ? "Clear" : "Select All"}
                              </button>
                            </div>
                            <div className="permission-category-list">
                              {availableInCat.map((p) => {
                                const meta = PERMISSION_LABELS[p] || { label: p, desc: p };
                                return (
                                  <label
                                    key={p}
                                    className="permission-checkbox-item"
                                    style={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: '8px',
                                      padding: '6px 8px',
                                      borderRadius: '6px',
                                      background: selectedPermissions.includes(p) ? 'var(--background-secondary-color)' : 'transparent',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedPermissions.includes(p)}
                                      onChange={(e) =>
                                        setSelectedPermissions((old) =>
                                          e.target.checked ? [...old, p] : old.filter((x) => x !== p)
                                        )
                                      }
                                      style={{ marginTop: '2px', flexShrink: 0 }}
                                    />
                                    <div style={{ minWidth: 0, lineHeight: 1.3 }}>
                                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color)' }}>
                                        {meta.label}
                                      </div>
                                      <div className="caption" style={{ fontSize: '11px', marginTop: '1px', color: 'var(--text-secondary-color)' }}>
                                        {meta.desc}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setEditingRole(null)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn" disabled={busy}>
                      {busy ? "Saving…" : editingRole.id ? "Update Role" : "Create Role"}
                    </button>
                  </div>
                </form>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: WORKSPACE & OWNERSHIP                                    */}
      {/* ============================================================== */}
      {activeTab === "organization" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="field-grid">
            {/* Workspace Settings */}
            {can("organization.manage") && (
              <FormSection
                key={"settings-" + data.organization.version}
                title="Company Settings"
                subtitle="Configure baseline currency, timezone, and workspace activity."
                busy={busy}
                submitText="Update Settings"
                onSubmit={submit("patch", "/organization", (x) => ({
                  name: x.name,
                  active: x.active === "true",
                  expectedVersion: data.organization.version,
                  ...(x.currency ? { currency: x.currency.toUpperCase() } : {}),
                  ...(x.timeZone ? { timeZone: x.timeZone } : {}),
                }))}
              >
                <Input
                  label="Company Name *"
                  name="name"
                  defaultValue={data.organization.name}
                  required
                  maxLength={200}
                />
                <Input
                  label="Default Currency Code (3-letter ISO) *"
                  name="currency"
                  defaultValue={data.organization.currency || "INR"}
                  maxLength={3}
                  placeholder="INR"
                  help="e.g. INR, USD, EUR"
                />
                <Input
                  label="Company Time Zone *"
                  name="timeZone"
                  defaultValue={data.organization.timeZone || "UTC"}
                  maxLength={100}
                  placeholder="Asia/Kolkata"
                  help="Used for civil midnight depreciation & reminders."
                />
                <Select label="Workspace Status" name="active" defaultValue={data.organization.active ? "true" : "false"}>
                  <option value="true">Active (Normal operations)</option>
                  <option value="false">Deactivate Workspace (Locks access for all members)</option>
                </Select>
              </FormSection>
            )}

            {/* Ownership Section */}
            {(can("organization.manage") || can("access.manage") || can("ownership.manage")) && (
              <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Company Ownership</h3>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Owners retain sovereign administrative control and cannot be removed without a successor.
                  </p>
                </div>

                {!data.organization.ownershipActivatedAt ? (
                  <div style={{ padding: '14px', background: 'var(--background-color)', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary-color)', fontSize: '13px' }}>
                      Company ownership has not been confirmed yet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Current Company Owners</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {data.owners.map((owner) => {
                          const m = data.memberships.find((mem) => mem.id === owner.userId);
                          const isSelf = owner.userId === user._id;
                          return (
                            <div
                              key={owner.userId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                background: 'var(--background-color)',
                                border: '1px solid var(--grey-200)',
                                borderRadius: '8px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                                  ★
                                </span>
                                <div>
                                  <strong style={{ fontSize: '13px' }}>{m?.name || owner.userId}</strong>
                                  <span className="caption" style={{ display: 'block' }}>{m?.email}</span>
                                </div>
                              </div>
                              <span className="status-pill status-neutral">
                                {isSelf ? "You (Owner)" : "Owner"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {data.owners.some((owner) => owner.userId === user._id) && can("ownership.manage") && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid var(--grey-200)' }}>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            const fields = dataOf(event);
                            const nominee = data.memberships.find((m) => m.id === fields.userId);
                            if (nominee) setPendingOwnerAppointment(nominee);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                        >
                          <Select label="Appoint a verified colleague as Owner" name="userId" required defaultValue="">
                            <option value="" disabled>Choose a verified member</option>
                            {data.memberships
                              .filter((m) => m.active && m.emailVerified && !data.owners.some((o) => o.userId === m.id))
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.email})
                                </option>
                              ))}
                          </Select>
                          <button className="btn" disabled={busy} style={{ alignSelf: 'flex-start', minWidth: '140px' }}>
                            Appoint Owner…
                          </button>
                        </form>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>

          {/* Owner Appointment Confirmation Modal */}
          {pendingOwnerAppointment && (
            <Modal open onClose={() => setPendingOwnerAppointment(null)} variant="fields">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-color)' }}>
                    Confirm Ownership Appointment
                  </h3>
                  <p className="caption" style={{ marginTop: '4px' }}>
                    Appoint <strong>{pendingOwnerAppointment.name}</strong> ({pendingOwnerAppointment.email}) as a legal Company Owner of <strong>{data.organization.name}</strong>.
                  </p>
                </div>

                <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '13px', lineHeight: 1.4 }}>
                  ⚠️ <strong>Important Notice:</strong> Company owners retain sovereign administrative control, including legal workspace operations, and cannot be removed without an active successor.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setPendingOwnerAppointment(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run("post", "/ownership/appointments", {
                        expectedVersion: data.organization.version,
                        userId: pendingOwnerAppointment.id,
                      });
                      if (ok) setPendingOwnerAppointment(null);
                    }}
                  >
                    {busy ? "Appointing…" : "Confirm Appointment"}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: AUDIT & EFFECTIVE PERMISSIONS                            */}
      {/* ============================================================== */}
      {activeTab === "security" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Executive Security KPI Summary Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
            <div className="panel" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid #0f766e' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary-color)', fontSize: '11px' }}>
                  Tenant Isolation
                </span>
                <span style={{ fontSize: '18px' }}>🔒</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-color)' }}>Schema Partitioned</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0f766e', flexShrink: 0 }} />
                <span>Dedicated Schema: <code>tenant_{data?.organization?.slug || 'active'}</code></span>
              </div>
            </div>

            <div className="panel" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary-color)', fontSize: '11px' }}>
                  Governance Control
                </span>
                <span style={{ fontSize: '18px' }}>👑</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-color)' }}>
                {data?.owners?.length || 1} Legal Owner{(data?.owners?.length || 1) > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#b45309', fontWeight: 500 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                <span>Sovereign Root Governance</span>
              </div>
            </div>

            <div className="panel" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary-color)', fontSize: '11px' }}>
                  Security Ledger
                </span>
                <span style={{ fontSize: '18px' }}>📋</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-color)' }}>
                {events ? `${events.length} Logged Events` : (loadingAudit ? 'Querying…' : 'Ready')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1d4ed8', fontWeight: 500 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span>Tamper-Evident & Append-Only</span>
              </div>
            </div>

            <div className="panel" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="caption" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary-color)', fontSize: '11px' }}>
                  Authorization Scope
                </span>
                <span style={{ fontSize: '18px' }}>🛡️</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-color)' }}>Deny-by-Default RBAC</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6d28d9', fontWeight: 500 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />
                <span>Scoped: Org · Dept · Self</span>
              </div>
            </div>
          </div>

          {/* Side-by-side Grids: Active Grants & Colleague Inspector */}
          <div className="field-grid">
            {/* 1. Your Effective Permissions */}
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>
                    Your Active Grants ({data?.grants?.length || 0})
                  </h3>
                  <span className="status-pill status-success" style={{ fontSize: '11px', padding: '2px 8px' }}>
                    ● Session Verified
                  </span>
                </div>
                <p className="caption" style={{ marginTop: '2px' }}>
                  Granular capabilities granted to your current session via roles and direct assignments.
                </p>
              </div>

              {/* Filter pills and search */}
              {(() => {
                const userGrants = data?.grants || [];
                const counts = {
                  all: userGrants.length,
                  assets: userGrants.filter(g => getGrantCategory(g.permission) === 'assets').length,
                  requisitions: userGrants.filter(g => getGrantCategory(g.permission) === 'requisitions').length,
                  team: userGrants.filter(g => getGrantCategory(g.permission) === 'team').length,
                  workspace: userGrants.filter(g => getGrantCategory(g.permission) === 'workspace').length,
                  governance: userGrants.filter(g => getGrantCategory(g.permission) === 'governance').length,
                };

                const filtered = userGrants.filter((g) => {
                  if (grantsCategoryFilter !== "all" && getGrantCategory(g.permission) !== grantsCategoryFilter) {
                    return false;
                  }
                  if (!grantsSearch.trim()) return true;
                  const q = grantsSearch.toLowerCase();
                  const meta = PERMISSION_LABELS[g.permission] || { label: g.permission, desc: g.permission };
                  return (
                    g.permission.toLowerCase().includes(q) ||
                    meta.label.toLowerCase().includes(q) ||
                    meta.desc.toLowerCase().includes(q)
                  );
                });

                return (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="search"
                        placeholder="Search verified grants…"
                        value={grantsSearch}
                        onChange={(e) => setGrantsSearch(e.target.value)}
                        style={{
                          minHeight: '34px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--grey-200)',
                          background: 'var(--background-secondary-color)',
                          color: 'var(--text-color)',
                          fontSize: '12px',
                          width: '100%',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                          { id: 'all', label: `All (${counts.all})` },
                          { id: 'assets', label: `Assets (${counts.assets})` },
                          { id: 'requisitions', label: `Requisitions (${counts.requisitions})` },
                          { id: 'team', label: `Team (${counts.team})` },
                          { id: 'governance', label: `Security (${counts.governance + counts.workspace})` },
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setGrantsCategoryFilter(cat.id)}
                            style={{
                              padding: '3px 10px',
                              fontSize: '11px',
                              borderRadius: '20px',
                              border: grantsCategoryFilter === cat.id ? '1px solid var(--accent)' : '1px solid var(--grey-200)',
                              background: grantsCategoryFilter === cat.id ? 'var(--accent)' : 'var(--background-color)',
                              color: grantsCategoryFilter === cat.id ? 'white' : 'var(--text-color)',
                              fontWeight: grantsCategoryFilter === cat.id ? 600 : 500,
                              cursor: 'pointer',
                              transition: 'all 120ms ease',
                            }}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filtered.length > 0 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: '8px',
                          maxHeight: '340px',
                          overflowY: 'auto',
                          paddingRight: '4px',
                        }}
                      >
                        {filtered.map((g, i) => {
                          const meta = PERMISSION_LABELS[g.permission] || { label: g.permission, desc: g.permission };
                          const cat = getGrantCategory(g.permission);
                          const catIcon = cat === 'assets' ? '📦' : cat === 'requisitions' ? '📝' : cat === 'team' ? '👥' : cat === 'workspace' ? '🏢' : '🛡️';
                          return (
                            <div
                              key={i}
                              style={{
                                padding: '10px 12px',
                                background: 'var(--background-color)',
                                border: '1px solid var(--grey-200)',
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                  <span style={{ fontSize: '12px' }}>{catIcon}</span>
                                  <strong style={{ fontSize: '12px', color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {meta.label}
                                  </strong>
                                </div>
                                <span className="status-pill status-neutral" style={{ fontSize: '9px', textTransform: 'capitalize', flexShrink: 0, padding: '1px 6px' }}>
                                  {g.scope}
                                </span>
                              </div>
                              <span className="caption" style={{ fontSize: '11px', color: 'var(--text-secondary-color)', lineHeight: 1.3 }}>
                                {meta.desc}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '24px 12px', textAlign: 'center', background: 'var(--background-color)', borderRadius: '8px', border: '1px dashed var(--grey-300)' }}>
                        <p className="caption" style={{ margin: 0 }}>No verified grants match your filter.</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* 2. Inspect Member Permissions */}
            {can("access.manage") && (
              <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Inspect Member Permissions</h3>
                  <p className="caption" style={{ marginTop: '2px' }}>Audit the live effective authorization scope and assigned roles of any colleague.</p>
                </div>

                <Select
                  label="Select Colleague"
                  value={inspectedMemberId}
                  onChange={async (e) => {
                    const mId = e.target.value;
                    setInspectedMemberId(mId);
                    setError("");
                    if (!mId) {
                      setEffective(null);
                      return;
                    }
                    try {
                      const res = await customFetch.get(`/access/members/${mId}/effective`);
                      setEffective(res.data.grants);
                    } catch (err) {
                      setError(err.response?.data?.msg || "Unable to inspect member");
                    }
                  }}
                >
                  <option value="" disabled>Choose member to inspect…</option>
                  {(data?.memberships || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email}) {m.department ? `· ${m.department}` : ''}
                    </option>
                  ))}
                </Select>

                {(() => {
                  const inspectedMember = data?.memberships?.find((m) => m.id === inspectedMemberId);
                  const inspectedAssignments = (data?.assignments || []).filter((a) => a.user_id === inspectedMemberId);

                  if (!inspectedMemberId || !inspectedMember) {
                    return (
                      <div style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--background-color)', borderRadius: '10px', border: '1px dashed var(--grey-300)', marginTop: '4px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
                        <p style={{ fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>No Colleague Selected</p>
                        <p className="caption" style={{ maxWidth: '340px', margin: '0 auto' }}>
                          Select any team member above to view their effective permission set, assigned roles, and organizational scope.
                        </p>
                      </div>
                    );
                  }

                  const filteredEffective = (effective || []).filter((g) => {
                    if (!inspectedGrantSearch.trim()) return true;
                    const q = inspectedGrantSearch.toLowerCase();
                    const meta = PERMISSION_LABELS[g.permission] || { label: g.permission, desc: g.permission };
                    return (
                      g.permission.toLowerCase().includes(q) ||
                      meta.label.toLowerCase().includes(q) ||
                      (g.scope || "").toLowerCase().includes(q)
                    );
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Rich Member Profile Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          background: 'var(--background-color)',
                          borderRadius: '10px',
                          border: '1px solid var(--grey-200)',
                        }}
                      >
                        <span
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            background: 'var(--primary-500)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '16px',
                            flexShrink: 0,
                          }}
                        >
                          {(inspectedMember.name || 'U').charAt(0).toUpperCase()}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--text-color)' }}>{inspectedMember.name}</strong>
                            <span className={`status-pill ${inspectedMember.active ? 'status-success' : 'status-danger'}`} style={{ fontSize: '10px', padding: '1px 7px' }}>
                              {inspectedMember.active ? 'Active' : 'Deactivated'}
                            </span>
                            {inspectedMember.department && (
                              <span className="status-pill status-neutral" style={{ fontSize: '10px', padding: '1px 7px' }}>
                                🏬 {inspectedMember.department}
                              </span>
                            )}
                          </div>
                          <span className="caption" style={{ color: 'var(--text-secondary-color)', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                            {inspectedMember.email}
                          </span>
                        </div>
                      </div>

                      {/* Assigned Roles */}
                      <div>
                        <span className="form-label" style={{ fontSize: '12px', marginBottom: '6px', display: 'block' }}>
                          Assigned Roles ({inspectedAssignments.length})
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {inspectedAssignments.length === 0 ? (
                            <span className="caption" style={{ fontStyle: 'italic' }}>No standard role assigned</span>
                          ) : (
                            inspectedAssignments.map((a) => {
                              const r = data.roles.find((ro) => ro.id === a.role_id);
                              const scopeLabel = a.scope === 'organization' ? 'Org-wide' : a.scope === 'department' ? `Dept: ${a.department_code || 'All'}` : a.scope;
                              return (
                                <span
                                  key={a.id}
                                  className="status-pill status-neutral"
                                  style={{ fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid var(--grey-300)' }}
                                >
                                  <strong>🛡️ {r?.name || a.role_id}</strong>
                                  <span style={{ opacity: 0.7, fontSize: '10px' }}>({scopeLabel})</span>
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Effective Grants List */}
                      {effective && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span className="form-label" style={{ fontSize: '12px', margin: 0 }}>
                              Effective Grants ({effective.length})
                            </span>
                            <span className="caption" style={{ fontSize: '11px' }}>
                              Resolved from role hierarchy
                            </span>
                          </div>

                          <input
                            type="search"
                            placeholder="Filter member permissions…"
                            value={inspectedGrantSearch}
                            onChange={(e) => setInspectedGrantSearch(e.target.value)}
                            style={{
                              minHeight: '32px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--grey-200)',
                              background: 'var(--background-secondary-color)',
                              color: 'var(--text-color)',
                              fontSize: '12px',
                              width: '100%',
                              marginBottom: '8px',
                            }}
                          />

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                            {filteredEffective.map((g, i) => {
                              const meta = PERMISSION_LABELS[g.permission] || { label: g.permission, desc: g.permission };
                              return (
                                <div
                                  key={i}
                                  style={{
                                    padding: '6px 8px',
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <strong style={{ fontSize: '11px', color: '#1e40af' }}>{meta.label}</strong>
                                    <span className="status-pill status-neutral" style={{ fontSize: '9px', padding: '0 4px', background: '#dbeafe', color: '#1e40af' }}>
                                      {g.scope} {g.department ? `(${g.department})` : ''}
                                    </span>
                                  </div>
                                  <span className="caption" style={{ fontSize: '10px', color: '#3b82f6', lineHeight: 1.2 }}>
                                    {meta.desc}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}
          </div>

          {/* 3. Audit Events Table */}
          {can("audit.read") && (
            <section className="panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Audit Events Log</h3>
                    <span className="status-pill status-neutral" style={{ fontSize: '11px' }}>
                      {events ? `${events.length} records` : 'Append-Only Ledger'}
                    </span>
                  </div>
                  <p className="caption" style={{ margin: 0, marginTop: '2px' }}>
                    Tamper-evident append-only ledger of authorization events, entity creations, and security operations.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="search"
                    placeholder="Search action, target, actor…"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    style={{
                      minHeight: '36px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--grey-200)',
                      background: 'var(--background-secondary-color)',
                      color: 'var(--text-color)',
                      fontSize: '13px',
                      width: '240px',
                    }}
                  />
                  <select
                    value={auditOutcomeFilter}
                    onChange={(e) => setAuditOutcomeFilter(e.target.value)}
                    aria-label="Filter outcome"
                    style={{
                      minHeight: '36px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--grey-200)',
                      background: 'var(--background-secondary-color)',
                      color: 'var(--text-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="all">All Outcomes</option>
                    <option value="success">Success Only</option>
                    <option value="denied">Denied Only</option>
                  </select>
                  <select
                    value={auditCategoryFilter}
                    onChange={(e) => setAuditCategoryFilter(e.target.value)}
                    aria-label="Filter category"
                    style={{
                      minHeight: '36px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--grey-200)',
                      background: 'var(--background-secondary-color)',
                      color: 'var(--text-color)',
                      fontSize: '13px',
                    }}
                  >
                    <option value="all">All Categories</option>
                    <option value="Workspace">Workspace</option>
                    <option value="Team">Team & Custody</option>
                    <option value="Access">Roles & Access</option>
                    <option value="Requisitions">Requisitions</option>
                    <option value="Assets">Assets</option>
                    <option value="System">System & Setup</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={loadingAudit}
                    onClick={loadAudit}
                    style={{ minHeight: '36px', padding: '6px 14px', fontSize: '12px' }}
                  >
                    {loadingAudit ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </div>

              {loadingAudit && !events ? (
                <div style={{ padding: '36px', textAlign: 'center' }}>
                  <p role="status">Querying secure audit ledger from PostgreSQL…</p>
                </div>
              ) : Array.isArray(events) ? (
                (() => {
                  const filtered = events.filter((e) => {
                    if (auditOutcomeFilter !== "all" && e.outcome !== auditOutcomeFilter) return false;
                    const meta = getAuditActionMeta(e.action);
                    if (auditCategoryFilter !== "all" && meta.cat !== auditCategoryFilter) return false;
                    if (!auditSearch.trim()) return true;
                    const q = auditSearch.toLowerCase();
                    return (
                      (e.action || "").toLowerCase().includes(q) ||
                      meta.label.toLowerCase().includes(q) ||
                      (e.target || "").toLowerCase().includes(q) ||
                      (e.actor_name || "").toLowerCase().includes(q) ||
                      new Date(e.created_at).toLocaleString().toLowerCase().includes(q)
                    );
                  });

                  if (!filtered.length) {
                    return (
                      <p className="caption" style={{ padding: '36px 0', textAlign: 'center' }}>
                        {events.length === 0 ? "No audit events recorded yet." : "No audit events match your active filters."}
                      </p>
                    );
                  }

                  return (
                    <div className="audit-table-wrapper" style={{ marginTop: 0 }}>
                      <table className="audit-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Actor</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Outcome</th>
                            <th style={{ textAlign: 'right' }}>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((e) => {
                            const meta = getAuditActionMeta(e.action);
                            const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
                            return (
                              <tr key={e.id}>
                                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary-color)', fontSize: '12px' }}>
                                  {new Date(e.created_at).toLocaleString()}
                                </td>
                                <td>
                                  {renderActorBadge(e.actor_id, e.actor_name, data)}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span
                                      className="status-pill status-neutral"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        background: meta.bg,
                                        color: meta.color,
                                        alignSelf: 'flex-start',
                                        fontWeight: 600,
                                      }}
                                    >
                                      <span>{meta.icon}</span>
                                      <span>{meta.label}</span>
                                    </span>
                                    <code style={{ fontSize: '10px', color: 'var(--text-secondary-color)' }}>
                                      {e.action}
                                    </code>
                                  </div>
                                </td>
                                <td>
                                  {renderTargetBadge(e.target, data)}
                                </td>
                                <td>
                                  <span className={`status-pill ${e.outcome === 'success' ? 'status-success' : 'status-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span>{e.outcome === 'success' ? '✓' : '✕'}</span>
                                    <span>{e.outcome === 'success' ? 'Success' : 'Denied'}</span>
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {hasMeta ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ minHeight: '28px', padding: '2px 8px', fontSize: '11px' }}
                                      onClick={() => setSelectedAuditDetail(e)}
                                    >
                                      Inspect
                                    </button>
                                  ) : (
                                    <span className="caption" style={{ color: 'var(--grey-400)', fontSize: '11px' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', background: 'var(--background-color)', borderRadius: '8px', border: '1px dashed var(--grey-300)' }}>
                  <p className="caption" style={{ margin: 0 }}>
                    Click &ldquo;Refresh&rdquo; above to query the audit ledger.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Audit Event Detail Inspection Modal */}
          {selectedAuditDetail && (
            <Modal open onClose={() => setSelectedAuditDetail(null)} variant="fields">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '20px' }}>{getAuditActionMeta(selectedAuditDetail.action).icon}</span>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-color)' }}>
                      Audit Event Details (ID #{selectedAuditDetail.id})
                    </h3>
                  </div>
                  <p className="caption" style={{ margin: 0 }}>
                    Immutable ledger record recorded at {new Date(selectedAuditDetail.created_at).toLocaleString()}.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', background: 'var(--background-color)', padding: '14px', borderRadius: '8px', border: '1px solid var(--grey-200)' }}>
                  <div>
                    <span className="caption" style={{ fontWeight: 600, display: 'block', fontSize: '11px' }}>ACTION</span>
                    <strong style={{ fontSize: '13px' }}>{selectedAuditDetail.action}</strong>
                  </div>
                  <div>
                    <span className="caption" style={{ fontWeight: 600, display: 'block', fontSize: '11px' }}>OUTCOME</span>
                    <span className={`status-pill ${selectedAuditDetail.outcome === 'success' ? 'status-success' : 'status-danger'}`}>
                      {selectedAuditDetail.outcome}
                    </span>
                  </div>
                  <div>
                    <span className="caption" style={{ fontWeight: 600, display: 'block', fontSize: '11px' }}>ACTOR</span>
                    <span>{selectedAuditDetail.actor_name || selectedAuditDetail.actor_id || 'System / Automated'}</span>
                  </div>
                  <div>
                    <span className="caption" style={{ fontWeight: 600, display: 'block', fontSize: '11px' }}>TARGET</span>
                    <span style={{ wordBreak: 'break-all', fontSize: '12px' }}>{selectedAuditDetail.target || '—'}</span>
                  </div>
                </div>

                <div>
                  <span className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>
                    Event Metadata Payload
                  </span>
                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {JSON.stringify(selectedAuditDetail.metadata, null, 2)}
                  </pre>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedAuditDetail(null)}
                    style={{ minHeight: '36px', padding: '6px 16px', fontSize: '13px' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </>
  );
}
