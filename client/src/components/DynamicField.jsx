import { useState } from 'react';
import { FIELDS } from '../utils/constants';

const DynamicField = ({ onClose, addFields, initialFields = [] }) => {
  const [selected, setSelected] = useState(() => new Set(initialFields.map((field) => field.name)));
  return <section className="optional-field-dialog">
    <h2 id="dialog-title-fields">Optional fields</h2><p className="muted">Choose the details you want to record for this asset.</p>
    <div className="optional-choices">{FIELDS.map((field) => <label key={field.name} className="optional-choice">
      <input type="checkbox" checked={selected.has(field.name)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); event.target.checked ? next.add(field.name) : next.delete(field.name); return next; })} />
      <span>{field.label}</span>
    </label>)}</div>
    <div className="form-actions"><button type="button" className="btn" onClick={() => { addFields(FIELDS.filter((field) => selected.has(field.name))); onClose(); }}>Apply fields</button><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button></div>
  </section>;
};
export default DynamicField;
