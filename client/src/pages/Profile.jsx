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
  if (file && file.size > 500000) { toast.error('Choose an image smaller than 0.5 MB.'); return null; }
  try { await customFetch.patch('/users/update-user', formData); toast.success('Profile updated successfully'); }
  catch (error) { toast.error(error?.response?.data?.msg || 'Unable to update your profile.'); }
  return null;
};
const Profile = () => {
  const { user } = useOutletContext();
  const { isDarkTheme, toggleDarkTheme, logoutUser } = useDashboardContext();
  return <>
    <div className="page-heading"><h2>Your profile</h2><p>Manage the details shown for your account.</p></div>
    <div className="form-layout profile-layout">
      <Form method="post" className="panel profile-form" encType="multipart/form-data" key={user.updatedAt}>
        <h3>Personal information</h3>
        <FormRowFile name="avatar" label="Avatar" help="Images only · max 0.5 MB" />
        <FormRow name="name" labelText="Name" defaultValue={user.name} autoComplete="name" maxLength={200} />
        <FormRow name="email" labelText="Email" type="email" defaultValue={user.email} autoComplete="email" maxLength={254} />
        <FormRow name="location" labelText="Location" defaultValue={user.location} maxLength={500} />
        <SubmitBtn text="Update Profile" waitingLabel="Updating profile" />
        <p className="caption">Your saved avatar appears in the workspace header. Updates keep you on this page.</p>
      </Form>
      <aside className="form-context">
        <section className="panel account-context"><h3>Workspace menu</h3><strong>{user.name} · {user.department || 'No department'}</strong>
          {hasPermission(user,'directory.read') && <><Link to="/dashboard/users"><DesignIcon name="users" />Users & departments</Link></>}{hasPermission(user,'statistics.read') && <><Link to="/dashboard/admin"><DesignIcon name="chart" />Admin statistics</Link></>}
          <button type="button" onClick={toggleDarkTheme}><DesignIcon name="moon" />Switch to {isDarkTheme ? 'light' : 'dark'} theme</button>
          <button type="button" onClick={logoutUser}><DesignIcon name="logout" />Log out</button>
        </section>
        <div className="context-note"><DesignIcon name="info" /><p>Your role and department are managed by your administrator.</p></div>
      </aside>
    </div>
  </>;
};
export default Profile;
