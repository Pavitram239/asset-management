import React from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import {
  HomeLayout,
  Landing,
  DashboardLayout,
  Login,
  Register,
  Error,
  Stats,
  Profile,
  Admin,
  AllProducts,
  AddProduct,
  EditProduct,
} from "./pages";
import { action as registerAction } from "./pages/Register";
import { action as loginAction } from "./pages/Login";
import { action as addProductAction } from "./pages/AddProduct";
import { action as deleteProductAction } from "./pages/DeleteProduct";
import { action as profileAction } from "./pages/Profile";
import { action as editProductAction } from "./pages/EditProduct";
import { loader as dashboardLoader } from "./pages/DashboardLayout";
import { loader as allProductsLoader } from "./pages/AllProducts";
import { loader as adminLoader } from "./pages/Admin";
import { loader as editProductLoader } from "./pages/EditProduct";
import { loader as addProductLoader } from "./pages/AddProduct";
import { loader as statsLoader } from './pages/Stats';
import Users, { loader as usersLoader } from './pages/Users';
const router = createBrowserRouter([
  {
    path: "/",
    element: <HomeLayout />,
    errorElement: <Error />,
    children: [
      {
        index: true,
        element: <Login />,
        action: loginAction,
      },
      {
        path: "register",
        element: <Register />,
        action: registerAction,
      },
      {
        path: "dashboard",
        element: <DashboardLayout />,
        loader: dashboardLoader,
        children: [
          {
            index: true,
            element: <AllProducts />,
            loader: allProductsLoader,
          },
          {
            path: "add-product",
            element: <AddProduct />,
            action: addProductAction,
            loader: addProductLoader,
          },
          { path: "profile", element: <Profile />, action: profileAction },
          { path: "admin", element: <Admin />, loader: adminLoader },
          { path: 'users', element: <Users />, loader: usersLoader },
          {
            path: "edit-product/:id",
            element: <EditProduct />,
            loader: editProductLoader,
            action: editProductAction,
          },
          { path: "delete-product/:id", action: deleteProductAction },
          { path: "stats", element: <Stats />, loader: statsLoader },
        ],
      },
    ],
  },
]);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
