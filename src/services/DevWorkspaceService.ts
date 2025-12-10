/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
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

import {
  DevWorkspace,
  DevWorkspaceList,
  DEVWORKSPACE_CRD,
  PatchOperation,
} from '../models/DevWorkspaceModels';
import { logger } from '../utils/logger';

/**
 * Service for managing DevWorkspace custom resources
 */
export class DevWorkspaceService {
  private customApi: k8s.CustomObjectsApi;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.customApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
  }

  /**
   * List all DevWorkspaces in a namespace
   */
  async listInNamespace(namespace: string): Promise<DevWorkspaceList> {
    try {
      const response = await this.customApi.listNamespacedCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_CRD.PLURAL,
      );

      const list = response.body as DevWorkspaceList;
      // Return the full list object (with items and metadata) to match Kubernetes API format
      return list;
    } catch (error) {
      logger.error({ error, namespace }, 'Error listing DevWorkspaces');
      throw error;
    }
  }

  /**
   * Get a specific DevWorkspace by name
   */
  async getByName(namespace: string, name: string): Promise<DevWorkspace> {
    try {
      const response = await this.customApi.getNamespacedCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_CRD.PLURAL,
        name,
      );

      return response.body as DevWorkspace;
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error getting DevWorkspace');
      throw error;
    }
  }

  /**
   * Create a new DevWorkspace
   */
  async create(namespace: string, devworkspace: DevWorkspace): Promise<DevWorkspace> {
    try {
      // Ensure metadata is set correctly
      if (!devworkspace.metadata) {
        devworkspace.metadata = {};
      }
      devworkspace.metadata.namespace = namespace;

      const response = await this.customApi.createNamespacedCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_CRD.PLURAL,
        devworkspace,
      );

      logger.info(
        { namespace, name: devworkspace.metadata.name },
        'DevWorkspace created successfully',
      );
      return response.body as DevWorkspace;
    } catch (error) {
      logger.error({ error, namespace }, 'Error creating DevWorkspace');
      throw error;
    }
  }

  /**
   * Update a DevWorkspace using JSON Patch
   */
  async patch(namespace: string, name: string, patch: PatchOperation[]): Promise<DevWorkspace> {
    try {
      const options = {
        headers: { 'Content-Type': 'application/json-patch+json' },
      };

      const response = await this.customApi.patchNamespacedCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_CRD.PLURAL,
        name,
        patch,
        undefined,
        undefined,
        undefined,
        options,
      );

      logger.info({ namespace, name }, 'DevWorkspace patched successfully');
      return response.body as DevWorkspace;
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error patching DevWorkspace');
      throw error;
    }
  }

  /**
   * Delete a DevWorkspace
   */
  async delete(namespace: string, name: string): Promise<void> {
    try {
      await this.customApi.deleteNamespacedCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_CRD.PLURAL,
        name,
      );

      logger.info({ namespace, name }, 'DevWorkspace deleted successfully');
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error deleting DevWorkspace');
      throw error;
    }
  }

  /**
   * Check if running workspaces exceed cluster limit
   */
  async isRunningWorkspacesClusterLimitExceeded(): Promise<boolean> {
    try {
      // Get cluster-level limit from environment
      const limit = parseInt(process.env.CHE_RUNNING_WORKSPACES_LIMIT || '-1', 10);

      // -1 means unlimited
      if (limit === -1) {
        return false;
      }

      // List all DevWorkspaces across all namespaces
      const response = await this.customApi.listClusterCustomObject(
        DEVWORKSPACE_CRD.GROUP,
        DEVWORKSPACE_CRD.VERSION,
        DEVWORKSPACE_CRD.PLURAL,
      );

      const list = response.body as DevWorkspaceList;
      const runningCount = (list.items || []).filter(
        dw => dw.status?.phase === 'Running' || dw.status?.phase === 'Starting',
      ).length;

      return runningCount >= limit;
    } catch (error) {
      logger.error({ error }, 'Error checking cluster workspace limit');
      throw error;
    }
  }
}
