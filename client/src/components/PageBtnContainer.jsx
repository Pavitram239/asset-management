import { useLocation, useNavigate } from 'react-router-dom';
import { useAllProductsContext } from '../pages/AllProducts';

const PageBtnContainer = () => {
  const { data: { numOfPages, currentPage, totalProducts, products }, searchValues } = useAllProductsContext();
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const limit = Number(searchValues.limit) || 10;
  const startPage = Math.max(1, Math.min(currentPage - 2, numOfPages - 4));
  const pages = Array.from({ length: Math.min(5, Math.max(1, numOfPages)) }, (_, index) => startPage + index);
  const change = (page) => { const params = new URLSearchParams(search); params.set('page', page); navigate(`${pathname}?${params}`); };
  const first = products.length ? (currentPage - 1) * limit + 1 : 0;
  const last = products.length ? first + products.length - 1 : 0;
  return <div className="pagination">
    <p className="caption">Showing {first}–{last} of {totalProducts} assets · {limit} per page</p>
    <nav aria-label="Asset pages" className="page-controls">
      <button className="btn btn-secondary" disabled={currentPage <= 1} onClick={() => change(currentPage - 1)}>Prev</button>
      {pages.map((page) => <button className={`btn ${page === currentPage ? '' : 'btn-secondary'}`} key={page} aria-current={page === currentPage ? 'page' : undefined} onClick={() => change(page)}>{page}</button>)}
      <button className="btn btn-secondary" disabled={currentPage >= numOfPages} onClick={() => change(currentPage + 1)}>Next</button>
    </nav>
  </div>;
};
export default PageBtnContainer;
