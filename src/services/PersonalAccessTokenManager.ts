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
import { logger } from '../utils/logger';

/**
 * Personal Access Token Manager
 *
 * Based on: org.eclipse.che.api.factory.server.scm.PersonalAccessTokenManager
 *
 * Manages personal access tokens for SCM providers (GitHub, GitLab, etc.)
 */
export class PersonalAccessTokenManager {
  private tokens: Map<string, string> = new Map();

  /**
   * Get and store personal access token for the given SCM server
   *
   * @param scmServerUrl - SCM server URL
   * @returns Promise that resolves when token is stored
   */
  async getAndStore(scmServerUrl: string): Promise<void> {
    logger.info(`Getting and storing token for ${scmServerUrl}`);

    // In a real implementation, this would:
    // 1. Check if token already exists
    // 2. If not, trigger OAuth flow
    // 3. Store the token securely

    // For demo purposes, we'll simulate token storage
    const simulatedToken = `token_${Date.now()}_${Math.random().toString(36)}`;
    this.tokens.set(scmServerUrl, simulatedToken);

    logger.info(`Token stored for ${scmServerUrl}`);
  }

  /**
   * Force refresh personal access token for the given SCM server
   *
   * @param scmServerUrl - SCM server URL
   * @returns Promise that resolves when token is refreshed
   */
  async forceRefreshPersonalAccessToken(scmServerUrl: string): Promise<void> {
    logger.info(`Force refreshing token for ${scmServerUrl}`);

    // In a real implementation, this would:
    // 1. Invalidate existing token
    // 2. Trigger new OAuth flow
    // 3. Store the new token

    // Remove old token and create new one
    this.tokens.delete(scmServerUrl);
    await this.getAndStore(scmServerUrl);

    logger.info(`Token refreshed for ${scmServerUrl}`);
  }

  /**
   * Get stored token for SCM server (for testing/debugging)
   *
   * @param scmServerUrl - SCM server URL
   * @returns Token if exists, undefined otherwise
   */
  getToken(scmServerUrl: string): string | undefined {
    return this.tokens.get(scmServerUrl);
  }

  /**
   * Check if token exists for SCM server
   *
   * @param scmServerUrl - SCM server URL
   * @returns true if token exists
   */
  hasToken(scmServerUrl: string): boolean {
    return this.tokens.has(scmServerUrl);
  }
}
