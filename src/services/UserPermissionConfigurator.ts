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
 * Configuration for user cluster roles.
 * Matches Java property: che.infra.kubernetes.user_cluster_roles
 */
export interface UserPermissionConfig {
  /**
   * Comma-separated list of ClusterRoles to bind to the user in their namespace.
   * Default: disabled (must be explicitly configured by Che)
   */
  userClusterRoles: string[];
}

// Important for "drop-in replacement" mode:
// Do NOT assume any ClusterRole exists. Che/Operator must explicitly configure roles
// via CHE_INFRA_KUBERNETES_USER_CLUSTER_ROLES (Java property: che.infra.kubernetes.user_cluster_roles).
const DEFAULT_USER_CLUSTER_ROLES: string[] = [];

/**
 * Configures user permissions in their namespace by creating RoleBindings.
 *
 * This is a TypeScript implementation of the Java class:
 * org.eclipse.che.workspace.infrastructure.kubernetes.namespace.configurator.UserPermissionConfigurator
 *
 * The Java implementation:
 * - Reads ClusterRoles from `che.infra.kubernetes.user_cluster_roles` property
 * - Creates RoleBindings in user's namespace binding User to each ClusterRole
 * - Uses CheServerKubernetesClientFactory (ServiceAccount) to create bindings
 *
 * This TypeScript implementation:
 * - Reads ClusterRoles from CHE_INFRA_KUBERNETES_USER_CLUSTER_ROLES env var
 * - Creates RoleBindings in user's namespace binding User to each ClusterRole
 * - Uses the provided KubeConfig (can be ServiceAccount or user token)
 */
export class UserPermissionConfigurator {
  private rbacApi: k8s.RbacAuthorizationV1Api;
  private userClusterRoles: string[];

  /**
   * Create a UserPermissionConfigurator.
   *
   * @param kubeConfig - KubeConfig to use for Kubernetes API calls
   * @param config - Optional configuration for user cluster roles
   */
  constructor(kubeConfig: k8s.KubeConfig, config?: Partial<UserPermissionConfig>) {
    this.rbacApi = kubeConfig.makeApiClient(k8s.RbacAuthorizationV1Api);
    
    // Load configuration from environment or use provided config
    this.userClusterRoles = this.loadUserClusterRoles(config);
    
    if (this.userClusterRoles.length > 0) {
      logger.info({ userClusterRoles: this.userClusterRoles }, 'UserPermissionConfigurator initialized with ClusterRoles');
    } else {
      logger.info('UserPermissionConfigurator initialized with no ClusterRoles (user RBAC binding disabled)');
    }
  }

  /**
   * Load user cluster roles from configuration or environment.
   * 
   * @param config - Optional configuration
   * @returns Array of ClusterRole names
   */
  private loadUserClusterRoles(config?: Partial<UserPermissionConfig>): string[] {
    // Priority: config > env > default
    if (config?.userClusterRoles && config.userClusterRoles.length > 0) {
      return config.userClusterRoles;
    }

    // Check environment variable (matches Java property name pattern)
    const envRoles = process.env.CHE_INFRA_KUBERNETES_USER_CLUSTER_ROLES;
    if (envRoles) {
      if (envRoles.toUpperCase() === 'NULL' || envRoles === '') {
        // Explicitly disabled (matches Java behavior where NULL means disabled)
        return [];
      }
      return envRoles.split(',').map(role => role.trim()).filter(role => role.length > 0);
    }

    // Default: disabled unless explicitly configured by Che
    return DEFAULT_USER_CLUSTER_ROLES;
  }

  /**
   * Configure user permissions in the namespace by creating RoleBindings.
   *
   * Matches Java method: UserPermissionConfigurator.configure(NamespaceResolutionContext, String)
   *
   * @param namespaceName - Namespace where RoleBindings will be created
   * @param username - Username to bind to ClusterRoles
   */
  async configure(namespaceName: string, username: string): Promise<void> {
    if (this.userClusterRoles.length === 0) {
      logger.debug({ namespaceName, username }, 'Skipping user permission configuration (no ClusterRoles configured)');
      return;
    }

    logger.info(
      { namespaceName, username, clusterRoles: this.userClusterRoles },
      '🔐 Configuring user permissions (creating RoleBindings)'
    );

    await this.bindRoles(namespaceName, username, this.userClusterRoles);

    logger.info({ namespaceName, username }, '✅ User permissions configured successfully');
  }

