import { EvaluableValue, Plugin, ProgressDisplayMode, TimeSensitive, TimedProgressBar, createProcessBlockImpl, formatDuration, formatEvaluable } from 'pr1';
import { PluginName, ProtocolBlockName } from 'pr1-shared';


export interface ProcessData {
  duration: EvaluableValue<number | null>;
}

export interface ProcessLocation {
  date: number | null;
  duration: number | null;
  progress: number;
}


export default {
  namespace: ('timer' as PluginName),
  blocks: {
    ['_' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, ProcessLocation>({
      Component(props) {
        if (props.location.duration === null) {
          return (
            <TimeSensitive
              contents={() => (
                <p>Time elapsed: {new Date().toString()}</p>
              )}
              interval={1000} />
          );
        }

        return (
          <TimedProgressBar
            date={props.location.date}
            duration={props.location.duration}
            setValue={(progress) => {
              props.context.pool.add(async () => {
                await props.context.sendMessage({
                  type: 'jump',
                  value: {
                    progress
                  }
                });
              });
            }}
            value={props.location.progress} />
        );
      },
      ReportComponent(props) {
        if (props.location.duration === null) {
          return null;
        }

        let progress = props.location.progress + (
          (props.location.date !== null)
            ? (props.eventDate - props.location.date) / (props.location.duration)
            : 0
        );

        return (
          <TimedProgressBar
            date={null}
            duration={props.location.duration}
            paused={props.location.date === null}
            value={progress} />
        );
      },
      createFeatures(data, location) {
        let formatInnerValue = (value: number | null) =>
          (value !== null)
            ? formatDuration(value)
            : 'Forever';

        return [{
          icon: 'hourglass_empty',
          label: location
            ? formatInnerValue(location.duration)
            : formatEvaluable(data.duration, formatInnerValue)
        }];
      },
      getLabel(data) {
        return 'Wait';
      }
    })
  },

  persistentStoreDefaults: {
    progressDisplayMode: ProgressDisplayMode.Fraction
  }
} satisfies Plugin<{
  progressDisplayMode: ProgressDisplayMode;
}>
