import styled from 'styled-components';

const Wrapper = styled.section`
  .dashboard { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
  &.sidebar-collapsed .dashboard { grid-template-columns: 80px minmax(0, 1fr); }
  .workspace-main { min-width: 0; }
  .dashboard-page { width: 100%; max-width: none; margin: 0; padding: 32px; }
  @media (min-width: 768px) and (max-width: 1100px) { .dashboard { grid-template-columns: 80px minmax(0, 1fr); } }
  @media (max-width: 767px) {
    .dashboard, &.sidebar-collapsed .dashboard { grid-template-columns: minmax(0, 1fr); }
    .dashboard-page { padding: 20px 20px 108px; }
  }
`;
export default Wrapper;
