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

import * as k8s from '@kubernetes/client-node';
import { KubeConfigProvider } from './KubeConfigProvider';

/**
 * Get a Kubernetes API client configured with the user's token from the request.
 *
 * This is the main entry point for creating Kubernetes clients that use
 * per-request authentication tokens, enabling proper RBAC and user isolation.
 *
 * Inspired by Eclipse Che Dashboard Backend:
 * packages/dashboard-backend/src/routes/api/helpers/getDevWorkspaceClient.ts
 *
 * @param token - User's authentication token from the request (from request.subject.token)
 * @param apiClass - The Kubernetes API class to instantiate (e.g., k8s.CoreV1Api)
 * @returns Configured Kubernetes API client
 *
 * @example
 * ```typescript
 * // In a Fastify route handler
 * const token = request.subject?.token;
 * if (!token) {
 *   throw new Error('Authentication required');
 * }
 *
 * const coreApi = getKubernetesClient(token, k8s.CoreV1Api);
 * const namespaces = await coreApi.listNamespace();
 * ```
 */
export function getKubernetesClient<T>(token: string, apiClass: new (server: string) => T): T {
  const kubeConfigProvider = new KubeConfigProvider();
  const kubeConfig = kubeConfigProvider.getKubeConfig(token);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return kubeConfig.makeApiClient(apiClass as any) as T;
}

/**
 * Get a KubeConfig configured with the user's token from the request.
 *
 * Use this if you need access to the KubeConfig itself rather than a specific API client.
 *
 * @param token - User's authentication token from the request
 * @returns KubeConfig configured with the user's token
 *
 * @example
 * ```typescript
 * const token = request.subject?.token;
 * const kubeConfig = getKubeConfig(token);
 *
 * // Create multiple API clients from the same config
 * const coreApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
 * const appsApi = kubeConfig.makeApiClient(k8s.AppsV1Api);
 * ```
 */
export function getKubeConfig(token: string): k8s.KubeConfig {
  const kubeConfigProvider = new KubeConfigProvider();
  return kubeConfigProvider.getKubeConfig(token);
}
