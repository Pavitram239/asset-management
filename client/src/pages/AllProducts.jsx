import { useState } from "react";
import { toast } from "react-toastify";
import { ProductsContainer, SearchContainer } from "../components";
import customFetch, { organizationKey } from "../utils/customFetch";
import { useLoaderData,redirect } from "react-router-dom";
import { useContext, createContext } from "react";
import { Link } from 'react-router-dom';
import { useDashboardContext } from './DashboardLayout';
import { hasPermission } from '../utils/permissions';
import DesignIcon from '../components/DesignIcon';

export const loader = async ({ request }) => {
  const params = Object.fromEntries([
    ...new URL(request.url).searchParams.entries(),
  ]);

  if(!sessionStorage.getItem(organizationKey)) return {data:{products:[],totalProducts:0,numOfPages:0,currentPage:1},searchValues:params};
  // The legacy register is one entry point; current stock/catalog grants have
  // their own screen and must not produce a misleading permission-denied toast.
  try{
    const {data:{user}}=await customFetch.get('/users/current-user');
    if(!hasPermission(user,'asset.read')){
      if(['catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening'].some(permission=>hasPermission(user,permission)))return redirect('/dashboard/catalog');
      return {data:{products:[],totalProducts:0,numOfPages:0,currentPage:1},searchValues:params};
    }
  }catch(error){if(error.response?.status===401)return redirect('/');}
  return await customFetch
    .get("/products", {
      params,
    })
    .then(({ data }) => {
      return { data, searchValues: { ...params } };
    })
    .catch((error) => {
      toast.error(error?.response?.data?.msg || error.message);
      if([400,403].includes(error.response?.status)) return {data:{products:[],totalProducts:0,numOfPages:0,currentPage:1},searchValues:params};
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
  const { user,activeOrganizationId } = useDashboardContext();
  if(!activeOrganizationId) return null;
  if(!hasPermission(user,'asset.read')) return <section className="panel empty-state"><h2>No asset access assigned</h2><p>Your organization administrator can assign a role or an asset permission.</p></section>;
  return (
    <AllProductsContext.Provider
      value={{ data, searchValues, open, onOpenModal, onCloseModal, filtersOpen, setFiltersOpen }}
    >
      <div className="page-heading">
        <div><h2>{filtersOpen ? 'Inventory' : 'Your inventory, in focus.'}</h2><p>{filtersOpen ? 'Assets within your granted scope' : `Welcome back, ${user.name?.split(' ')[0] || 'there'}. Browse your assets and their assignments.`}</p></div>
        {hasPermission(user,'asset.create') && <Link className="btn inventory-add" to="add-product"><DesignIcon name="plus-white" />Add asset</Link>}
      </div>
      <SearchContainer />
      <ProductsContainer />
    </AllProductsContext.Provider>
  );
};

export const useAllProductsContext = () => useContext(AllProductsContext);

export default AllProducts;
