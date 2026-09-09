import { useState } from "react";
import { FIELDS } from "../utils/constants";
import Wrapper from "../assets/wrappers/DynamicField";
import FormBtn from "./FormBtn";

const DynamicField = ({ onClose, addFields }) => {
  const [fields, setFields] = useState([]);

  const checkedListHandler = () => {
    addFields(fields);
    onClose();
  };

  const onChecked = (e) => {
    if (!Array.isArray(fields)) {
      console.error("fields is not an array.");
      return;
    }
    if (e.target.checked) {
      setFields([
        ...fields,
        {
          name: e.target.value,
          type: e.target.dataset.type,
          label: e.target.dataset.label,
        },
      ]);
    } else {
      setFields(fields.filter((field) => field.name !== e.target.value));
    }
  };
  return (
    <Wrapper>
      {FIELDS.map((field, index) => {
        return (
          <div className="checkbox" key={index}>
            <input
              type="checkbox"
              value={field.name}
              name={field.name}
              id={field.name}
              onChange={onChecked}
              data-type={field.type}
              data-label={field.label}
            />
            <label htmlFor={field.name}>{field.label}</label>
          </div>
        );
      })}
      <FormBtn formBtn text="Add Fields" handler={checkedListHandler} />
    </Wrapper>
  );
};
export default DynamicField;
