import { createContext, useContext, useState } from "react";
import { Outlet, redirect, useLoaderData, useNavigate, useNavigation } from "react-router-dom";
import Wrapper from "../assets/wrappers/Dashboard";
import { BigSidebar, Navbar, SmallSidebar } from "../components";
import customFetch from "../utils/customFetch";
import { toast } from "react-toastify";
import useTheme from '../utils/useTheme';

export const loader = async () => {
  try {
    const { data } = await customFetch.get("/users/current-user");
    return data;
  } catch (error) {
    return redirect("/");
  }
};

const DashboardContext = createContext();

const DashboardLayout = () => {
  const { user } = useLoaderData();
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
    navigate("/");
    toast.success("Logout successful");
  };

  return (
    <DashboardContext.Provider
      value={{
        user,
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
