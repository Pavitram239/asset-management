import { useState } from "react";
import { toast } from "react-toastify";
import { ProductsContainer, SearchContainer } from "../components";
import customFetch from "../utils/customFetch";
import { useLoaderData } from "react-router-dom";
import { useContext, createContext } from "react";
import { Link } from 'react-router-dom';
import { useDashboardContext } from './DashboardLayout';
import DesignIcon from '../components/DesignIcon';

export const loader = async ({ request }) => {
  const params = Object.fromEntries([
    ...new URL(request.url).searchParams.entries(),
  ]);

  return await customFetch
    .get("/products", {
      params,
    })
    .then(({ data }) => {
      return { data, searchValues: { ...params } };
    })
    .catch((error) => {
      toast.error(error?.response?.data?.msg || error.message);
      throw error;
    });
};

const AllProductsContext = createContext();

const AllProducts = () => {
  const [open, setOpen] = useState(false);

  const onOpenModal = () => setOpen(true);
  const onCloseModal = () => setOpen(false);

  const { data, searchValues } = useLoaderData();
  const [filtersOpen, setFiltersOpen] = useState(() => Boolean(searchValues.productStatus && searchValues.productStatus !== 'all' || searchValues.productWarranty && searchValues.productWarranty !== 'all' || searchValues.sort && searchValues.sort !== 'newest'));
  const { user } = useDashboardContext();
  return (
    <AllProductsContext.Provider
      value={{ data, searchValues, open, onOpenModal, onCloseModal, filtersOpen, setFiltersOpen }}
    >
      <div className="page-heading">
        <div><h2>{filtersOpen ? 'Inventory' : 'Your inventory, in focus.'}</h2><p>{filtersOpen ? user.role === 'admin' ? 'All departments · Admin access' : `${user.department} · Department access` : `Welcome back, ${user.name?.split(' ')[0] || 'there'}. Browse your assets and their assignments.`}</p></div>
        {user.role !== 'user' && <Link className="btn inventory-add" to="add-product"><DesignIcon name="plus-white" />Add asset</Link>}
      </div>
      <SearchContainer />
      <ProductsContainer />
    </AllProductsContext.Provider>
  );
};

export const useAllProductsContext = () => useContext(AllProductsContext);

export default AllProducts;
