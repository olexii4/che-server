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

import { readFileSync } from 'fs';
import crypto from 'crypto';
import { axiosInstanceNoCert } from '../helpers/getCertificateAuthority';
import { logger } from '../utils/logger';

export class OAuth1AuthenticationException extends Error {}
export class UserDeniedOAuthAuthenticationException extends OAuth1AuthenticationException {}

type OAuth1Credentials = { token: string; tokenSecret?: string };

type OAuth1SignatureMethod = 'rsa' | 'hmac';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

function epochSeconds(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function percentEncode(input: string): string {
  // OAuth 1.0 percent-encoding is close to encodeURIComponent, but we keep it explicit.
  return encodeURIComponent(input)
    .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeBaseUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.hash = '';
  url.search = '';
  return url.toString();
}

function normalizeParameters(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
}

function buildSignatureBaseString(method: string, requestUrl: string, params: Record<string, string>) {
  const baseUrl = normalizeBaseUrl(requestUrl);
  const normalizedParams = normalizeParameters(params);
  return `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(normalizedParams)}`;
}

function parseQueryBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split('&')) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (!k) continue;
    out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}

function oauthHeader(params: Record<string, string>): string {
  const headerParams = Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(', ');
  return `OAuth ${headerParams}`;
}

function encodeRedirectUrlLikeJava(urlStr: string): string {
  // Mirrors EmbeddedOAuthAPI.encodeRedirectUrl behavior:
  // - take the query string and URL-encode it as a single chunk
  // - this is used when redirect_after_login contains unescaped JSON like {} which breaks URI parsing
  const parsed = new URL(urlStr, 'http://dummy.local');
  const query = parsed.search.startsWith('?') ? parsed.search.substring(1) : parsed.search;
  if (!query) return urlStr;
  const idx = urlStr.indexOf(query);
  if (idx < 0) return urlStr;
  return urlStr.substring(0, idx) + encodeURIComponent(query);
}

export function getRedirectAfterLoginUrl(
  parameters: Map<string, string>,
  errorCode?: string,
): string {
  let redirectAfterLogin = parameters.get('redirect_after_login') ?? '';
  // Java uses URI.create() which fails on unsupported characters (like '{' and '}') in the URL.
  // We emulate this check by triggering encoding when raw braces are present.
  if (redirectAfterLogin.includes('{') || redirectAfterLogin.includes('}')) {
    redirectAfterLogin = encodeRedirectUrlLikeJava(redirectAfterLogin);
  }
  if (errorCode) {
    redirectAfterLogin += `${redirectAfterLogin.includes('?') ? '&' : '?'}error_code=${errorCode}`;
  }
  return redirectAfterLogin;
}

export class BitbucketServerOAuth1Authenticator {
  public static readonly NAME = 'bitbucket-server';

  private readonly requestTokenUri: string;
  private readonly accessTokenUri: string;
  private readonly authorizeTokenUri: string;
  private readonly redirectUri: string;

  private readonly tempTokenSecrets: Map<string, string> = new Map();
  private readonly credentialsByUserId: Map<string, OAuth1Credentials> = new Map();

  constructor(
    private readonly consumerKey: string,
    private readonly privateKey: string,
    private readonly bitbucketEndpoint: string,
    private readonly apiEndpoint: string,
  ) {
    this.requestTokenUri = `${bitbucketEndpoint}/plugins/servlet/oauth/request-token`;
    this.accessTokenUri = `${bitbucketEndpoint}/plugins/servlet/oauth/access-token`;
    this.authorizeTokenUri = `${bitbucketEndpoint}/plugins/servlet/oauth/authorize`;
    this.redirectUri = `${apiEndpoint}/api/oauth/1.0/callback`;
  }

  getEndpointUrl(): string {
    return this.bitbucketEndpoint;
  }

  private createPrivateKeyObject(): crypto.KeyObject {
    const raw = this.privateKey.trim();
    // Try PEM first
    try {
      if (raw.includes('BEGIN')) {
        return crypto.createPrivateKey(raw);
      }
    } catch {
      // fall through
    }
    // Try base64 DER (PKCS8)
    try {
      const der = Buffer.from(raw, 'base64');
      return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    } catch {
      // Last attempt: treat as raw string PEM
      return crypto.createPrivateKey(raw);
    }
  }

