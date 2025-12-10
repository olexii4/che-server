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
 * The service uses two KubeConfigs:
 * 1. execKubeConfig - Used for exec operations (running commands in pods).
 *    This is typically the ServiceAccount's KubeConfig with permissions to exec.
 * 2. userKubeConfig - The kubeconfig content to inject into containers.
 *    This contains the user's token for their access.
 *
 * This separation is needed because in clusters where the Kubernetes API server
 * doesn't trust the OIDC provider (e.g., Dex), the user's OIDC token cannot be
 * used directly for Kubernetes API calls. The ServiceAccount token is used instead.
 *
 * Matches dashboard-backend/src/devworkspaceClient/services/kubeConfigApi.ts
 */
export class KubeConfigService {
  private coreV1Api: k8s.CoreV1Api;
  private kubeConfigYaml: string;
  private serverConfig: ServerConfig;

  /**
   * Create KubeConfigService
   *
   * @param execKubeConfig - KubeConfig for exec operations (ServiceAccount's config)
   * @param userKubeConfig - Optional KubeConfig to inject into containers (user's config).
   *                         If not provided, execKubeConfig is used for both.
   */
  constructor(execKubeConfig: k8s.KubeConfig, userKubeConfig?: k8s.KubeConfig) {
    // Use execKubeConfig for API calls and exec operations
    this.coreV1Api = execKubeConfig.makeApiClient(k8s.CoreV1Api);

    // Use userKubeConfig for the content to inject, fallback to execKubeConfig
    const configToInject = userKubeConfig || execKubeConfig;
    this.kubeConfigYaml = configToInject.exportConfig();

    // Server config for WebSocket exec uses the execKubeConfig
    const server = execKubeConfig.getCurrentCluster()?.server || '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = {};
    execKubeConfig.applyToRequest(opts);
    this.serverConfig = { opts, server };

    logger.info(
      `[KubeConfigService] Initialized with exec server: ${server}, inject config cluster: ${configToInject.getCurrentCluster()?.server}`,
    );
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
    logger.info(
      `[KubeConfigService] Resolving kubeconfig directory for ${namespace}/${name}/${containerName}`,
    );

    try {
      // Attempt to resolve the KUBECONFIG env variable
      logger.info(`[KubeConfigService] Trying printenv KUBECONFIG...`);
      const kubeConfigEnvResult = await this.exec(name, namespace, containerName, [
        'sh',
        '-c',
        'printenv KUBECONFIG',
      ]);

      logger.info(
        `[KubeConfigService] KUBECONFIG result: stdOut="${kubeConfigEnvResult.stdOut}", stdError="${kubeConfigEnvResult.stdError}"`,
      );

      if (kubeConfigEnvResult.stdOut) {
        const dir = kubeConfigEnvResult.stdOut.replace(/\/config$/, '');
        logger.info(`[KubeConfigService] Using KUBECONFIG directory: ${dir}`);
        return dir;
      }
    } catch (e) {
      logger.warn(
        { error: e },
        `[KubeConfigService] Failed to run "printenv KUBECONFIG" in "${namespace}/${name}/${containerName}"`,
      );
    }

    try {
      // Attempt to resolve the HOME directory
      logger.info(`[KubeConfigService] Trying printenv HOME...`);
      const homeEnvResult = await this.exec(name, namespace, containerName, [
        'sh',
        '-c',
        'printenv HOME',
      ]);

      logger.info(
        `[KubeConfigService] HOME result: stdOut="${homeEnvResult.stdOut}", stdError="${homeEnvResult.stdError}"`,
      );

      if (homeEnvResult.stdOut) {
        const home = homeEnvResult.stdOut;
        const dir = home.endsWith('/') ? home + '.kube' : home + '/.kube';
        logger.info(`[KubeConfigService] Using HOME-based directory: ${dir}`);
        return dir;
      }
    } catch (e) {
      logger.warn(
        { error: e },
        `[KubeConfigService] Failed to run "printenv HOME" in "${namespace}/${name}/${containerName}"`,
      );
    }

    logger.warn(`[KubeConfigService] Could not resolve kubeconfig directory`);
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

    logger.info(`[KubeConfigService.exec] Executing command in ${namespace}/${pod}/${container}`);
    logger.info(`[KubeConfigService.exec] Command: ${command.join(' ')}`);
    logger.info(`[KubeConfigService.exec] Server: ${server}`);
    logger.info(
      `[KubeConfigService.exec] Opts keys: ${Object.keys(opts as Record<string, unknown>).join(', ')}`,
    );

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
        logger.info(`[KubeConfigService.exec] WebSocket URL: ${url.substring(0, 100)}...`);

        const client = new WebSocket(url, PROTOCOLS, opts as WebSocket.ClientOptions);
        let openTimeoutObj: NodeJS.Timeout | undefined;
        let responseTimeoutObj: NodeJS.Timeout | undefined;

        client.onopen = () => {
          logger.info(`[KubeConfigService.exec] WebSocket connected`);
          openTimeoutObj = setTimeout(() => {
            logger.warn(`[KubeConfigService.exec] WebSocket open timeout, closing`);
            if (client.readyState === WebSocket.OPEN) {
              client.close();
            }
          }, 30000);
        };

        client.onclose = () => {
          logger.info(
            `[KubeConfigService.exec] WebSocket closed. stdOut="${stdOut}", stdError="${stdError}"`,
          );
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
          logger.error(`[KubeConfigService.exec] WebSocket error: ${message}`);
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
