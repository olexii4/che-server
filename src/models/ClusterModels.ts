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

/**
 * Application identifiers for cluster info
 */
export enum ApplicationId {
  CLUSTER_CONSOLE = 'cluster-console',
}

/**
 * Application info for external tools (e.g., OpenShift Console)
 */
export interface ApplicationInfo {
  id: ApplicationId;
  icon?: string;
  title: string;
  url: string;
  group?: string;
}

/**
 * Cluster information including external applications
 */
export interface ClusterInfo {
  applications: ApplicationInfo[];
}

/**
 * Cluster-specific configuration
 */
export interface ClusterConfig {
  dashboardWarning?: string;
  dashboardFavicon?: string;
  allWorkspacesLimit?: number;
  runningWorkspacesLimit?: number;
  currentArchitecture?: string;
}

/**
 * Container build configuration
 */
export interface ContainerBuildConfiguration {
  openShiftSecurityContextConstraint?: string;
  containerBuildConfiguration?: {
    [key: string]: string;
  };
}

/**
 * Container run configuration
 */
export interface ContainerRunConfiguration {
  openShiftSecurityContextConstraint?: string;
  containerRunConfiguration?: {
    [key: string]: string;
  };
}

/**
 * Server defaults configuration
 */
export interface ServerDefaults {
  editor?: string;
  plugins?: string[];
  components?: unknown[];
  pvcStrategy?: string;
}

/**
 * Server timeouts configuration
 */
export interface ServerTimeouts {
  inactivityTimeout?: number;
  runTimeout?: number;
  startTimeout?: number;
  axiosRequestTimeout?: number;
}

/**
 * Devfile registry configuration
 */
export interface DevfileRegistryConfig {
  disableInternalRegistry?: boolean;
  externalDevfileRegistries?: Array<{
    url: string;
  }>;
}

/**
 * Default namespace configuration
 */
export interface DefaultNamespaceConfig {
  autoProvision?: boolean;
}

/**
 * Plugin registry configuration
 */
export interface PluginRegistryConfig {
  openVSXURL?: string;
}

/**
 * Networking configuration
 */
export interface NetworkingConfig {
  auth?: {
    advancedAuthorization?: {
      allowUsers?: string[];
      allowGroups?: string[];
      denyUsers?: string[];
      denyGroups?: string[];
    };
  };
}

/**
 * Editors visibility configuration
 */
export interface EditorsVisibilityConfig {
  showDeprecated?: boolean;
  hideById?: string[];
}

/**
 * Complete server configuration
 */
export interface ServerConfig {
  containerBuild?: ContainerBuildConfiguration;
  containerRun?: ContainerRunConfiguration;
  defaults?: ServerDefaults;
  timeouts?: ServerTimeouts;
  devfileRegistry?: DevfileRegistryConfig;
  defaultNamespace?: DefaultNamespaceConfig;
  pluginRegistry?: PluginRegistryConfig;
  cheNamespace?: string;
  pluginRegistryURL?: string;
  pluginRegistryInternalURL?: string;
  allowedSourceUrls?: string[];
  dashboardLogo?: string;
  networking?: NetworkingConfig;
  editorsVisibility?: EditorsVisibilityConfig;
}
