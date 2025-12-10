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
  DevWorkspaceTemplate,
  DevWorkspaceTemplateList,
  DEVWORKSPACE_TEMPLATE_CRD,
  PatchOperation,
} from '../models/DevWorkspaceModels';
import { logger } from '../utils/logger';

/**
 * Service for managing DevWorkspaceTemplate custom resources
 */
export class DevWorkspaceTemplateService {
  private customApi: k8s.CustomObjectsApi;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.customApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
  }

  /**
   * List all DevWorkspaceTemplates in a namespace
   */
  async listInNamespace(namespace: string): Promise<DevWorkspaceTemplate[]> {
    try {
      const response = await this.customApi.listNamespacedCustomObject(
        DEVWORKSPACE_TEMPLATE_CRD.GROUP,
        DEVWORKSPACE_TEMPLATE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_TEMPLATE_CRD.PLURAL,
      );

      const list = response.body as DevWorkspaceTemplateList;
      return list.items || [];
    } catch (error) {
      logger.error({ error, namespace }, 'Error listing DevWorkspaceTemplates');
      throw error;
    }
  }

  /**
   * Get a specific DevWorkspaceTemplate by name
   */
  async getByName(namespace: string, name: string): Promise<DevWorkspaceTemplate> {
    try {
      const response = await this.customApi.getNamespacedCustomObject(
        DEVWORKSPACE_TEMPLATE_CRD.GROUP,
        DEVWORKSPACE_TEMPLATE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_TEMPLATE_CRD.PLURAL,
        name,
      );

      return response.body as DevWorkspaceTemplate;
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error getting DevWorkspaceTemplate');
      throw error;
    }
  }

  /**
   * Create a new DevWorkspaceTemplate
   */
  async create(namespace: string, template: DevWorkspaceTemplate): Promise<DevWorkspaceTemplate> {
    try {
      // Ensure metadata is set correctly
      if (!template.metadata) {
        template.metadata = {};
      }
      template.metadata.namespace = namespace;

      const response = await this.customApi.createNamespacedCustomObject(
        DEVWORKSPACE_TEMPLATE_CRD.GROUP,
        DEVWORKSPACE_TEMPLATE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_TEMPLATE_CRD.PLURAL,
        template,
      );

      logger.info(
        { namespace, name: template.metadata.name },
        'DevWorkspaceTemplate created successfully',
      );
      return response.body as DevWorkspaceTemplate;
    } catch (error) {
      logger.error({ error, namespace }, 'Error creating DevWorkspaceTemplate');
      throw error;
    }
  }

  /**
   * Update a DevWorkspaceTemplate using JSON Patch
   */
  async patch(
    namespace: string,
    name: string,
    patch: PatchOperation[],
  ): Promise<DevWorkspaceTemplate> {
    try {
      const options = {
        headers: { 'Content-Type': 'application/json-patch+json' },
      };

      const response = await this.customApi.patchNamespacedCustomObject(
        DEVWORKSPACE_TEMPLATE_CRD.GROUP,
        DEVWORKSPACE_TEMPLATE_CRD.VERSION,
        namespace,
        DEVWORKSPACE_TEMPLATE_CRD.PLURAL,
        name,
        patch,
        undefined,
        undefined,
        undefined,
        options,
      );

      logger.info({ namespace, name }, 'DevWorkspaceTemplate patched successfully');
      return response.body as DevWorkspaceTemplate;
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error patching DevWorkspaceTemplate');
      throw error;
    }
  }
}
