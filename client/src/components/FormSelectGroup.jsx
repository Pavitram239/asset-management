import DesignIcon from './DesignIcon';

const FormSelectGroup = ({ name, labelText, list = [], categories, defaultValue = '', onChange, help }) => (
  <div className="form-row">
    <label htmlFor={name} className="form-label">{labelText || name}</label>
    <div className="select-control"><select name={name} id={name} className="form-select" defaultValue={defaultValue} onChange={onChange}>
      <option value="">Unassigned</option>
      {Object.values(categories).map((category) => <optgroup key={category} label={category}>
        {list.filter((user) => user.category === category).map((user) => <option key={user.value} value={user.value}>{user.name}</option>)}
      </optgroup>)}
    </select><DesignIcon name="chevron" /></div>
    {help && <p className="field-help">{help}</p>}
  </div>
);
export default FormSelectGroup;
