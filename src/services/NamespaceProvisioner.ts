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

import { KubernetesNamespaceMeta } from '../models/KubernetesNamespaceMeta';
import { NamespaceResolutionContext } from '../models/NamespaceResolutionContext';
import { logger } from '../utils/logger';
import { KubernetesNamespaceFactory } from './KubernetesNamespaceFactory';
import { UserProfileService } from './UserProfileService';
import { UserPermissionConfigurator } from './UserPermissionConfigurator';
import { WorkspacePreferencesService } from './WorkspacePreferencesService';

/**
 * Provisions the k8s Namespace. After provisioning, configures the namespace.
 *
 * This is a TypeScript implementation of the Java class:
 * org.eclipse.che.workspace.infrastructure.kubernetes.provision.NamespaceProvisioner
 * 
 * Matches Java behavior with multiple NamespaceConfigurators:
 * - UserProfileConfigurator: Creates user-profile Secret
 * - UserPermissionConfigurator: Creates RoleBindings for user RBAC access
 * 
 * Java source files:
 * - infrastructures/kubernetes/.../namespace/configurator/UserProfileConfigurator.java
 * - infrastructures/kubernetes/.../namespace/configurator/UserPermissionConfigurator.java
 */
export class NamespaceProvisioner {
  private userPermissionConfigurator: UserPermissionConfigurator;

  constructor(
    private namespaceFactory: KubernetesNamespaceFactory,
    private kubeConfig: k8s.KubeConfig,
  ) {
    // Initialize UserPermissionConfigurator with the same KubeConfig
    // This will create RoleBindings using the current token (ServiceAccount or user)
    this.userPermissionConfigurator = new UserPermissionConfigurator(kubeConfig);
  }

  /**
   * Provision a namespace for the given context.
   *
   * @param namespaceResolutionContext - Context containing user information
   * @returns Promise resolving to namespace metadata
   * @throws Error if namespace cannot be provisioned or found
   */
  async provision(
    namespaceResolutionContext: NamespaceResolutionContext,
  ): Promise<KubernetesNamespaceMeta> {
    // Evaluate namespace name based on context
    const namespaceName = this.namespaceFactory.evaluateNamespaceName(namespaceResolutionContext);

    logger.info({ namespaceName, userId: namespaceResolutionContext.subject.userId }, '📋 Provisioning namespace');

    // Get or create the namespace
    const namespace = await this.namespaceFactory.getOrCreate(
      namespaceName,
      namespaceResolutionContext.subject.userId,
    );

    if (!namespace.metadata?.name) {
      throw new Error(`Not able to find the provisioned namespace name`);
    }

    // Configure the namespace (create user-profile Secret, etc.)
    // Matches Java UserProfileConfigurator.configure()
    await this.configure(namespaceResolutionContext, namespace.metadata.name);

    // Fetch the namespace metadata
    const namespaceMeta = await this.namespaceFactory.fetchNamespace(namespace.metadata.name);

    if (!namespaceMeta) {
      throw new Error(`Not able to find namespace ${namespace.metadata?.name}`);
    }

    logger.info({ namespaceName, userId: namespaceResolutionContext.subject.userId }, '✅ Namespace provisioned successfully');

    return namespaceMeta;
  }

  /**
   * Configure the namespace by running all NamespaceConfigurators.
   * 
   * Matches Java implementation pattern where multiple configurators are called:
   * - UserProfileConfigurator.configure() - Creates user-profile Secret
   * - UserPermissionConfigurator.configure() - Creates RoleBindings for user RBAC
   * 
   * Java source: KubernetesNamespaceFactory.configureNamespace()
   * 
   * @param namespaceResolutionContext - Context containing user information
   * @param namespaceName - Namespace name to configure
   */
  private async configure(
    namespaceResolutionContext: NamespaceResolutionContext,
    namespaceName: string,
  ): Promise<void> {
    logger.info({ namespaceName }, '🔧 Configuring namespace');

    const username = namespaceResolutionContext.subject.userName;

    try {
      // 1. UserProfileConfigurator - Create user-profile Secret
      // Matches Java: UserProfileConfigurator.configure()
      logger.info({ namespaceName }, '📋 Creating user-profile Secret');
      const userProfileService = new UserProfileService(this.kubeConfig);
      await userProfileService.getUserProfile(namespaceName);
      
      // 2. UserPermissionConfigurator - Create RoleBindings for user RBAC access
      // Matches Java: UserPermissionConfigurator.configure()
      // This allows the user to access their namespace resources via RBAC
      await this.userPermissionConfigurator.configure(namespaceName, username);

      // 3. WorkspacePreferences ConfigMap - Ensure it exists
      // Java creates/ensures preferences storage during namespace setup.
      // The dashboard backend expects this ConfigMap to exist in the user namespace.
      const workspacePreferencesService = new WorkspacePreferencesService(this.kubeConfig);
      await workspacePreferencesService.ensureConfigMapExists(namespaceName);
      
      logger.info({ namespaceName }, '✅ Namespace configured successfully');
    } catch (error: any) {
      logger.error({ error: error.message, namespaceName }, '❌ Error configuring namespace');
      throw new Error(`Error occurred while configuring namespace: ${error.message}`);
    }
  }
}
