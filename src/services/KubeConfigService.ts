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
import WebSocket from 'ws';
import YAML from 'yamljs';

import { logger } from '../utils/logger';

const EXCLUDED_CONTAINERS = ['che-gateway', 'che-machine-exec'];
const PROTOCOLS = ['base64.channel.k8s.io'];

enum CHANNELS {
  STD_OUT = 1,
  STD_ERROR = 2,
  ERROR = 3,
}

interface ServerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any;
  server: string;
}

/**
 * Service for KubeConfig Injection
 *
 * This feature injects kubeconfig into running DevWorkspace pods.
 *
 * Matches dashboard-backend/src/devworkspaceClient/services/kubeConfigApi.ts
 */
export class KubeConfigService {
  private coreV1Api: k8s.CoreV1Api;
  private kubeConfigYaml: string;
  private serverConfig: ServerConfig;

  constructor(kubeConfig: k8s.KubeConfig) {
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.kubeConfigYaml = kubeConfig.exportConfig();

    const server = kubeConfig.getCurrentCluster()?.server || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = {};
    kubeConfig.applyToRequest(opts);
    this.serverConfig = { opts, server };
  }

  /**
   * Inject kubeconfig into all containers in a DevWorkspace pod
   *
   * @param namespace The namespace where the pod lives
   * @param devworkspaceId The id of the devworkspace
   */
  async injectKubeConfig(namespace: string, devworkspaceId: string): Promise<void> {
    const currentPod = await this.getPodByDevWorkspaceId(namespace, devworkspaceId);
    const podName = currentPod.metadata?.name || '';
    const currentPodContainers = currentPod.spec?.containers || [];

    let resolved = false;
    for (const container of currentPodContainers) {
      const containerName = container.name;
      if (EXCLUDED_CONTAINERS.indexOf(containerName) !== -1) {
        continue;
      }

      try {
        // Find the directory where we should create the kubeconfig
        const kubeConfigDirectory = await this.resolveDirectory(podName, namespace, containerName);
        if (kubeConfigDirectory === '') {
          logger.info(
            `Could not find appropriate kubeconfig directory for ${namespace}/${podName}/${containerName}`,
          );
          continue;
        }

        // Create the directory if it doesn't exist
        await this.exec(podName, namespace, containerName, [
          'sh',
          '-c',
          `mkdir -p ${kubeConfigDirectory}`,
        ]);

        // Check if the kubeconfig is already mounted
        if (container.volumeMounts?.some(vm => vm.mountPath === kubeConfigDirectory)) {
          logger.info(
            `Kubeconfig is already mounted in ${namespace}/${podName}/${containerName} skipping...`,
          );
          continue;
        }

        let kubeConfig = this.setNamespaceInContext(this.kubeConfigYaml, namespace);

        // Get the kubeconfig from the container
        const { stdOut, stdError } = await this.exec(podName, namespace, containerName, [
          'sh',
          '-c',
          `cat ${kubeConfigDirectory}/config`,
        ]);

        // If there is no kubeconfig in the container, stdOut will be empty
        if (stdError !== '') {
          logger.warn(`Error reading kubeconfig from container: ${stdError}`);
        }

        // If no error and stdout is not empty, merge the kubeconfig
        if (stdError === '' && stdOut !== '') {
          kubeConfig = this.mergeKubeConfig(stdOut, kubeConfig);
        }

        // Write the kubeconfig to the container
        // Escape single quotes in the kubeconfig
        const escapedKubeConfig = kubeConfig.replace(/'/g, "'\\''");
        await this.exec(podName, namespace, containerName, [
          'sh',
          '-c',
          `echo '${escapedKubeConfig}' > ${kubeConfigDirectory}/config`,
        ]);

        if (!resolved) {
          resolved = true;
        }

        logger.info(
          `Successfully injected kubeconfig into ${namespace}/${podName}/${containerName}`,
        );
      } catch (e) {
        logger.warn({ error: e }, `Failed to inject kubeconfig into container ${containerName}`);
      }
    }

    if (!resolved) {
      throw new Error(`Could not add kubeconfig into containers in ${namespace}`);
    }
  }

  /**
   * Get pod by DevWorkspace ID
   */
  private async getPodByDevWorkspaceId(
    namespace: string,
    devworkspaceId: string,
  ): Promise<k8s.V1Pod> {
    try {
      const resp = await this.coreV1Api.listNamespacedPod(
        namespace,
        undefined,
        false,
        undefined,
        undefined,
        `controller.devfile.io/devworkspace_id=${devworkspaceId}`,
      );
      if (resp.body.items.length === 0) {
        throw new Error(
          `Could not find requested devworkspace with id ${devworkspaceId} in ${namespace}`,
        );
      }
      return resp.body.items[0];
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Error occurred when attempting to retrieve pod. ${message}`);
    }
  }

  /**
   * Resolve the directory where the kubeconfig will be stored
   */
  private async resolveDirectory(
    name: string,
    namespace: string,
    containerName: string,
  ): Promise<string> {
    try {
      // Attempt to resolve the KUBECONFIG env variable
      const kubeConfigEnvResult = await this.exec(name, namespace, containerName, [
        'sh',
        '-c',
        'printenv KUBECONFIG',
      ]);

      if (kubeConfigEnvResult.stdOut) {
        return kubeConfigEnvResult.stdOut.replace(/\/config$/, '');
      }
    } catch (e) {
      logger.debug(
        { error: e },
        `Failed to run "printenv KUBECONFIG" in "${namespace}/${name}/${containerName}"`,
      );
    }

    try {
      // Attempt to resolve the HOME directory
      const homeEnvResult = await this.exec(name, namespace, containerName, [
        'sh',
        '-c',
        'printenv HOME',
      ]);

      if (homeEnvResult.stdOut) {
        const home = homeEnvResult.stdOut;
        if (home.endsWith('/')) {
          return home + '.kube';
        } else {
          return home + '/.kube';
        }
      }
    } catch (e) {
      logger.debug(
        { error: e },
        `Failed to run "printenv HOME" in "${namespace}/${name}/${containerName}"`,
      );
    }

    return '';
  }

  /**
   * Set namespace in all contexts
   */
  private setNamespaceInContext(kubeConfig: string, namespace: string): string {
    try {
      const kubeConfigYaml = YAML.parse(kubeConfig);
      for (const context of kubeConfigYaml.contexts || []) {
        if (context.context) {
          context.context.namespace = namespace;
        }
      }
      return YAML.stringify(kubeConfigYaml, 4);
    } catch (e) {
      logger.error({ error: e }, 'Failed to parse kubeconfig');
      return kubeConfig;
    }
  }

  /**
   * Merge kubeconfigs
   */
  private mergeKubeConfig(kubeconfigSource: string, generatedKubeconfig: string): string {
    try {
      const kubeConfig = YAML.parse(kubeconfigSource);
      const generatedKubeConfig = YAML.parse(generatedKubeconfig);

      // Merge contexts
      for (const context of generatedKubeConfig.contexts || []) {
        const existingIndex = kubeConfig.contexts?.findIndex(
          (c: { name: string }) => c.name === context.name,
        );
        if (existingIndex >= 0) {
          kubeConfig.contexts.splice(existingIndex, 1);
        }
        kubeConfig.contexts = kubeConfig.contexts || [];
        kubeConfig.contexts.push(context);
      }

      // Merge clusters
      for (const cluster of generatedKubeConfig.clusters || []) {
        const existingIndex = kubeConfig.clusters?.findIndex(
          (c: { name: string }) => c.name === cluster.name,
        );
        if (existingIndex >= 0) {
          kubeConfig.clusters.splice(existingIndex, 1);
        }
        kubeConfig.clusters = kubeConfig.clusters || [];
        kubeConfig.clusters.push(cluster);
      }

      // Merge users
      for (const user of generatedKubeConfig.users || []) {
        const existingIndex = kubeConfig.users?.findIndex(
          (c: { name: string }) => c.name === user.name,
        );
        if (existingIndex >= 0) {
          kubeConfig.users.splice(existingIndex, 1);
        }
        kubeConfig.users = kubeConfig.users || [];
        kubeConfig.users.push(user);
      }

      // Preserve the current context from the generated kubeconfig
      kubeConfig['current-context'] = generatedKubeConfig['current-context'];

      return YAML.stringify(kubeConfig, 4);
    } catch (e) {
      logger.error({ error: e }, 'Failed to merge kubeconfig, returning source');
      return kubeconfigSource;
    }
  }

  /**
   * Execute a command in a container
   */
  private async exec(
    pod: string,
    namespace: string,
    container: string,
    command: string[],
  ): Promise<{ stdOut: string; stdError: string }> {
    let stdOut = '';
    let stdError = '';
    const { server, opts } = this.serverConfig;

    try {
      await new Promise<void>((resolve, reject) => {
        const k8sServer = server.replace(/^http/, 'ws');
        if (!k8sServer) {
          reject(new Error('Failed to get kubernetes client server.'));
          return;
        }

        const queryParams = new URLSearchParams();
        queryParams.append('stdout', 'true');
        queryParams.append('stderr', 'true');
        queryParams.append('container', container);
        for (const cmd of command) {
          queryParams.append('command', cmd);
        }

        const url = `${k8sServer}/api/v1/namespaces/${namespace}/pods/${pod}/exec?${queryParams.toString()}`;

        const client = new WebSocket(url, PROTOCOLS, opts as WebSocket.ClientOptions);
        let openTimeoutObj: NodeJS.Timeout | undefined;
        let responseTimeoutObj: NodeJS.Timeout | undefined;

        client.onopen = () => {
          openTimeoutObj = setTimeout(() => {
            if (client.readyState === WebSocket.OPEN) {
              client.close();
            }
          }, 30000);
        };

        client.onclose = () => {
          resolve();
          if (openTimeoutObj) {
            clearTimeout(openTimeoutObj);
          }
          if (responseTimeoutObj) {
            clearTimeout(responseTimeoutObj);
          }
        };

        client.onerror = err => {
          const message = err.message || 'WebSocket error';
          stdError += message;
          reject(new Error(message));
          client.close();
        };

        client.onmessage = event => {
          if (typeof event.data !== 'string') {
            return;
          }

          const channel = parseInt(event.data[0], 10);

          if (channel === CHANNELS.STD_OUT && event.data.length === 1) {
            if (!responseTimeoutObj) {
              responseTimeoutObj = setTimeout(() => {
                if (client.readyState === WebSocket.OPEN) {
                  client.close();
                }
              }, 3000);
            }
            return;
          }

          const message = Buffer.from(event.data.substring(1), 'base64').toString('utf-8').trim();

          if (channel === CHANNELS.STD_OUT) {
            stdOut += message;
          } else if (channel === CHANNELS.STD_ERROR || channel === CHANNELS.ERROR) {
            stdError += message;
          }
          client.close();
        };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(message);
    }

    return { stdOut, stdError };
  }
}
