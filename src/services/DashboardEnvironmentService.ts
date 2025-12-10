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

import axios from 'axios';

import { logger } from '../utils/logger';

/**
 * Environment variables that can be read from the dashboard
 */
export interface DashboardEnvironmentVars {
  CHE_SHOW_DEPRECATED_EDITORS?: string;
  CHE_HIDE_EDITORS_BY_ID?: string;
  CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DISABLECONTAINERBUILDCAPABILITIES?: string;
  CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DEFAULTEDITOR?: string;
  CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DEFAULTCOMPONENTS?: string;
  CHE_DEFAULT_SPEC_COMPONENTS_PLUGINREGISTRY_OPENVSXURL?: string;
}

/**
 * Service for reading dashboard environment variables at startup
 *
 * This service reads environment variables from the che-dashboard's exported
 * JSON file at /dashboard/dashboard-env.json. The dashboard exports these
 * variables at startup for backward compatibility.
 *
 * This approach is simpler and more efficient than querying the Kubernetes API
 * and doesn't require additional RBAC permissions.
 */
export class DashboardEnvironmentService {
  private static instance: DashboardEnvironmentService;
  private envVars: DashboardEnvironmentVars = {};
  private initialized = false;
  private dashboardUrl: string;

  private constructor() {
    // Use internal dashboard service URL
    this.dashboardUrl =
      process.env.CHE_DASHBOARD_INTERNAL_URL ||
      process.env.CHE_DASHBOARD_URL ||
      'http://che-dashboard.eclipse-che:8080';
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DashboardEnvironmentService {
    if (!DashboardEnvironmentService.instance) {
      DashboardEnvironmentService.instance = new DashboardEnvironmentService();
    }
    return DashboardEnvironmentService.instance;
  }

  /**
   * Initializes the service by fetching environment variables from dashboard's JSON file
   * This method should be called once at application startup
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('DashboardEnvironmentService already initialized');
      return;
    }

    try {
      const url = `${this.dashboardUrl}/dashboard/dashboard-env.json`;
      logger.info(`Fetching dashboard environment variables from ${url}`);

      const response = await axios.get<DashboardEnvironmentVars>(url, {
        timeout: 5000,
        validateStatus: (status) => status === 200,
      });

      this.envVars = response.data;

      // Filter out empty values and log only the set variables
      const setVars = Object.entries(this.envVars)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key]) => key);

      if (setVars.length > 0) {
        logger.info(`Successfully loaded dashboard environment variables: ${setVars.join(', ')}`);
      } else {
        logger.info('Dashboard environment variables file loaded (all values empty, using defaults)');
      }

      this.initialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(
        { error: errorMessage, url: this.dashboardUrl },
        'Failed to fetch dashboard environment variables from JSON file. Proceeding with process.env fallback.',
      );
      // Don't throw - service should work even without dashboard env vars
      this.initialized = true;
    }
  }

  /**
   * Get a specific environment variable value
   * Falls back to process.env if not found in dashboard config
   */
  getEnvVar(name: keyof DashboardEnvironmentVars): string | undefined {
    return this.envVars[name] || process.env[name];
  }

  /**
   * Get all environment variables
   */
  getAllEnvVars(): DashboardEnvironmentVars {
    return { ...this.envVars };
  }

  /**
   * Get whether to show deprecated editors
   */
  getShowDeprecatedEditors(): boolean {
    const value = this.getEnvVar('CHE_SHOW_DEPRECATED_EDITORS');
    return value === 'true';
  }

  /**
   * Get list of editor IDs to hide
   */
  getHideEditorsById(): string[] {
    const value = this.getEnvVar('CHE_HIDE_EDITORS_BY_ID');
    if (!value) {
      return [];
    }
    return value.split(',').map((val) => val.trim());
  }

  /**
   * Get whether container build capabilities are disabled
   */
  getDisableContainerBuildCapabilities(): boolean {
    const value = this.getEnvVar('CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DISABLECONTAINERBUILDCAPABILITIES');
    // `defaultDisableContainerBuildCapabilities` is true if the env var is undefined or is not equal to 'false'
    return value === undefined || value.toLowerCase() !== 'false';
  }

  /**
   * Get default editor
   */
  getDefaultEditor(): string | undefined {
    return this.getEnvVar('CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DEFAULTEDITOR');
  }

  /**
   * Get default components
   */
  getDefaultComponents(): any[] {
    const value = this.getEnvVar('CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DEFAULTCOMPONENTS');
    if (!value) {
      return [];
    }
    try {
      return JSON.parse(value);
    } catch (e) {
      logger.error(
        { error: e },
        'Unable to parse default components from environment variable CHE_DEFAULT_SPEC_DEVENVIRONMENTS_DEFAULTCOMPONENTS',
      );
      return [];
    }
  }

  /**
   * Get OpenVSX URL
   */
  getOpenVSXURL(): string | undefined {
    return this.getEnvVar('CHE_DEFAULT_SPEC_COMPONENTS_PLUGINREGISTRY_OPENVSXURL');
  }
}
