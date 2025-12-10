/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
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
 * Factory models - TypeScript implementation of Eclipse Che Factory DTOs
 *
 * Based on Java interfaces:
 * - org.eclipse.che.api.factory.shared.dto.FactoryMetaDto
 * - org.eclipse.che.api.factory.shared.dto.FactoryDevfileV2Dto
 */

/**
 * Link representation
 */
export interface Link {
  rel: string;
  href: string;
  method?: string;
  produces?: string;
  consumes?: string;
}

/**
 * Author information
 */
export interface Author {
  userId?: string;
  created?: number;
  userName?: string;
}

/**
 * Policies configuration
 */
export interface Policies {
  referer?: string;
  since?: number;
  until?: number;
}

/**
 * IDE configuration
 */
export interface IdeConfig {
  onAppClosed?: string;
  onAppLoaded?: string;
  onProjectsLoaded?: string;
}

/**
 * SCM (Source Control Management) information
 */
export interface ScmInfo {
  clone_url?: string;
  branch?: string;
  scm_provider?: string;
  scm_provider_url?: string;
  repository_id?: string;
}

/**
 * Base Factory Meta interface
 *
 * TypeScript implementation of org.eclipse.che.api.factory.shared.dto.FactoryMetaDto
 */
export interface FactoryMeta {
  /** Factory version */
  v: string;

  /** Factory name */
  name?: string;

  /** Factory ID */
  id?: string;

  /** Source filename (e.g., "devfile.yaml") */
  source?: string;

  /** Factory creator */
  creator?: Author;

  /** Factory policies */
  policies?: Policies;

  /** IDE configuration */
  ide?: IdeConfig;

  /** Factory links */
  links?: Link[];
}

/**
 * Factory with Devfile V2
 *
 * TypeScript implementation of org.eclipse.che.api.factory.shared.dto.FactoryDevfileV2Dto
 */
export interface FactoryDevfileV2 extends FactoryMeta {
  /**
   * Devfile v2 as a generic object.
   * Since che-server doesn't know the structure of Devfile v2,
   * we use a generic object type.
   */
  devfile: Record<string, any>;

  /** SCM information */
  scm_info?: ScmInfo;
}

/**
 * Factory resolver request parameters
 */
export interface FactoryResolverParams {
  /** URL of the factory source */
  url?: string;

  /** Authorization header for private repository access */
  authorization?: string;

  /** Additional custom parameters */
  [key: string]: string | boolean | undefined;
}

/**
 * Factory token refresh request parameters
 */
export interface FactoryTokenRefreshParams {
  /** Factory URL to refresh token for */
  url: string;
}

/**
 * Constants for Factory API
 */
export const FACTORY_CONSTANTS = {
  /** URL parameter name */
  URL_PARAMETER_NAME: 'url',

  /** Current factory version */
  CURRENT_VERSION: '4.0',

  /** Error messages */
  ERRORS: {
    NOT_RESOLVABLE:
      'Cannot build factory with any of the provided parameters. Please check parameters correctness, and resend query.',
    URL_REQUIRED: 'Factory url required',
    PARAMETERS_REQUIRED: 'Factory build parameters required',
  },
} as const;
