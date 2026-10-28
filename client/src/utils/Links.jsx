const links = [
  { text: 'Inventory', path: '.', icon: 'package', permission:'asset.read' },
  { text: 'Add asset', path: 'add-product', icon: 'plus', permission:'asset.create' },
  { text: 'Profile', path: 'profile', icon: 'user' },
  { text: 'Workspaces', path: 'workspaces', icon: 'users' },
  { text: 'Catalog & stock',path:'catalog',icon:'package',permissions:['catalog.read','catalog.manage','catalog.requestable.read','inventory.read','inventory.opening'] },
  { text: 'Inventory setup', path: 'inventory-setup', icon: 'package', permissions:['location.manage','category.manage','unit.manage'] },
  { text: 'Invitations', path: 'invitations', icon: 'users', permission:'membership.manage' },
  { text: 'Users & departments', path: 'users', icon: 'users', permission:'directory.read' },
  { text: 'Statistics', path: 'admin', icon: 'chart', permission:'statistics.read' },
  { text: 'Access management', path: 'access', icon: 'users' },
];
export default links;
