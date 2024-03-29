import { Brand, HostIdentifier } from 'pr1-shared';
import { PythonInstallation, PythonInstallationId } from 'find-python-installations';


export type DraftEntryId = Brand<string, 'DraftEntryId'>;

export interface DraftEntry {
  id: DraftEntryId;
  entryPath: string;
  name: string | null;
}

export interface LocalHostOptions {
  customPythonInstallation: PythonInstallation | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string | null;
    id: PythonInstallationId;
    virtualEnv: boolean;
  };
}

export interface AppData {
  defaultHostSettingsId: HostSettingsId | null;
  drafts: Record<DraftEntryId, DraftEntry>;
  embeddedPythonInstallation: null;
  hostSettingsRecord: HostSettingsRecord;
  stores: Record<string, Record<string, unknown>>;
  version: number;
}

export interface HostSettings {
  id: HostSettingsId;
  label: string;
  options: HostSettingsOptionsLocal | HostSettingsOptionsTcp;
};

export interface HostSettingsOptionsLocal {
  type: 'local';
  architecture: string | null;
  conf: ServerConfiguration;
  dirPath: string;
  identifier: HostIdentifier;
  pythonPath: string; // | null; // null -> use embedded
}

export type HostSettingsId = Brand<string, 'HostSettingsId'>;
export type HostSettingsRecord = Record<HostSettingsId, HostSettings>;


export interface ServerConfiguration {
  advertisement: {
    description: string;
  } | null;
  auth: null;
  bridges: ({
    type: 'socket';
    options: {
      type: 'tcp';
      addresses: string[];
      port: number;
      secure: boolean;
    } | {
      type: 'unix';
      path: string;
    };
  } | {
    type: 'stdio';
    options: {};
  } | {
    type: 'websocket';
    options: {
      hostname: string;
      port: number;
      secure: boolean;
      singleClient: boolean;
      staticAuthenticateClients: boolean;
      staticPort: boolean;
    };
  })[];
  identifier: HostIdentifier;
  static: {
    hostname: string;
    port: number;
    secure: boolean;
  } | null;
  version: number;
}


export type TcpHostOptions = {
  hostname: string;
  identifier: HostIdentifier;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint;
  secure: true;
  trusted: boolean;
});

export type TcpHostOptionsCandidate = {
  hostname: string;
  identifier: HostIdentifier | null;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint | null;
  secure: true;
  trusted: boolean;
});

export type HostSettingsOptionsTcp = TcpHostOptions & {
  type: 'tcp';
}

export interface HostSettingsOptionsUnix {
  type: 'unix';
  identifier: HostIdentifier | null;
  path: string;
  password: string | null;
  secure: false;
}


export type CertificateFingerprint = Brand<string, 'CertificateFingerprint'>;
