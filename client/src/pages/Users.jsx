import { useState } from 'react';
import { redirect, useLoaderData } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import DesignIcon from '../components/DesignIcon';

export const loader = async () => {
  try {
    const [usersRes, deptsRes] = await Promise.all([
      customFetch.get('/users/users-list'),
      customFetch.get('/users/departments'),
    ]);
    return {
      users: usersRes.data.users || [],
      departments: deptsRes.data.departments || [],
    };
  } catch {
    return redirect('/dashboard');
  }
};

const Users = () => {
  const { users, departments } = useLoaderData();
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');

  const filteredUsers = users.filter((person) => {
    if (selectedDept !== 'all' && person.department !== selectedDept) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        person.name?.toLowerCase().includes(q) ||
        person.department?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Team & Department Directory</h2>
          <p>Authorized assignment lookup and organizational staff reference.</p>
        </div>
      </div>

      {/* Modern Sub-Tab Pill Bar */}
      <div className="access-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'users'}
          className={`access-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          <span>Team Members</span>
          <span className="badge">{users.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'departments'}
          className={`access-tab ${tab === 'departments' ? 'active' : ''}`}
          onClick={() => setTab('departments')}
        >
          <span>Departments</span>
          <span className="badge">{departments.length}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <input
          type="search"
          placeholder={tab === 'users' ? 'Search team member or department…' : 'Search department…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            minHeight: '36px',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--grey-200)',
            background: 'var(--background-secondary-color)',
            color: 'var(--text-color)',
            fontSize: '13px',
            width: '280px',
          }}
        />

        {tab === 'users' && (
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
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
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Directory Content */}
      <div className="panel" style={{ padding: '20px' }}>
        {tab === 'users' ? (
          !filteredUsers.length ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary-color)' }}>
              No team members match your current filter.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="asset-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Department</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((person) => {
                    const initials = (person.name || 'U')
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <tr key={person._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: '#1e3a8a',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '12px',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px' }}>{person.name}</span>
                              <span className="caption" style={{ fontSize: '11px' }}>
                                ID: {person._id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'var(--background-color)',
                              border: '1px solid var(--grey-200)',
                              fontSize: '13px',
                              fontWeight: 500,
                            }}
                          >
                            {person.department || 'Unassigned'}
                          </span>
                        </td>
                        <td>
                          <span className="status-pill status-success">Active Member</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {departments.map((dept) => {
              const count = users.filter((u) => u.department === dept).length;
              return (
                <div
                  key={dept}
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    border: '1px solid var(--grey-200)',
                    background: 'var(--background-secondary-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600 }}>{dept}</h4>
                    <span className="caption">Functional Unit</span>
                  </div>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '99px',
                      background: '#eff6ff',
                      color: '#1e3a8a',
                      fontWeight: 700,
                      fontSize: '13px',
                    }}
                  >
                    {count} {count === 1 ? 'member' : 'members'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Users;
