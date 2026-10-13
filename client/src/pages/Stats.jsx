import { Link, useLoaderData } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import { useDashboardContext } from './DashboardLayout';

export const loader = async () => (await customFetch.get('/products/overview')).data;

const Stats = () => {
  const { total, assigned, outside, expired, departments, recent } = useLoaderData();
  const { user } = useDashboardContext();
  const metrics = [
    ['Total assets', total, 'Equipment in your workspace'],
    ['Assigned assets', assigned, 'Assets with a named owner'],
    ['Out of campus', outside, 'Equipment away from campus'],
    ['Expired warranty', expired, 'Assets marked as expired'],
  ];
  return <>
    <div className="page-heading"><div><span className="eyebrow">Workspace / Overview</span><h2>Everything in view.</h2><p>{user.role === 'admin' ? 'Your organization' : 'Your department'}’s assets, ownership and coverage at a glance.</p></div><Link to="/dashboard" className="btn">Browse assets →</Link></div>
    <div className="metric-grid">{metrics.map(([label, count, description], index) => <article className="metric-card" key={label}><span className="metric-index">0{index + 1}</span><h3>{label}</h3><strong>{count}</strong><p>{description}</p></article>)}</div>
    <div className="overview-grid">
      <section className="asset-panel"><div className="panel-heading"><h3>Assets by department</h3><span>Distribution</span></div><div className="department-list">{departments.length ? departments.map((department) => <div className="department-row" key={department._id || 'unknown'}><div><span>{department._id || 'Unspecified'}</span><strong>{department.count}</strong></div><progress value={department.count} max={Math.max(total, 1)} aria-label={`${department._id || 'Unspecified'} assets`} /></div>) : <p className="muted">Add an asset to see your department breakdown.</p>}</div></section>
      <section className="asset-panel"><div className="panel-heading"><h3>Recently updated</h3><Link to="/dashboard">View register →</Link></div><div className="recent-list">{recent.length ? recent.map((asset) => <div className="recent-row" key={asset._id}><span className="asset-initial">{asset.name.slice(0, 1).toUpperCase()}</span><div><strong>{asset.name}</strong><small>{asset.department} · {asset.status}</small></div><time dateTime={asset.updatedAt}>{new Date(asset.updatedAt).toLocaleDateString()}</time></div>) : <p className="muted">No recent assets yet.</p>}</div></section>
    </div>
  </>;
};
export default Stats;
