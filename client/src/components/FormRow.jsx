const FormRow = ({ type = 'text', name, defaultValue, labelText, onChange, placeholder, required = true, help, ...props }) => (
  <div className="form-row">
    <label htmlFor={name} className="form-label">{labelText || name}{required && ' *'}</label>
    <input type={type} id={name} name={name} className="form-input" defaultValue={defaultValue ?? ''}
      onChange={onChange} placeholder={placeholder || ''} required={required}
      aria-describedby={help ? `${name}-help` : undefined} {...props} />
    {help && <p id={`${name}-help`} className="field-help">{help}</p>}
  </div>
);
export default FormRow;
