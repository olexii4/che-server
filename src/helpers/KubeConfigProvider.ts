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

/**
 * KubeConfig Provider
 *
 * Creates Kubernetes client configurations with user tokens from requests.
 *
 * Inspired by Eclipse Che Dashboard Backend:
 * packages/dashboard-backend/src/services/kubeclient/kubeConfigProvider.ts
 *
 * This provider supports two modes:
 * 1. Local Development (LOCAL_RUN=true): Uses local kubeconfig file
 * 2. In-Cluster (production): Uses in-cluster service account config
 *
 * In both cases, it creates a new KubeConfig with the user's token from the request,
 * enabling user-scoped Kubernetes operations (RBAC applies per-user).
 */
export class KubeConfigProvider {
  private inClusterKubeConfig: k8s.KubeConfig | undefined;
  private isLocalRun: boolean;

  constructor() {
    // LOCAL_RUN=true for development mode (uses local kubeconfig)
    // In production (Kubernetes/OpenShift), this should be false
    this.isLocalRun = process.env.LOCAL_RUN === 'true';

    if (this.isLocalRun) {
      logger.info('KubeConfigProvider: Running in LOCAL_RUN mode, will use local kubeconfig');
    } else {
      logger.info('KubeConfigProvider: Running in cluster mode, will use in-cluster config');
    }
  }

  /**
   * Get a KubeConfig configured with the user's token.
   *
   * This method:
   * 1. Gets the base config (local or in-cluster)
   * 2. Extracts cluster information
   * 3. Creates a new User with the provided token
   * 4. Creates a new Context pointing to that user
   * 5. Returns a KubeConfig ready for use
   *
   * @param token - User's authentication token from the request
   * @returns KubeConfig configured with the user's token
   * @throws Error if base kubeconfig is invalid
   */
  getKubeConfig(token: string): k8s.KubeConfig {
    // Get base configuration (service account or local)
    const baseKc = this.getBaseKubeConfig();

    // Get current context and cluster from base config
    const currentContextName = baseKc.getCurrentContext();
    const currentContext = baseKc.getContextObject(currentContextName);

    if (!currentContext) {
      throw new Error('Base kubeconfig is not valid: no current context is found');
    }

    const currentCluster = baseKc.getCluster(currentContext.cluster);
    if (!currentCluster) {
      throw new Error(
        'Base kubeconfig is not valid: no cluster exists specified in the current context',
      );
    }

    // Extract username from token if possible (format: userid:username)
    let userName = 'user';
    try {
      const parts = token.split(':');
      if (parts.length === 2) {
        userName = parts[1]; // Use the username part
      }
    } catch (error) {
      // If parsing fails, use default
      userName = 'user';
    }

    // Create a new user with the request token
    const user: k8s.User = {
      name: userName,
      token: token,
    };

    // Create a new context for this user
    const context: k8s.Context = {
      user: user.name,
      cluster: currentContext.cluster,
      name: 'request-user-context',
      namespace: currentContext.namespace, // Preserve namespace if set
    };

    // Build new KubeConfig with user's token
    const kubeconfig = new k8s.KubeConfig();
    kubeconfig.addUser(user);
    kubeconfig.addCluster(currentCluster);
    kubeconfig.addContext(context);
    kubeconfig.setCurrentContext(context.name);

    logger.debug(
      `Created KubeConfig for user '${userName}' with cluster '${currentCluster.server}'`,
    );

    return kubeconfig;
  }

  /**
   * Get the base KubeConfig (service account or local).
   *
   * This provides the cluster information that will be used as the base
   * for creating user-specific configurations.
   *
   * @returns Base KubeConfig
   */
  private getBaseKubeConfig(): k8s.KubeConfig {
    if (this.isLocalRun) {
      // Development mode: use local kubeconfig file
      const kc = new k8s.KubeConfig();
      let kubeConfigFile = process.env.KUBECONFIG;

      if (!kubeConfigFile) {
        // Fallback to kubectl default: $HOME/.kube/config
        kubeConfigFile = process.env.HOME + '/.kube/config';
      }

      try {
        kc.loadFromFile(kubeConfigFile);
        logger.debug(`Loaded kubeconfig from: ${kubeConfigFile}`);
      } catch (error: any) {
        logger.warn(
          { error },
          `Failed to load kubeconfig from ${kubeConfigFile}, trying loadFromDefault()`,
        );
        kc.loadFromDefault();
      }

      return kc;
    } else {
      // Production mode: use in-cluster config (cached)
      if (!this.inClusterKubeConfig) {
        this.inClusterKubeConfig = new k8s.KubeConfig();
        try {
          this.inClusterKubeConfig.loadFromCluster();
          logger.info('Loaded in-cluster Kubernetes configuration');
        } catch (error: any) {
          logger.error({ error }, 'Failed to load in-cluster config');
          throw new Error('Failed to load in-cluster Kubernetes configuration');
        }
      }

      return this.inClusterKubeConfig;
    }
  }

  /**
   * Get the ServiceAccount's KubeConfig (for operations that need elevated permissions).
   *
   * This returns the base KubeConfig with the ServiceAccount's token,
   * which has the permissions granted to the che-server ServiceAccount.
   *
   * Use this for operations like:
   * - Managing secrets in user namespaces (PATs, SSH keys)
   * - Creating RoleBindings
   * - Other privileged operations
   *
   * @returns KubeConfig with ServiceAccount token
   */
  getServiceAccountKubeConfig(): k8s.KubeConfig {
    return this.getBaseKubeConfig();
  }

  /**
   * Check if running in local development mode.
   */
  isLocal(): boolean {
    return this.isLocalRun;
  }
}
