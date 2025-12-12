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

import * as k8s from '@kubernetes/client-node';
import { logger } from '../utils/logger';
import { KubeConfigProvider } from '../helpers/KubeConfigProvider';
import { getServiceAccountToken } from '../helpers/getServiceAccountToken';

/**
 * Labels for Personal Access Token secrets
 */
const SECRET_LABELS = {
  'app.kubernetes.io/component': 'scm-personal-access-token',
  'app.kubernetes.io/part-of': 'che.eclipse.org',
};

/**
 * Represents a Personal Access Token retrieved from Kubernetes
 */
export interface PatInfo {
  tokenName: string;
  tokenData: string; // The actual token value (decoded from base64)
  gitProvider: string;
  gitProviderEndpoint: string;
  cheUserId: string;
  isOauth: boolean;
}

/**
 * Service for looking up Personal Access Tokens from Kubernetes secrets
 *
 * PATs are stored as Kubernetes secrets with specific labels and annotations
 * in the user's namespace (e.g., admin-che).
 */
export class PatLookupService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig?: k8s.KubeConfig) {
    // Use provided kubeConfig or create one with service account token
    if (kubeConfig) {
      this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
    } else {
      // Use service account token for Kubernetes API calls
      const serviceAccountToken = getServiceAccountToken();
      const kubeConfigProvider = new KubeConfigProvider();
      const config = kubeConfigProvider.getKubeConfig(serviceAccountToken);
      this.coreV1Api = config.makeApiClient(k8s.CoreV1Api);
    }
  }

  /**
   * Get PAT for a specific SCM provider from user's namespace
   *
   * @param namespace - User's namespace (e.g., admin-che)
   * @param scmProvider - SCM provider name (github, gitlab, bitbucket, azure-devops)
   * @param scmUrl - Optional SCM URL to match (e.g., https://github.com)
   * @returns PAT info or null if not found
   */
  async getPatForProvider(
    namespace: string,
    scmProvider: string,
    scmUrl?: string,
  ): Promise<PatInfo | null> {
    try {
      logger.info(
        `[PatLookupService] Looking up PAT for provider "${scmProvider}" in namespace "${namespace}"`,
      );

      // Build label selector
      const labelSelector = Object.entries(SECRET_LABELS)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

      // List secrets with PAT labels in the namespace
      const response = await this.coreV1Api.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      const secrets = response.body.items;
      logger.info(`[PatLookupService] Found ${secrets.length} PAT secrets in namespace "${namespace}"`);

      // Filter by SCM provider
      for (const secret of secrets) {
        const annotations = secret.metadata?.annotations || {};
        const secretProvider = annotations['che.eclipse.org/scm-provider-name'] || '';
        const secretScmUrl = annotations['che.eclipse.org/scm-url'] || '';

        logger.info(
          `[PatLookupService] Checking secret "${secret.metadata?.name}": provider="${secretProvider}", scmUrl="${secretScmUrl}"`,
        );

        // Match by provider name
        if (secretProvider.toLowerCase() !== scmProvider.toLowerCase()) {
          continue;
        }

        // Optionally match by SCM URL if provided
        if (scmUrl) {
          // Normalize URLs for comparison
          const normalizedSecretUrl = this.normalizeUrl(secretScmUrl);
          const normalizedTargetUrl = this.normalizeUrl(scmUrl);

          if (normalizedSecretUrl !== normalizedTargetUrl) {
            logger.info(
              `[PatLookupService] SCM URL mismatch: "${normalizedSecretUrl}" !== "${normalizedTargetUrl}"`,
            );
            continue;
          }
        }

        // Found matching secret - extract token
        const tokenData = secret.data?.token;
        if (!tokenData) {
          logger.warn(`[PatLookupService] Secret "${secret.metadata?.name}" has no token data`);
          continue;
        }

        // Decode base64 token
        const decodedToken = Buffer.from(tokenData, 'base64').toString('utf-8');

        logger.info(
          `[PatLookupService] ✅ Found PAT for provider "${scmProvider}": secret="${secret.metadata?.name}", token length=${decodedToken.length}`,
        );

        return {
          tokenName: secret.metadata?.name?.replace('personal-access-token-', '') || '',
          tokenData: decodedToken,
          gitProvider: secretProvider,
          gitProviderEndpoint: secretScmUrl,
          cheUserId: annotations['che.eclipse.org/che-userid'] || '',
          isOauth:
            (annotations['che.eclipse.org/scm-personal-access-token-name'] || '').startsWith(
              'oauth2-',
            ) || false,
        };
      }

      logger.info(`[PatLookupService] No PAT found for provider "${scmProvider}" in namespace "${namespace}"`);
      return null;
    } catch (error: any) {
      // Check if it's a 404 (namespace not found) or 403 (no permission)
      if (error.response?.statusCode === 404) {
        logger.warn(`[PatLookupService] Namespace "${namespace}" not found`);
        return null;
      }
      if (error.response?.statusCode === 403) {
        logger.warn(
          `[PatLookupService] No permission to list secrets in namespace "${namespace}"`,
        );
        return null;
      }

      logger.error(`[PatLookupService] Error looking up PAT: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all PATs from a user's namespace
   *
   * @param namespace - User's namespace
   * @returns Array of PAT info
   */
  async getAllPats(namespace: string): Promise<PatInfo[]> {
    try {
      logger.info(`[PatLookupService] Listing all PATs in namespace "${namespace}"`);

      const labelSelector = Object.entries(SECRET_LABELS)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

      const response = await this.coreV1Api.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      const pats: PatInfo[] = [];

      for (const secret of response.body.items) {
        const annotations = secret.metadata?.annotations || {};
        const tokenData = secret.data?.token;

        if (!tokenData) {
          continue;
        }

        const decodedToken = Buffer.from(tokenData, 'base64').toString('utf-8');

        pats.push({
          tokenName: secret.metadata?.name?.replace('personal-access-token-', '') || '',
          tokenData: decodedToken,
          gitProvider: annotations['che.eclipse.org/scm-provider-name'] || '',
          gitProviderEndpoint: annotations['che.eclipse.org/scm-url'] || '',
          cheUserId: annotations['che.eclipse.org/che-userid'] || '',
          isOauth:
            (annotations['che.eclipse.org/scm-personal-access-token-name'] || '').startsWith(
              'oauth2-',
            ) || false,
        });
      }

      logger.info(`[PatLookupService] Found ${pats.length} PATs in namespace "${namespace}"`);
      return pats;
    } catch (error: any) {
      logger.error(`[PatLookupService] Error listing PATs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Normalize URL for comparison
   * Removes trailing slashes, protocol variations, etc.
   */
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Return just the host (e.g., "github.com")
      return parsed.host.toLowerCase();
    } catch {
      return url.toLowerCase().replace(/\/+$/, '');
    }
  }

  /**
   * Determine SCM provider from repository URL
   */
  static getProviderFromUrl(repoUrl: string): string {
    const url = repoUrl.toLowerCase();

    if (url.includes('github.com') || url.includes('github')) {
      return 'github';
    }
    if (url.includes('gitlab.com') || url.includes('gitlab')) {
      return 'gitlab';
    }
    // Bitbucket Server (self-hosted) typically uses URLs like:
    // - https://host/scm/<project>/<repo>.git
    // - https://host/projects/<project>/repos/<repo>/browse
    // - https://host/users/<user>/repos/<repo>/browse
    if (
      (url.includes('/scm/') || url.includes('/projects/') || url.includes('/users/')) &&
      url.includes('bitbucket') &&
      !url.includes('bitbucket.org') &&
      !url.includes('api.bitbucket.org')
    ) {
      return 'bitbucket-server';
    }
    if (url.includes('bitbucket.org') || url.includes('bitbucket')) {
      return 'bitbucket';
    }
    if (
      url.includes('dev.azure.com') ||
      url.includes('visualstudio.com') ||
      url.includes('azure')
    ) {
      return 'azure-devops';
    }

    return 'unknown';
  }

  /**
   * Get SCM URL from repository URL
   * Extracts the base URL (e.g., https://github.com from https://github.com/owner/repo)
   */
  static getScmUrlFromRepoUrl(repoUrl: string): string {
    try {
      const parsed = new URL(repoUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return '';
    }
  }
}

/**
 * Helper function to get user namespace from username
 * Convention: {username}-che
 */
export function getUserNamespace(username: string): string {
  return `${username}-che`;
}

