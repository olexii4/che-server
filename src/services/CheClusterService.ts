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

export interface IExternalDevfileRegistry {
  url: string;
}

export interface CheClusterCustomResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    components?: {
      devfileRegistry?: {
        disableInternalRegistry?: boolean;
        externalDevfileRegistries?: IExternalDevfileRegistry[];
      };
      pluginRegistry?: {
        openVSXURL?: string;
      };
      dashboard?: {
        headerMessage?: {
          text?: string;
        };
      };
    };
    devEnvironments?: {
      defaultEditor?: string;
      defaultComponents?: unknown[];
      disableContainerBuildCapabilities?: boolean;
    };
  };
}

/**
 * Service for reading CheCluster CustomResource
 */
export class CheClusterService {
  private static instance: CheClusterService | null = null;
  private customObjectsApi: k8s.CustomObjectsApi;
  private cheNamespace: string;
  private cheClusterName: string;
  private cachedCheCluster: CheClusterCustomResource | null = null;
  private lastFetchTime = 0;
  private cacheTTL = 60000; // Cache for 60 seconds

  private constructor(kubeConfig: k8s.KubeConfig) {
    this.customObjectsApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
    this.cheNamespace = process.env.CHECLUSTER_CR_NAMESPACE || process.env.CHE_NAMESPACE || 'eclipse-che';
    this.cheClusterName = process.env.CHECLUSTER_CR_NAME || 'eclipse-che';
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CheClusterService {
    if (!CheClusterService.instance) {
      const kubeConfig = new k8s.KubeConfig();
      if (process.env.LOCAL_RUN === 'true') {
        kubeConfig.loadFromDefault();
      } else {
        kubeConfig.loadFromCluster();
      }
      CheClusterService.instance = new CheClusterService(kubeConfig);
    }
    return CheClusterService.instance;
  }

  /**
   * Initialize and load CheCluster CR at startup
   */
  async initialize(): Promise<void> {
    try {
      await this.getCheCluster();
      logger.info('CheClusterService initialized successfully');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize CheClusterService, will use fallback values');
    }
  }

  /**
   * Get the CheCluster CustomResource with caching
   */
  async getCheCluster(): Promise<CheClusterCustomResource | null> {
    const now = Date.now();
    
    // Return cached value if still fresh
    if (this.cachedCheCluster && now - this.lastFetchTime < this.cacheTTL) {
      return this.cachedCheCluster;
    }

    try {
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('CheCluster fetch timeout')), 5000);
      });

      const fetchPromise = this.customObjectsApi.getNamespacedCustomObject(
        'org.eclipse.che',
        'v2',
        this.cheNamespace,
        'checlusters',
        this.cheClusterName,
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!response) {
        throw new Error('CheCluster fetch timed out');
      }

      this.cachedCheCluster = response.body as CheClusterCustomResource;
      this.lastFetchTime = now;

      logger.info(
        {
          name: this.cheClusterName,
          namespace: this.cheNamespace,
          externalRegistries: this.cachedCheCluster?.spec?.components?.devfileRegistry?.externalDevfileRegistries?.length || 0,
        },
        'CheCluster CR fetched successfully',
      );

      return this.cachedCheCluster;
    } catch (error: any) {
      if (error.statusCode === 404 || error.response?.statusCode === 404) {
        logger.warn(
          { name: this.cheClusterName, namespace: this.cheNamespace },
          'CheCluster CR not found',
        );
        return null;
      }
      logger.error({ error: error?.message || error, name: this.cheClusterName, namespace: this.cheNamespace }, 'Error fetching CheCluster CR');
      throw error;
    }
  }

  /**
   * Get external devfile registries from CheCluster CR (synchronous, uses cache)
   */
  getExternalDevfileRegistries(): IExternalDevfileRegistry[] {
    return this.cachedCheCluster?.spec?.components?.devfileRegistry?.externalDevfileRegistries || [];
  }

  /**
   * Get whether internal registry is disabled (synchronous, uses cache)
   */
  getDisableInternalRegistry(): boolean {
    return this.cachedCheCluster?.spec?.components?.devfileRegistry?.disableInternalRegistry || false;
  }

  /**
   * Get OpenVSX URL from CheCluster CR (synchronous, uses cache)
   */
  getOpenVSXURL(): string | undefined {
    return this.cachedCheCluster?.spec?.components?.pluginRegistry?.openVSXURL;
  }

  /**
   * Get default editor from CheCluster CR (synchronous, uses cache)
   */
  getDefaultEditor(): string | undefined {
    return this.cachedCheCluster?.spec?.devEnvironments?.defaultEditor;
  }

  /**
   * Get default components from CheCluster CR (synchronous, uses cache)
   */
  getDefaultComponents(): unknown[] {
    return this.cachedCheCluster?.spec?.devEnvironments?.defaultComponents || [];
  }

  /**
   * Get dashboard header message from CheCluster CR (synchronous, uses cache)
   */
  getDashboardHeaderMessage(): string | undefined {
    return this.cachedCheCluster?.spec?.components?.dashboard?.headerMessage?.text;
  }

  /**
   * Clear the cache (useful for testing or force refresh)
   */
  clearCache(): void {
    this.cachedCheCluster = null;
    this.lastFetchTime = 0;
  }
}

