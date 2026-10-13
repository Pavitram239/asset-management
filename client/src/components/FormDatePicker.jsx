import DesignIcon from './DesignIcon';
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const FormDatePicker = ({ name, labelText, defaultValue, max, min, help }) => (
  <div className="form-row">
    <label htmlFor={name} className="form-label">{labelText || name}</label>
    <div className="date-control"><input type="date" id={name} name={name} className="form-input"
      defaultValue={defaultValue ? String(defaultValue).slice(0, 10) : name === 'purchaseDate' ? today() : ''}
      max={max ? today() : undefined} min={min ? today() : undefined}
      aria-describedby={help ? `${name}-help` : undefined} /><DesignIcon name="calendar" /></div>
    {help && <p className="field-help" id={`${name}-help`}>{help}</p>}
  </div>
);
export default FormDatePicker;
