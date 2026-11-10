import { Form, Link, redirect, useActionData } from 'react-router-dom';
import { FormRow, SubmitBtn } from '../components';
import AuthLayout from '../components/AuthLayout';
import customFetch from '../utils/customFetch';
import { toast } from 'react-toastify';

export const action = async ({ request }) => {
  const data = Object.fromEntries((await request.formData()).entries());
  try {
    await customFetch.post('/auth/login', data);
    toast.success('Signed in successfully');
    return redirect('/dashboard');
  } catch (error) {
    return { msg: error?.response?.data?.msg || 'Unable to sign in. Please verify your email and password.' };
  }
};

const Login = () => {
  const errors = useActionData();

  return (
    <AuthLayout>
      <Form method="post" className="auth-form" style={{ maxWidth: '440px' }}>
        <div className="page-heading">
          <h2>Welcome back</h2>
          <p>Sign in to your private company asset & inventory workspace.</p>
        </div>

        {errors?.msg && (
          <div role="alert" className="form-error">
            {errors.msg}
          </div>
        )}

        <div className="auth-fields">
          <FormRow
            type="email"
            name="email"
            labelText="Work Email"
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            maxLength={254}
          />
          <FormRow
            type="password"
            name="password"
            labelText="Password"
            placeholder="Enter your password"
            autoComplete="current-password"
            minLength={8}
            maxLength={72}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-12px' }}>
          <Link to="/forgot-password" style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500 }}>
            Forgot password?
          </Link>
        </div>

        <SubmitBtn text="Sign In to Workspace" waitingLabel="Signing in…" className="btn-block" />

        <div style={{ margin: '16px 0', borderTop: '1px solid var(--grey-200)', position: 'relative', textAlign: 'center' }}>
          <span style={{ position: 'relative', top: '-10px', background: 'var(--background-secondary-color)', padding: '0 12px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
            or
          </span>
        </div>

        <p className="auth-switch" style={{ margin: 0, textAlign: 'center', fontSize: '14px' }}>
          New organization? <Link to="/register" style={{ fontWeight: 600 }}>Create your company workspace 🚀</Link>
        </p>
      </Form>
    </AuthLayout>
  );
};

export default Login;
