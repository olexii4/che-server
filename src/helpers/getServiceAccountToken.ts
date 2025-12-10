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

import { existsSync, readFileSync } from 'fs';
import { logger } from '../utils/logger';

export const SERVICE_ACCOUNT_TOKEN_PATH = '/run/secrets/kubernetes.io/serviceaccount/token';

/**
 * Get the Kubernetes service account token.
 *
 * This token is used for cluster-level operations that require elevated permissions,
 * such as listing all che namespaces. The service account has permissions that individual
 * users might not have.
 *
 * In production (running in a pod): Reads from /run/secrets/kubernetes.io/serviceaccount/token
 * In local development (LOCAL_RUN=true): Uses SERVICE_ACCOUNT_TOKEN env var
 *
 * Pattern based on:
 * https://github.com/eclipse-che/che-dashboard/blob/main/packages/dashboard-backend/src/routes/api/helpers/getServiceAccountToken.ts
 */
export function getServiceAccountToken(): string {
  const isLocalRun = process.env.LOCAL_RUN === 'true';

  if (isLocalRun) {
    const token = process.env.SERVICE_ACCOUNT_TOKEN;
    if (!token) {
      logger.warn(
        'SERVICE_ACCOUNT_TOKEN not set for local run. Namespace listing may fail without proper permissions.',
      );
      return '';
    }
    return token;
  }

  if (!existsSync(SERVICE_ACCOUNT_TOKEN_PATH)) {
    logger.fatal(
      `SERVICE_ACCOUNT_TOKEN is required but ${SERVICE_ACCOUNT_TOKEN_PATH} does not exist.\n` +
        `  Running locally? Set LOCAL_RUN=true and SERVICE_ACCOUNT_TOKEN env vars.\n` +
        `  Example: export LOCAL_RUN=true && export SERVICE_ACCOUNT_TOKEN=$(oc whoami -t)`,
    );
    process.exit(1);
  }

  return readFileSync(SERVICE_ACCOUNT_TOKEN_PATH, 'utf-8').trim();
}

/**
 * Check if running in local development mode
 */
export function isLocalRun(): boolean {
  return process.env.LOCAL_RUN === 'true';
}
