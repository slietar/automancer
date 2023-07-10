import { OrdinaryId } from 'pr1-shared';
import { PropsWithChildren, ReactNode, memo, useState } from 'react';

import { formatClass } from '../util';
import { Icon } from '../components/icon';


export interface FeatureDef {
  id?: OrdinaryId;
  accent?: unknown;
  actions?: (FeatureActionDef | null)[]; // null = empty action slot used for alignment
  description?: string | null;
  disabled?: unknown;
  error?: {
    kind: 'emergency' | 'error' | 'power' | 'shield' | 'warning';
    message: string;
  } | null;
  icon: string;
  label: ReactNode;
}

export interface FeatureActionDef {
  id: OrdinaryId;
  disabled?: unknown;
  icon: string;
  label?: string;
}

export interface FeatureEntryProps {
  id: OrdinaryId;
  actions?: FeatureActionDef[];
  detail?: (() => ReactNode) | null;
  features: FeatureDef[];
  onAction?(actionId: OrdinaryId): void;
}


export const Feature = memo(({ feature, onAction }: {
  feature: FeatureDef;
  onAction?(actionId: OrdinaryId): void;
}) => {
  return (
    <div className={formatClass('Feature', {
      '_accent': feature.accent,
      '_disabled': feature.disabled
    })}>
      <Icon name={feature.icon} className="icon" />
      <div className="body">
        {feature.description && <div className="description">{feature.description}</div>}
        <div className="label">{feature.label}</div>
      </div>
      {feature.error && (
        <Icon
          className="error-icon"
          name={{
            emergency: 'emergency_home',
            error: 'error',
            power: 'power_off',
            shield: 'gpp_maybe',
            warning: 'warning'
          }[feature.error.kind]}
          title={feature.error.message} />
      )}
      <div className="actions">
        {feature.actions?.map((action, actionIndex) => (
          action
            ? (
              <button
                type="button"
                disabled={!!action.disabled}
                title={action.label}
                className="item"
                key={action.id}
                onClick={() => void onAction!(action.id)}>
                <Icon name={action.icon} />
              </button>
            )
            : <div key={-actionIndex} />
        ))}
      </div>
    </div>
  );
});

export function FeatureEntries(props: PropsWithChildren<{}>) {
  return (
    <div className="FeatureEntries">
      {props.children}
    </div>
  );
}

export const FeatureEntry = memo((props: {
  actions?: FeatureActionDef[];
  detail?: (() => ReactNode) | null;
  features: FeatureDef[];
  onAction?(actionId: OrdinaryId): void;
}) => {
  let [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="FeatureEntry">
      <div className="FeatureList">
        {props.features.map((feature, featureIndex) => (
          <Feature
            feature={{
              ...feature,
              actions: (featureIndex === 0)
                ? [
                  ...(props.actions ?? []),
                  props.detail
                    ? detailOpen
                      ? {
                        id: '_toggle',
                        label: 'Collapse',
                        icon: 'expand_less'
                      }
                      : {
                        id: '_toggle',
                        label: 'Expand',
                        icon: 'expand_more'
                      }
                    : null
                ]
                : []
            }}
            onAction={(actionId) => {
              if (actionId === '_toggle') {
                setDetailOpen((open) => !open);
              } else {
                props.onAction!(actionId);
              }
            }}
            key={feature.id ?? featureIndex} />
        ))}
      </div>
      {detailOpen && props.detail && (
        <div className="detail">
          {props.detail()}
        </div>
      )}
    </div>
  );
});

export function FeatureGroups(props: {
  groups: {
    id: OrdinaryId;
    contents: ReactNode;
    label: ReactNode;
  }[];
}) {
  return (
    <div className="FeatureGroups">
      {props.groups.map((group) => (
        <div className="item" key={group.id}>
          <div className="label">{group.label}</div>
          {group.contents}
        </div>
      ))}
    </div>
  );
}

export function FeatureList(props: PropsWithChildren<{}>) {
  return (
    <div className="FeatureList">
      {props.children}
    </div>
  );
}

export function FeatureRoot(props: PropsWithChildren<{}>) {
  return (
    <div className="FeatureRoot">
      {props.children}
    </div>
  );
}
