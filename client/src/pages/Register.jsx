import { Form, redirect, Link, useActionData } from 'react-router-dom';
import { FormRow, SubmitBtn } from '../components';
import AuthLayout from '../components/AuthLayout';
import DesignIcon from '../components/DesignIcon';
import customFetch from '../utils/customFetch';
import { toast } from 'react-toastify';


export const action = async ({ request }) => {
  const data = Object.fromEntries((await request.formData()).entries());
  try {
    await customFetch.post('/auth/register', data);
    toast.success('Account created. Check your email for a verification link, then sign in.');
    return redirect('/');
  } catch (error) { return { msg: error?.response?.data?.msg || 'Unable to register. Please try again.' }; }
};
const Register = () => {
  const errors = useActionData();
  return <AuthLayout><Form method="post" className="auth-form">
    <div className="page-heading"><h2>Create your account</h2><p>Register, verify your email, then sign in.</p></div>
    {errors?.msg && <p className="form-error" role="alert">{errors.msg}</p>}
    <div className="auth-fields registration-fields">
      <FormRow name="name" labelText="Name" placeholder="Your full name" autoComplete="name" maxLength={200} />
      <FormRow name="location" labelText="Location" placeholder="Your location" maxLength={500} />
      <FormRow type="email" name="email" labelText="Email" placeholder="you@example.com" autoComplete="email" maxLength={254} />
      <FormRow type="password" name="password" labelText="Password" placeholder="Choose a password" autoComplete="new-password" minLength={8} maxLength={72} help="Minimum 8 characters." />
      <div className="context-note warning-note"><DesignIcon name="info-warning" /><p>Verify your email to create your own company workspace or accept an employee invitation. Access stays separate for each company.</p></div>
    </div>
    <SubmitBtn text="Register" waitingLabel="Registering" className="btn-block" />
    <p className="auth-switch">Already registered? <Link to="/">Login</Link></p>
  </Form></AuthLayout>;
};
export default Register;
