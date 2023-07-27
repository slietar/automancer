import * as d3 from 'd3';
import * as fc from 'd3fc';
import { Button, Form, Icon, StaticSelect, ureg, util } from 'pr1';
import { Component, ReactNode, createElement, createRef, useEffect, useRef, useState } from 'react';
import { OrdinaryId } from 'pr1-shared';

import styles from '../styles.module.scss';

import { BaseNode, BooleanValue, Context, EnumValue, ExecutorState, NodePath, NodeState, NullableValue, NumericNodeSpec, ValueEvent, ValueNode, namespace } from '../types';
import { isValueNode } from '../util';
import { NumericValue } from '../types';


export interface WindowOption {
  label: string;
  value: number;
}

export const ChartWindowOptions: WindowOption[] = [
  { label: '1 sec', value: 1e3 },
  { label: '10 sec', value: 10e3 },
  { label: '1 min', value: 60e3 },
  { label: '10 min', value: (10 * 60e3) }
];



export interface NodeDetailProps {
  context: Context;
  executor: ExecutorState;
  node: BaseNode;
  nodePath: NodePath;
  nodeState: NodeState;
}

export interface NodeDetailState {
  chartReady: boolean;
  chartWindowOption: WindowOption;

  numericRawTargetValue: {
    input: string;
    unit: number;
  } | null;
}

export class NodeDetail extends Component<NodeDetailProps, NodeDetailState> {
  private chart: any;
  private data: [number, number][] = [];
  private chartRenderId: number | null = null;
  private refChart = createRef<HTMLDivElement>();

  private previousDisplayWindow = 0;
  private minSampleCount = 4;
  private storageWindow = 30 * 60e3;

  constructor(props: NodeDetailProps) {
    super(props);

    this.state = {
      chartReady: false,
      chartWindowOption: ChartWindowOptions[1],
      numericRawTargetValue: null
    };

    let xScale = d3.scaleLinear();
    let yScale = d3.scaleLinear();

    let series1 = fc
      .seriesWebglLine()
      .mainValue((d) => d[1])
      .crossValue((d) => d[0])
      .decorate((program, data) => {
        fc.webglStrokeColor()
          .value((_, i) => [0x00 / 0xff, 0x74 / 0xff, 0xd9 / 0xff, 1])
          .data(data)(program);
      });

    this.chart = fc
      .chartCartesian(xScale, yScale)
      .webglPlotArea(
        fc.seriesWebglMulti()
          .series([series1])
          .mapping((data, index, series) => data)
      );
  }

  override componentDidUpdate(prevProps: Readonly<NodeDetailProps>, prevState: Readonly<NodeDetailState>, snapshot?: any) {
    if (isValueNode(this.props.node) && (this.props.node.spec.type === 'numeric') && (this.props.nodeState.value?.value?.type === 'default')) {
      let newTime = this.props.nodeState.value.time;
      let newValue = this.props.nodeState.value.value.value.magnitude;

      if ((this.data.length < 1) || (newTime !== this.data.at(-1)[0])) {
        this.data.push([newTime, newValue]);
        this.controlChartRender();
      }
    }

    if (this.state.chartReady && !prevState.chartReady) {
      let render = () => {
        this.renderChart();
        this.chartRenderId = requestAnimationFrame(render);
      };

      this.chartRenderId = requestAnimationFrame(render);
    }
  }

  override componentWillUnmount() {
    this.cancelChartRender();
  }

  cancelChartRender() {
    if (this.chartRenderId !== null) {
      cancelAnimationFrame(this.chartRenderId);
      this.chartRenderId = null;
    }
  }

  controlChartRender() {
    let now = Date.now();

    let sliceIndex = this.data.findIndex(([time, value]) => time > (now - this.storageWindow));
    this.data.splice(0, (sliceIndex >= 0) ? (sliceIndex - 1) : this.data.length);

    if (this.data.length >= this.minSampleCount) {
      if (!this.state.chartReady) {
        this.setState({ chartReady: true });
      }
    } else {
      if (this.state.chartReady) {
        this.setState({ chartReady: false });
        this.cancelChartRender();
      }
    }
  }