  private sign(
    signatureMethod: OAuth1SignatureMethod,
    method: string,
    requestUrl: string,
    oauthParams: Record<string, string>,
    tokenSecret?: string,
  ): string {
    const baseString = buildSignatureBaseString(method, requestUrl, oauthParams);
    if (signatureMethod === 'rsa') {
      const keyObj = this.createPrivateKeyObject();
      const sig = crypto.sign('RSA-SHA1', Buffer.from(baseString), keyObj);
      return sig.toString('base64');
    }
    // HMAC-SHA1 (not used for Bitbucket Server in Che by default, but kept for completeness)
    const key = `${percentEncode(this.consumerKey)}&${percentEncode(tokenSecret ?? '')}`;
    return crypto.createHmac('sha1', key).update(baseString).digest('base64');
  }

  async getAuthenticateUrl(
    requestUrl: URL,
    requestMethod: string | undefined,
    signatureMethod: string | undefined,
    currentUserId: string,
  ): Promise<string> {
    const query = requestUrl.search.startsWith('?') ? requestUrl.search.substring(1) : requestUrl.search;
    const queryParams = new URLSearchParams(query);
    const providedUserId = queryParams.get('userId');
    if (providedUserId && providedUserId !== currentUserId) {
      throw new OAuth1AuthenticationException(
        `Provided query parameter userId=${providedUserId} does not match the current user id: ${currentUserId}`,
      );
    }
    if (!providedUserId) {
      queryParams.set('userId', currentUserId);
    }

    const callbackUrl = new URL(this.redirectUri);
    callbackUrl.search = queryParams.toString();

    const httpMethod = requestMethod?.toLowerCase() === 'post' ? 'POST' : 'GET';
    const sigMethod: OAuth1SignatureMethod = signatureMethod?.toLowerCase() === 'rsa' ? 'rsa' : 'hmac';

    const oauthParams: Record<string, string> = {
      oauth_callback: callbackUrl.toString(),
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: sigMethod === 'rsa' ? 'RSA-SHA1' : 'HMAC-SHA1',
      oauth_timestamp: epochSeconds(),
      oauth_version: '1.0',
    };
    oauthParams.oauth_signature = this.sign(sigMethod, httpMethod, this.requestTokenUri, oauthParams);

    const headers = { Authorization: oauthHeader(oauthParams) };
    const resp = await axiosInstanceNoCert.request({
      method: httpMethod,
      url: this.requestTokenUri,
      headers,
      validateStatus: () => true,
    });

    if (resp.status !== 200 || !isNonEmptyString(resp.data)) {
      throw new OAuth1AuthenticationException(`Failed to get request token: HTTP ${resp.status}`);
    }

    const parsed = parseQueryBody(resp.data);
    const oauthToken = parsed.oauth_token;
    const tokenSecret = parsed.oauth_token_secret;
    if (!oauthToken) {
      throw new OAuth1AuthenticationException('Missing oauth_token in request token response');
    }
    if (tokenSecret) {
      this.tempTokenSecrets.set(oauthToken, tokenSecret);
    }

    return `${this.authorizeTokenUri}?oauth_token=${encodeURIComponent(oauthToken)}`;
  }

  async callback(requestUrl: URL): Promise<string> {
    const oauthToken = requestUrl.searchParams.get('oauth_token');
    const oauthVerifier = requestUrl.searchParams.get('oauth_verifier');
    const state = requestUrl.searchParams.get('state') ?? '';

    if (!oauthToken) throw new OAuth1AuthenticationException('Missing oauth_token parameter');
    if (!oauthVerifier) throw new OAuth1AuthenticationException('Missing oauth_verifier parameter');
    if (oauthVerifier === 'denied') throw new UserDeniedOAuthAuthenticationException('Authorization denied');

    const stateParams = new URLSearchParams(state);
    const userId = stateParams.get('userId') ?? '';
    const requestMethod = stateParams.get('request_method') ?? undefined;
    const signatureMethod = stateParams.get('signature_method') ?? undefined;

    const httpMethod = requestMethod?.toLowerCase() === 'post' ? 'POST' : 'GET';
    const sigMethod: OAuth1SignatureMethod = signatureMethod?.toLowerCase() === 'rsa' ? 'rsa' : 'hmac';

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: sigMethod === 'rsa' ? 'RSA-SHA1' : 'HMAC-SHA1',
      oauth_timestamp: epochSeconds(),
      oauth_token: oauthToken,
      oauth_verifier: oauthVerifier,
      oauth_version: '1.0',
    };

    const tempSecret = this.tempTokenSecrets.get(oauthToken);
    oauthParams.oauth_signature = this.sign(sigMethod, httpMethod, this.accessTokenUri, oauthParams, tempSecret);

