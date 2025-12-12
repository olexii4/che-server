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

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  OAuth1Service,
  OAuth1AuthenticationException,
  UserDeniedOAuthAuthenticationException,
  getRedirectAfterLoginUrl,
} from '../services/OAuth1Service';

function queryMapFromState(state: string): Map<string, string> {
  // Java uses UrlUtils.getQueryParametersFromState(getState(requestUrl)).
  // For Node, state is passed as a query-string-like blob.
  const params = new URLSearchParams(state);
  const map = new Map<string, string>();
  for (const [k, v] of params.entries()) {
    map.set(k, v);
  }
  return map;
}

export async function registerOAuth1Routes(fastify: FastifyInstance): Promise<void> {
  const oauth1Service = new OAuth1Service();
  oauth1Service.initialize();

  /**
   * GET /api/oauth/1.0/authenticate
   *
   * Java: org.eclipse.che.security.oauth1.OAuthAuthenticationService#authenticate
   */
  fastify.get(
    '/oauth/1.0/authenticate',
    {
      schema: { hide: true, tags: ['oauth'], summary: 'OAuth 1.0 authenticate' },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as any;
      const providerName = q.oauth_provider as string | undefined;
      const requestMethod = q.request_method as string | undefined;
      const signatureMethod = q.signature_method as string | undefined;
      const redirectAfterLogin = q.redirect_after_login as string | undefined;

      if (!providerName) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Provider name required' });
      }
      if (!redirectAfterLogin) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Redirect after login required' });
      }
      if (!request.subject?.id) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      const authenticator = oauth1Service.getAuthenticator(providerName);
      if (!authenticator) {
        return reply
          .code(400)
          .send({ error: 'Bad Request', message: `Unsupported OAuth provider: ${providerName}` });
      }

      // Build absolute request URL (best-effort behind proxy).
      const proto = (request.headers['x-forwarded-proto'] as string | undefined) || 'http';
      const host = request.headers.host || 'localhost';
      const fullUrl = new URL(`${proto}://${host}${request.raw.url}`);

      try {
        // Ensure redirect_after_login stays in the state (it already is in query string)
        const authUrl = await authenticator.getAuthenticateUrl(
          fullUrl,
          requestMethod,
          signatureMethod,
          request.subject.id,
        );
        return reply.redirect(307, authUrl);
      } catch (e: any) {
        return reply.code(400).send({ error: 'Bad Request', message: e?.message || 'OAuth1 error' });
      }
    },
  );

  /**
   * GET /api/oauth/1.0/callback
   *
   * Java: org.eclipse.che.security.oauth1.OAuthAuthenticationService#callback
   */
  fastify.get(
    '/oauth/1.0/callback',
    {
      schema: { hide: true, tags: ['oauth'], summary: 'OAuth 1.0 callback' },
      // Java endpoint is protected (Service) and tests call it with basic auth.
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as any;
      const state = (q.state as string | undefined) ?? '';
      const paramsFromState = queryMapFromState(state);
      const providerName = paramsFromState.get('oauth_provider') ?? '';
      const redirectAfterLogin = getRedirectAfterLoginUrl(paramsFromState);

      const proto = (request.headers['x-forwarded-proto'] as string | undefined) || 'http';
      const host = request.headers.host || 'localhost';
      const fullUrl = new URL(`${proto}://${host}${request.raw.url}`);

      const authenticator = oauth1Service.getAuthenticator(providerName);
      if (!authenticator) {
        // Java throws BadRequestException("Unsupported OAuth provider: X")
        return reply.redirect(307, `${redirectAfterLogin}?error_code=invalid_request`);
      }

      try {
        await authenticator.callback(fullUrl);
        return reply.redirect(307, redirectAfterLogin);
      } catch (e: any) {
        if (e instanceof UserDeniedOAuthAuthenticationException) {
          return reply.redirect(307, getRedirectAfterLoginUrl(paramsFromState, 'access_denied'));
        }
        if (e instanceof OAuth1AuthenticationException) {
          return reply.redirect(307, getRedirectAfterLoginUrl(paramsFromState, 'invalid_request'));
        }
        return reply.redirect(307, getRedirectAfterLoginUrl(paramsFromState, 'invalid_request'));
      }
    },
  );

  /**
   * GET /api/oauth/1.0/signature
   *
   * Java: org.eclipse.che.security.oauth1.OAuthAuthenticationService#signature
   */
  fastify.get(
    '/oauth/1.0/signature',
    {
      schema: { hide: true, tags: ['oauth'], summary: 'OAuth 1.0 signature' },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as any;
      const providerName = q.oauth_provider as string | undefined;
      const requestUrl = q.request_url as string | undefined;
      const requestMethod = q.request_method as string | undefined;

      if (!providerName) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Provider name required' });
      }
      if (!requestUrl) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Request url required' });
      }
      if (!requestMethod) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Request method required' });
      }
      if (!request.subject?.id) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }

      const authenticator = oauth1Service.getAuthenticator(providerName);
      if (!authenticator) {
        return reply
          .code(400)
          .send({ error: 'Bad Request', message: `Unsupported OAuth provider: ${providerName}` });
      }

      try {
        const header = authenticator.computeAuthorizationHeader(
          request.subject.id,
          requestMethod,
          requestUrl,
        );
        return reply.code(200).send(header);
      } catch (e: any) {
        return reply.code(401).send({ error: 'Unauthorized', message: e?.message || 'OAuth1 error' });
      }
    },
  );
}


