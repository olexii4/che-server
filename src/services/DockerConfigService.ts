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

import { logger } from '../utils/logger';

const SECRET_KEY = '.dockerconfigjson';
const SECRET_NAME = 'devworkspace-container-registry-dockercfg';
const SECRET_LABELS = {
  'controller.devfile.io/devworkspace_pullsecret': 'true',
  'controller.devfile.io/watch-secret': 'true',
};
const EMPTY_DOCKERCONFIG = 'eyJhdXRocyI6IFtdfQ=='; // base64 for '{"auths": []}'

/**
 * Service for managing Docker Configuration
 *
 * Docker configuration is stored as a Kubernetes Secret of type
 * kubernetes.io/dockerconfigjson. It's automatically used by the
 * DevWorkspace controller to pull container images from private registries.
 */
export class DockerConfigService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * Read docker configuration from a namespace
   */
  async read(namespace: string): Promise<string> {
    try {
      const response = await this.coreV1Api.readNamespacedSecret(SECRET_NAME, namespace);
      return this.getDockerConfig(response.body);
    } catch (error: any) {
      // If Secret doesn't exist, return empty config
      if (error.statusCode === 404 || error.response?.statusCode === 404) {
        return EMPTY_DOCKERCONFIG;
      }
      logger.error({ error, namespace }, 'Error reading docker config');
      throw error;
    }
  }

  /**
   * Update docker configuration
   */
  async update(namespace: string, dockerCfg: string): Promise<string> {
    try {
      const secret = this.toDockerConfigSecret(dockerCfg);
      const response = await this.coreV1Api.replaceNamespacedSecret(SECRET_NAME, namespace, secret);
      return this.getDockerConfig(response.body);
    } catch (error: any) {
      // If Secret doesn't exist, create it
      // Note: With RBAC resourceNames, Kubernetes may return 403 instead of 404 for non-existent resources
      if (error.statusCode === 404 || error.statusCode === 403 || error.response?.statusCode === 404 || error.response?.statusCode === 403) {
        logger.info({ namespace, secretName: SECRET_NAME }, 'Secret does not exist or permission denied on replace, attempting to create');
        try {
          return await this.createNamespacedSecret(namespace, dockerCfg);
        } catch (createError: any) {
          // If create also fails with 403, it might be a real permission issue
          logger.error({ error: createError, namespace }, 'Error creating docker config after update failed');
          throw createError;
        }
      }
      logger.error({ error, namespace }, 'Error updating docker config');
      throw error;
    }
  }

  /**
   * Create docker config Secret if it doesn't exist
   */
  private async createNamespacedSecret(namespace: string, dockerCfg?: string): Promise<string> {
    const dockerConfigSecret = this.toDockerConfigSecret(dockerCfg);
    try {
      const response = await this.coreV1Api.createNamespacedSecret(namespace, dockerConfigSecret);
      return this.getDockerConfig(response.body);
    } catch (error) {
      logger.error({ error, namespace }, 'Error creating docker config Secret');
      throw error;
    }
  }

  /**
   * Convert docker config string to Kubernetes Secret
   */
  private toDockerConfigSecret(dockerCfg: string = EMPTY_DOCKERCONFIG): k8s.V1Secret {
    return {
      apiVersion: 'v1',
      data: {
        [SECRET_KEY]: dockerCfg,
      },
      kind: 'Secret',
      metadata: {
        name: SECRET_NAME,
        labels: SECRET_LABELS,
      },
      type: 'kubernetes.io/dockerconfigjson',
    };
  }

  /**
   * Extract docker config from Secret
   */
  private getDockerConfig(secret: k8s.V1Secret): string {
    return secret.data?.[SECRET_KEY] || EMPTY_DOCKERCONFIG;
  }
}