  /**
   * Create RoleBindings for the user in the namespace.
   *
   * Matches Java method: UserPermissionConfigurator.bindRoles(...)
   *
   * @param namespaceName - Namespace where RoleBindings will be created
   * @param username - Username to bind to ClusterRoles
   * @param clusterRoles - Array of ClusterRole names to bind
   */
  private async bindRoles(
    namespaceName: string,
    username: string,
    clusterRoles: string[]
  ): Promise<void> {
    for (const clusterRole of clusterRoles) {
      try {
        await this.createOrUpdateRoleBinding(namespaceName, username, clusterRole);
      } catch (error: any) {
        // Log warning but continue with other bindings
        logger.warn(
          { error: error.message, namespaceName, username, clusterRole },
          '⚠️ Failed to create RoleBinding'
        );
      }
    }
  }

  /**
   * Create or update a RoleBinding for a user to a ClusterRole.
   *
   * @param namespaceName - Namespace where RoleBinding will be created
   * @param username - Username to bind
   * @param clusterRoleName - ClusterRole name to bind to
   */
  private async createOrUpdateRoleBinding(
    namespaceName: string,
    username: string,
    clusterRoleName: string
  ): Promise<void> {
    // Use a deterministic name based on username and role
    // This ensures idempotency - same user/role combo always gets same binding name
    const bindingName = this.generateBindingName(username, clusterRoleName);

    const roleBinding: k8s.V1RoleBinding = {
      metadata: {
        name: bindingName,
        namespace: namespaceName,
        labels: {
          'app.kubernetes.io/part-of': 'che.eclipse.org',
          'app.kubernetes.io/component': 'user-permission',
          'che.eclipse.org/username': this.sanitizeLabelValue(username),
        },
      },
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: clusterRoleName,
      },
      subjects: [
        {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'User',
          name: username,
        },
      ],
    };

    try {
      // Try to create the RoleBinding
      await this.rbacApi.createNamespacedRoleBinding(namespaceName, roleBinding);
      logger.info(
        { namespaceName, username, clusterRole: clusterRoleName, bindingName },
        '✅ Created RoleBinding'
      );
    } catch (error: any) {
      if (error.statusCode === 409) {
        // RoleBinding already exists, update it
        await this.rbacApi.replaceNamespacedRoleBinding(bindingName, namespaceName, roleBinding);
        logger.info(
          { namespaceName, username, clusterRole: clusterRoleName, bindingName },
          '✅ Updated existing RoleBinding'
        );
      } else if (error.statusCode === 403) {
        // Forbidden - log specific error for RBAC issues
        logger.error(
          { namespaceName, username, clusterRole: clusterRoleName, error: error.body?.message || error.message },
          '❌ Forbidden: Cannot create RoleBinding (check che-server ServiceAccount permissions)'
        );
        throw error;
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate a deterministic RoleBinding name.
   *
   * @param username - Username
   * @param clusterRoleName - ClusterRole name
   * @returns Generated binding name
   */
  private generateBindingName(username: string, clusterRoleName: string): string {
    // Sanitize username for use in k8s resource name
    const sanitizedUsername = username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 30); // Limit username part length

    // Create name like: che-user-<username>-<clusterrole>
    let name = `${sanitizedUsername}-${clusterRoleName}`;
    
    // Ensure total length doesn't exceed 63 characters
    if (name.length > 63) {
      name = name.substring(0, 63);
    }

    // Ensure it doesn't end with hyphen
    name = name.replace(/-+$/, '');

    return name;
  }

  /**
   * Sanitize a value for use in a Kubernetes label.
   *
   * @param value - Value to sanitize
   * @returns Sanitized value
   */
  private sanitizeLabelValue(value: string): string {
    return value
      .replace(/[^a-zA-Z0-9-_.]/g, '-')
      .substring(0, 63)
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Check if user permission configuration is enabled.
   *
   * @returns true if ClusterRoles are configured
   */
  isEnabled(): boolean {
    return this.userClusterRoles.length > 0;
  }

  /**
   * Get configured ClusterRoles.
   *
   * @returns Array of ClusterRole names
   */
  getConfiguredClusterRoles(): string[] {
    return [...this.userClusterRoles];
  }

  /**
   * Clean up RoleBindings for a user in a namespace.
   * Called when a user's namespace is being deleted.
   *
   * @param namespaceName - Namespace to clean up
   * @param username - Username whose bindings should be removed
   */
  async cleanup(namespaceName: string, username: string): Promise<void> {
    for (const clusterRole of this.userClusterRoles) {
      const bindingName = this.generateBindingName(username, clusterRole);
      try {
        await this.rbacApi.deleteNamespacedRoleBinding(bindingName, namespaceName);
        logger.info({ namespaceName, username, bindingName }, 'Deleted RoleBinding');
      } catch (error: any) {
        if (error.statusCode !== 404) {
          logger.warn(
            { error: error.message, namespaceName, username, bindingName },
            'Failed to delete RoleBinding'
          );
        }
      }
    }
  }
}

