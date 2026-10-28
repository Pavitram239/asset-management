import { useLoaderData, redirect } from 'react-router-dom';
import { toast } from 'react-toastify';
import { saveAs } from 'file-saver';
import customFetch from '../utils/customFetch';
import AssetForm from '../components/AssetForm';

export const action = async ({ request }) => {
  try {
    const { data } = await customFetch.post('/products', await request.formData());
    toast.success('Asset added successfully');
    if (data.product?.qr && window.confirm('Download the QR code for this asset?')) saveAs(data.product.qr, `${data.product._id}.png`);
    return redirect('/dashboard');
  } catch (error) { toast.error(error?.response?.data?.msg || 'Unable to add the asset.'); return null; }
};
export const loader = async () => {
  try {
    const [users, departments] = await Promise.all([customFetch.get('/users/users-list'), customFetch.get('/users/departments')]);
    return { users: users.data.users, departments: departments.data.departments };
  } catch { toast.error('You are not authorized to add assets.'); return redirect('/dashboard'); }
};
const AddProduct = () => {
  const { users, departments } = useLoaderData();
  return <AssetForm users={users} departments={departments} />;
};
export default AddProduct;
