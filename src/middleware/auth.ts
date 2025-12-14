/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

/**
 * Authentication middleware for Fastify
 *
 * Supports multiple authentication methods:
 * 1. Bearer token (real Kubernetes/OpenShift token): Authorization: Bearer sha256~...
 * 2. Bearer token (test format): Authorization: Bearer <userid>:<username>
 * 3. gap-auth header (from Eclipse Che Gateway)
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * User subject information extracted from authentication
 */
export interface Subject {
  id: string; // User ID (UUID from JWT sub claim or generated)
  userId: string; // Username (for backwards compatibility)
  userName: string;
  token: string;
  isGatewayAuth?: boolean; // True if authenticated via Eclipse Che Gateway
}

/**
 * Extend Fastify request and instance to include subject and auth hooks
 */
declare module 'fastify' {
  interface FastifyRequest {
    subject?: Subject;
  }

  interface FastifyInstance {
    authenticate: typeof authenticate;
    requireAuth: typeof requireAuth;
  }
}

/**
 * Decode JWT token (without verification) to extract claims
 * Eclipse Che Gateway already verified the token, we just need to read it
 */
function decodeJwtPayload(token: string): any {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode base64url payload
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    logger.info(`Failed to decode JWT: ${error}`);
    return null;
  }
}

function sanitizeUsername(raw: string): string {
  let username = raw.trim();
  if (!username) return username;

  // "user@domain" -> "user"
  username = username.split('@')[0];

  // OpenShift/Kubernetes sometimes prefixes identities
  // e.g. "kube:admin" or "system:admin" -> "admin"
  if (username.includes(':')) {
    username = username.split(':')[username.split(':').length - 1];
  }

  return username;
}

/**
 * Parse Bearer token format: Bearer <token>
 *
 * Supports three formats:
 * 1. JWT token (from Eclipse Che Gateway): extracts preferred_username
 * 2. Real Kubernetes/OpenShift tokens (e.g., sha256~...)
 * 3. Test format: userid:username
 */
async function parseBearerToken(token: string): Promise<Subject | null> {
  // Check if it's the test format (userid:username)
  const parts = token.split(':');
  if (parts.length === 2) {
    logger.info(`✅ Test token format: ${parts[0]}:${parts[1]}`);
    return {
      id: parts[0], // First part is the ID (UUID or identifier)
      userId: parts[1], // Second part is the username
      userName: parts[1],
      token: token,
    };
  }

  // Try to decode as JWT token (from Eclipse Che Gateway or Keycloak)
  const jwtPayload = decodeJwtPayload(token);
  if (jwtPayload) {
    // JWT token - extract username directly from claims (no TokenReview needed)
    const userId = jwtPayload.sub;

    // Extract username from JWT claims (in order of preference)
    // Check for name, username, preferred_username, or extract from email
    // Ignore "undefined" strings and null values
    let username = null;

    if (jwtPayload.name && jwtPayload.name !== 'undefined') {
      username = jwtPayload.name;
    } else if (jwtPayload.username && jwtPayload.username !== 'undefined') {
      username = jwtPayload.username;
    } else if (jwtPayload.preferred_username && jwtPayload.preferred_username !== 'undefined') {
      username = jwtPayload.preferred_username;
    } else if (jwtPayload.email) {
      username = jwtPayload.email.split('@')[0];
    } else if (jwtPayload.sub) {
      username = jwtPayload.sub;
    }

    logger.info(
      `✅ JWT token decoded: sub="${userId}", preferred_username="${jwtPayload.preferred_username}" -> id="${userId}", username="${username}"`,
    );

    return {
      id: userId || username || 'che-user', // Prefer sub (UUID) as ID
      userId: username || userId || 'che-user', // username for backwards compatibility
      userName: username || userId || 'che-user',
      token: token,
    };
  }

  // Real Kubernetes/OpenShift token (no colons, not a JWT)
  // IMPORTANT: For "drop-in replacement" mode we avoid TokenReview API calls because they require
  // cluster-scoped RBAC (tokenreviews.authentication.k8s.io). On OpenShift default Che install
  // may not grant this to che-server.
  logger.warn(
    `⚠️ Non-JWT bearer token provided; TokenReview is disabled. Falling back to 'che-user'.`,
  );
  return {
    id: 'che-user',
    userId: 'che-user',
    userName: 'che-user',
    token: token,
  };
}

/**
 * Fastify hook to authenticate requests
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // Check for Eclipse Che Gateway authentication first
  const gapAuth = request.headers['gap-auth'];
  const forwardedUser =
    (request.headers['x-forwarded-user'] as string | undefined) ||
    (request.headers['x-forwarded-preferred-username'] as string | undefined) ||
    (request.headers['x-forwarded-email'] as string | undefined);

  // DEBUG: Log all authentication headers
  logger.info('🔐 Authentication attempt:', {
    path: request.url,
    hasGapAuth: !!gapAuth,
    hasForwardedUser: !!forwardedUser,
    forwardedUserValue: forwardedUser || 'not-present',
    gapAuthValue: gapAuth || 'not-present',
    hasAuthorization: !!request.headers.authorization,
    authType: request.headers.authorization?.split(' ')[0] || 'none',
  });

  if (gapAuth) {
    // Gateway passes user identity via gap-auth header
    // Format: username (e.g., "che@eclipse.org" or "admin")
    // Extract just the username part before @ if present
    const fullUsername = gapAuth as string;
    const username = sanitizeUsername(fullUsername);

    logger.info(`✅ Using gap-auth: "${fullUsername}" -> username: "${username}"`);

    // Use service account token for Kubernetes operations
    // Note: gap-auth doesn't provide UUID, so we use username as ID
    // In Eclipse Che, this would require a user database lookup
    request.subject = {
      id: username, // No UUID available from gap-auth, use username
      userId: username,
      userName: username,
      token: '', // Service account token will be used by routes
      isGatewayAuth: true,
    };
    return;
  }

  if (forwardedUser) {
    const username = sanitizeUsername(forwardedUser);
    if (username) {
      logger.info(`✅ Using forwarded user header -> username: "${username}"`);
      request.subject = {
        id: username,
        userId: username,
        userName: username,
        token: '',
        isGatewayAuth: true,
      };
      return;
    }
  }

  // Fallback to standard Authorization header (for standalone mode)
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.info('❌ No authentication headers present');
    request.subject = undefined;
    return;
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const subject = await parseBearerToken(token);
    if (subject) {
      logger.info(
        `✅ Bearer token authenticated as: userId="${subject.userId}", userName="${subject.userName}"`,
      );
      request.subject = subject;
      return;
    }
  }

  logger.info('❌ Authentication failed - no valid credentials found');
  request.subject = undefined;
}

/**
 * Fastify hook to require authentication
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.subject) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authorization header is required',
    });
  }
}
