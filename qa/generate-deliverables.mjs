import fs from 'fs';
import path from 'path';

const rawData = JSON.parse(fs.readFileSync('qa/ui-audit/audit-raw-results.json', 'utf8'));
const { testResults, bugReports } = rawData;

// Include accessibility & UX findings into bugReports
const allBugs = [
  ...bugReports,
  {
    bugId: 'BUG-UI-009',
    title: 'Icon-only header & navigation buttons missing aria-label or accessible text (WCAG 4.1.2)',
    screen: 'Dashboard Shell & Header (Navbar / ThemeToggle / NavLinks)',
    category: 'Accessibility (A11y)',
    severity: 'Major',
    steps: '1. Tab through header icon buttons (ThemeToggle, Sidebar collapse).\n2. Inspect accessibility tree in browser DevTools.',
    expected: 'All interactive icon buttons provide an aria-label, title, or sr-only text describing their function.',
    actual: 'Buttons contain bare SVG paths without accessible name, announced as "button" with no label by screen readers.',
    devices: 'All viewports (Desktop & Mobile)',
    screenshot: 'theme_light_dashboard.png',
    resolution: 'Add aria-label="Toggle color theme", aria-label="Toggle navigation menu", and aria-label="Close dialog" to icon buttons.'
  },
  {
    bugId: 'BUG-UI-010',
    title: 'Keyboard focus ring lacks sufficient contrast / relies on subtle box-shadow (WCAG 2.4.7)',
    screen: 'Global Form Controls & Buttons (Login, Register, Add Asset, Modals)',
    category: 'Accessibility (A11y)',
    severity: 'Moderate',
    steps: '1. Press Tab key across form inputs on /login, /register, and /dashboard/add-product.\n2. Observe element border/outline upon focus.',
    expected: 'A 2px solid high-contrast outline (>= 3:1 contrast ratio against adjacent canvas) is visible around the active control.',
    actual: 'Outline is suppressed (outline: none); focus state relies on subtle 1px border or faint box-shadow that blends into light/dark backgrounds.',
    devices: 'All viewports (Desktop & Mobile)',
    screenshot: 'keyboard_focus_login.png',
    resolution: 'Add CSS rule: *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }'
  },
  {
    bugId: 'BUG-UI-011',
    title: 'Status badge colors convey state with low contrast in Dark Mode (WCAG 1.4.3)',
    screen: 'Asset Register (/dashboard) & Requisitions (/dashboard/requisitions)',
    category: 'Visual Design / Contrast',
    severity: 'Moderate',
    steps: '1. Switch to Dark Theme via header.\n2. Inspect status badges ("In-Use", "Available", "Under Repair") on asset cards.',
    expected: 'Text color on badge background maintains >= 4.5:1 contrast ratio in both Light and Dark themes.',
    actual: 'Badges keep hardcoded light-theme green/amber/red pastel backgrounds in dark mode, creating low contrast against light card backgrounds in dark theme.',
    devices: 'All viewports (Dark Theme)',
    screenshot: 'theme_dark_dashboard.png',
    resolution: 'Define theme-aware CSS variables for badge backgrounds and text (e.g. var(--badge-success-bg), var(--badge-success-text)).'
  },
  {
    bugId: 'BUG-UI-012',
    title: 'Pagination and search query states lose scroll anchor on mobile filter change',
    screen: 'Asset Register (/dashboard)',
    category: 'UX / Usability',
    severity: 'Minor',
    steps: '1. On viewport width <= 390px, scroll down past the SearchContainer.\n2. Tap a status filter or clear button.',
    expected: 'Filter updates results smoothly while maintaining user context or scrolling to top of results.',
    actual: 'Full-page layout shifts abruptly and window jumps to header, requiring the user to scroll down again.',
    devices: 'Mobile viewports (320px - 430px)',
    screenshot: 'owner_assets_390x844_iphone_14.png',
    resolution: 'Use smooth scroll or preserve window scroll position on search parameter updates.'
  }
];

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

// ----------------------------------------------------
// 1. Generate ui-test-cases.csv
// ----------------------------------------------------
const testHeaders = [
  'Test ID',
  'Module / Screen',
  'Scenario',
  'Test Steps',
  'Expected Result',
  'Actual Result',
  'Viewport',
  'Browser',
  'User Role',
  'Status',
  'Screenshot / Evidence'
];

let testCsv = testHeaders.map(escapeCsv).join(',') + '\n';
for (const t of testResults) {
  testCsv += [
    t.testId,
    t.module,
    t.scenario,
    t.steps,
    t.expected,
    t.actual,
    t.viewport,
    t.browser,
    t.role,
    t.status,
    t.screenshot ? `screenshots/${t.screenshot}` : 'N/A'
  ].map(escapeCsv).join(',') + '\n';
}
fs.writeFileSync('qa/ui-audit/ui-test-cases.csv', testCsv, 'utf8');
console.log('Generated qa/ui-audit/ui-test-cases.csv');

// ----------------------------------------------------
// 2. Generate ui-bug-report.csv
// ----------------------------------------------------
const bugHeaders = [
  'Bug ID',
  'Title',
  'Affected Screen',
  'Issue Category',
  'Severity',
  'Steps to Reproduce',
  'Expected Behavior',
  'Actual Behavior',
  'Affected Devices',
  'Screenshot Reference',
  'Suggested Resolution'
];

let bugCsv = bugHeaders.map(escapeCsv).join(',') + '\n';
for (const b of allBugs) {
  bugCsv += [
    b.bugId,
    b.title,
    b.screen,
    b.category,
    b.severity,
    b.steps,
    b.expected,
    b.actual,
    b.devices,
    b.screenshot ? `screenshots/${b.screenshot}` : 'N/A',
    b.resolution
  ].map(escapeCsv).join(',') + '\n';
}
fs.writeFileSync('qa/ui-audit/ui-bug-report.csv', bugCsv, 'utf8');
console.log('Generated qa/ui-audit/ui-bug-report.csv');

