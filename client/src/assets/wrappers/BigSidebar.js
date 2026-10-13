import styled from 'styled-components';

const Wrapper = styled.aside`
  position: sticky; top: 0; height: 100vh; min-width: 0;
  display: flex; flex-direction: column; gap: 24px; padding: 20px;
  background: var(--background-secondary-color); border-right: 1px solid var(--grey-200);
  .nav-links, .sidebar-footer { display: flex; flex-direction: column; gap: 4px; }
  .sidebar-footer { gap: 8px; }
  .nav-link { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 12px; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary-color); font-size: 13px; font-weight: 500; text-align: left; white-space: nowrap; cursor: pointer; }
  .nav-link:hover { background: var(--background-color); }
  .nav-link.active { background: var(--primary-500); color: white; }
  .sidebar-collapsed & { padding: 16px; }
  .sidebar-collapsed & .brand-name, .sidebar-collapsed & .nav-label { display: none; }
  .sidebar-collapsed & .nav-link { width: 48px; justify-content: center; padding: 14px; }
  @media (min-width: 768px) and (max-width: 1100px) {
    padding: 16px;
    .brand-name, .nav-label { display: none; }
    .nav-link { width: 48px; justify-content: center; padding: 14px; }
  }
  @media (max-width: 767px) { display: none; }
`;
export default Wrapper;
