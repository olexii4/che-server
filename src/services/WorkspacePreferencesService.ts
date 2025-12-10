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

import { GitProvider } from '../models/CredentialsModels';
import {
  TrustedSourceAll,
  TrustedSourceUrl,
  WorkspacePreferences,
} from '../models/AdvancedFeaturesModels';
import { logger } from '../utils/logger';

const DEV_WORKSPACE_PREFERENCES_CONFIGMAP = 'workspace-preferences-configmap';
const SKIP_AUTHORIZATION_KEY = 'skip-authorisation';

/**
 * Service for managing Workspace Preferences
 *
 * Preferences are stored in a ConfigMap and include:
 * - skip-authorisation: Git providers to skip OAuth for
 * - trusted-sources: Trusted repository sources
 */
export class WorkspacePreferencesService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * Get workspace preferences
   */
  async getWorkspacePreferences(namespace: string): Promise<WorkspacePreferences> {
    try {
      const response = await this.coreV1Api.readNamespacedConfigMap(
        DEV_WORKSPACE_PREFERENCES_CONFIGMAP,
        namespace,
      );
      const data = response.body.data || {};

      if (!data[SKIP_AUTHORIZATION_KEY]) {
        data[SKIP_AUTHORIZATION_KEY] = '[]';
      }

      const preferences: WorkspacePreferences = {};

      Object.keys(data).forEach(key => {
        if (key === SKIP_AUTHORIZATION_KEY) {
          if (data[key] === '[]') {
            preferences[key] = [];
          } else {
            const providers = data[key].replace('[', '').replace(']', '').split(/,\s+/);
            preferences[key] = providers as GitProvider[];
          }
        } else {
          try {
            preferences[key as keyof WorkspacePreferences] = JSON.parse(data[key]);
          } catch (e) {
            logger.warn({ error: e, key }, 'Failed to parse preference value');
          }
        }
      });

      return preferences;
    } catch (error: any) {
      // If ConfigMap doesn't exist, return empty preferences with proper structure
      if (error.statusCode === 404 || error.response?.statusCode === 404) {
        logger.info({ namespace }, 'Workspace preferences ConfigMap not found, returning defaults');
        return {
          'skip-authorisation': [],
          'trusted-sources': [],
        };
      }
      logger.error({ error, namespace }, 'Error getting workspace preferences');
      throw error;
    }
  }

  /**
   * Remove a provider from the skip-authorisation list
   */
  async removeProviderFromSkipAuthorizationList(
    namespace: string,
    provider: GitProvider,
  ): Promise<void> {
    try {
      const preferences = await this.getWorkspacePreferences(namespace);
      const skipList = preferences['skip-authorisation'] || [];
      const updatedList = skipList.filter(p => p !== provider);

      preferences['skip-authorisation'] = updatedList;
      await this.updateWorkspacePreferences(namespace, preferences);
    } catch (error) {
      logger.error({ error, namespace, provider }, 'Error removing provider from skip list');
      throw error;
    }
  }

  /**
   * Add a trusted source
   */
  async addTrustedSource(
    namespace: string,
    source: TrustedSourceAll | TrustedSourceUrl,
  ): Promise<void> {
    try {
      const preferences = await this.getWorkspacePreferences(namespace);
      const trustedSources = preferences['trusted-sources'] || [];

      if (!trustedSources.includes(source)) {
        trustedSources.push(source);
        preferences['trusted-sources'] = trustedSources;
        await this.updateWorkspacePreferences(namespace, preferences);
      }
    } catch (error) {
      logger.error({ error, namespace, source }, 'Error adding trusted source');
      throw error;
    }
  }

  /**
   * Remove all trusted sources
   */
  async removeTrustedSources(namespace: string): Promise<void> {
    try {
      const preferences = await this.getWorkspacePreferences(namespace);
      preferences['trusted-sources'] = [];
      await this.updateWorkspacePreferences(namespace, preferences);
    } catch (error) {
      logger.error({ error, namespace }, 'Error removing trusted sources');
      throw error;
    }
  }

  /**
   * Update workspace preferences
   */
  private async updateWorkspacePreferences(
    namespace: string,
    updatedData: WorkspacePreferences,
  ): Promise<void> {
    const data: Record<string, string> = {};

    Object.keys(updatedData).forEach(key => {
      if (key === SKIP_AUTHORIZATION_KEY) {
        const list = updatedData[key] || [];
        data[key] = '[' + list.join(', ') + ']';
      } else {
        data[key] = JSON.stringify(updatedData[key as keyof WorkspacePreferences]);
      }
    });

    try {
      await this.coreV1Api.patchNamespacedConfigMap(
        DEV_WORKSPACE_PREFERENCES_CONFIGMAP,
        namespace,
        { data },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: {
            'content-type': k8s.PatchUtils.PATCH_FORMAT_STRATEGIC_MERGE_PATCH,
          },
        },
      );
    } catch (error) {
      logger.error({ error, namespace }, 'Error updating workspace preferences');
      throw error;
    }
  }
}
