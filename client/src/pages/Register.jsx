import { Form, redirect, Link, useActionData } from 'react-router-dom';
import { FormRow, SubmitBtn } from '../components';
import AuthLayout from '../components/AuthLayout';
import DesignIcon from '../components/DesignIcon';
import customFetch, { organizationKey } from '../utils/customFetch';
import { toast } from 'react-toastify';

export const action = async ({ request }) => {
  const data = Object.fromEntries((await request.formData()).entries());
  try {
    const res = await customFetch.post('/auth/register', data);
    const { organization } = res.data;
    if (organization?.id) {
      sessionStorage.setItem(organizationKey, organization.id);
    }
    toast.success(`Welcome to ${organization?.name || 'your workspace'}! Your company workspace is ready.`);
    return redirect('/dashboard');
  } catch (error) {
    return { msg: error?.response?.data?.msg || 'Unable to register company. Please try again.' };
  }
};

const Register = () => {
  const errors = useActionData();

  return (
    <AuthLayout>
      <Form method="post" className="auth-form" style={{ maxWidth: '480px' }}>
        <div className="page-heading">
          <h2>Register Your Company</h2>
          <p>Create your organization and launch your private tenant schema.</p>
        </div>

        {errors?.msg && <p className="form-error" role="alert">{errors.msg}</p>}

        <div className="auth-fields registration-fields" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* SECTION 1: ABOUT THE COMPANY */}
          <div style={{ padding: '14px 16px', background: 'var(--background-secondary-color)', borderRadius: '10px', border: '1px solid var(--grey-200)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '10px' }}>
              🏢 1. Company / Organization
            </span>

            <FormRow
              name="companyName"
              labelText="Company / Organization Name *"
              placeholder="e.g. Atmiya Vidya Dham or Apex Tech"
              required
              maxLength={200}
            />

            <label className="form-row" style={{ marginTop: '10px' }}>
              <span className="form-label">Organization Type</span>
              <select className="form-select" name="organizationType" defaultValue="ngo">
                <option value="ngo">Non-Profit / NGO / Trust</option>
                <option value="corporate">Corporate / IT & Tech</option>
                <option value="education">Educational Institution / Campus</option>
                <option value="healthcare">Healthcare & Hospital</option>
                <option value="manufacturing">Manufacturing & Industrial</option>
                <option value="hospitality">Events & Hospitality</option>
                <option value="general">General Business Enterprise</option>
              </select>
            </label>
          </div>

          {/* SECTION 2: ABOUT THE CEO / OWNER */}
          <div style={{ padding: '14px 16px', background: 'var(--background-secondary-color)', borderRadius: '10px', border: '1px solid var(--grey-200)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '10px' }}>
              👤 2. CEO / Administrator
            </span>

            <FormRow
              name="name"
              labelText="Full Name *"
              placeholder="e.g. Pavitra Patel"
              autoComplete="name"
              required
              maxLength={200}
            />

            <FormRow
              type="email"
              name="email"
              labelText="Work Email *"
              placeholder="you@company.com"
              autoComplete="email"
              required
              maxLength={254}
            />

            <FormRow
              type="password"
              name="password"
              labelText="Password *"
              placeholder="Create strong password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              help="Minimum 8 characters."
            />
          </div>

          <div className="context-note" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
            <DesignIcon name="check" />
            <span>Includes dedicated PostgreSQL tenant schema, default roles, and starter facility setup.</span>
          </div>
        </div>

        <SubmitBtn text="🚀 Create Company & Launch Dashboard" waitingLabel="Provisioning Schema…" className="btn-block" style={{ marginTop: '16px' }} />

        <p className="auth-switch" style={{ marginTop: '14px', textAlign: 'center' }}>
          Already have an account? <Link to="/">Sign in</Link>
        </p>
      </Form>
    </AuthLayout>
  );
};

export default Register;
