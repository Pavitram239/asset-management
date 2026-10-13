import { Form, Link, redirect, useActionData } from 'react-router-dom';
import { FormRow, SubmitBtn } from '../components';
import AuthLayout from '../components/AuthLayout';
import customFetch from '../utils/customFetch';
import { toast } from 'react-toastify';

export const action = async ({ request }) => {
  const data = Object.fromEntries((await request.formData()).entries());
  try {
    await customFetch.post('/auth/login', data);
    toast.success('Login successful');
    return redirect('/dashboard');
  } catch (error) { return { msg: error?.response?.data?.msg || 'Unable to sign in. Please try again.' }; }
};
const Login = () => {
  const errors = useActionData();
  return <AuthLayout><Form method="post" className="auth-form">
    <div className="page-heading"><h2>Welcome back</h2><p>Sign in to your asset workspace.</p></div>
    {errors?.msg && <p className="form-error" role="alert">{errors.msg}</p>}
    <div className="auth-fields">
      <FormRow type="email" name="email" labelText="Email" placeholder="you@example.com" autoComplete="email" autoFocus maxLength={254} />
      <FormRow type="password" name="password" labelText="Password" placeholder="Enter your password" autoComplete="current-password" minLength={8} maxLength={72} help="At least 8 characters." />
    </div>
    <SubmitBtn text="Sign In" waitingLabel="Signing in" className="btn-block" />
    <p className="auth-switch">New to Asset Manager? <Link to="/register">Register</Link></p>
  </Form></AuthLayout>;
};
export default Login;
