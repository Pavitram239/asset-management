import { FormRow, FormRowSelect, SubmitBtn } from ".";
import Wrapper from "../assets/wrappers/DashboardFormPage";
import { Form, useSubmit, Link } from "react-router-dom";
import {
  PRODUCT_SORT_BY,
  PRODUCT_STATUS,
  WARRANTY_STATUS,
} from "../utils/constants";
import { useAllProductsContext } from "../pages/AllProducts";
const SearchContainer = () => {
  const { searchValues } = useAllProductsContext();
  const { search, productStatus, productWarranty, sort } = searchValues;
  const submit = useSubmit();

  const debounce = (onChange) => {
    let timeOut;
    return (e) => {
      const form = e.currentTarget.form;
      clearTimeout(timeOut);
      timeOut = setTimeout(() => {
        onChange(form);
      }, 2000);
    };
  };

  return (
    <Wrapper>
      <Form className="form">
        <h5 className="form-title">Search Form</h5>
        <div className="form-center">
          <FormRow
            type="search"
            name="search"
            defaultValue={search}
            onChange={debounce((form) => {
              submit(form);
            })}
          />

          <FormRowSelect
            labelText="Product Status"
            name="productStatus"
            list={["all", ...Object.values(PRODUCT_STATUS)]}
            defaultValue={productStatus}
            onChange={(e) => {
              submit(e.currentTarget.form);
            }}
          />

          <FormRowSelect
            labelText="Product Warranty"
            name="productWarranty"
            list={["all", ...Object.values(WARRANTY_STATUS)]}
            defaultValue={productWarranty}
            onChange={(e) => {
              submit(e.currentTarget.form);
            }}
          />

          <FormRowSelect
            name="Sort"
            list={Object.values(PRODUCT_SORT_BY)}
            defaultValue={sort}
            onChange={(e) => {
              submit(e.currentTarget.form);
            }}
          />
          <Link to="/dashboard" className="btn form-btn delete-btn">
            Reset Search Values
          </Link>
        </div>
      </Form>
    </Wrapper>
  );
};
export default SearchContainer;
