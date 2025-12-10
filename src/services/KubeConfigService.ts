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
 * Service for KubeConfig Injection
 *
 * This feature injects kubeconfig into running DevWorkspace pods.
 *
 * IMPLEMENTATION STATUS: Stub
 *
 * Full implementation requires:
 * - Pod command execution via Kubernetes API
 * - YAML parsing and merging of kubeconfig files
 * - Complex logic to detect and merge existing kubeconfigs
 *
 * See dashboard-backend/src/devworkspaceClient/services/kubeConfigApi.ts for reference.
 */
export class KubeConfigService {
  /**
   * Inject kubeconfig into a DevWorkspace
   *
   * @throws Error indicating this feature is not yet implemented
   */
  async injectKubeConfig(namespace: string, devworkspaceId: string): Promise<void> {
    throw new Error(
      'KubeConfig injection not implemented. ' +
        'This feature requires pod command execution and YAML manipulation. ' +
        'See PHASE_5_IMPLEMENTATION_DECISION.md for details.',
    );
  }
}
