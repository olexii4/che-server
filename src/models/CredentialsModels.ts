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
 * Models for Credentials & Configuration APIs
 *
 * These models define the structure for SSH keys, Personal Access Tokens,
 * Git configuration, and Docker configuration management.
 */

// ============================================================================
// SSH Keys
// ============================================================================

/**
 * SSH Key representation
 */
export interface SshKey {
  name: string;
  keyPub: string; // base64 encoded public key
  creationTimestamp?: string;
}

/**
 * New SSH Key for creation
 */
export interface NewSshKey {
  name: string;
  key: string; // base64 encoded private key
  keyPub: string; // base64 encoded public key
  passphrase?: string;
}

// ============================================================================
// Personal Access Tokens
// ============================================================================

/**
 * Supported Git providers
 */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'azure-devops';

/**
 * Personal Access Token
 */
export interface PersonalAccessToken {
  tokenName: string;
  cheUserId: string;
  gitProvider: GitProvider;
  gitProviderEndpoint: string;
  gitProviderOrganization?: string;
  isOauth: boolean;
  tokenData: string; // base64 encoded token
}

// ============================================================================
// Git Config
// ============================================================================

/**
 * Git Configuration
 */
export interface GitConfig {
  resourceVersion?: string;
  gitconfig: {
    user: {
      name: string;
      email: string;
    };
    [key: string]: any;
  };
}

// ============================================================================
// Docker Config
// ============================================================================

/**
 * Docker Configuration (for container registry authentication)
 */
export interface DockerConfig {
  dockerconfig: string; // base64 encoded dockerconfigjson
}

/**
 * Docker Config request body
 */
export interface DockerConfigRequest {
  dockerconfig: string;
}
