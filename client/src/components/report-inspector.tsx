import { Experiment, ExperimentReportEventIndex, ExperimentReportEvents, ExperimentReportInfo, ExperimentReportStaticEntry, Protocol, ProtocolBlockPath } from 'pr1-shared';
import { Fragment, useEffect, useState } from 'react';

import spotlightStyles from '../../styles/components/spotlight.module.scss';

import { Range } from 'immutable';
import { Application } from '../application';
import { formatDateOrTimePair } from '../format';
import { Host } from '../host';
import { GlobalContext } from '../interfaces/plugin';
import { Feature, FeatureGroups, FeatureList, FeatureRoot } from '../libraries/features';
import { analyzeBlockPath, getBlockImpl } from '../protocol';
import { usePool } from '../util';
import { DiscreteSlider } from './discrete-slider';
import { ErrorBoundary } from './error-boundary';
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
  let [selection, setSelection] = useState<{
    eventIndex: ExperimentReportEventIndex;
    occurenceIndex: number;
  } | null>(
    (occurences.length > 0)
      ?  {
        eventIndex: occurences[0][0],
        occurenceIndex: 0
      }
      : null
  );
  // } | null>((occurences.length > 0) ? 0 : null);
  // let [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  let globalContext: GlobalContext = {
    app: props.app,
    host: props.host,
    pool
  };

  useEffect(() => {
    pool.add(async () => {
      let events = await props.host.client.request({
        type: 'getExperimentReportEvents',
        eventIndices: occurences.flatMap((occurence) => Range(occurence[0], occurence[1]).toArray() as ExperimentReportEventIndex[]),
        experimentId: props.experiment.id
      });

      setEvents(events);
    });
  }, []);

  let location = events && (selection !== null)
    ? events[selection.eventIndex].location
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
                    let lastEvent = events![(endEventIndex - 1) as ExperimentReportEventIndex];

                    return {
                      id: (occurenceIndex as ExperimentReportEventIndex),
                      label: formatDateOrTimePair(startEvent.date, lastEvent.date, props.reportInfo.startDate, { display: 'time', format: 'text' })
                    };
                  })
                ]}
                selectedOptionId={selection?.occurenceIndex ?? null}
                selectOption={(occurenceIndex) => void setSelection(
                  (occurenceIndex !== null)
                    ? {
                      occurenceIndex,
                      eventIndex: occurences[occurenceIndex][0]
                    }
                    : null
                )}>
                {(() => {
                  if (selection === null) {
                    return 'General form';
                  }

                  let occurence = occurences[selection.occurenceIndex];
                  let startEvent = events![occurence[0]];
                  let lastEvent = events![(occurence[1] - 1) as ExperimentReportEventIndex];

                  return (
                    <>
                      {formatDateOrTimePair(startEvent.date, lastEvent.date, props.reportInfo.startDate, { display: 'time', format: 'react' })} (
                      {formatDateOrTimePair(startEvent.date, lastEvent.date, props.reportInfo.startDate, { display: 'date', format: 'react' })})
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
                  {leafBlockImpl.createFeatures!(leafPair.block, leafPair.location, [], globalContext).map((feature, featureIndex) => (
                    <Feature feature={{ ...feature, accent: true }} key={feature.id ?? featureIndex} />
                  ))}
                </FeatureList>
              </FeatureRoot>
            )}

            {leafBlockImpl.Component && (
              <ErrorBoundary>
                <leafBlockImpl.Component
                  block={leafPair.block}
                  context={null}
                  location={leafPair.location} />
              </ErrorBoundary>
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
      {events && (selection !== null) && (() => {
        let [startEventIndex, endEventIndex] = occurences[selection.occurenceIndex];
        let startEvent = events[startEventIndex];
        let lastEvent = events[(endEventIndex - 1) as ExperimentReportEventIndex];

        return (
          <DiscreteSlider
            currentItemIndex={selection.eventIndex - startEventIndex}
            items={Range(startEventIndex, endEventIndex).toArray().map((eventIndex_) => {
              let eventIndex = eventIndex_ as ExperimentReportEventIndex;
              let event = events![eventIndex];

              return {
                // label: formatDateOrTime(events![startEventIndex + index].date, props.reportInfo.startDate, { display: 'time', format: 'text' }),
                label: eventIndex.toString(),
                position: (event.date - startEvent.date) / (lastEvent.date - startEvent.date)
              };
            })}
            setCurrentItemIndex={(itemIndex) => {
              setSelection((selection) => selection && {
                ...selection,
                eventIndex: (startEventIndex + itemIndex) as ExperimentReportEventIndex
              });
            }} />
        );
      })()}
    </div>
  );
}
