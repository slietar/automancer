import electron from 'electron';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';

import { Logger } from './logger';


export class Pool {
  #logger: Logger | null = null;
  #promises = new Set<Promise<unknown>>();

  constructor(logger?: Logger) {
    this.#logger = logger ?? null;
  }

  add(generator: (() => Promise<unknown>) | Promise<unknown>) {
    let promise = typeof generator === 'function'
      ? generator()
      : generator;

    promise
      .catch((err) => {
        if (this.#logger) {
          this.#logger.error(err.message);
          logError(err, this.#logger);
        } else {
          console.error(err);
        }
      })
      .finally(() => {
        this.#promises.delete(promise);
      });

    this.#promises.add(promise);

    return Promise.allSettled([promise]) as Promise<never>;
  }

  get empty() {
    return this.size < 1;
  }

  get size() {
    return this.#promises.size;
  }

  async wait() {
    while (!this.empty) {
      await Promise.allSettled(this.#promises);
    }
  }
}


export function getComputerName() {
  let hostname = os.hostname();

  return hostname.endsWith('.local')
    ? hostname.slice(0, -'.local'.length)
    : hostname;
}

export function getResourcePath() {
  return path.join(__dirname, '../..');

  // return app.isPackaged
  //   ? path.join(process.resourcesPath, 'app')
  //   : path.join(__dirname, '..');
}

export function logError(err: any, logger: Logger) {
  logger.error(err.message);

  for (let line of err.stack.split('\n')) {
    logger.debug(line);
  }
}

export interface RunCommandOptions {
  architecture?: string | null;
  cwd?: string;
  ignoreErrors?: unknown;
  timeout?: number;
}


const transformCertificatePrincipal = (input: tls.Certificate): electron.CertificatePrincipal => ({
  commonName: input.CN,
  organizations: [input.O],
  organizationUnits: [input.OU],
  locality: input.L,
  state: input.ST,
  country: input.C,
});

const transformDate = (input: string) => Math.round(new Date(input).getTime() / 1000);

export function transformCertificate(cert: tls.PeerCertificate): electron.Certificate {
  return {
    data: `-----BEGIN CERTIFICATE-----\n${cert.raw.toString('base64')}\n-----END CERTIFICATE-----`,
    fingerprint: cert.fingerprint,
    issuer: transformCertificatePrincipal(cert.issuer),
    issuerName: cert.issuer.CN,
    subject: transformCertificatePrincipal(cert.subject),
    subjectName: cert.issuer.CN,
    serialNumber: cert.serialNumber,
    validStart: transformDate(cert.valid_from),
    validExpiry: transformDate(cert.valid_to),

    // @ts-expect-error
    issuerCert: null
  };
}
