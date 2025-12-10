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
 * Models for Advanced Features APIs (Phase 5)
 *
 * These models define the structure for workspace preferences, getting started samples,
 * kubeconfig injection, and air-gapped samples.
 */

import { GitProvider } from './CredentialsModels';

// ============================================================================
// Workspace Preferences
// ============================================================================

/**
 * Trusted source types
 */
export type TrustedSourceAll = '*';
export type TrustedSourceUrl = string;

/**
 * Workspace Preferences
 */
export interface WorkspacePreferences {
  'skip-authorisation'?: GitProvider[];
  'trusted-sources'?: Array<TrustedSourceAll | TrustedSourceUrl>;
}

/**
 * Trusted source request body
 */
export interface TrustedSourceRequest {
  source: TrustedSourceAll | TrustedSourceUrl;
}

// ============================================================================
// Getting Started Samples
// ============================================================================

/**
 * Getting Started Sample
 */
export interface GettingStartedSample {
  displayName: string;
  description: string;
  tags: string[];
  url: string;
  icon?: {
    base64data: string;
    mediatype: string;
  };
}

// ============================================================================
// Air Gap Samples
// ============================================================================

/**
 * Air Gap Sample
 */
export interface AirGapSample {
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  icon?: {
    base64data: string;
    mediatype: string;
  };
  devfile?: {
    filename: string;
  };
  project?: {
    zip?: {
      filename: string;
    };
  };
}

/**
 * Streamed File (for downloads)
 */
export interface StreamedFile {
  stream: NodeJS.ReadableStream;
  size: number;
}
