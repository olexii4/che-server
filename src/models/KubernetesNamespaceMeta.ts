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
 * Describes meta information about kubernetes namespace.
 *
 * This is a TypeScript implementation of the Java interface:
 * org.eclipse.che.workspace.infrastructure.kubernetes.api.shared.KubernetesNamespaceMeta
 */
export interface KubernetesNamespaceMeta {
  /**
   * Returns the name of namespace.
   *
   * Value may be not a name of existing namespace, but predicted name with placeholders inside,
   * like <workspaceid>.
   */
  name: string;

  /**
   * Returns namespace attributes, which may contains additional info about it like description.
   *
   * Common attributes:
   * - "default": "true" or "false" - shows if k8s namespace is configured as default
   * - "phase": "Active" or "Terminating" - current namespace status
   */
  attributes: Record<string, string>;
}

/**
 * Attribute constants
 */
export const NAMESPACE_ATTRIBUTES = {
  /**
   * Attribute that shows if k8s namespace is configured as default.
   * Possible values: true/false. Absent value should be considered as false.
   */
  DEFAULT: 'default',

  /**
   * Attributes that contains information about current namespace status.
   * Example values: Active, Terminating. Absent value indicates that namespace is not created yet.
   */
  PHASE: 'phase',
} as const;
