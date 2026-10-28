import { createContext, useContext, useState } from "react";
import { Link, Outlet, redirect, useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router-dom";
import Wrapper from "../assets/wrappers/Dashboard";
import { BigSidebar, Navbar, SmallSidebar } from "../components";
import customFetch, { organizationKey } from "../utils/customFetch";
import { toast } from "react-toastify";
import useTheme from '../utils/useTheme';
import VerificationNotice from '../components/VerificationNotice';

export const loader = async () => {
  try {
    const { data } = await customFetch.get("/users/current-user");
    return data;
  } catch (error) {
    if(error.response?.status===403){sessionStorage.removeItem(organizationKey);const {data}=await customFetch.get('/users/current-user');return data;}
    return redirect("/");
  }
};

const DashboardContext = createContext();

const DashboardLayout = () => {
  const { user, organizations, activeOrganizationId } = useLoaderData();
  const revalidator=useRevalidator();
  const switchOrganization=(id)=>{
    sessionStorage.setItem(organizationKey,id);
    window.location.assign('/dashboard');
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isDarkTheme, toggleDarkTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const navigate = useNavigate();
  const navigation = useNavigation();

  const toggleSidebar = () => {
    setSidebarCollapsed((previous) => !previous);
  };

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const logoutUser = async () => {
    await customFetch.get("/auth/logout");
    sessionStorage.removeItem(organizationKey);
    navigate("/");
    toast.success("Logout successful");
  };

  return (
    <DashboardContext.Provider
      value={{
        user, organizations, activeOrganizationId, switchOrganization, refreshAccess:()=>revalidator.revalidate(),
        sidebarCollapsed,
        isDarkTheme,
        toggleDarkTheme,
        toggleSidebar,
        logoutUser,
        open,
        onOpenModal,
        onCloseModal,
      }}
    >
      <Wrapper className={sidebarCollapsed ? 'sidebar-collapsed' : ''}>
        <main className="dashboard">
          <SmallSidebar />
          <BigSidebar />
          <div className="workspace-main">
            <Navbar />
            <div className="dashboard-page">
              {navigation.state !== 'idle' && <div className="route-progress" role="status">Updating workspace…</div>}
              <VerificationNotice key={user.email} user={user} refresh={()=>revalidator.revalidate()} />
              {!activeOrganizationId && <section className="panel"><h2>{organizations.length ? 'Select an organization' : 'Set up your workspace'}</h2>
                {organizations.length ? <p>Choose your organization in the header to open its workspace.</p> : <p>{user.emailVerified ? <>Create your company workspace or reopen an employee invitation. <Link to="/dashboard/workspaces">Create workspace</Link></> : 'Verify your email above, then create your company or accept an invitation.'}</p>}
              </section>}
              <Outlet context={{ user }} />
            </div>
          </div>
        </main>
      </Wrapper>
    </DashboardContext.Provider>
  );
};

export const useDashboardContext = () => {
  return useContext(DashboardContext);
};
export default DashboardLayout;
