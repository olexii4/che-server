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

import { NewSshKey, SshKey } from '../models/CredentialsModels';
import { logger } from '../utils/logger';

const SSH_SECRET_NAME = 'git-ssh-key';
const SSH_SECRET_LABELS = {
  'controller.devfile.io/mount-to-devworkspace': 'true',
  'controller.devfile.io/watch-secret': 'true',
};
const SSH_SECRET_ANNOTATIONS = {
  'controller.devfile.io/mount-as': 'subpath',
  'controller.devfile.io/mount-path': '/etc/ssh/',
};

const SSH_CONFIG = `host *
  IdentityFile /etc/ssh/dwo_ssh_key
  StrictHostKeyChecking = no
`;

/**
 * Service for managing SSH Keys
 *
 * SSH keys are stored as Kubernetes Secrets with specific labels and annotations
 * that allow them to be automatically mounted into DevWorkspaces.
 */
export class SSHKeysService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  /**
   * List all SSH keys in a namespace
   */
  async list(namespace: string): Promise<SshKey[]> {
    try {
      const labelSelector = Object.entries(SSH_SECRET_LABELS)
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
        .filter(secret => this.isSshKeySecret(secret))
        .map(secret => this.fromSecret(secret));
    } catch (error) {
      logger.error({ error, namespace }, 'Error listing SSH keys');
      throw error;
    }
  }

  /**
   * Add a new SSH key
   */
  async add(namespace: string, sshKey: NewSshKey): Promise<SshKey> {
    try {
      // Check if secret already exists
      const labelSelector = Object.entries(SSH_SECRET_LABELS)
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
        secret => secret.metadata?.name === sshKey.name,
      );

      if (existingSecret) {
        throw new Error(`SSH key "${sshKey.name}" already exists`);
      }

      // Create the secret
      const secret = this.toSecret(namespace, sshKey);
      const response = await this.coreV1Api.createNamespacedSecret(namespace, secret);

      return this.fromSecret(response.body);
    } catch (error) {
      logger.error({ error, namespace, keyName: sshKey.name }, 'Error adding SSH key');
      throw error;
    }
  }

  /**
   * Delete an SSH key
   */
  async delete(namespace: string, name: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedSecret(name, namespace);
    } catch (error) {
      logger.error({ error, namespace, name }, 'Error deleting SSH key');
      throw error;
    }
  }

  /**
   * Check if a secret is an SSH key secret
   */
  private isSshKeySecret(secret: k8s.V1Secret): boolean {
    const name = secret.metadata?.name || '';
    const labels = secret.metadata?.labels || {};
    const annotations = secret.metadata?.annotations || {};

    return (
      name.includes(SSH_SECRET_NAME) &&
      labels['controller.devfile.io/mount-to-devworkspace'] === 'true' &&
      labels['controller.devfile.io/watch-secret'] === 'true' &&
      annotations['controller.devfile.io/mount-as'] === 'subpath' &&
      annotations['controller.devfile.io/mount-path'] === '/etc/ssh/'
    );
  }

  /**
   * Convert Kubernetes Secret to SshKey
   */
  private fromSecret(secret: k8s.V1Secret): SshKey {
    return {
      name: secret.metadata?.name || '',
      keyPub: secret.data?.['dwo_ssh_key.pub'] || '',
      creationTimestamp: secret.metadata?.creationTimestamp?.toISOString(),
    };
  }

  /**
   * Convert SshKey to Kubernetes Secret
   */
  private toSecret(namespace: string, sshKey: NewSshKey): k8s.V1Secret {
    const data: { [key: string]: string } = {
      'dwo_ssh_key.pub': sshKey.keyPub,
      dwo_ssh_key: sshKey.key,
      ssh_config: Buffer.from(SSH_CONFIG).toString('base64'),
    };

    if (sshKey.passphrase) {
      data.passphrase = Buffer.from(sshKey.passphrase).toString('base64');
    }

    return {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: sshKey.name,
        namespace,
        labels: SSH_SECRET_LABELS,
        annotations: SSH_SECRET_ANNOTATIONS,
      },
      data,
    };
  }
}
