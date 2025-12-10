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

import { V1alpha2DevWorkspace, V1alpha2DevWorkspaceTemplate } from '@devfile/api';

/**
 * DevWorkspace custom resource
 * Represents a workspace in the cluster
 */
export type DevWorkspace = V1alpha2DevWorkspace;

/**
 * DevWorkspaceTemplate custom resource
 * Represents a reusable workspace template
 */
export type DevWorkspaceTemplate = V1alpha2DevWorkspaceTemplate;

/**
 * JSON Patch operation for updating resources
 */
export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

/**
 * DevWorkspace resources request
 * Used for generating DevWorkspace YAML from devfile content
 */
export interface DevWorkspaceResourcesRequest {
  devfileContent: string;
  editorPath?: string;
  editorContent?: string;
}

/**
 * DevWorkspace list response
 */
export interface DevWorkspaceList {
  apiVersion: string;
  kind: string;
  metadata?: {
    continue?: string;
    resourceVersion?: string;
  };
  items: DevWorkspace[];
}

/**
 * DevWorkspaceTemplate list response
 */
export interface DevWorkspaceTemplateList {
  apiVersion: string;
  kind: string;
  metadata?: {
    continue?: string;
    resourceVersion?: string;
  };
  items: DevWorkspaceTemplate[];
}

/**
 * DevWorkspace phase constants
 */
export enum DevWorkspacePhase {
  Starting = 'Starting',
  Running = 'Running',
  Stopping = 'Stopping',
  Stopped = 'Stopped',
  Failed = 'Failed',
  Terminating = 'Terminating',
}

/**
 * DevWorkspace status condition types
 */
export enum DevWorkspaceConditionType {
  Started = 'Started',
  Ready = 'Ready',
  Failed = 'Failed',
  Stopped = 'Stopped',
}

/**
 * Constants for DevWorkspace CRD
 */
export const DEVWORKSPACE_CRD = {
  GROUP: 'workspace.devfile.io',
  VERSION: 'v1alpha2',
  PLURAL: 'devworkspaces',
  KIND: 'DevWorkspace',
} as const;

/**
 * Constants for DevWorkspaceTemplate CRD
 */
export const DEVWORKSPACE_TEMPLATE_CRD = {
  GROUP: 'workspace.devfile.io',
  VERSION: 'v1alpha2',
  PLURAL: 'devworkspacetemplates',
  KIND: 'DevWorkspaceTemplate',
} as const;