    const headers = { Authorization: oauthHeader(oauthParams) };
    const resp = await axiosInstanceNoCert.request({
      method: httpMethod,
      url: this.accessTokenUri,
      headers,
      validateStatus: () => true,
    });

    if (resp.status !== 200 || !isNonEmptyString(resp.data)) {
      throw new OAuth1AuthenticationException(`Failed to get access token: HTTP ${resp.status}`);
    }
    const parsed = parseQueryBody(resp.data);
    const accessToken = parsed.oauth_token;
    const accessSecret = parsed.oauth_token_secret;
    if (!accessToken) {
      throw new OAuth1AuthenticationException('Missing oauth_token in access token response');
    }
    if (!isNonEmptyString(userId)) {
      throw new OAuth1AuthenticationException('Missing userId in state');
    }
    this.credentialsByUserId.set(userId, { token: accessToken, tokenSecret: accessSecret });

    // cleanup
    this.tempTokenSecrets.delete(oauthToken);

    return userId;
  }

  computeAuthorizationHeader(userId: string, requestMethod: string, requestUrl: string): string {
    const creds = this.credentialsByUserId.get(userId);
    if (!creds) {
      throw new OAuth1AuthenticationException(`OAuth1 token for user ${userId} was not found`);
    }

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.consumerKey,
      oauth_nonce: generateNonce(),
      oauth_signature_method: 'RSA-SHA1',
      oauth_timestamp: epochSeconds(),
      oauth_token: creds.token,
      oauth_version: '1.0',
    };
    oauthParams.oauth_signature = this.sign('rsa', requestMethod, requestUrl, oauthParams, creds.tokenSecret);
    return oauthHeader(oauthParams);
  }
}

export class OAuth1Service {
  private bitbucketServer?: BitbucketServerOAuth1Authenticator;

  initialize(): void {
    // Java properties:
    // - che.oauth1.bitbucket.consumerkeypath
    // - che.oauth1.bitbucket.privatekeypath
    // - che.oauth.bitbucket.endpoint
    //
    // In Node we map these to env vars (uppercase):
    // - CHE_OAUTH1_BITBUCKET_CONSUMERKEYPATH
    // - CHE_OAUTH1_BITBUCKET_PRIVATEKEYPATH
    // - CHE_OAUTH_BITBUCKET_ENDPOINT
    const consumerKeyPath = process.env.CHE_OAUTH1_BITBUCKET_CONSUMERKEYPATH;
    const privateKeyPath = process.env.CHE_OAUTH1_BITBUCKET_PRIVATEKEYPATH;
    const bitbucketEndpoint = process.env.CHE_OAUTH_BITBUCKET_ENDPOINT;

    const apiEndpoint =
      process.env.CHE_API || process.env.CHE_API_ENDPOINT || `http://localhost:${process.env.PORT || 8080}`;

    if (!isNonEmptyString(consumerKeyPath) || !isNonEmptyString(privateKeyPath) || !isNonEmptyString(bitbucketEndpoint)) {
      logger.info(
        {
          hasConsumerKeyPath: isNonEmptyString(consumerKeyPath),
          hasPrivateKeyPath: isNonEmptyString(privateKeyPath),
          hasBitbucketEndpoint: isNonEmptyString(bitbucketEndpoint),
        },
        'OAuth1Service: Bitbucket Server OAuth1 is not configured (provider will be unsupported)',
      );
      return;
    }

    try {
      const consumerKey = readFileSync(consumerKeyPath, 'utf-8').trim();
      const privateKey = readFileSync(privateKeyPath, 'utf-8').trim();
      if (!consumerKey || !privateKey) {
        return;
      }
      this.bitbucketServer = new BitbucketServerOAuth1Authenticator(
        consumerKey,
        privateKey,
        bitbucketEndpoint,
        apiEndpoint,
      );
      logger.info(
        { bitbucketEndpoint },
        'OAuth1Service: Bitbucket Server OAuth1 authenticator is configured',
      );
    } catch (e: any) {
      logger.warn({ err: e?.message }, 'OAuth1Service: Failed to initialize Bitbucket Server OAuth1 authenticator');
    }
  }

  getAuthenticator(providerName: string): BitbucketServerOAuth1Authenticator | undefined {
    if (providerName === BitbucketServerOAuth1Authenticator.NAME) {
      return this.bitbucketServer;
    }
    return undefined;
  }
}


