import { USER_DEPARTMENTS } from "../utils/constants";
const FormRowSelect = ({
  name,
  labelText,
  list,
  defaultValue = "",
  onChange,
}) => {
  const SelectOptions = Object.values(list).map((item) => {
    return (
      <option key={item} value={item}>
        {item}
      </option>
    );
  });
  return (
    <div className="form-row">
      <label htmlFor={name} className="form-label">
        {labelText || name}
      </label>
      <select
        name={name}
        id={name}
        className="form-select"
        defaultValue={defaultValue}
        onChange={onChange}
      >
        {SelectOptions}
      </select>
    </div>
  );
};
export default FormRowSelect;
