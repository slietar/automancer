import type { BaseBackend } from './base';
import type { DraftCompilation } from '../draft';
import type { Codes, ExecutorStates, ProtocolData, SegmentData, Unit, UnitInfo, UnitNamespace } from '../units';


export abstract class BackendCommon implements BaseBackend {
  private _listeners: Set<() => void> = new Set();

  abstract closed: Promise<void>;
  abstract state: HostState;

  async close(): Promise<void> { }
  async sync(): Promise<void> { }
  async start(): Promise<void> { }

  onUpdate(listener: () => void, options?: { signal?: AbortSignal; }) {
    this._listeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this._listeners.delete(listener);
    });
  }

  protected _update() {
    for (let listener of this._listeners) {
      listener();
    }
  }

  abstract command<T>(options: { chipId: ChipId; command: T; namespace: UnitNamespace; }): Promise<void>;
  abstract compileDraft(options: {
    draftId: DraftId;
    source: string;
  }): Promise<DraftCompilation>;
  abstract createChip(): Promise<{ chipId: ChipId; }>;
  abstract createDraftSample(): Promise<string>;
  abstract deleteChip(chipId: ChipId, options: { trash: boolean; }): Promise<void>;
  abstract duplicateChip(chipId: ChipId): Promise<{ chipId: ChipId; }>;
  abstract instruct<T>(instruction: T): Promise<void>;
  abstract pause(chipId: ChipId, options: { neutral: boolean; }): Promise<void>;
  abstract reloadUnits(): Promise<void>;
  abstract resume(chipId: ChipId): Promise<void>;
  abstract revealChipDirectory(chipId: ChipId): Promise<void>;
  abstract setLocation(chipId: ChipId, location: ProtocolLocation): Promise<void>;
  abstract skipSegment(chipId: ChipId, segmentIndex: number, processState?: object): Promise<void>;
  abstract startPlan(options: {
    chipId: ChipId;
    data: Codes;
    location: ProtocolLocation;
    source: string;
  }): Promise<void>;

  abstract loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>>;
}

export type BackendAuthAgentSpec = {
  type: 'password';
  description: string;
};


export type ChipId = string;
export type DeviceId = string;
export type DraftId = string;
export type HostId = string;

export interface Device {
  id: DeviceId;
  name: string;
}


export interface Chip {
  id: ChipId;
  condition: ChipCondition.Ok | ChipCondition.Partial | ChipCondition.Unrunnable;
  readable: true;
  master: Master | null;
  runners: Record<UnitNamespace, unknown>;
  unitList: UnitNamespace[];
}

export interface UnreadableChip {
  id: ChipId;
  condition: ChipCondition.Unsupported | ChipCondition.Corrupted;
  readable: false;
}

export type GeneralChip = Chip | UnreadableChip;


export enum ChipCondition {
  Ok = 0,
  Partial = 1,
  Unrunnable = 2,
  Unsupported = 3,
  Corrupted = 4
}


export interface Draft {
  id: DraftId;
  errors: {
    message: string;
    range: [number, number];
  }[];
  protocol: Protocol | null;
  source: string;
}


export interface Master {
  entries: MasterEntry[];
  protocol: Protocol;
}

export interface MasterEntry {
  error: string | null;
  paused: boolean;
  processState: { progress: number; };
  segmentIndex: number;
  time: number;
}


export interface Protocol {
  name: string | null;
  segments: ProtocolSegment[];
  stages: ProtocolStage[];
  data: ProtocolData;
}

export interface ProtocolStage {
  name: string;
  seq: ProtocolSeq;
  steps: ProtocolStep[];
}

export interface ProtocolStep {
  name: string;
  seq: ProtocolSeq;
}

export interface ProtocolSegment {
  processNamespace: Namespace;
  data: SegmentData;
}

export type ProtocolSeq = [number, number];


export interface ProtocolLocation {
  segmentIndex: number;
  state: any;
}


export interface HostState {
  info: {
    id: HostId;
    instanceRevision: number;
    name: string;
    startTime: number;
    units: Record<string, UnitInfo>;
  };

  chips: Record<ChipId, GeneralChip>;
  drafts: Record<DraftId, Draft>;
  devices: Record<DeviceId, Device>;
  executors: ExecutorStates;
}

export type Namespace = 'control' | 'input' | 'timer';
