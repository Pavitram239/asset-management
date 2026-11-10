import { hasPermission } from '../utils/permissions';
import { Form, Link, useOutletContext } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import { toast } from 'react-toastify';
import { FormRow, FormRowFile, SubmitBtn } from '../components';
import DesignIcon from '../components/DesignIcon';
import { useDashboardContext } from './DashboardLayout';

export const action = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('avatar');
  if (file && file.size > 500000) {
    toast.error('Choose an image smaller than 0.5 MB.');
    return null;
  }
  try {
    await customFetch.patch('/users/update-user', formData);
    toast.success('Profile updated successfully');
  } catch (error) {
    toast.error(error?.response?.data?.msg || 'Unable to update your profile.');
  }
  return null;
};

const Profile = () => {
  const { user } = useOutletContext();
  const { isDarkTheme, toggleDarkTheme, logoutUser, activeOrganizationId } = useDashboardContext();

  const initials = (user.name || 'User')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Account & Profile Settings</h2>
          <p>Manage your personal profile details, avatar, and security preferences.</p>
        </div>
      </div>

      {/* Profile Overview Header Card */}
      <div
        className="panel"
        style={{
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--primary-100)',
              }}
            />
          ) : (
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: '#172554',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
                border: '3px solid var(--primary-100)',
              }}
            >
              {initials}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{user.name}</h3>
              {user.emailVerified ? (
                <span className="status-pill status-success" style={{ fontSize: '11px' }}>
                  ✓ Verified
                </span>
              ) : (
                <span className="status-pill status-warning" style={{ fontSize: '11px' }}>
                  Pending Verification
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary-color)', fontSize: '14px' }}>
              {user.email} · Department: <strong>{user.department || 'General'}</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={toggleDarkTheme}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '8px 14px', fontSize: '13px' }}
          >
            <DesignIcon name="moon" />
            {isDarkTheme ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={logoutUser}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '8px 14px', fontSize: '13px', color: '#b91c1c' }}
          >
            <DesignIcon name="logout" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Settings Layout */}
      <div className="form-layout profile-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '24px', alignItems: 'start' }}>
        <Form method="post" className="panel profile-form" encType="multipart/form-data" key={user.updatedAt} style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600 }}>Personal Details</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormRowFile name="avatar" label="Profile Avatar" help="PNG or JPG · Maximum 0.5 MB" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormRow name="name" labelText="Full Name *" defaultValue={user.name} autoComplete="name" required maxLength={200} />
              <FormRow name="email" labelText="Email Address *" type="email" defaultValue={user.email} autoComplete="email" required maxLength={254} />
            </div>

            <FormRow name="location" labelText="Workplace Location" defaultValue={user.location} maxLength={500} placeholder="e.g. Building A, Desk 14" />

            <div style={{ marginTop: '8px' }}>
              <SubmitBtn text="Save Profile Changes" waitingLabel="Saving…" />
            </div>
            <p className="caption" style={{ margin: 0 }}>
              Your profile picture and details appear on your asset requests and team directory.
            </p>
          </div>
        </Form>

        {/* Aside Quick Links */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section className="panel" style={{ padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>Workspace Context</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div>
                <span className="caption" style={{ display: 'block' }}>Role Scope</span>
                <strong>{user.grants?.some((g) => g.scope === 'organization') ? 'Company-Wide Scope' : 'Departmental Scope'}</strong>
              </div>
              <div>
                <span className="caption" style={{ display: 'block' }}>Total Effective Grants</span>
                <strong>{user.grants?.length || 0} Permissions</strong>
              </div>
            </div>
          </section>

          <div className="context-note" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <DesignIcon name="info" />
            <p style={{ margin: 0 }}>
              Role assignments and departmental transfers are managed securely by your organization administrator.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
};

export default Profile;
