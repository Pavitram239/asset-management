import { useLoaderData, redirect, Link } from 'react-router-dom';
import customFetch from '../utils/customFetch';

export const loader = async () => {
  try { return (await customFetch.get('/users/admin/app-stats')).data; }
  catch { return redirect('/dashboard'); }
};
const Admin = () => {
  const { users, products } = useLoaderData();
  return <>
    <div className="page-heading"><h2>Admin statistics</h2><p>Current users and assets in your workspace.</p></div>
    <p className="scope-label">{'Your authorized scope'}</p>
    <div className="admin-metrics"><section className="panel metric-card"><h3>Current users</h3><strong>{users}</strong><p className="caption">{'Members in your authorized scope'}</p></section><section className="panel metric-card"><h3>Total assets</h3><strong>{products}</strong><p className="caption">{'Assets in your authorized scope'}</p></section></div>
    <section className="panel statistics-context"><h3>What these counts include</h3><p>Administrators see users and assets across the organization.</p><p>Department heads see users and assets in their own department.</p></section>
    <Link className="btn btn-secondary" to="/dashboard">Back to inventory</Link>
  </>;
};
export default Admin;