  renderChart() {
    let displayWindow = this.state.chartWindowOption.value;

    let now = Date.now();
    let data = this.data.map(([time, value]) => [(time - now), value]);

    let firstIncludedIndex = data.findIndex(([delta, value]) => -delta < displayWindow);
    data = (firstIncludedIndex >= 0)
      ? data.slice(Math.max(0, firstIncludedIndex - 1))
      : [];

    let values = data.map(([delta, value]) => value);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    let diff = maxValue - minValue;

    minValue -= diff * 0.05;
    maxValue += diff * 0.05;

    this.chart
      .yDomain([minValue, maxValue])
      // .yTickFormat((value, index) => `${value.toFixed(2)} MB`);


    if (displayWindow !== this.previousDisplayWindow) {
      this.previousDisplayWindow = displayWindow;

      this.chart
        .xDomain([-displayWindow, 0])
        .xTickFormat((delta: number) => {
          let minutes = Math.floor(-delta / 60e3);
          let seconds = Math.round((-delta - minutes * 60e3) / 1e3);

          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        });
    }


    d3.select(this.refChart.current!)
      .datum(data)
      .call(this.chart);
  }

  override render() {
    let { node, nodePath, nodeState } = this.props;

    let owner = nodeState.writer?.owner ?? null;
    let owned = (owner?.type === 'user');
    // (owner?.type === 'client') && (owner.clientId === this.props.context.host.clientId);

    return (
      <div className={styles.detailRoot} key={nodePath.join('.')}>
        <div className={styles.detailContents}>
          <div className={styles.detailHeaderRoot}>
            <div className={styles.detailHeaderTitle}>
              <h1 className={styles.detailHeaderLabel}>{node.label ?? node.id}</h1>
              <p className={styles.detailHeaderDescription}>{node.description ?? ' '}</p>
            </div>
            <div className={styles.detailHeaderActions}>
              {nodeState.writer && (
                <Button onClick={() => {
                  this.props.context.pool.add(async () => {
                    await this.props.context.requestToExecutor({
                      type: (owned ? 'release' : 'claim'),
                      nodePath: nodePath.toJS()
                    });
                  });
                }}>{owned ? 'Release' : 'Claim'}</Button>
              )}
              {/* <Button onClick={() => {}}>Pin</Button> */}
            </div>
          </div>
          <div className={styles.detailInfoRoot}>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Full name</div>
              <div className={styles.detailInfoValue}>
                <code>{nodePath.join('.')}</code>
              </div>
            </div>
            <div className={styles.detailInfoEntry}>
              <div className={styles.detailInfoLabel}>Status</div>
              <div className={styles.detailInfoValue}>
                {nodeState.connected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
            {nodeState.writer && (
              <div className={styles.detailInfoEntry}>
                <div className={styles.detailInfoLabel}>Current user</div>
                <div className={styles.detailInfoValue}>{(() => {
                  if (!owner) {
                    return '\u2013';
                  }

                  switch (owner.type) {
                    case 'master':
                      let experiment = this.props.context.host.state.experiments[owner.experimentId];
                      return `Experiment ${experiment.title}`;
                    case 'user':
                      return 'Manual control';
                    default:
                      return '[Unknown]';
                  }
                })()}</div>
              </div>
            )}
            {/* <div className={styles.detailConnectionRoot}>
                      <div className={styles.detailConnectionStatus}>
                        <Icon name="error" style="sharp" />
                        <div>Disconnected</div>
                      </div>
                      <p className={styles.detailConnectionMessage}>The device is disconnected.</p>
                    </div> */}
          </div>
          {/* <div className={styles.detailChartRoot}>
            <div className={styles.detailChartToolbar}>
              <StaticSelect
                options={ChartWindowOptions}
                selectOption={(chartWindowOption) => void this.setState({ chartWindowOption })}
                selectedOption={this.state.chartWindowOption}>
                Window: {this.state.chartWindowOption.label}
              </StaticSelect>
            </div>
            <div className={styles.detailChartContainer}>
              {this.state.chartReady
                ? (
                  <div className={styles.detailChartContents} ref={this.refChart} key={0} />
                )
                : (
                  <div className={styles.detailChartPlaceholder} key={1}>
                    <p>Gathering samples...</p>
                  </div>
                )}
            </div>
          </div> */}
          {isValueNode(node) && (
            <div className={styles.detailValues}>
              <div className={styles.detailValueRoot}>
                <div className={styles.detailValueLabel}>{nodeState.connected ? 'Current value' : 'Last known value'}</div>
                <div className={styles.detailValueQuantity}>
                  {(() => {
                    let spec = node.spec;
                    let lastValueEvent = nodeState.lastValueEvent;

                    let magnitude: ReactNode;
                    let unit: ReactNode | null = null;

                    if (!lastValueEvent?.value) {
                      // The value is unknown.
                      magnitude = '\u2013';
                    } else if (lastValueEvent.value.type === 'null') {
                      // The device is disabled.
                      magnitude = '[disabled]';
                    } else {
                      switch (spec.type) {
                        case 'boolean': {
                          magnitude = (lastValueEvent.value.innerValue as BooleanValue) ? 'On' : 'Off';
                          break;
                        }

                        case 'enum': {
                          let enumValue = lastValueEvent.value.innerValue as EnumValue;
                          let enumCase = spec.cases.find((specCase) => (specCase.id === enumValue))!;
                          magnitude = enumCase.label;

                          break;
                        }

                        case 'numeric': {
                          let joint;

                          [magnitude, joint, unit] = ureg.formatQuantityAsReact((lastValueEvent.value.innerValue as NumericValue).magnitude, spec.resolution ?? 0, ureg.deserializeContext(spec.context), {
                            createElement,
                            sign: (spec.range && spec.range[0] < 0),
                            style: 'symbol'
                          });

                          break;
                        }

                        default: {
                          magnitude = '[unknown]';
                          break;
                        }
                      }
                    }

                    return (
                      <>
                        <div className={styles.detailValueMagnitude}>{magnitude}</div>
                        {unit && <div className={styles.detailValueUnit}>{unit}</div>}
                      </>
                    );
                  })()}
                </div>
              </div>
              {node.writable && (
                <div className={styles.detailValueRoot}>
                  <div className={styles.detailValueLabel}>Target value</div>
                  {(() => {
                    let targetValueEvent = nodeState.writer!.targetValueEvent;

                    let setValue = <T,>(value: NullableValue<T>) => {
                      this.props.context.pool.add(async () => {
                        this.props.context.requestToExecutor({
                          type: 'write',
                          nodePath: nodePath.toJS(),
                          value
                        });
                      });
                    };

                    switch (node.spec.type) {
                      case 'boolean': {
                        let currentValueId = (targetValueEvent?.value?.type === 'default')
                          ? ((targetValueEvent.value.innerValue as boolean) ? 1 : 0)
                          : null;

                        return (
                          <Form.UncontrolledSelect
                            onInput={(value) => void setValue<BooleanValue>(
                              (value !== null)
                                ? { type: 'default', innerValue: [false, true][value] }
                                : { type: 'null' }
                            )}
                            options={[
                              ...((currentValueId === null) || node.nullable
                                ? [{
                                  id: null,
                                  label: '\u2013'
                                }]
                                : []),
                              { id: 0,
                                label: 'Off' },
                              { id: 1,
                                label: 'On' }
                            ]}
                            value={currentValueId} />
                        );
                      }

                      case 'numeric':
                        return (
                          <NumericValueEditor
                            node={node}
                            nodeState={nodeState}
                            setValue={setValue<NumericValue>} />
                        );

                      case 'enum': {
                        let currentValueId = (targetValueEvent?.value?.type === 'default')
                          ? (targetValueEvent.value.innerValue as OrdinaryId)
                          : null;

                        return (
                          <Form.UncontrolledSelect
                            onInput={(value) => void setValue<EnumValue>(
                              (value !== null)
                                ? { type: 'default', innerValue: value }
                                : { type: 'null' }
                            )}
                            options={[
                              ...((currentValueId === null) || node.nullable
                                ? [{
                                  id: null,
                                  label: '\u2013'
                                }]
                                : []),
                              ...node.spec.cases.map((specCase) => ({
                                id: specCase.id,
                                label: (specCase.label ?? specCase.id.toString())
                              }))
                            ]}
                            value={currentValueId} />
                        );
                      }
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}


const MINUS_CLUSTER = '\u2212\u2009'; // &minus;&thinsp;

function NumericValueEditor(props: {
  node: ValueNode;
  nodeState: NodeState;
  setValue(value: NullableValue<NumericValue>): void;
}) {
  let [rawValue, setRawValue] = useState<{
    input: string;
    optionIndex: number;
  } | null>(null);
  let [projectedValueEvent, setProjectedValueEvent] = useState<ValueEvent | null>(null);
  let refInput = useRef<HTMLInputElement>(null);

  let spec = props.node.spec as NumericNodeSpec;
  let writer = props.nodeState.writer!;
  let range = spec.range!;

  let unitOptions = ureg.filterRangeCompositeUnitFormats(
    range[0],
    range[1],
    ureg.deserializeContext(spec.context),
    { resolution: (spec.resolution ?? 0),
      system: 'SI' }
  ).map((option, index) => ({
    id: index,
    label: ureg.formatAssemblyAsText(option.assembly),
    value: option
  }));

  let selectActive = rawValue && (unitOptions.length > 1);


  useEffect(() => {
    if (!rawValue) {
      refInput.current!.blur();
    }
  }, [rawValue]);


  let currentTargetValueEvent = (writer.targetValueEvent && projectedValueEvent)
    ? ((writer.targetValueEvent.time > projectedValueEvent.time)
      ? writer.targetValueEvent
      : projectedValueEvent)
    : (writer.targetValueEvent ?? projectedValueEvent);

  let currentTargetValue = (currentTargetValueEvent?.value?.type === 'default')
    ? (currentTargetValueEvent.value.innerValue as NumericValue).magnitude
    : null;

  let currentMagnitude: string;
  let currentOptionIndex: number;

  if (currentTargetValue !== null) {
    let context = ureg.deserializeContext(spec.context);
    let variant = ureg.findVariant(ureg.getContext(context), { system: 'SI' });
    let currentOption = ureg.findBestVariantOption(currentTargetValue, variant);

    currentMagnitude = ureg.formatMagnitude(currentTargetValue, (spec.resolution ?? 0), currentOption);
    currentOptionIndex = unitOptions.findIndex((option) => (option.value.value === currentOption.value));
  } else {
    currentMagnitude = '\u2013';
    currentOptionIndex = 0;
  }


  let floatValue: number | null = null;
  let floatValueInRange = false;

  if (rawValue) {
    let strValue = rawValue.input.replaceAll(MINUS_CLUSTER, '-');

    if (/^-?\d+(?:\.\d+)?$/.test(strValue)) {
      floatValue = ureg.applyOption(parseFloat(strValue), unitOptions[rawValue.optionIndex].value);
      floatValueInRange = (floatValue >= range[0]) && (floatValue <= range[1]);
    }
  }


  let trySubmitValue = () => {
    if ((floatValue !== null) && floatValueInRange) {
      let value: NullableValue<NumericValue> = {
        type: 'default',
        innerValue: {
          magnitude: floatValue
        }
      };

      props.setValue(value);

      setRawValue(null);
      setProjectedValueEvent({
        time: (currentTargetValueEvent?.time ?? 0),
        value
      });
    }
  };


  return (
    <>
      <div className={util.formatClass(styles.detailValueQuantity, { '_active': rawValue })}>
        <div className={styles.detailValueBackground}>
          {rawValue?.input.replaceAll(' ', '\xa0') ?? currentMagnitude}
        </div>
        <input
          type="text"
          className={styles.detailValueMagnitude}
          spellCheck={false}
          value={rawValue?.input ?? currentMagnitude}
          onFocus={(event) => {
            if (!rawValue) {
              event.currentTarget.select();

              setRawValue({
                input: (currentTargetValue !== null)
                  ? currentMagnitude
                  : '',
                optionIndex: currentOptionIndex
              });
            }
          }}
          onInput={(event) => {
            let el = event.currentTarget;
            let value = el.value;

            let selectionStart = event.currentTarget.selectionStart;
            let selectionEnd = event.currentTarget.selectionEnd;

            let normalized = normalizeStringWithClusters(value, { '-': MINUS_CLUSTER }, [selectionStart ?? 0, selectionEnd ?? 0]);

            el.value = normalized.string;

            if (selectionStart !== null) {
              el.selectionStart = normalized.positions[0];
              el.selectionEnd = (selectionEnd !== null)
                ? normalized.positions[1]
                : el.selectionStart;
            }

            setRawValue((rawValue) => ({
              ...rawValue!,
              input: normalized.string
            }));
          }}
          onKeyDown={(event) => {
            event.stopPropagation();

            if (event.key === 'Escape') {
              setRawValue(null);
            }

            if (event.key === 'Enter') {
              trySubmitValue();
            }
          }}
          ref={refInput} />
        <div className={styles.detailValueRight}>
          <StaticSelect
            disabled={!selectActive}
            options={unitOptions}
            rootClassName={styles.detailValueUnitSelectRoot}
            selectOption={(optionId) => void setRawValue({ ...rawValue!, optionIndex: optionId })}
            selectedOptionId={rawValue?.optionIndex ?? 0}
            selectionClassName={styles.detailValueUnitSelectSelection}>
            <div className={styles.detailValueUnit}>{ureg.formatAssemblyAsReact(unitOptions[rawValue?.optionIndex ?? currentOptionIndex].value.assembly, { createElement })}</div>
            {selectActive && <Icon name="height" className={styles.detailValueUnitSelectIcon} />}
          </StaticSelect>
        </div>
      </div>
      {rawValue && (() => {
        let error: ReactNode | null = null;

        if (floatValue !== null) {
          if (!floatValueInRange) {
            error = (
              <>
                The target value must be in the range {ureg.formatRangeAsReact(range[0], range[1], (spec.resolution ?? 0), ureg.deserializeContext(spec.context), { createElement })}.
              </>
            );
          }
        } else {
          error = 'This value is not valid.';
        }

        return (
          <>
            <div className={styles.detailValueActions}>
              <Button
                shortcut="Escape"
                onClick={() => {
                  setRawValue(null);
                }}>
                Cancel
              </Button>
              <Button
                disabled={error}
                shortcut="Enter"
                onClick={() => {
                  trySubmitValue();
                }}>
                Confirm
              </Button>
            </div>
            <p className={styles.detailValueError}>{error}</p>
          </>
        );
      })()}

      {props.node.nullable && (writer.targetValueEvent?.value?.type !== 'null') && !rawValue && (
        <div className={styles.detailValueActions}>
          <Button onClick={() => {
            props.setValue({ type: 'null' });
          }}>Disable</Button>
        </div>
      )}
    </>
  );
}


function normalizeStringWithClusters(string: string, clusters: Record<string, string>, positions: number[]) {
  let outputPositions = Array.from(positions);
  let outputString = '';

  let specialChars = new Set(Object.values(clusters).flatMap((clusterValue) => clusterValue.split('')));

  outer:
  for (let charIndex = 0; charIndex < string.length;) {
    let char = string[charIndex];

    for (let [clusterChar, clusterValue] of Object.entries(clusters)) {
      if (string.startsWith(clusterValue, charIndex)) {
        charIndex += clusterValue.length;
        outputString += clusterValue;
        continue outer;
      }

      if (char === clusterChar) {
        charIndex += 1;
        outputString += clusterValue;

        for (let [positionIndex, position] of positions.entries()) {
          if (position >= charIndex) {
            outputPositions[positionIndex] += (clusterValue.length - 1);
          }
        }

        continue outer;
      }
    }

    if (specialChars.has(char)) {
      for (let [positionIndex, position] of positions.entries()) {
        if (position > charIndex) {
          outputPositions[positionIndex] -= 1;
        }
      }
    } else {
      outputString += char;
    }

    charIndex += 1;
  }

  return {
    positions: outputPositions,
    string: outputString
  };
}
