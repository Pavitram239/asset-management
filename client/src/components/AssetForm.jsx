import { useState } from 'react';
import { Form, Link } from 'react-router-dom';
import { useDashboardContext } from '../pages/DashboardLayout';
import { FormRow, FormRowSelect, FormRowFile, FormDatePicker, FormSelectGroup, SubmitBtn, Modal, DynamicField } from '.';
import DesignIcon from './DesignIcon';
import { FIELDS, PRODUCT_STATUS } from '../utils/constants';

const AssetForm = ({ product, users, departments }) => {
  const { user, organizations, activeOrganizationId } = useDashboardContext();
  const activeOrg = organizations?.find((o) => o.id === activeOrganizationId) || organizations?.[0];

  const editing = Boolean(product);
  const isCatalogLinked = Boolean(product?.catalogItemId);
  const canUpdate = editing ? (product?.capabilities?.update !== false && !isCatalogLinked) : true;

  const initialFields = FIELDS.filter((field) => product?.[field.name] !== undefined && product?.[field.name] !== null && product?.[field.name] !== '');
  const [fields, setFields] = useState(initialFields);
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState(product?.department || (departments.includes(user.department) ? user.department : departments[0] || 'IT'));
  const usersList = users.filter((person) => person.department === department).map((person) => ({ name: person.name, value: person._id, category: person.department }));
  const removedFields = initialFields.filter((field) => !fields.some((selected) => selected.name === field.name));

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>{editing ? 'Edit Asset Record' : 'Add New Asset'}</h2>
          <p>{editing ? `${product.name} · ${product.company || activeOrg?.name}` : 'Register a serialized physical asset and assign custody to staff or a department.'}</p>
        </div>
      </div>

      <div className="form-layout" style={{ maxWidth: '900px' }}>
        <Form method="post" className="panel asset-form" encType="multipart/form-data" style={{ padding: '28px' }}>
          {isCatalogLinked && (
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e40af', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <DesignIcon name="info" />
              <div>
                <strong>Catalog-Managed Inventory Unit:</strong> Custody and locations are tracked via Inventory Stock Movements. Direct form edits are locked.
              </div>
            </div>
          )}

          <fieldset disabled={!canUpdate} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Section 1: Basic Identity */}
            <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--background-secondary-color)', border: '1px solid var(--grey-200)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '12px' }}>
                📦 1. Asset Identity & Picture
              </span>

              <FormRowFile name="productImg" label="Asset Photo / Image" help={editing && product.productImg ? 'Existing image retained unless replaced.' : 'Upload JPG or PNG.'} />

              <div className="field-grid" style={{ marginTop: '14px' }}>
                <FormRow name="name" labelText="Asset Name *" placeholder="e.g. Sony 4K Event Projector" defaultValue={product?.name} required maxLength={500} />
                <FormRow name="company" labelText="Company / Organization *" placeholder="Company name" defaultValue={product?.company || activeOrg?.name || 'Company'} required maxLength={500} />
              </div>
            </div>

            {/* Section 2: Department & Custody */}
            <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--background-secondary-color)', border: '1px solid var(--grey-200)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '12px' }}>
                🏢 2. Department & Custody
              </span>

              <div className="field-grid">
                <FormRowSelect name="department" labelText="Department *" list={departments} value={department} onChange={(event) => setDepartment(event.target.value)} help="Governs departmental scope." />
                <FormRowSelect name="status" labelText="Operational Status *" list={PRODUCT_STATUS} defaultValue={product?.status || PRODUCT_STATUS.IN_DEPT} help="In department · Not in Department · Out of campus" />
              </div>

              <div style={{ marginTop: '14px' }}>
                <FormSelectGroup key={department} name="assignedToId" labelText="Assigned Personnel" list={usersList} categories={departments} defaultValue={product?.department === department ? product.assignedToId || '' : ''} help="Assign directly to a team member, or leave in central store." />
              </div>
            </div>

            {/* Section 3: Warranty & Lifecycle */}
            <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--background-secondary-color)', border: '1px solid var(--grey-200)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary-600)', display: 'block', marginBottom: '12px' }}>
                📅 3. Lifecycle & Specifications
              </span>

              <div className="field-grid">
                <FormDatePicker name="purchaseDate" labelText="Purchase Date" defaultValue={product?.purchaseDate} max help="Date equipment was acquired." />
              </div>

              <section className="optional-fields" style={{ marginTop: '16px' }}>
                <div className="optional-fields-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary-color)' }}>Custom Specifications</h4>
                  {canUpdate && (
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => setOpen(true)}>
                      <DesignIcon name="plus" /> Add Attribute Fields
                    </button>
                  )}
                </div>

                {!fields.length && <p className="caption">No custom specifications added. Click "+ Add Attribute Fields" to attach serial number, capacity, etc.</p>}

                <div className="optional-inputs" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {fields.map((field) =>
                    field.type === 'date' ? (
                      <FormDatePicker name={field.name} labelText={field.label} defaultValue={product?.[field.name]} key={field.name} />
                    ) : field.type === 'file' ? (
                      <FormRowFile name={field.name} label={field.label} key={field.name} />
                    ) : (
                      <FormRow name={field.name} labelText={field.label} defaultValue={product?.[field.name]} required={false} maxLength={500} key={field.name} />
                    )
                  )}
                </div>
                {removedFields.map((field) => field.type !== 'file' && <input key={field.name} type="hidden" name={field.name} value="" />)}
              </section>
            </div>
          </fieldset>

          <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            {isCatalogLinked ? (
              <Link to="/inventory" className="btn btn-primary">Go to Inventory Movements</Link>
            ) : (
              <SubmitBtn text={editing ? 'Update Asset' : 'Save Asset Record'} waitingLabel={editing ? 'Updating…' : 'Saving…'} />
            )}
            <Link to="/dashboard" className="btn btn-secondary">Cancel</Link>
          </div>
        </Form>
      </div>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} center>
          <DynamicField fields={fields} setFields={setFields} setOpen={setOpen} />
        </Modal>
      )}
    </>
  );
};

export default AssetForm;
