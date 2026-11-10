import { useLoaderData, redirect, Link } from 'react-router-dom';
import customFetch from '../utils/customFetch';
import DesignIcon from '../components/DesignIcon';
import { useDashboardContext } from './DashboardLayout';

export const loader = async () => {
  try {
    return (await customFetch.get('/users/admin/app-stats')).data;
  } catch {
    return redirect('/dashboard');
  }
};

const Admin = () => {
  const { users, products } = useLoaderData();
  const { user } = useDashboardContext();

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Executive Statistics & Health</h2>
          <p>Real-time operational summary of assets, personnel, and inventory within your scope.</p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">
          Back to Inventory
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Metric 1: Total Assets */}
        <div
          className="panel"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderLeft: '4px solid #1e3a8a',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Assets
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e3a8a' }}>
              <DesignIcon name="package" />
            </div>
          </div>
          <strong style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-color)', lineHeight: 1 }}>
            {products}
          </strong>
          <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
            Physical serialized and catalog assets in your authorized scope.
          </p>
        </div>

        {/* Metric 2: Authorized Members */}
        <div
          className="panel"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderLeft: '4px solid #0f766e',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Active Personnel
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e' }}>
              <DesignIcon name="users" />
            </div>
          </div>
          <strong style={{ fontSize: '36px', fontWeight: 800, color: 'var(--text-color)', lineHeight: 1 }}>
            {users}
          </strong>
          <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
            Authorized team members and departmental staff.
          </p>
        </div>

        {/* Metric 3: Company Context */}
        <div
          className="panel"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderLeft: '4px solid #f59e0b',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tenant Isolation
            </span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
              <DesignIcon name="check" />
            </div>
          </div>
          <strong style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-color)', marginTop: '8px' }}>
            Schema Active
          </strong>
          <p className="caption" style={{ margin: 0, marginTop: '4px' }}>
            PostgreSQL dedicated tenant partition with zero cross-tenant leakage.
          </p>
        </div>
      </div>

      {/* Scope Explanation & Quick Shortcuts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <section className="panel" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
            Understanding Scope & Governance
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary-color)', lineHeight: 1.6, margin: '0 0 12px 0' }}>
            Metrics reflect your authenticated role and permission boundaries:
          </p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1e3a8a' }} />
              <strong>Company Owners & Admins:</strong> View global metrics across all branches and departments.
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0f766e' }} />
              <strong>Department Heads:</strong> View metrics bounded strictly to their department.
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }} />
              <strong>Employees:</strong> View statistics bounded to their personal custody.
            </li>
          </ul>
        </section>

        <section className="panel" style={{ padding: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>
            Quick Operations
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Link to="/dashboard/requisitions" className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px' }}>
              📦 Requisitions
            </Link>
            <Link to="/dashboard/catalog" className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px' }}>
              📋 Catalog Master
            </Link>
            <Link to="/dashboard/inventory-setup" className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px' }}>
              ⚙️ Inventory Setup
            </Link>
            <Link to="/dashboard/access" className="btn btn-secondary" style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px' }}>
              👥 Access Control
            </Link>
          </div>
        </section>
      </div>
    </>
  );
};

export default Admin;
