import styled from 'styled-components';

const Wrapper = styled.aside`
  position: sticky;
  top: 0;
  height: 100vh;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 14px;
  background: var(--background-secondary-color);
  border-right: 1px solid var(--grey-200);
  box-sizing: border-box;

  .sidebar-header {
    flex-shrink: 0;
  }

  .nav-links {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 6px;
    scrollbar-width: thin;
    scrollbar-color: var(--grey-300) transparent;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--grey-300);
      border-radius: 4px;
    }
  }

  .dark-theme & .nav-links {
    scrollbar-color: var(--grey-700) transparent;
    &::-webkit-scrollbar-thumb {
      background: var(--grey-700);
    }
  }

  .sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid var(--grey-200);
  }

  .nav-section-title {
    padding: 12px 12px 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--grey-400);
    user-select: none;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary-color);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: all 120ms ease;
  }

  .nav-link:hover {
    background: var(--background-color);
    color: var(--text-color);
  }

  .nav-link.active {
    background: var(--primary-500);
    color: white;
    font-weight: 600;
  }

  .sidebar-collapsed & {
    padding: 16px;
    .brand-name,
    .nav-label,
    .nav-arrow,
    .nav-section-title {
      display: none;
    }
    .nav-link {
      width: 48px;
      justify-content: center;
      padding: 12px;
    }
    .nav-sub-links {
      display: none;
    }
  }

  @media (min-width: 768px) and (max-width: 1100px) {
    padding: 16px;
    .brand-name,
    .nav-label,
    .nav-arrow,
    .nav-section-title {
      display: none;
    }
    .nav-link {
      width: 48px;
      justify-content: center;
      padding: 12px;
    }
    .nav-sub-links {
      display: none;
    }
  }

  @media (max-width: 767px) {
    display: none;
  }
`;

export default Wrapper;
