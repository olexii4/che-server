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

import { GettingStartedSample } from '../models/AdvancedFeaturesModels';
import { logger } from '../utils/logger';

const DEVFILE_METADATA_LABEL_SELECTOR =
  'app.kubernetes.io/component=getting-started-samples,app.kubernetes.io/part-of=che.eclipse.org';

const DEFAULT_ICON = {
  base64data:
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgaGVpZ2h0PSI1ZW0iIHdpZHRoPSI1ZW0iIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8ZyBmaWxsPSIjNmE2ZTczIj4KICA8cGF0aCBkPSJNNDg4LjYgMjUwLjJMMzkyIDIxNFYxMDUuNWMwLTE1LTkuMy0yOC40LTIzLjQtMzMuN2wtMTAwLTM3LjVjLTguMS0zLjEtMTcuMS0zLjEtMjUuMyAwbC0xMDAgMzcuNWMtMTQuMSA1LjMtMjMuNCAxOC43LTIzLjQgMzMuN1YyMTRsLTk2LjYgMzYuMkM5LjMgMjU1LjUgMCAyNjguOSAwIDI4My45VjM5NGMwIDEzLjYgNy43IDI2LjEgMTkuOSAzMi4ybDEwMCA1MGMxMC4xIDUuMSAyMi4xIDUuMSAzMi4yIDBsMTAzLjktNTIgMTAzLjkgNTJjMTAuMSA1LjEgMjIuMSA1LjEgMzIuMiAwbDEwMC01MGMxMi4yLTYuMSAxOS45LTE4LjYgMTkuOS0zMi4yVjI4My45YzAtMTUtOS4zLTI4LjQtMjMuNC0zMy43ek0zNTggMjE0LjhsLTg1IDMxLjl2LTY4LjJsODUtMzd2NzMuM3pNMTU0IDEwNC4xbDEwMi0zOC4yIDEwMiAzOC4ydi42bC0xMDIgNDEuNC0xMDItNDEuNHYtLjZ6bTg0IDI5MS4xbC04NSA0Mi41di03OS4xbDg1LTM4Ljh2NzUuNHptMC0xMTJsLTEwMiA0MS40LTEwMi00MS40di0uNmwxMDItMzguMiAxMDIgMzguMnYuNnptMjQwIDExMmwtODUgNDIuNXYtNzkuMWw4NS0zOC44djc1LjR6bTAtMTEybC0xMDIgNDEuNC0xMDItNDEuNHYtLjZsMTAyLTM4LjIgMTAyIDM4LjJ2LjZ6Ii8+CiAgPC9nPgo8L3N2Zz4=',
  mediatype: 'image/svg+xml',
};

/**
 * Ensure sample has an icon, use default if not provided
 */
function getIcon(sample: GettingStartedSample): { base64data: string; mediatype: string } {
  if (!sample?.icon) {
    return DEFAULT_ICON;
  }
  return sample.icon;
}

/**
 * Service for managing Getting Started Samples
 *
 * Samples are stored as ConfigMaps with specific labels in the Che namespace.
 */
export class GettingStartedSamplesService {
  private coreV1Api: k8s.CoreV1Api;
  private cheNamespace: string;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.cheNamespace = process.env.CHECLUSTER_CR_NAMESPACE || 'eclipse-che';
  }

  /**
   * List all getting started samples
   */
  async list(): Promise<GettingStartedSample[]> {
    // In local run mode, return empty array
    if (process.env.LOCAL_RUN === 'true') {
      logger.info('LOCAL_RUN mode: returning empty getting started samples list');
      return [];
    }

    if (!this.cheNamespace) {
      logger.warn('CHECLUSTER_CR_NAMESPACE not defined, returning empty list');
      return [];
    }

    try {
      const response = await this.coreV1Api.listNamespacedConfigMap(
        this.cheNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        DEVFILE_METADATA_LABEL_SELECTOR,
      );

      const samples: GettingStartedSample[] = [];

      for (const cm of response.body.items) {
        if (!cm.data) {
          continue;
        }

      for (const key in cm.data) {
        try {
          const sampleData = JSON.parse(cm.data[key]);
          // Handle both single samples and arrays of samples
          if (Array.isArray(sampleData)) {
            samples.push(...sampleData);
          } else {
            samples.push(sampleData);
          }
        } catch (error) {
          logger.error(
            { error, configMapName: cm.metadata?.name, key },
            'Failed to parse getting started sample',
          );
        }
      }
    }

    // Ensure icon for each sample
    samples.forEach(sample => {
      sample.icon = getIcon(sample);
    });

    return samples;
    } catch (error) {
      logger.error(
        { error, namespace: this.cheNamespace },
        'Error listing getting started samples',
      );
      throw error;
    }
  }
}
