import DesignIcon from './DesignIcon';

const FormRowSelect = ({ name, labelText, list, defaultValue, value, onChange, help, disabled = false }) => (
  <div className="form-row">
    <label htmlFor={name} className="form-label">{labelText || name}</label>
    <div className="select-control"><select name={name} id={name} className="form-select" disabled={disabled}
      {...(value !== undefined ? { value } : { defaultValue })} onChange={onChange}
      aria-describedby={help ? `${name}-help` : undefined}>
      {Object.values(list).map((item) => <option key={item} value={item}>{item}</option>)}
    </select><DesignIcon name="chevron" /></div>
    {help && <p className="field-help" id={`${name}-help`}>{help}</p>}
  </div>
);
export default FormRowSelect;
