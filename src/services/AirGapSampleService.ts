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

import { AirGapSample, StreamedFile } from '../models/AdvancedFeaturesModels';
import { logger } from '../utils/logger';

/**
 * Service for Air-Gapped Samples
 *
 * This feature provides offline/air-gapped sample projects.
 *
 * IMPLEMENTATION STATUS: Stub
 *
 * Full implementation requires:
 * - Filesystem access to /public/dashboard/devfile-registry/air-gap
 * - File streaming for downloads
 * - index.json parsing for sample metadata
 *
 * See dashboard-backend/src/devworkspaceClient/services/airGapSampleApi.ts for reference.
 */
export class AirGapSampleService {
  /**
   * List all air-gapped samples
   *
   * @returns Empty array (no air-gap resources configured)
   */
  async list(): Promise<AirGapSample[]> {
    logger.info('Air-gap samples not configured, returning empty list');
    return [];
  }

  /**
   * Download a sample project
   *
   * @throws Error indicating this feature is not yet implemented
   */
  async downloadProject(id: string): Promise<StreamedFile> {
    throw new Error(
      'Air-gap sample project download not implemented. ' +
        'This feature requires filesystem access and file streaming. ' +
        'See PHASE_5_IMPLEMENTATION_DECISION.md for details.',
    );
  }

  /**
   * Download a sample devfile
   *
   * @throws Error indicating this feature is not yet implemented
   */
  async downloadDevfile(id: string): Promise<StreamedFile> {
    throw new Error(
      'Air-gap sample devfile download not implemented. ' +
        'This feature requires filesystem access and file streaming. ' +
        'See PHASE_5_IMPLEMENTATION_DECISION.md for details.',
    );
  }
}
