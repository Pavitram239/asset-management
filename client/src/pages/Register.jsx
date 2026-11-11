import { Form, redirect, Link, useActionData } from 'react-router-dom';
import { FormRow, SubmitBtn } from '../components';
import AuthLayout from '../components/AuthLayout';
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
    toast.success('Account created successfully.');
    return redirect('/dashboard');
  } catch (error) {
    return { msg: error?.response?.data?.msg || 'Unable to register. Please try again.' };
  }
};

const Register = () => {
  const errors = useActionData();

  return (
    <AuthLayout>
      <Form method="post" className="auth-form" style={{ maxWidth: '480px' }}>
        <div className="page-heading">
          <h2>Create User Account</h2>
          <p>Register your account or activate your client organization access.</p>
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--background-secondary-color)', borderRadius: '8px', border: '1px solid var(--grey-200)', marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          ℹ️ <strong>Client Organizations:</strong> New company workspaces are provisioned by your platform administrator. If you received an invitation link, click the link in your email to set up your administrator or employee access.
        </div>

        {errors?.msg && <p className="form-error" role="alert">{errors.msg}</p>}

        <div className="auth-fields registration-fields" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '14px 16px', background: 'var(--background-secondary-color)', borderRadius: '10px', border: '1px solid var(--grey-200)' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '10px' }}>
              👤 User Account
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormRow
                name="name"
                labelText="Full Name"
                placeholder="e.g. Jane Doe"
                required
                maxLength={60}
              />
              <FormRow
                name="firstName"
                labelText="First Name"
                placeholder="Jane"
                maxLength={40}
              />
            </div>

            <FormRow
              type="email"
              name="email"
              labelText="Work Email"
              placeholder="you@company.com"
              autoComplete="email"
              required
              maxLength={254}
            />

            <FormRow
              type="password"
              name="password"
              labelText="Password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </div>

          <SubmitBtn text="Create Account" />

          <p style={{ textAlign: 'center', fontSize: '13px', marginTop: '10px', color: 'var(--text-secondary-color)' }}>
            Already have an account?{' '}
            <Link to="/" style={{ color: 'var(--primary-600)', fontWeight: 600 }}>
              Sign in
            </Link>
          </p>
        </div>
      </Form>
    </AuthLayout>
  );
};

export default Register;
