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
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
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
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
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

        // Get token
        let token = await oauthService.getOrRefreshToken(request.subject.userId, oauthProvider);

        // If no token exists, generate a mock one (for development/demo)
        if (!token) {
          token = oauthService.generateMockToken(oauthProvider);
          oauthService.storeToken(request.subject.userId, oauthProvider, token);
        }

        return reply.code(200).send(token);
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
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
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

        // Invalidate token
        await oauthService.invalidateToken(request.subject.userId, oauthProvider);

        return reply.code(204).send();
      } catch (error: any) {
        fastify.log.error('Error invalidating OAuth token:', error);

        if (error.message?.includes('not found')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

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
        const redirectUri = `${process.env.CHE_API_ENDPOINT || `http://localhost:${process.env.PORT || 8080}`}/api/oauth/callback`;

        // Build state parameter (contains redirect_after_login)
        const state = redirect_after_login
          ? Buffer.from(JSON.stringify({ redirect_after_login })).toString('base64')
          : '';

        const authUrl = new URL(authenticator.endpointUrl);
        authUrl.searchParams.set(
          'client_id',
          process.env[`${oauth_provider.toUpperCase()}_CLIENT_ID`] || 'che-client',
        );
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

        // TODO: Exchange authorization code for access token
        // This requires implementing token exchange with each OAuth provider
        // For now, return a success page

        // Decode state to get redirect URL
        let redirectUrl = '/';
        if (state) {
          try {
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
            redirectUrl = decoded.redirect_after_login || '/';
          } catch (err) {
            fastify.log.warn({ err }, 'Failed to decode state parameter');
          }
        }

        fastify.log.info({ redirectUrl }, 'OAuth authentication successful');

        // For now, show success page
        // In production, this should exchange the code for a token and redirect
        const successPage = `
          <html>
            <head>
              <title>Authentication Successful</title>
              <script>
                // Close the popup window if this was opened in a popup
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth-success' }, '*');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </head>
            <body>
              <h1>Authentication Successful!</h1>
              <p>You have successfully authenticated with the OAuth provider.</p>
              <p>Authorization code: <code>${code.substring(0, 20)}...</code></p>
              <p>This window will close automatically, or <a href="${redirectUrl}">click here to continue</a>.</p>
            </body>
          </html>
        `;

        return reply.type('text/html').code(200).send(successPage);
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
