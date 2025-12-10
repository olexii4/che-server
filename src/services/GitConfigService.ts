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
import * as ini from 'multi-ini';

import { GitConfig } from '../models/CredentialsModels';
import { logger } from '../utils/logger';

const GITCONFIG_CONFIGMAP = 'workspace-userdata-gitconfig-configmap';

/**
 * Service for managing Git Configuration
 *
 * Git configuration is stored as a ConfigMap with INI format content.
 * It's automatically mounted into DevWorkspaces at /etc/gitconfig.
 */
export class GitConfigService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * Read git configuration from a namespace
   */
  async read(namespace: string): Promise<GitConfig> {
    try {
      const response = await this.coreV1Api.readNamespacedConfigMap(GITCONFIG_CONFIGMAP, namespace);
      return this.toGitConfig(response.body);
    } catch (error: any) {
      // If ConfigMap doesn't exist, create it
      if (error.statusCode === 404 || error.response?.statusCode === 404) {
        return this.createGitConfigMap(namespace);
      }
      logger.error({ error, namespace }, 'Error reading git config');
      throw error;
    }
  }

  /**
   * Patch git configuration
   */
  async patch(namespace: string, changedGitConfig: GitConfig): Promise<GitConfig> {
    try {
      // Read current config
      const gitConfig = await this.read(namespace);

      // Check resource version for conflicts
      const currentVersion = parseInt(gitConfig.resourceVersion || '0', 10);
      const changedVersion = parseInt(changedGitConfig.resourceVersion || '0', 10);

      if (currentVersion > changedVersion) {
        throw new Error(
          `Conflict detected. The gitconfig was modified in the namespace "${namespace}"`,
        );
      }

      // Update gitconfig
      gitConfig.gitconfig = changedGitConfig.gitconfig;
      const gitconfigStr = this.fromGitConfig(gitConfig);

      // Patch the ConfigMap
      const response = await this.coreV1Api.patchNamespacedConfigMap(
        GITCONFIG_CONFIGMAP,
        namespace,
        {
          data: {
            gitconfig: gitconfigStr,
          },
        },
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

      return this.toGitConfig(response.body);
    } catch (error) {
      logger.error({ error, namespace }, 'Error patching git config');
      throw error;
    }
  }

  /**
   * Create git config ConfigMap if it doesn't exist
   */
  private async createGitConfigMap(namespace: string): Promise<GitConfig> {
    const configMap: k8s.V1ConfigMap = {
      metadata: {
        name: GITCONFIG_CONFIGMAP,
        namespace,
        labels: {
          'controller.devfile.io/mount-to-devworkspace': 'true',
          'controller.devfile.io/watch-configmap': 'true',
        },
        annotations: {
          'controller.devfile.io/mount-as': 'subpath',
          'controller.devfile.io/mount-path': '/etc/',
        },
      },
      data: {
        gitconfig: this.fromGitConfig({
          gitconfig: {
            user: {
              name: '',
              email: '',
            },
          },
        }),
      },
    };

    try {
      const response = await this.coreV1Api.createNamespacedConfigMap(namespace, configMap);
      return this.toGitConfig(response.body);
    } catch (error) {
      logger.error({ error, namespace }, 'Error creating git config ConfigMap');
      throw error;
    }
  }

  /**
   * Convert GitConfig to INI string
   */
  private fromGitConfig(gitConfig: GitConfig): string {
    const serializer = new ini.Serializer();
    return serializer.serialize(gitConfig.gitconfig);
  }

  /**
   * Convert ConfigMap to GitConfig
   */
  private toGitConfig(configMap: k8s.V1ConfigMap): GitConfig {
    const resourceVersion = configMap.metadata?.resourceVersion;
    const gitconfigStr = configMap.data?.gitconfig;

    if (typeof gitconfigStr !== 'string') {
      throw new Error('Gitconfig data is not a string');
    }

    const parser = new ini.Parser();
    const gitconfigLines = gitconfigStr.split(/\r?\n/);
    const gitconfig = parser.parse(gitconfigLines);

    if (!this.isGitConfig(gitconfig)) {
      throw new Error('Gitconfig is empty or invalid');
    }

    return {
      resourceVersion,
      gitconfig,
    };
  }

  /**
   * Validate gitconfig structure
   */
  private isGitConfig(gitconfig: unknown): gitconfig is GitConfig['gitconfig'] {
    const gc = gitconfig as GitConfig['gitconfig'];
    return gc.user !== undefined && gc.user.email !== undefined && gc.user.name !== undefined;
  }
}
