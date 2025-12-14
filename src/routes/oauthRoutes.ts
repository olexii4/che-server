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

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OAuthService } from '../services/OAuthService';
import { PersonalAccessTokenService } from '../services/PersonalAccessTokenService';
import { getServiceAccountKubeConfig } from '../helpers/getKubernetesClient';
import { GitProvider } from '../models/CredentialsModels';
import { PatLookupService } from '../services/PatLookupService';

/**
 * Register OAuth routes
 *
 * Based on: org.eclipse.che.security.oauth.OAuthAuthenticationService
 *
 * OAuth Configuration:
 * - Loads providers from Kubernetes Secrets
 * - Returns [] if no secrets configured
 * - See: https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/
 */
export async function registerOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize service and load providers from Kubernetes Secrets
  const oauthService = new OAuthService();
  await oauthService.initialize();

  /**
   * GET /oauth
   *
   * Gets list of installed OAuth authenticators.
   */
  fastify.get(
    '/oauth',
    {
      schema: {
        tags: ['oauth'],
        summary: 'Get registered OAuth authenticators',
        description: 'Gets list of installed OAuth authenticators',
        security: [{ BearerAuth: [] }],
        response: {
          200: {
            description: 'List of registered OAuth authenticators',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                endpointUrl: { type: 'string' },
                links: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      rel: { type: 'string' },
                      href: { type: 'string' },
                      method: { type: 'string' },
                      parameters: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            defaultValue: { type: 'string' },
                            required: { type: 'boolean' },
                            valid: { type: 'array', items: { type: 'string' } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authenticators = oauthService.getRegisteredAuthenticators();
        return reply.code(200).send(authenticators);
      } catch (error: any) {
        fastify.log.error('Error getting OAuth authenticators:', error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get OAuth authenticators',
        });
      }
    },
  );

  /**
   * GET /oauth/token
   *
   * Gets OAuth token for the authenticated user.
   */
  fastify.get(
    '/oauth/token',
    {
      schema: {
        tags: ['oauth'],
        summary: 'Get OAuth token',
        description: 'Gets OAuth token for the authenticated user and specified provider',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['oauth_provider'],
          properties: {
            oauth_provider: {
              type: 'string',
              description: 'OAuth provider name',
              enum: ['github', 'gitlab', 'bitbucket', 'azure-devops'],
            },
          },
        },
        response: {
          200: {
            description: 'OAuth token successfully retrieved',
            type: 'object',
            properties: {
              token: { type: 'string' },
              scope: { type: 'string' },
            },
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          404: {
            description: 'OAuth provider not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Ensure user is authenticated
        if (!request.subject) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Get oauth_provider from query
        const query = request.query as any;
        const oauthProvider = query.oauth_provider;

        if (!oauthProvider) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'OAuth provider is required',
          });
        }

        // NOTE: In Java, /oauth/token returns an OAuth token if present, otherwise it throws Unauthorized.
        // In Che Next (Kubernetes), OAuth tokens are typically stored as "oauth2-*" Personal Access Token secrets
        // in the user's namespace (e.g., admin-che).
        const namespace = `${request.subject.userName}-che`;

        // First: check in-memory token cache (dev/testing only)
        const memToken = await oauthService.getOrRefreshToken(request.subject.userId, oauthProvider);
        if (memToken) {
          return reply.code(200).send(memToken);
        }

        // Second: look for an oauth2-* PAT secret created by the OAuth callback
        const kubeConfig = getServiceAccountKubeConfig();
        const patLookup = new PatLookupService(kubeConfig);
        const pat = await patLookup.getPatForProvider(namespace, oauthProvider);

        if (pat?.tokenData && pat.isOauth) {
          return reply.code(200).send({ token: pat.tokenData, scope: '' });
        }

        return reply.code(401).send({
          error: 'Unauthorized',
          message: `OAuth token for user ${request.subject.userId} was not found`,
        });
      } catch (error: any) {
        fastify.log.error('Error getting OAuth token:', error);

        if (error.message?.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to get OAuth token',
        });
      }
    },
  );

  /**
   * DELETE /oauth/token
   *
   * Invalidates OAuth token for the authenticated user.
   */
  fastify.delete(
    '/oauth/token',
    {
      schema: {
        tags: ['oauth'],
        summary: 'Invalidate OAuth token',
        description:
          'Invalidates (deletes) OAuth token for the authenticated user and specified provider',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['oauth_provider'],
          properties: {
            oauth_provider: {
              type: 'string',
              description: 'OAuth provider name',
              enum: ['github', 'gitlab', 'bitbucket', 'azure-devops'],
            },
          },
        },
        response: {
          204: {
            description: 'OAuth token successfully invalidated',
            type: 'null',
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          404: {
            description: 'OAuth token not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      onRequest: [fastify.authenticate, fastify.requireAuth],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Ensure user is authenticated
        if (!request.subject) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Get oauth_provider from query
        const query = request.query as any;
        const oauthProvider = query.oauth_provider;

        if (!oauthProvider) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'OAuth provider is required',
          });
        }

        const namespace = `${request.subject.userName}-che`;

        // Invalidate in-memory token (if any)
        try {
          oauthService.invalidateToken(request.subject.userId, oauthProvider);
        } catch {
          // Ignore - we treat revoke as idempotent
        }

        // Also delete oauth2-* PAT tokens in the user's namespace (where callback stores tokens)
        try {
          const kubeConfig = getServiceAccountKubeConfig();
          const patLookup = new PatLookupService(kubeConfig);
          const pats = await patLookup.getAllPats(namespace);

          const kubeConfigSa = getServiceAccountKubeConfig();
          const patService = new PersonalAccessTokenService(kubeConfigSa);

          const oauthPats = pats.filter(
            p =>
              p.isOauth &&
              p.gitProvider?.toLowerCase() === oauthProvider.toLowerCase() &&
              p.cheUserId === request.subject!.userId,
          );

          for (const p of oauthPats) {
            await patService.delete(namespace, p.tokenName);
          }
        } catch (err) {
          // Treat as best-effort; revocation should not fail the UI flow.
          fastify.log.warn({ err, namespace, oauthProvider }, 'Failed to delete oauth PAT secret(s)');
        }

        // Idempotent revoke: always return 204
        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error('Error invalidating OAuth token:', error);

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to invalidate OAuth token',
        });
      }
    },
  );

  /**
   * GET /oauth/authenticate
   *
   * Initiates the OAuth authentication flow by redirecting to the OAuth provider.
   * This endpoint is called when a user needs to authenticate with an SCM provider.
   *
   * Based on: org.eclipse.che.security.oauth.OAuthAuthenticationService.authenticate()
   */
  fastify.get(
    '/oauth/authenticate',
    {
      schema: {
        tags: ['oauth'],
        summary: 'Initiate OAuth authentication',
        description:
          'Redirects to OAuth provider for authentication. This endpoint initiates the OAuth flow.',
        security: [{ BearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['oauth_provider'],
          properties: {
            oauth_provider: {
              type: 'string',
              description: 'OAuth provider name',
              enum: ['github', 'gitlab', 'bitbucket', 'azure-devops'],
            },
            scope: {
              type: 'string',
              description: 'OAuth scope to request',
            },
            request_method: {
              type: 'string',
              description: 'HTTP request method',
            },
            signature_method: {
              type: 'string',
              description: 'Signature method',
            },
            redirect_after_login: {
              type: 'string',
              description: 'URL to redirect to after successful authentication',
            },
          },
        },
        response: {
          302: {
            description: 'Redirect to OAuth provider',
            type: 'null',
          },
          400: {
            description: 'Bad Request - Missing or invalid parameters',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      // Authenticate user to get their identity for the OAuth state
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          oauth_provider?: string;
          scope?: string;
          request_method?: string;
          signature_method?: string;
          redirect_after_login?: string;
        };

        const { oauth_provider, scope, redirect_after_login } = query;

        if (!oauth_provider) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'oauth_provider parameter is required',
          });
        }

        // Get OAuth provider configuration
        const authenticators = oauthService.getRegisteredAuthenticators();
        const authenticator = authenticators.find(auth => auth.name === oauth_provider);

        if (!authenticator) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `OAuth provider '${oauth_provider}' is not registered`,
          });
        }

        // Build redirect URL to OAuth provider
        // Use CHE_API or CHE_API_ENDPOINT, remove trailing /api to avoid /api/api duplication
        let baseUrl =
          process.env.CHE_API ||
          process.env.CHE_API_ENDPOINT ||
          `http://localhost:${process.env.PORT || 8080}`;
        if (baseUrl.endsWith('/api')) {
          baseUrl = baseUrl.slice(0, -4);
        }
        const redirectUri = `${baseUrl}/api/oauth/callback`;

        // Build state parameter (contains redirect_after_login AND user info for callback)
        // The callback bypasses Dex auth, so we need to pass user context in the state
        const userId = request.subject?.userId || 'anonymous';
        const userName = request.subject?.userName || 'anonymous';
        const namespace = `${userName}-che`;

        const stateData = {
          // Default to the dashboard route if the UI didn't provide a redirect.
          // This avoids redirecting to "/" after OAuth login (common "wrong redirect" symptom).
          redirect_after_login: redirect_after_login || '/dashboard/',
          oauth_provider: oauth_provider,
          userId,
          userName,
          namespace,
        };
        const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

        // Use authorizationEndpoint (full URL like https://github.com/login/oauth/authorize)
        // Fall back to endpointUrl if authorizationEndpoint is not available
        const authEndpoint = authenticator.authorizationEndpoint || authenticator.endpointUrl;
        const authUrl = new URL(authEndpoint);

        // Use clientId from OAuth configuration (loaded from Kubernetes secret)
        const clientId =
          authenticator.clientId ||
          process.env[`${oauth_provider.toUpperCase()}_CLIENT_ID`] ||
          'che-client';
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        if (scope) {
          authUrl.searchParams.set('scope', scope);
        }
        if (state) {
          authUrl.searchParams.set('state', state);
        }
        authUrl.searchParams.set('response_type', 'code');

        fastify.log.info(`Redirecting to OAuth provider: ${oauth_provider}`);
        fastify.log.debug({ authUrl: authUrl.toString() }, 'Auth URL generated');

        // Redirect to OAuth provider
        return reply.redirect(302, authUrl.toString());
      } catch (error: any) {
        fastify.log.error('Error initiating OAuth authentication:', error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to initiate OAuth authentication',
        });
      }
    },
  );

  /**
   * GET /oauth/callback
   *
   * OAuth callback endpoint that receives the authorization code from the OAuth provider.
   * Exchanges the code for an access token and stores it.
   *
   * Based on: org.eclipse.che.security.oauth.OAuthAuthenticationService.callback()
   */
  fastify.get(
    '/oauth/callback',
    {
      schema: {
        tags: ['oauth'],
        summary: 'OAuth callback',
        description:
          'Handles OAuth callback from provider. Exchanges authorization code for access token.',
        querystring: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Authorization code from OAuth provider',
            },
            state: {
              type: 'string',
              description: 'State parameter (contains redirect URL)',
            },
            error: {
              type: 'string',
              description: 'Error code if authentication failed',
            },
            error_description: {
              type: 'string',
              description: 'Error description if authentication failed',
            },
          },
        },
        response: {
          302: {
            description: 'Redirect to application',
            type: 'null',
          },
          400: {
            description: 'Bad Request',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      // In Che, the callback is served under the same domain as the dashboard and is typically
      // authenticated by the gateway (gap-auth / session). We authenticate here to get user context
      // for storing the token in the correct namespace.
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as {
          code?: string;
          state?: string;
          error?: string;
          error_description?: string;
        };

        const { code, state, error, error_description } = query;

        // Check for OAuth errors
        if (error) {
          fastify.log.error(`OAuth error: ${error} - ${error_description}`);
          const errorPage = `
            <html>
              <head><title>Authentication Failed</title></head>
              <body>
                <h1>Authentication Failed</h1>
                <p><strong>Error:</strong> ${error}</p>
                <p><strong>Description:</strong> ${error_description || 'Unknown error'}</p>
                <p><a href="/">Return to application</a></p>
              </body>
            </html>
          `;
          return reply.type('text/html').code(400).send(errorPage);
        }

        if (!code) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Authorization code is required',
          });
        }

        // Decode state to get redirect URL, OAuth provider info, AND user context
        let redirectUrl = '/';
        let oauthProvider = 'github'; // Default, should come from state
        let userId = 'anonymous';
        let userName = 'anonymous';
        let namespace = '';

        if (state) {
          try {
            // Try base64 JSON format first
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
            redirectUrl = decoded.redirect_after_login || '/';
            oauthProvider = decoded.oauth_provider || 'github';
            userId = decoded.userId || 'anonymous';
            userName = decoded.userName || 'anonymous';
            namespace = decoded.namespace || `${userName}-che`;

            fastify.log.info({ oauthProvider, userId, userName, namespace }, 'Decoded OAuth state');
          } catch {
            // Try URL-encoded format (used by dashboard)
            try {
              const params = new URLSearchParams(decodeURIComponent(state));
              redirectUrl = params.get('redirect_after_login') || '/';
              oauthProvider = params.get('oauth_provider') || 'github';
            } catch (err) {
              fastify.log.warn({ err }, 'Failed to decode state parameter');
            }
          }
        }

        // Prefer authenticated user context if available (gateway-authenticated callback)
        if (request.subject?.userName) {
          userName = request.subject.userName;
          userId = request.subject.userId;
          namespace = `${userName}-che`;
        }

        // Exchange authorization code for access token
        const authenticators = oauthService.getRegisteredAuthenticators();
        const authenticator = authenticators.find(auth => auth.name === oauthProvider);

        if (authenticator && authenticator.clientId) {
          try {
            // Get token endpoint
            let tokenEndpoint = '';
            if (oauthProvider === 'github') {
              tokenEndpoint = 'https://github.com/login/oauth/access_token';
            } else if (oauthProvider === 'gitlab') {
              tokenEndpoint = 'https://gitlab.com/oauth/token';
            } else if (oauthProvider === 'bitbucket') {
              tokenEndpoint = 'https://bitbucket.org/site/oauth2/access_token';
            }

            if (tokenEndpoint) {
              // Build redirect URI (same as used in /authenticate)
              let baseUrl =
                process.env.CHE_API ||
                process.env.CHE_API_ENDPOINT ||
                `http://localhost:${process.env.PORT || 8080}`;
              if (baseUrl.endsWith('/api')) {
                baseUrl = baseUrl.slice(0, -4);
              }
              const redirectUri = `${baseUrl}/api/oauth/callback`;

              // Get client secret from OAuth configuration (loaded from Kubernetes secret)
              const clientSecret =
                authenticator.clientSecret ||
                process.env[`${oauthProvider.toUpperCase()}_CLIENT_SECRET`];

              // Exchange code for token
              const tokenResponse = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  client_id: authenticator.clientId,
                  client_secret: clientSecret || '',
                  code: code,
                  redirect_uri: redirectUri,
                }),
              });

              const tokenData = await tokenResponse.json();
              fastify.log.info(
                { provider: oauthProvider, hasToken: !!tokenData.access_token },
                'Token exchange completed',
              );

              if (tokenData.access_token) {
                // Store token as a Personal Access Token (PAT) Kubernetes secret
                // Use user info from OAuth state (since callback bypasses Dex auth)

                if (userName !== 'anonymous' && namespace) {
                  try {
                    // Generate a random token name (5 chars like dogfooding does)
                    const tokenName = Math.random().toString(36).substring(2, 7);

                    // Get provider endpoint
                    let gitProviderEndpoint = 'https://github.com';
                    if (oauthProvider === 'gitlab') {
                      gitProviderEndpoint = 'https://gitlab.com';
                    } else if (oauthProvider === 'bitbucket') {
                      gitProviderEndpoint = 'https://bitbucket.org';
                    } else if (oauthProvider === 'azure-devops') {
                      gitProviderEndpoint = 'https://dev.azure.com';
                    }

                    // Create PAT using ServiceAccount (has permission to create secrets)
                    const kubeConfig = getServiceAccountKubeConfig();
                    const patService = new PersonalAccessTokenService(kubeConfig);

                    // Base64 encode the token
                    const tokenDataBase64 = Buffer.from(tokenData.access_token).toString('base64');

                    await patService.create(namespace, {
                      tokenName,
                      cheUserId: userId,
                      gitProvider: oauthProvider as GitProvider,
                      gitProviderEndpoint,
                      isOauth: true,
                      tokenData: tokenDataBase64,
                    });

                    fastify.log.info(
                      { provider: oauthProvider, userId, namespace, tokenName },
                      'OAuth token stored as PAT secret successfully',
                    );
                  } catch (patError: any) {
                    fastify.log.error(
                      { error: patError.message, namespace },
                      'Failed to store OAuth token as PAT secret',
                    );
                  }
                } else {
                  // Fallback: store in memory if no namespace available
                  await oauthService.storeToken(userId, oauthProvider, {
                    token: tokenData.access_token,
                    scope: tokenData.scope || '',
                  });
                  fastify.log.info(
                    { provider: oauthProvider, userId },
                    'OAuth token stored in memory (no namespace available)',
                  );
                }
              } else if (tokenData.error) {
                fastify.log.error(
                  {
                    error: tokenData.error,
                    description: tokenData.error_description,
                  },
                  'Token exchange failed',
                );
              }
            }
          } catch (tokenError: any) {
            fastify.log.error(
              { error: tokenError.message },
              'Failed to exchange authorization code for token',
            );
          }
        }

        fastify.log.info({ redirectUrl }, 'OAuth authentication successful');

        // Redirect to the original URL
        return reply.redirect(302, redirectUrl);
      } catch (error: any) {
        fastify.log.error('Error handling OAuth callback:', error);
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to handle OAuth callback',
        });
      }
    },
  );
}
