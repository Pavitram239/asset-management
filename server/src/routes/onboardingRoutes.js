import { Router } from 'express';
import { authenticateUser, checkForTestUser } from '../middlewares/authMiddleware.js';
import { organizationContext } from '../utils/authorization.js';
import { organizationCommand } from '../utils/commands.js';
import { sharedRateLimit } from '../middlewares/sharedRateLimit.js';
import { acceptInvitation, createWorkspace, invitationAuthority, invitationDto, inviteEmployee, listInvitations, revokeInvitation } from '../services/onboarding.js';

const router = Router();
router.use(authenticateUser, checkForTestUser);
const limit = sharedRateLimit({ namespace: 'onboarding', max: 30, keyFor: req => req.user.userId });
router.post('/workspaces', limit, createWorkspace);
router.post('/invitations/acceptance', limit, acceptInvitation);
router.get('/invitations', organizationContext, listInvitations);
const invitationCommand = options => organizationCommand({ authorize: invitationAuthority, resourceType: 'invitation',
  readResult: (db, actor, command) => invitationDto(db, command.resource_id, actor.organizationId), ...options });
router.post('/invitations', limit, organizationContext, invitationCommand({ operationId: 'inviteEmployee', statusCode: 201, execute: inviteEmployee }));
router.post('/invitations/:id/revocations', limit, organizationContext, invitationCommand({ operationId: 'revokeInvitation', execute: revokeInvitation }));
export default router;
