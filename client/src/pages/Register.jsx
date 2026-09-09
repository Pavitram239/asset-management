import { Form, redirect, Link } from "react-router-dom";
import Wrapper from "../assets/wrappers/RegisterAndLoginPage";
import { FormRow, FormRowSelect, Logo, SubmitBtn } from "../components";
import customFetch from "../utils/customFetch";
import { toast } from "react-toastify";
import { USER_DEPARTMENTS } from "../utils/constants";
export const action = async ({ request }) => {
  const formData = await request.formData();
  const data = Object.fromEntries(formData.entries());
  try {
    await customFetch.post("/auth/register", data);
    toast.success("Registration successful");
    return redirect("/");
  } catch (error) {
    toast.error(error?.response?.data?.msg || error.message);
    return error;
  }
};

const Register = () => {
  return (
    <Wrapper>
      <Form method="POST" className="form">
        <Logo />
        <h4>Register</h4>
        <FormRow type="text" name="name" placeholder="Enter your name" />
        <FormRow
          type="text"
          name="location"
          placeholder="Enter your location"
        />
        <FormRow type="email" name="email" placeholder="Enter your email" />
        <FormRow
          type="password"
          name="password"
          placeholder="Enter your password"
        />
        <FormRowSelect name="department" list={USER_DEPARTMENTS} />
        <FormRowSelect name="role" list={["user", "head", "admin"]} />
        <SubmitBtn formBtn text="Register" waitingLabel="Registering" />
        <p>
          Already a member?
          <Link to="/login" className="member-btn">
            Login
          </Link>
        </p>
      </Form>
    </Wrapper>
  );
};

export default Register;
