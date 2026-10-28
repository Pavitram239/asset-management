import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import customFetch from "../utils/customFetch";
import { useDashboardContext } from "./DashboardLayout";
import { hasPermission } from "../utils/permissions";

const Input = ({ label, ...props }) => (
  <label className="form-row">
    {label}
    <input className="form-input" {...props} />
  </label>
);
const Select = ({ label, children, ...props }) => (
  <label className="form-row">
    {label}
    <select className="form-select" aria-label={label} {...props}>
      {children}
    </select>
  </label>
);
const FormSection = ({ title, onSubmit, children, busy }) => (
  <section className="panel">
    <h3>{title}</h3>
    <form onSubmit={onSubmit}>
      {children}
      <button className="btn" disabled={busy}>
        Save
      </button>
    </form>
  </section>
);
Input.propTypes = { label: PropTypes.string.isRequired };
Select.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};
FormSection.propTypes = {
  title: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  children: PropTypes.node,
  busy: PropTypes.bool,
};
const dataOf = (event) =>
  Object.fromEntries(new FormData(event.currentTarget).entries());
export default function AccessManagement() {
  const { user, activeOrganizationId, refreshAccess } = useDashboardContext();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [roleId, setRoleId] = useState(""),
    [selectedPermissions, setSelectedPermissions] = useState([]),
    [events, setEvents] = useState(null),
    [effective, setEffective] = useState(null);
  const commandKeys=useRef(new Map());
  const writing=useRef(false);
  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      setData((await customFetch.get("/access/management")).data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.msg || "Unable to load access settings");
    }
  }, [activeOrganizationId]);
  useEffect(() => {
    load();
  }, [load]);
  const run = async (method, path, body) => {
    if(writing.current)return false;
    writing.current=true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ownership=path.startsWith('/ownership/');
      const intent=JSON.stringify({method,path,body,activeOrganizationId});
      if(ownership&&!commandKeys.current.has(intent))commandKeys.current.set(intent,crypto.randomUUID());
      await customFetch.request({ method, url: ownership?path:"/access" + path, data: body,
        ...(ownership?{headers:{'Idempotency-Key':commandKeys.current.get(intent)}}:{}) });
      if(ownership)commandKeys.current.delete(intent);
      setNotice("Changes saved");
      await load();
      refreshAccess();
      return true;
    } catch (e) {
      setError(e.response?.data?.msg || "Unable to save changes");
      return false;
    } finally {
      writing.current=false;
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
  if (!activeOrganizationId)
    return (
      <section className="panel">
        <h2>Access management</h2>
        <p>Select an organization to manage access.</p>
      </section>
    );
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
  const scopeFields = (
    <>
      <Select label="Scope" name="scope">
        <option value="organization">Organization</option>
        <option value="department">Department</option>
        <option value="location">Location and descendants</option>
        <option value="self">Assigned assets only</option>
      </Select>
      <Select label="Location (only for location scope)" name="locationId"><option value="">None</option>{(data.locations||[]).filter(location=>location.active).map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</Select>
      <Select label="Department (only for department scope)" name="department">
        <option value="">None</option>
        {departmentOptions}
      </Select>
    </>
  );
  return (
    <>
      <div className="page-heading">
        <h2>Access management</h2>
        <p>
          {data.organization.name} · Permissions take effect on the next
          request.
        </p>
      </div>
      {error && (
        <div role="alert" className="form-error">
          {error}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={load}>Reload access settings</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="access-grid">
        <section className="panel">
          <h3>Your effective permissions</h3>
          {data.grants.length ? (
            <ul>
              {data.grants.map((g, i) => (
                <li key={i}>
                  {g.permission} · {g.scope}
                  {g.department && ` · ${g.department}`}
                </li>
              ))}
            </ul>
          ) : (
            <p>No permissions assigned.</p>
          )}
        </section>
        {can("organization.create") && (
          <FormSection
            title="Create organization"
            busy={busy}
            onSubmit={submit("post", "/organizations")}
          >
            <Input
              label="Organization name"
              name="name"
              required
              maxLength={200}
            />
          </FormSection>
        )}
        {can("organization.manage") && (
          <FormSection
            key={'settings-'+data.organization.version}
            title="Organization settings"
            busy={busy}
            onSubmit={submit("patch", "/organization", (x) => ({
              name:x.name,
              active: x.active === "true",
              expectedVersion:data.organization.version,
              ...(x.currency?{currency:x.currency.toUpperCase()}:{}),
              ...(x.timeZone?{timeZone:x.timeZone}:{}),
            }))}
          >
            <Input
              label="Name"
              name="name"
              defaultValue={data.organization.name}
              required
              maxLength={200}
            />
            <Input label="Default currency code" name="currency" defaultValue={data.organization.currency || ''} maxLength={3} placeholder="INR" />
            <Input label="Company time zone" name="timeZone" defaultValue={data.organization.timeZone || ''} maxLength={100} placeholder="Asia/Kolkata" />
            <p>Currency and time zone support consistent purchase amounts and reminder dates.</p>
            <Select label="Status" name="active">
              <option value="true">Active</option>
              <option value="false">Deactivate organization</option>
            </Select>
            <p>Deactivation removes workspace access for every member.</p>
          </FormSection>
        )}
        {(can('organization.manage')||can('access.manage')||can('ownership.manage')) && <section className="panel">
          <h3>Company ownership</h3>
          {!data.organization.ownershipActivatedAt ? <p>Company ownership has not been confirmed yet. Ask the person managing this installation to confirm it.</p> : <>
            <p>Owners are recorded separately from editable roles. Keep at least one active owner.</p>
            <ul>{data.owners.map(owner=><li key={owner.userId}>{data.memberships.find(m=>m.id===owner.userId)?.name || owner.userId}</li>)}</ul>
            {data.owners.some(owner=>owner.userId===user._id)&&can('ownership.manage')&&<>
              <form onSubmit={event=>{
                event.preventDefault();const fields=dataOf(event);
                run('post','/ownership/appointments',{expectedVersion:data.organization.version,userId:fields.userId});
              }}>
                <Select label="Appoint a verified colleague as owner" name="userId" required defaultValue="">
                  <option value="" disabled>Choose a verified member</option>
                  {data.memberships.filter(m=>m.active&&m.emailVerified&&!data.owners.some(o=>o.userId===m.id)).map(m=><option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </Select>
                <p>Appointments require an active member whose email is verified.</p>
                <button className="btn" disabled={busy}>Appoint owner</button>
              </form>
              <form onSubmit={event=>{
                event.preventDefault();const fields=dataOf(event);
                run('post',`/ownership/${fields.userId}/removals`,{expectedVersion:data.organization.version,reason:fields.reason});
              }}>
                <Select label="Remove ownership" name="userId" required defaultValue="">
                  <option value="" disabled>Choose an owner</option>
                  {data.owners.map(o=><option key={o.userId} value={o.userId}>{data.memberships.find(m=>m.id===o.userId)?.name || o.userId}{o.userId===user._id?' (you)':''}</option>)}
                </Select>
                <Input label="Reason for removing ownership" name="reason" required maxLength={2000} />
                <p>Removing ownership retains membership and other access. The last active owner cannot be removed.</p>
                <button className="btn btn-secondary" disabled={busy||data.owners.length<2}>Remove ownership</button>
              </form>
            </>}
          </>}
        </section>}
        {can("department.manage") && (
          <>
            <FormSection
              title="Create department"
              busy={busy}
              onSubmit={submit("post", "/departments")}
            >
              <Input label="Code" name="code" maxLength={100} required />
              <Input label="Name" name="name" maxLength={200} required />
            </FormSection>
            <section className="panel">
              <h3>Departments</h3>
              {!data.departments.length && <p>No departments created.</p>}
              {data.departments.map((d) => (
                <form
                  key={d.code}
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("patch", `/departments/${encodeURIComponent(d.code)}`, {
                      name: dataOf(e).name,
                    });
                  }}
                >
                  <Input
                    label={`${d.code} name`}
                    name="name"
                    defaultValue={d.name}
                    required
                  />
                  <button className="btn" disabled={busy}>
                    Rename
                  </button>{" "}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        "patch",
                        `/departments/${encodeURIComponent(d.code)}`,
                        { active: !d.active },
                      )
                    }
                  >
                    {d.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              ))}
            </section>
          </>
        )}
        {can("membership.manage") && (
          <>
            <FormSection
              title="Add registered user"
              busy={busy}
              onSubmit={submit("post", "/members")}
            >
              <Input
                label="Registered email"
                name="email"
                type="email"
                required
              />
              <Select label="Department" name="department">
                <option value="">None</option>
                {departmentOptions}
              </Select>
              <p>Membership alone grants no permissions.</p>
            </FormSection>
            <section className="panel">
              <h3>Memberships</h3>
              {data.memberships.map((m) => (
                <form
                  key={m.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("patch", `/members/${m.id}`, dataOf(e));
                  }}
                >
                  <p>
                    {m.name} · {m.email} · {m.active ? "Active" : "Inactive"}
                  </p>
                  <Select
                    label="Department"
                    name="department"
                    defaultValue={m.department || ""}
                  >
                    <option value="">None</option>
                    {departmentOptions}
                  </Select>
                  <button className="btn" disabled={busy || m.id === user._id}>
                    Update department
                  </button>{" "}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || m.id === user._id}
                    onClick={() =>
                      run("patch", `/members/${m.id}`, { active: !m.active })
                    }
                  >
                    {m.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              ))}
            </section>
          </>
        )}
        {can("role.manage") && (
          <section className="panel">
            <h3>Create or edit role</h3>
            <Select
              label="Role"
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                setSelectedPermissions(
                  data.roles.find((r) => r.id === e.target.value)
                    ?.permissions || [],
                );
              }}
            >
              <option value="">Create new role</option>
              {data.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {!r.active ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
            <form
              key={roleId}
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  roleId ? "patch" : "post",
                  roleId ? `/roles/${roleId}` : "/roles",
                  { name: dataOf(e).name, permissions: selectedPermissions },
                );
              }}
            >
              <Input
                label="Role name"
                name="name"
                required
                maxLength={200}
                defaultValue={
                  data.roles.find((r) => r.id === roleId)?.name || ""
                }
              />
              <fieldset>
                <legend>Permissions</legend>
                {data.permissions.map((p) => (
                  <label className="permission-option" key={p}>
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(p)}
                      onChange={(e) =>
                        setSelectedPermissions((old) =>
                          e.target.checked
                            ? [...old, p]
                            : old.filter((x) => x !== p),
                        )
                      }
                    />
                    {p}
                  </label>
                ))}
              </fieldset>
              <button className="btn" disabled={busy}>
                Save role
              </button>
              {roleId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    run("patch", `/roles/${roleId}`, {
                      active: !data.roles.find((r) => r.id === roleId)?.active,
                    })
                  }
                >
                  Toggle activation
                </button>
              )}
            </form>
            <p>
              Changes to roles assigned to yourself require another authorized
              administrator.
            </p>
          </section>
        )}
        {can("access.manage") && (
          <>
            <FormSection
              title="Assign role"
              busy={busy}
              onSubmit={submit("post", "/assignments")}
            >
              <Select label="Member" name="userId" required>
                <option value="">Choose member</option>
                {memberOptions}
              </Select>
              <Select label="Role" name="roleId" required>
                <option value="">Choose role</option>
                {data.roles
                  .filter((r) => r.active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
              {scopeFields}
            </FormSection>
            <FormSection
              title="Grant permission directly"
              busy={busy}
              onSubmit={submit("post", "/grants")}
            >
              <Select label="Member" name="userId" required>
                <option value="">Choose member</option>
                {memberOptions}
              </Select>
              <Select label="Permission" name="permission">
                {data.permissions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
              {scopeFields}
            </FormSection>
            <section className="panel">
              <h3>Assigned roles and direct grants</h3>
              {!data.assignments.length && !data.directGrants.length && (
                <p>No assignments.</p>
              )}
              {[
                ["assignments", data.assignments],
                ["grants", data.directGrants],
              ].flatMap(([kind, items]) =>
                items.map((item) => (
                  <div key={item.id}>
                    <p>
                      {data.memberships.find((m) => m.id === item.user_id)
                        ?.name || item.user_id}{" "}
                      ·{" "}
                      {item.permission_id ||
                        data.roles.find((r) => r.id === item.role_id)?.name ||
                        item.role_id}{" "}
                      · {item.scope} {item.department_code} {item.location_id && (data.locations||[]).find(location=>location.id===item.location_id)?.name}
                    </p>
                    <button
                      className="btn btn-secondary"
                      disabled={busy || item.user_id === user._id}
                      onClick={() => run("delete", `/${kind}/${item.id}`)}
                    >
                      Revoke
                    </button>
                  </div>
                )),
              )}
            </section>
            <section className="panel">
              <h3>Inspect member permissions</h3>
              <Select
                label="Member"
                defaultValue=""
                onChange={async (e) => {
                  setError("");
                  try {
                    setEffective(
                      (
                        await customFetch.get(
                          `/access/members/${e.target.value}/effective`,
                        )
                      ).data.grants,
                    );
                  } catch (e) {
                    setError(
                      e.response?.data?.msg || "Unable to inspect member",
                    );
                  }
                }}
              >
                <option value="" disabled>
                  Choose member
                </option>
                {data.memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
              {effective && (
                <ul>
                  {effective.map((g, i) => (
                    <li key={i}>
                      {g.permission} · {g.scope} {g.department}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {can("audit.read") && (
          <section className="panel">
            <h3>Audit events</h3>
            <button
              className="btn"
              onClick={async () => {
                try {
                  setEvents(
                    (await customFetch.get("/access/audit")).data.events,
                  );
                } catch (e) {
                  setError(e.response?.data?.msg || "Unable to load audit");
                }
              }}
            >
              Load latest 100 events
            </button>
            {events && (
              <ul>
                {events.map((e) => (
                  <li key={e.id}>
                    {new Date(e.created_at).toLocaleString()} · {e.action} ·{" "}
                    {e.target} · {e.outcome}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
