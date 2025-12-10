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
 * OAuth models - TypeScript implementation of Eclipse Che OAuth DTOs
 *
 * Based on Java interfaces:
 * - org.eclipse.che.api.auth.shared.dto.OAuthToken
 * - org.eclipse.che.security.oauth.shared.dto.OAuthAuthenticatorDescriptor
 */

import { Link } from './FactoryModels';

/**
 * OAuth Token
 *
 * TypeScript implementation of org.eclipse.che.api.auth.shared.dto.OAuthToken
 */
export interface OAuthToken {
  /** OAuth access token */
  token: string;

  /** OAuth scope */
  scope?: string;
}

/**
 * Link Parameter
 */
export interface LinkParameter {
  name: string;
  defaultValue?: string;
  required: boolean;
  valid: string[];
}

/**
 * OAuth Link (extended Link with parameters)
 */
export interface OAuthLink {
  rel: string;
  href: string;
  method?: string;
  parameters?: LinkParameter[];
}

/**
 * OAuth Authenticator Descriptor
 *
 * TypeScript implementation of org.eclipse.che.security.oauth.shared.dto.OAuthAuthenticatorDescriptor
 */
export interface OAuthAuthenticatorDescriptor {
  /** Name of the OAuth provider (e.g., "github", "gitlab") */
  name: string;

  /** Endpoint URL for OAuth provider */
  endpointUrl: string;

  /** HAL links for OAuth operations */
  links?: OAuthLink[];
}

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderConfig {
  name: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

/**
 * OAuth Constants
 */
export const OAUTH_CONSTANTS = {
  /** Supported OAuth providers */
  PROVIDERS: {
    GITHUB: 'github',
    GITLAB: 'gitlab',
    BITBUCKET: 'bitbucket',
    AZURE_DEVOPS: 'azure-devops',
  },

  /** Error messages */
  ERRORS: {
    PROVIDER_REQUIRED: 'OAuth provider is required',
    PROVIDER_NOT_FOUND: 'OAuth provider not found',
    TOKEN_NOT_FOUND: 'OAuth token not found',
    UNAUTHORIZED: 'Unauthorized: OAuth token is invalid or expired',
  },
} as const;
