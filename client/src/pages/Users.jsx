import { useState } from 'react';
import { redirect, useLoaderData } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import { useDashboardContext } from './DashboardLayout';

export const loader = async () => {
  try {
    const [users, departments] = await Promise.all([customFetch.get('/users/users-list'), customFetch.get('/users/departments')]);
    return { users: users.data.users, departments: departments.data.departments };
  } catch { return redirect('/dashboard'); }
};
const Users = () => {
  const { users, departments } = useLoaderData();
  const { user } = useDashboardContext();
  const [tab, setTab] = useState('users');
  return <>
    <div className="page-heading"><h2>Users & departments</h2><p>Assignment lookup reference</p></div>
    <div className="reference-tabs" role="tablist" aria-label="Directory">
      <button type="button" role="tab" id="users-tab" aria-selected={tab === 'users'} aria-controls="directory-panel" className={`btn ${tab === 'users' ? '' : 'btn-secondary'}`} onClick={() => setTab('users')}>Users</button>
      <button type="button" role="tab" id="departments-tab" aria-selected={tab === 'departments'} aria-controls="directory-panel" className={`btn ${tab === 'departments' ? '' : 'btn-secondary'}`} onClick={() => setTab('departments')}>Departments</button>
    </div>
    <div className="reference-layout"><section className="directory-table" id="directory-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>
      <table>{tab === 'users' ? <><thead><tr><th>Name</th><th>Department</th></tr></thead><tbody>{users.map((person) => <tr key={person._id}><td>{person.name}</td><td>{person.department}</td></tr>)}</tbody></> : <><thead><tr><th>Department</th><th>Users</th></tr></thead><tbody>{departments.map((department) => <tr key={department}><td>{department}</td><td>{users.filter((person) => person.department === department).length}</td></tr>)}</tbody></>}</table>
      <p className="caption directory-footer">{user.role === 'admin' ? 'All departments' : user.department} · Read-only reference</p>
    </section><aside className="panel department-context"><h3>Department values</h3>{departments.map((department) => <p key={department}>{department}</p>)}<p className="caption">{user.role === 'admin' ? 'Your account can access all departments.' : 'Your account can access your own department.'}</p></aside></div>
  </>;
};
export default Users;
