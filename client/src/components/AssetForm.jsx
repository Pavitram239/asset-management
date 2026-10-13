import { useState } from 'react';
import { Form, Link } from 'react-router-dom';
import { useDashboardContext } from '../pages/DashboardLayout';
import { FormRow, FormRowSelect, FormRowFile, FormDatePicker, FormSelectGroup, SubmitBtn, Modal, DynamicField } from '.';
import DesignIcon from './DesignIcon';
import { FIELDS, PRODUCT_STATUS, USER_DEPARTMENTS } from '../utils/constants';

const AssetForm = ({ product, users, departments }) => {
  const { user } = useDashboardContext();
  const editing = Boolean(product);
  const initialFields = FIELDS.filter((field) => product?.[field.name] !== undefined && product?.[field.name] !== null && product?.[field.name] !== '');
  const [fields, setFields] = useState(initialFields);
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState(product?.department || (departments.includes(user.department) ? user.department : departments[0]));
  const usersList = users.filter((person) => person.department === department).map((person) => ({ name: person.name, value: person._id, category: person.department }));
  const removedFields = initialFields.filter((field) => !fields.some((selected) => selected.name === field.name));
  return <>
    <div className="page-heading"><h2>{editing ? 'Edit asset' : 'Add asset'}</h2><p>{editing ? `${product.name} · ${product.company}` : 'Create a record and assign it to a user.'}</p></div>
    <div className="form-layout">
      <Form method="post" className="panel asset-form" encType="multipart/form-data">
        <h3>Asset information</h3><p className="caption">Fields marked * are required.</p>
        <FormRowFile name="productImg" label="Product image" help={editing && product.productImg ? 'Existing image is retained unless you choose a replacement.' : undefined} />
        <div className="field-grid"><FormRow name="name" labelText="Name" placeholder="Asset name" defaultValue={product?.name} maxLength={500} /><FormRow name="company" labelText="Company" placeholder="Company name" defaultValue={product?.company} maxLength={500} /></div>
        <div className="field-grid">
          <FormDatePicker name="purchaseDate" labelText="Purchase date" defaultValue={product?.purchaseDate} max help="Optional · latest date is today." />
          <FormRowSelect name="department" labelText="Department" list={departments} value={department} onChange={(event) => setDepartment(event.target.value)} help={user.role === 'admin' ? 'Choose the department responsible for this asset.' : 'Assets remain within your department.'} />
        </div>
        <FormSelectGroup key={department} name="assignedToId" labelText="Assigned to" list={usersList} categories={USER_DEPARTMENTS} defaultValue={product?.department === department ? product.assignedToId || '' : ''} help="Choose a user from this asset’s department, or leave it unassigned." />
        <FormRowSelect name="status" labelText="Status" list={PRODUCT_STATUS} defaultValue={product?.status || PRODUCT_STATUS.IN_DEPT} help="In department · Not in Department · Out of campus" />
        <section className="optional-fields">
          <div className="optional-fields-heading"><h4>Optional fields</h4><button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}><DesignIcon name="plus" />Add Fields</button></div>
          {!fields.length && <p className="caption">None selected. Choose from the six supported fields.</p>}
          <div className="optional-inputs">{fields.map((field) => field.type === 'date'
            ? <FormDatePicker name={field.name} labelText={field.label} defaultValue={product?.[field.name]} key={field.name} />
            : field.type === 'file' ? <FormRowFile name={field.name} label={field.label} key={field.name} />
              : <FormRow name={field.name} labelText={field.label} defaultValue={product?.[field.name]} required={false} maxLength={500} key={field.name} />)}
          </div>
          {removedFields.map((field) => field.type !== 'file' && <input key={field.name} type="hidden" name={field.name} value="" />)}
        </section>
        <div className="form-actions"><SubmitBtn text={editing ? 'Update Product' : 'Add Product'} waitingLabel={editing ? 'Updating asset' : 'Adding asset'} /><Link to="/dashboard" className="btn btn-secondary">Cancel</Link></div>
      </Form>
      <aside className="form-context">
        <section className="panel"><h3>Access & scope</h3><p>Admins can choose any of the department values.</p><p>Department heads manage assets in their own department. “all” is a department, not a permission to view every department.</p></section>
        <div className="context-note"><DesignIcon name="info" /><p>{editing ? 'Review the assignment when transferring an asset to another department.' : 'After creation, you can download the asset’s QR code for its label.'}</p></div>
      </aside>
    </div>
    {open && <Modal open onClose={() => setOpen(false)} variant="fields" title="Optional fields"><DynamicField initialFields={fields} onClose={() => setOpen(false)} addFields={setFields} /></Modal>}
  </>;
};
export default AssetForm;
