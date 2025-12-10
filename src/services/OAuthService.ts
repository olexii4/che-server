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

import {
  OAuthToken,
  OAuthAuthenticatorDescriptor,
  OAuthProviderConfig,
  OAUTH_CONSTANTS,
} from '../models/OAuthModels';
import { logger } from '../utils/logger';
import * as k8s from '@kubernetes/client-node';

/**
 * OAuth Service - Manages OAuth authentication and token operations
 *
 * Based on: org.eclipse.che.security.oauth.OAuthAPI
 *
 * Configuration:
 * - In production: Loads OAuth providers from Kubernetes Secrets
 * - Without secrets: Returns empty array [] (no default providers)
 *
 * See: https://eclipse.dev/che/docs/stable/administration-guide/configuring-oauth-2-for-github/
 */
export class OAuthService {
  private tokens: Map<string, Map<string, OAuthToken>> = new Map(); // userId -> provider -> token
  private providers: Map<string, OAuthProviderConfig> = new Map();
  private k8sApi?: k8s.CoreV1Api;
  private namespace: string;
  private isInitialized = false;

  constructor() {
    // Start with empty providers - will be loaded from Kubernetes Secrets
    this.namespace = process.env.CHE_NAMESPACE || 'eclipse-che';

    // Initialize Kubernetes API client if in cluster
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      logger.info('OAuth Service: Kubernetes API client initialized');
    } catch (error) {
      logger.warn('OAuth Service: Not running in Kubernetes cluster, no providers will be loaded');
    }
  }

  /**
   * Initialize OAuth service - load providers from Kubernetes Secrets
   *
   * Must be called before using the service in production environments.
   * Without Kubernetes Secrets, the service will return empty array [] for providers.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.loadProvidersFromSecrets();
    this.isInitialized = true;
  }

  /**
   * Load OAuth providers from Kubernetes Secrets
   *
   * Reads secrets with label: app.kubernetes.io/component=oauth-scm-configuration
   *
   * Expected Secret structure:
   * ```yaml
   * apiVersion: v1
   * kind: Secret
   * metadata:
   *   name: github-oauth-config
   *   labels:
   *     app.kubernetes.io/part-of: che.eclipse.org
   *     app.kubernetes.io/component: oauth-scm-configuration
   *   annotations:
   *     che.eclipse.org/oauth-scm-server: github
   *     che.eclipse.org/scm-server-endpoint: https://github.com
   * type: Opaque
   * data:
   *   id: <base64-client-id>
   *   secret: <base64-client-secret>
   * ```
   */
  private async loadProvidersFromSecrets(): Promise<void> {
    if (!this.k8sApi) {
      logger.info('OAuth Service: Kubernetes API not available, no providers loaded');
      return;
    }

    try {
      logger.info(
        `OAuth Service: Loading providers from Kubernetes Secrets in namespace: ${this.namespace}`,
      );

      // List secrets with OAuth configuration label
      const response = await this.k8sApi.listNamespacedSecret(
        this.namespace,
        undefined, // pretty
        undefined, // allowWatchBookmarks
        undefined, // _continue
        undefined, // fieldSelector
        'app.kubernetes.io/component=oauth-scm-configuration', // labelSelector
      );

      if (!response.body.items || response.body.items.length === 0) {
        logger.info(
          'OAuth Service: No OAuth configuration secrets found. /api/oauth will return []',
        );
        return;
      }

      logger.info(
        `OAuth Service: Found ${response.body.items.length} OAuth configuration secret(s)`,
      );

      for (const secret of response.body.items) {
        try {
          await this.processOAuthSecret(secret);
        } catch (error: any) {
          logger.error(
            `OAuth Service: Failed to process secret ${secret.metadata?.name}: ${error.message}`,
          );
          // Continue processing other secrets
        }
      }

      logger.info(`OAuth Service: Successfully loaded ${this.providers.size} OAuth provider(s)`);
    } catch (error: any) {
      logger.error({ error }, 'OAuth Service: Failed to load OAuth providers from Kubernetes');
      // Continue with empty providers - API will return empty array
    }
  }

  /**
   * Process a single OAuth configuration secret
   */
  private async processOAuthSecret(secret: k8s.V1Secret): Promise<void> {
    const annotations = secret.metadata?.annotations || {};
    const data = secret.data || {};
    const secretName = secret.metadata?.name || 'unknown';

    // Extract provider configuration from annotations
    const providerName = annotations['che.eclipse.org/oauth-scm-server'];
    const serverEndpoint = annotations['che.eclipse.org/scm-server-endpoint'];

    // Validate required fields
    if (!providerName) {
      logger.warn(
        `OAuth Service: Secret ${secretName} missing annotation: che.eclipse.org/oauth-scm-server`,
      );
      return;
    }

    if (!data.id || !data.secret) {
      logger.warn(
        `OAuth Service: Secret ${secretName} missing required data fields: id and secret`,
      );
      return;
    }

    // Decode base64 credentials
    const clientId = Buffer.from(data.id, 'base64').toString('utf-8');
    const clientSecret = Buffer.from(data.secret, 'base64').toString('utf-8');

    if (!clientId || !clientSecret) {
      logger.warn(`OAuth Service: Secret ${secretName} has empty credentials`);
      return;
    }

    // Build provider configuration based on provider type
    const config = this.buildProviderConfig(providerName, serverEndpoint, clientId, clientSecret);

    if (config) {
      this.providers.set(providerName, config);
      logger.info(
        `OAuth Service: Loaded provider '${providerName}' from secret '${secretName}' (endpoint: ${serverEndpoint || 'default'})`,
      );
    }
  }

  /**
   * Build provider configuration based on provider type
   */
  private buildProviderConfig(
    providerName: string,
    serverEndpoint: string | undefined,
    clientId: string,
    clientSecret: string,
  ): OAuthProviderConfig | null {
    const lowerProvider = providerName.toLowerCase();

    // GitHub
    if (lowerProvider === 'github') {
      const baseUrl = serverEndpoint || 'https://github.com';
      return {
        name: lowerProvider,
        authorizationEndpoint: `${baseUrl}/login/oauth/authorize`,
        tokenEndpoint: `${baseUrl}/login/oauth/access_token`,
        scopes: ['repo', 'user', 'write:public_key'],
        clientId,
        clientSecret,
      };
    }

    // GitLab
    if (lowerProvider === 'gitlab') {
      const baseUrl = serverEndpoint || 'https://gitlab.com';
      return {
        name: lowerProvider,
        authorizationEndpoint: `${baseUrl}/oauth/authorize`,
        tokenEndpoint: `${baseUrl}/oauth/token`,
        scopes: ['api', 'read_user', 'read_repository'],
        clientId,
        clientSecret,
      };
    }

    // Bitbucket
    if (lowerProvider === 'bitbucket') {
      const baseUrl = serverEndpoint || 'https://bitbucket.org';
      return {
        name: lowerProvider,
        authorizationEndpoint: `${baseUrl}/site/oauth2/authorize`,
        tokenEndpoint: `${baseUrl}/site/oauth2/access_token`,
        scopes: ['repository', 'account'],
        clientId,
        clientSecret,
      };
    }

    // Azure DevOps
    if (lowerProvider === 'azure-devops' || lowerProvider === 'azure_devops') {
      return {
        name: 'azure-devops',
        authorizationEndpoint: 'https://app.vssps.visualstudio.com/oauth2/authorize',
        tokenEndpoint: 'https://app.vssps.visualstudio.com/oauth2/token',
        scopes: ['vso.code', 'vso.code_write'],
        clientId,
        clientSecret,
      };
    }

    logger.warn(`OAuth Service: Unknown provider type: ${providerName}`);
    return null;
  }

  /**
   * Register an OAuth provider
   *
   * @param config - OAuth provider configuration
   */
  registerProvider(config: OAuthProviderConfig): void {
    this.providers.set(config.name, config);
  }

  /**
   * Get list of registered OAuth authenticators
   *
   * @returns Array of OAuth authenticator descriptors
   */
  getRegisteredAuthenticators(): OAuthAuthenticatorDescriptor[] {
    const descriptors: OAuthAuthenticatorDescriptor[] = [];
    const apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';

    this.providers.forEach((config, name) => {
      // Get the base endpoint URL (without /oauth/authorize path)
      let endpointUrl = config.authorizationEndpoint;

      // Extract base URL for display
      if (name === 'github') {
        endpointUrl = 'https://github.com';
      } else if (name === 'gitlab') {
        endpointUrl = 'https://gitlab.com';
      } else if (name === 'bitbucket') {
        endpointUrl = 'https://bitbucket.org';
      } else if (name === 'azure-devops') {
        endpointUrl = 'https://dev.azure.com';
      }

      descriptors.push({
        name: name,
        endpointUrl: endpointUrl,
        links: [
          {
            method: 'GET',
            parameters: [
              {
                name: 'oauth_provider',
                defaultValue: name,
                required: true,
                valid: [],
              },
              {
                name: 'mode',
                defaultValue: 'federated_login',
                required: true,
                valid: [],
              },
            ],
            rel: 'Authenticate URL',
            href: `${apiEndpoint}/api/oauth/authenticate`,
          },
        ],
      });
    });

    return descriptors;
  }

  /**
   * Get or refresh OAuth token for user
   *
   * @param userId - User ID
   * @param oauthProvider - OAuth provider name
   * @returns OAuth token or null if not found
   * @throws Error if provider not found
   */
  async getOrRefreshToken(userId: string, oauthProvider: string): Promise<OAuthToken | null> {
    if (!oauthProvider) {
      throw new Error(OAUTH_CONSTANTS.ERRORS.PROVIDER_REQUIRED);
    }

    // Check if provider exists
    if (!this.providers.has(oauthProvider)) {
      throw new Error(OAUTH_CONSTANTS.ERRORS.PROVIDER_NOT_FOUND);
    }

    // Get user's tokens
    const userTokens = this.tokens.get(userId);
    if (!userTokens) {
      return null;
    }

    // Get token for this provider
    const token = userTokens.get(oauthProvider);
    if (!token) {
      return null;
    }

    return token;
  }

  /**
   * Store OAuth token for user
   *
   * @param userId - User ID
   * @param oauthProvider - OAuth provider name
   * @param token - OAuth token
   */
  storeToken(userId: string, oauthProvider: string, token: OAuthToken): void {
    if (!this.tokens.has(userId)) {
      this.tokens.set(userId, new Map());
    }

    const userTokens = this.tokens.get(userId)!;
    userTokens.set(oauthProvider, token);

    logger.info(`Stored OAuth token for user ${userId} and provider ${oauthProvider}`);
  }

  /**
   * Invalidate OAuth token for user
   *
   * @param userId - User ID
   * @param oauthProvider - OAuth provider name
   * @throws Error if provider or token not found
   */
  invalidateToken(userId: string, oauthProvider: string): void {
    if (!oauthProvider) {
      throw new Error(OAUTH_CONSTANTS.ERRORS.PROVIDER_REQUIRED);
    }

    const userTokens = this.tokens.get(userId);
    if (!userTokens) {
      throw new Error(OAUTH_CONSTANTS.ERRORS.TOKEN_NOT_FOUND);
    }

    if (!userTokens.has(oauthProvider)) {
      throw new Error(OAUTH_CONSTANTS.ERRORS.TOKEN_NOT_FOUND);
    }

    userTokens.delete(oauthProvider);
    logger.info(`Invalidated OAuth token for user ${userId} and provider ${oauthProvider}`);
  }

  /**
   * Check if user has token for provider
   *
   * @param userId - User ID
   * @param oauthProvider - OAuth provider name
   * @returns true if token exists
   */
  hasToken(userId: string, oauthProvider: string): boolean {
    const userTokens = this.tokens.get(userId);
    if (!userTokens) {
      return false;
    }
    return userTokens.has(oauthProvider);
  }

  /**
   * Generate a mock OAuth token for testing
   *
   * @param oauthProvider - OAuth provider name
   * @returns Mock OAuth token
   */
  generateMockToken(oauthProvider: string): OAuthToken {
    const provider = this.providers.get(oauthProvider);
    const scopes = provider?.scopes.join(' ') || 'read';

    return {
      token: `gho_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      scope: scopes,
    };
  }
}
