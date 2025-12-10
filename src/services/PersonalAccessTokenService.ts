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

import { PersonalAccessToken } from '../models/CredentialsModels';
import { logger } from '../utils/logger';

// base64 encoded `dummy-access-token-HqKrZVCZvSp7qPLF`
const DUMMY_TOKEN_DATA = 'ZHVtbXktYWNjZXNzLXRva2VuLUhxS3JaVkNadlNwN3FQTEY=';

const SECRET_LABELS = {
  'app.kubernetes.io/component': 'scm-personal-access-token',
  'app.kubernetes.io/part-of': 'che.eclipse.org',
};

/**
 * Service for managing Personal Access Tokens
 *
 * Personal Access Tokens are stored as Kubernetes Secrets with specific labels
 * and annotations that identify the Git provider and user.
 */
export class PersonalAccessTokenService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * List all personal access tokens in a namespace
   */
  async listInNamespace(namespace: string): Promise<PersonalAccessToken[]> {
    try {
      const labelSelector = Object.entries(SECRET_LABELS)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

      const response = await this.coreV1Api.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      return response.body.items
        .filter(secret => this.isPatSecret(secret))
        .map(secret => this.toToken(secret));
    } catch (error) {
      logger.error({ error, namespace }, 'Error listing personal access tokens');
      throw error;
    }
  }

  /**
   * Create a new personal access token
   */
  async create(
    namespace: string,
    personalAccessToken: PersonalAccessToken,
  ): Promise<PersonalAccessToken> {
    try {
      // Check if token already exists
      const secretName = this.toSecretName(personalAccessToken.tokenName);
      const labelSelector = Object.entries(SECRET_LABELS)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');

      const existingSecrets = await this.coreV1Api.listNamespacedSecret(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      const existingSecret = existingSecrets.body.items.find(
        secret => secret.metadata?.name === secretName,
      );

      if (existingSecret) {
        throw new Error(`Personal access token "${personalAccessToken.tokenName}" already exists`);
      }

      // Create the secret
      const secret = this.toSecret(namespace, personalAccessToken);
      const response = await this.coreV1Api.createNamespacedSecret(namespace, secret);

      return this.toToken(response.body);
    } catch (error) {
      logger.error(
        { error, namespace, tokenName: personalAccessToken.tokenName },
        'Error creating personal access token',
      );
      throw error;
    }
  }

  /**
   * Replace an existing personal access token
   */
  async replace(namespace: string, token: PersonalAccessToken): Promise<PersonalAccessToken> {
    try {
      const secretName = this.toSecretName(token.tokenName);

      // Read the existing secret to get the real token value if dummy is provided
      const existingSecret = await this.coreV1Api.readNamespacedSecret(secretName, namespace);

      // Replace dummy token with real one if needed
      if (token.tokenData === DUMMY_TOKEN_DATA) {
        token.tokenData = existingSecret.body.data?.token || '';
      }

      // Replace the secret
      const response = await this.coreV1Api.replaceNamespacedSecret(
        secretName,
        namespace,
        this.toSecret(namespace, token),
      );

      return this.toToken(response.body);
    } catch (error) {
      logger.error({ error, namespace, tokenName: token.tokenName }, 'Error replacing token');
      throw error;
    }
  }

  /**
   * Delete a personal access token
   */
  async delete(namespace: string, tokenName: string): Promise<void> {
    try {
      const secretName = this.toSecretName(tokenName);
      await this.coreV1Api.deleteNamespacedSecret(secretName, namespace);
    } catch (error) {
      logger.error({ error, namespace, tokenName }, 'Error deleting personal access token');
      throw error;
    }
  }

  /**
   * Check if a secret is a personal access token secret
   */
  private isPatSecret(secret: k8s.V1Secret): boolean {
    const labels = secret.metadata?.labels || {};
    return (
      labels['app.kubernetes.io/component'] === 'scm-personal-access-token' &&
      labels['app.kubernetes.io/part-of'] === 'che.eclipse.org'
    );
  }

  /**
   * Convert secret name to token name
   */
  private toSecretName(tokenName: string): string {
    return `personal-access-token-${tokenName}`;
  }

  /**
   * Convert Kubernetes Secret to PersonalAccessToken
   */
  private toToken(secret: k8s.V1Secret): PersonalAccessToken {
    const annotations = secret.metadata?.annotations || {};
    const name = secret.metadata?.name || '';
    const tokenName = name.replace('personal-access-token-', '');

    return {
      tokenName,
      cheUserId: annotations['che.eclipse.org/che-userid'] || '',
      gitProvider: (annotations['che.eclipse.org/scm-provider-name'] || 'github') as any,
      gitProviderEndpoint: annotations['che.eclipse.org/scm-url'] || '',
      gitProviderOrganization: annotations['che.eclipse.org/scm-organization'],
      isOauth:
        (annotations['che.eclipse.org/scm-personal-access-token-name'] || '').startsWith(
          'oauth2-',
        ) || false,
      tokenData: DUMMY_TOKEN_DATA, // Never expose real token
    };
  }

  /**
   * Convert PersonalAccessToken to Kubernetes Secret
   */
  private toSecret(namespace: string, token: PersonalAccessToken): k8s.V1Secret {
    if (token.tokenData === DUMMY_TOKEN_DATA) {
      throw new Error('Personal access token data is required');
    }

    const annotations: { [key: string]: string } = {
      'che.eclipse.org/che-userid': token.cheUserId,
      'che.eclipse.org/scm-provider-name': token.gitProvider,
      'che.eclipse.org/scm-personal-access-token-name': token.gitProvider,
      'che.eclipse.org/scm-url': this.sanitizeEndpoint(token.gitProviderEndpoint),
    };

    if (token.gitProvider === 'azure-devops' && token.gitProviderOrganization) {
      annotations['che.eclipse.org/scm-organization'] = token.gitProviderOrganization;
    }

    return {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: this.toSecretName(token.tokenName),
        namespace,
        labels: SECRET_LABELS,
        annotations,
      },
      data: {
        token: token.tokenData,
      },
    };
  }

  /**
   * Sanitize endpoint URL
   */
  private sanitizeEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return url.href;
    } catch {
      return endpoint;
    }
  }
}
