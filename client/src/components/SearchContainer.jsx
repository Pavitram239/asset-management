import { useEffect, useRef, useState } from 'react';
import { Form, Link, useSubmit } from 'react-router-dom';
import { FormRowSelect } from '.';
import DesignIcon from './DesignIcon';
import { PRODUCT_SORT_BY, PRODUCT_STATUS, WARRANTY_STATUS } from '../utils/constants';
import { useAllProductsContext } from '../pages/AllProducts';

const SearchContainer = () => {
  const { searchValues, filtersOpen, setFiltersOpen } = useAllProductsContext();
  const [query, setQuery] = useState(searchValues.search || '');
  const submit = useSubmit();
  const timer = useRef();
  useEffect(() => { setQuery(searchValues.search || ''); }, [searchValues.search]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = (form) => { clearTimeout(timer.current); submit(form, { replace: true }); };
  return <Form method="get" className="inventory-search" onSubmit={() => clearTimeout(timer.current)}>
    <div className="search-controls">
      <label className="search-box"><span className="sr-only">Search by asset name</span><DesignIcon name="search" />
        <input type="search" name="search" placeholder="Search by asset name" value={query} maxLength={200}
          onChange={(event) => { setQuery(event.target.value); const form = event.currentTarget.form; clearTimeout(timer.current); timer.current = setTimeout(() => submit(form, { replace: true }), 2000); }} />
      </label>
      <button type="button" className="btn btn-secondary" aria-expanded={filtersOpen} aria-controls="inventory-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters{filtersOpen ? ' ▴' : ''}</button>
    </div>
    <p className="caption search-caption">Search matches asset names only · updates after 2 seconds</p>
    {filtersOpen ? <section className="panel filter-panel" id="inventory-filters">
      <h3>Search values</h3><div className="filter-grid" key={JSON.stringify(searchValues)}>
        <FormRowSelect name="productStatus" labelText="Status" list={['all', ...Object.values(PRODUCT_STATUS)]} defaultValue={searchValues.productStatus || 'all'} onChange={(event) => apply(event.currentTarget.form)} help="all · In department · Not in Department · Out of campus" />
        <FormRowSelect name="productWarranty" labelText="Warranty" list={['all', ...Object.values(WARRANTY_STATUS)]} defaultValue={searchValues.productWarranty || 'all'} onChange={(event) => apply(event.currentTarget.form)} help="all · active · expired" />
        <FormRowSelect name="sort" labelText="Sort" list={Object.values(PRODUCT_SORT_BY)} defaultValue={searchValues.sort || 'newest'} onChange={(event) => apply(event.currentTarget.form)} help="newest · oldest · a-z · z-a" />
      </div>
      <Link to="/dashboard" className="btn btn-secondary" onClick={() => { clearTimeout(timer.current); setQuery(''); }}>Reset Search Values</Link>
      <p className="caption">Changing filters resets to page 1.</p>
    </section> : <>
      <input type="hidden" name="productStatus" value={searchValues.productStatus || 'all'} />
      <input type="hidden" name="productWarranty" value={searchValues.productWarranty || 'all'} />
      <input type="hidden" name="sort" value={searchValues.sort || 'newest'} />
    </>}
  </Form>;
};
export default SearchContainer;
