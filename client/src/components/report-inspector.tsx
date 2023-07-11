import { Experiment, ExperimentReportEvents, ExperimentReportInfo, ExperimentReportStaticEntry, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Fragment, useEffect, useState } from 'react';

import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Application } from '../application';
import { formatDateOrTimePair } from '../format';
import { Host } from '../host';
import { GlobalContext } from '../interfaces/plugin';
import { Feature, FeatureGroups, FeatureList, FeatureRoot } from '../libraries/features';
import { analyzeBlockPath, getBlockImpl } from '../protocol';
import { usePool } from '../util';
import { Icon } from './icon';
import { StaticSelect } from './static-select';


export function ReportInspector(props: {
  app: Application;
  blockPath: ProtocolBlockPath | null;
  host: Host;
  experiment: Experiment;
  protocol: Protocol;
  reportInfo: ExperimentReportInfo;
  selectBlock(path: ProtocolBlockPath | null): void;
}) {
  let pool = usePool();

  if (!props.blockPath) {
    return (
      <div className={spotlightStyles.placeholder}>
        <p>Nothing selected</p>
      </div>
    );
  }

  let staticEntry = props.blockPath.reduce<ExperimentReportStaticEntry | null>((staticEntry, childId) => (staticEntry?.children[childId] ?? null), props.reportInfo.rootStaticEntry);
  let occurences = (staticEntry?.occurences ?? []);

  let [events, setEvents] = useState<ExperimentReportEvents | null>(null);
  let [selectedOccurenceIndex, setSelectedOccurenceIndex] = useState<number | null>((occurences.length > 0) ? 0 : null);

  let globalContext: GlobalContext = {
    app: props.app,
    host: props.host,
    pool
  };

  useEffect(() => {
    pool.add(async () => {
      let events = await props.host.client.request({
        type: 'getExperimentReportEvents',
        eventIndices: occurences.flat(),
        experimentId: props.experiment.id
      });

      setEvents(events);
    });
  }, []);

  let location = events && (selectedOccurenceIndex !== null)
    ? events[occurences[selectedOccurenceIndex][0]].location
    : null;

  let blockAnalysis = analyzeBlockPath(props.protocol, location, null, props.blockPath, globalContext);

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
          <div>Occurences</div>
          <div>
            {events && (
              <StaticSelect
                options={[
                  { id: null, label: 'General form' },
                  ...occurences.map(([startEventIndex, endEventIndex], occurenceIndex) => {
                    let startEvent = events![startEventIndex];
                    let endEvent = events![endEventIndex];

                    return {
                      id: occurenceIndex,
                      label: formatDateOrTimePair(startEvent.date, endEvent.date, props.reportInfo.startDate, { display: 'time', format: 'text' })
                    };
                  })
                ]}
                selectedOptionId={selectedOccurenceIndex}
                selectOption={(occurenceIndex) => void setSelectedOccurenceIndex(occurenceIndex)}>
                {(() => {
                  if (selectedOccurenceIndex === null) {
                    return 'General form';
                  }

                  let occurence = occurences[selectedOccurenceIndex];
                  let startEvent = events![occurence[0]];
                  let endEvent = events![occurence[1]];

                  return (
                    <>
                      {formatDateOrTimePair(startEvent.date, endEvent.date, props.reportInfo.startDate, { display: 'time', format: 'react' })} (
                      {formatDateOrTimePair(startEvent.date, endEvent.date, props.reportInfo.startDate, { display: 'date', format: 'react' })})
                    </>
                  );
                })()}
                <Icon name="height" />
              </StaticSelect>
            )}
          </div>
        </div>

        {events && (
          <>
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

                  let features = blockImpl.createFeatures?.(pair.block, pair.location, descendantPairs, globalContext) ?? [];

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
          </>
        )}
      </div>
    </div>
  );
}
