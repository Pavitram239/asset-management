// Visibility only. Backend authorization remains authoritative, including row capabilities.
export const hasPermission = (user, permission) =>
  Boolean(user?.grants?.some(grant=>grant.permission===permission));
