import { useLoaderData, redirect } from 'react-router-dom';
import { toast } from 'react-toastify';
import customFetch from '../utils/customFetch';
import AssetForm from '../components/AssetForm';

export const loader = async ({ params }) => {
  try {
    const [product, users, departments] = await Promise.all([customFetch.get(`/products/${params.id}`), customFetch.get('/users/users-list'), customFetch.get('/users/departments')]);
    return { product: product.data.product, users: users.data.users, departments: departments.data.departments };
  } catch (error) { toast.error(error?.response?.data?.msg || 'Unable to load this asset.'); return redirect('/dashboard'); }
};
export const action = async ({ request, params }) => {
  try {
    await customFetch.patch(`/products/${params.id}`, await request.formData());
    toast.success('Asset updated successfully');
    return redirect('/dashboard');
  } catch (error) { toast.error(error?.response?.data?.msg || 'Unable to update this asset.'); return null; }
};
const EditProduct = () => {
  const { product, users, departments } = useLoaderData();
  return <AssetForm key={product._id} product={product} users={users} departments={departments} />;
};
export default EditProduct;
