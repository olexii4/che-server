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
import { V1PodList } from '@kubernetes/client-node';

import { logger } from '../utils/logger';

/**
 * Service for managing Pods
 *
 * Provides methods to list pods in a namespace.
 * Used for monitoring workspace pods and their status.
 */
export class PodService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * List all pods in a namespace
   */
  async listInNamespace(namespace: string): Promise<V1PodList> {
    try {
      const response = await this.coreV1Api.listNamespacedPod(namespace);
      return response.body;
    } catch (error) {
      logger.error({ error, namespace }, 'Error listing pods');
      throw error;
    }
  }
}
