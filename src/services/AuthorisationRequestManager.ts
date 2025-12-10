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
 * Authorization Request Manager
 *
 * Based on: org.eclipse.che.api.factory.server.scm.AuthorisationRequestManager
 *
 * Manages authorization rejection states for SCM providers
 */
export class AuthorisationRequestManager {
  private rejectedProviders: Set<string> = new Set();

  /**
   * Check if authorization was rejected/stored for a provider
   *
   * @param providerName - SCM provider name (e.g., "github", "gitlab")
   * @returns true if authorization was rejected for this provider
   */
  isStored(providerName: string): boolean {
    return this.rejectedProviders.has(providerName);
  }

  /**
   * Store that authorization was rejected for a provider
   *
   * @param providerName - SCM provider name
   */
  store(providerName: string): void {
    this.rejectedProviders.add(providerName);
    logger.info(`Authorization rejection stored for provider: ${providerName}`);
  }

  /**
   * Remove authorization rejection for a provider
   *
   * @param providerName - SCM provider name
   */
  remove(providerName: string): void {
    this.rejectedProviders.delete(providerName);
    logger.info(`Authorization rejection removed for provider: ${providerName}`);
  }

  /**
   * Clear all authorization rejections
   */
  clear(): void {
    this.rejectedProviders.clear();
    logger.info('All authorization rejections cleared');
  }
}
