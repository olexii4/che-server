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
import * as yaml from 'js-yaml';

import { logger } from '../utils/logger';

const EDITOR_METADATA_LABEL_SELECTOR =
  'app.kubernetes.io/component=editor-definition,app.kubernetes.io/part-of=che.eclipse.org';

export class EditorNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorNotFoundError';
  }
}

/**
 * Devfile v2 editor definition
 */
export interface EditorDevfile {
  schemaVersion: string;
  metadata: {
    name: string;
    displayName?: string;
    description?: string;
    icon?: string;
    tags?: string[];
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Service for managing Editor definitions
 *
 * Provides methods to list and get editor devfiles.
 * Editors are stored as ConfigMaps in the Che namespace.
 */
export class EditorService {
  private coreV1Api: k8s.CoreV1Api;
  private cheNamespace: string;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.cheNamespace = process.env.CHECLUSTER_CR_NAMESPACE || 'eclipse-che';
  }

  /**
   * List all available editors
   */
  async list(): Promise<EditorDevfile[]> {
    try {
      const response = await this.coreV1Api.listNamespacedConfigMap(
        this.cheNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        EDITOR_METADATA_LABEL_SELECTOR,
      );

      const editors: EditorDevfile[] = [];

      for (const cm of response.body.items) {
        if (cm.data === undefined) {
          continue;
        }

        for (const key in cm.data) {
          try {
            const editorYaml = cm.data[key];
            if (!editorYaml || typeof editorYaml !== 'string') {
              logger.warn({ configMapName: cm.metadata?.name, key }, 'Empty or invalid editor YAML');
              continue;
            }
            
            const editor = yaml.load(editorYaml) as EditorDevfile;
            
            // Validate that the editor has required fields
            if (!editor || typeof editor !== 'object') {
              logger.warn(
                { configMapName: cm.metadata?.name, key, editorType: typeof editor },
                'Parsed editor is not an object',
              );
              continue;
            }
            
            if (!editor.metadata) {
              logger.warn(
                { configMapName: cm.metadata?.name, key, editorKeys: Object.keys(editor).slice(0, 5) },
                'Parsed editor is missing metadata field',
              );
              continue;
            }
            
            // Log first successful editor for debugging
            if (editors.length === 0) {
              logger.info(
                { 
                  name: editor.metadata.name,
                  displayName: editor.metadata.displayName,
                  hasSchemaVersion: !!editor.schemaVersion,
                  componentCount: editor.components?.length || 0
                },
                'First editor parsed successfully'
              );
            }
            
            editors.push(editor);
          } catch (error) {
            logger.error(
              { error, configMapName: cm.metadata?.name, key },
              'Failed to parse editor devfile',
            );
          }
        }
      }

      logger.info({ editorCount: editors.length }, 'Successfully loaded editors');
      return editors;
    } catch (error) {
      logger.error({ error, namespace: this.cheNamespace }, 'Error listing editors');
      throw error;
    }
  }

  /**
   * Get a specific editor by ID
   */
  async get(editorId: string): Promise<EditorDevfile> {
    const editors = await this.list();

    const editor = editors.find(e => {
      const id = `${e.metadata.name}`;
      return id === editorId || e.metadata.name === editorId;
    });

    if (!editor) {
      throw new EditorNotFoundError(`Editor with id "${editorId}" not found`);
    }

    return editor;
  }
}
