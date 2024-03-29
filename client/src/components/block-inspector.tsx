import { MasterBlockLocation, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Fragment, ReactNode } from 'react';

import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Application } from '../application';
import { formatDateOrTimePair, formatDurationTerm } from '../format';
import { Host } from '../host';
import { HostDraftMark } from '../interfaces/draft';
import { GlobalContext } from '../interfaces/plugin';
import { analyzeBlockPath, getBlockImpl } from '../protocol';
import { getDateFromTerm } from '../term';
import { usePool } from '../util';
import { Feature, FeatureGroups, FeatureList, FeatureRoot } from '../libraries/features';
import { Icon } from './icon';
import { TimeSensitive } from './time-sensitive';
import { PanelPlaceholder } from '../libraries/panel';


export function BlockInspector(props: {
  app: Application;
  blockPath: ProtocolBlockPath | null;
  footer?: [ReactNode, ReactNode] | null;
  host: Host;
  location: MasterBlockLocation | null;
  mark: HostDraftMark | null;
  protocol: Protocol;
  selectBlock(path: ProtocolBlockPath | null): void;
}) {
  let pool = usePool();

  if (!props.blockPath) {
    return (
      <PanelPlaceholder message="Nothing selected" />
    );
  }

  let globalContext: GlobalContext = {
    app: props.app,
    host: props.host,
    pool
  };

  let blockAnalysis = analyzeBlockPath(props.protocol, props.location, props.mark, props.blockPath, globalContext);

  // console.log(props.mark);
  // console.log(blockAnalysis);

  let ancestorGroups = blockAnalysis.groups.slice(0, -1);
  let leafGroup = blockAnalysis.groups.at(-1)!;

  let leafPair = blockAnalysis.pairs.at(-1)!;
  let leafBlockImpl = getBlockImpl(leafPair.block, globalContext);

  return (
    <div className={spotlightStyles.root}>
      <div className={spotlightStyles.contents}>
        {(ancestorGroups.length > 0) && (
          <div className={spotlightStyles.breadcrumbRoot}>
            {ancestorGroups.map((group, groupIndex, arr) => {
              let last = groupIndex === (arr.length - 1);

              return (
                <Fragment key={groupIndex}>
                  <button type="button" className={spotlightStyles.breadcrumbEntry} onClick={() => {
                    props.selectBlock(group.path);
                  }}>{group.name ?? <i>Untitled</i>}</button>
                  {!last && <Icon name="chevron_right" className={spotlightStyles.breadcrumbIcon} />}
                </Fragment>
              );
            })}
          </div>
        )}
        <div className={spotlightStyles.header}>
          <h2 className={spotlightStyles.title}>{leafGroup.name ?? <i>{leafBlockImpl.getLabel?.(leafPair.block) ?? 'Untitled'}</i>}</h2>
        </div>

        <div className={spotlightStyles.timeinfo}>
          <TimeSensitive
            contents={() => {
              let now = Date.now();
              let terms = leafPair.terms;

              if (!terms) {
                return <div>Past step</div>;
              }

              let startDate = getDateFromTerm(terms.start, now);

              return (
                <>
                  <div>{formatDurationTerm(leafPair.block.duration) ?? '\xa0'}</div>
                  {(startDate !== null) && (
                    <div>{formatDateOrTimePair(startDate, getDateFromTerm(terms.end, now), now, { display: 'date', format: 'react', mode: 'directional' })}</div>
                  )}
                </>
              );
            }}
            interval={30e3} />
        </div>

        {blockAnalysis.isLeafBlockTerminal && (
          <FeatureRoot>
            <FeatureList>
              {leafBlockImpl.createFeatures!(leafPair.block, null, [], globalContext).map((feature, featureIndex) => (
                <Feature feature={{ ...feature, accent: true }} key={feature.id ?? featureIndex} />
              ))}
            </FeatureList>
          </FeatureRoot>
        )}

        <FeatureRoot>
          <FeatureGroups groups={blockAnalysis.groups.slice().reverse().flatMap((group) => {
            let renderedFeaturesByPair = group.pairs.slice().reverse().flatMap((pair, pairIndex) => {
              let blockImpl = getBlockImpl(pair.block, globalContext);
              let descendantPairs = blockAnalysis.pairs.slice(group.firstPairIndex + group.pairs.length - pairIndex);

              let features = blockImpl.createFeatures?.(pair.block, null, descendantPairs, globalContext) ?? [];

              if (features.length < 1) {
                return [];
              }

              return [(
                <Fragment key={pairIndex}>
                  {features.map((feature, featureIndex) => (
                    <Feature feature={feature} key={feature.id ?? featureIndex} />
                  ))}
                </Fragment>
              )];
            });

            if (renderedFeaturesByPair.length < 1) {
              return [];
            }

            return [{
              id: group.firstPairIndex,
              label: group.name ?? group.labels.join(', ') ?? <i>Untitled group</i>,
              contents: (
                <FeatureList>
                  {renderedFeaturesByPair}
                </FeatureList>
              )
            }];
          })} />
        </FeatureRoot>
      </div>
      {props.footer && (
        <div className={spotlightStyles.footerRoot}>
          <div className={spotlightStyles.footerActions}>
            {props.footer[0]}
          </div>
          <div className={spotlightStyles.footerActions}>
            {props.footer[1]}
          </div>
        </div>
      )}
    </div>
  );
}
