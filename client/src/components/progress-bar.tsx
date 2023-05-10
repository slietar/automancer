import * as React from 'react';
import { ReactNode, createRef } from 'react';

import styles from '../../styles/components/progress-bar.module.scss';

import * as util from '../util';


export interface ProgressBarProps {
  description?(selectValue: number | null): ReactNode;
  endDate?: number | null;
  paused?: unknown;
  setValue?(newValue: number): void;
  value: number;
}

export interface ProgressBarState {
  selectValue: number | null;
}

export class ProgressBar extends React.Component<ProgressBarProps, ProgressBarState> {
  private animation: {
    obj: Animation;
    startDate: number;
  } | null = null;
  private ref = createRef<HTMLDivElement>();

  constructor(props: ProgressBarProps) {
    super(props);

    this.state = {
      selectValue: null
    };
  }

  override componentDidMount() {
    this.updateAnimation();
  }

  override componentDidUpdate(prevProps: Readonly<ProgressBarProps>, prevState: Readonly<ProgressBarState>, snapshot?: any) {
    if (this.props.endDate !== prevProps.endDate) {
      // if (prevProps.endDate && this.animation && (prevProps !== this.props)) {
      if (false) {
        // this.updateAnimation(prevProps.value + (1 - prevProps.value) * (Date.now() - this.animation.startDate) / (prevProps.endDate - this.animation.startDate));
      } else {
        this.updateAnimation();
      }
    }
  }

  private updateAnimation(currentValue?: number) {
    if (this.animation) {
      this.animation.obj.cancel();
      this.animation = null;
    }

    if (this.props.endDate != null) {
      let nowDate = Date.now();
      let duration = (this.props.endDate - nowDate);

      if (duration > 0) {
        let obj = this.ref.current!.animate([
          { width: `${(currentValue ?? this.props.value) * 100}%` },
          { width: '100%' }
        ], {
          duration,
          fill: 'forwards'
        });

        this.animation = {
          obj,
          startDate: nowDate
        };
      }
    }
  }

  override render() {
    return (
      <div className={util.formatClass(styles.root, {
        '_paused': this.props.paused,
        '_writable': this.props.setValue
      })}>
        <div className={styles.outer}
          onMouseMove={this.props.setValue && ((event) => {
            let inner = event.currentTarget.firstChild as HTMLDivElement;
            let innerRect = inner.getBoundingClientRect();

            let value = (event.clientX - innerRect.x) / innerRect.width;
            value = Math.min(1, Math.max(0, value));

            this.setState({ selectValue: value });
          })}
          onMouseLeave={this.props.setValue && (() => {
            this.setState({ selectValue: null });
          })}
          onClick={this.props.setValue && (() => {
            this.props.setValue!(this.state.selectValue!);
          })}>
          <div className={styles.inner} />
          <div className={styles.progress} style={{ width: `${this.props.value * 100}%` }} ref={this.ref} />
          {(this.state.selectValue !== null) && (
            <div className={styles.select} style={{ width: `${this.state.selectValue * 100}%` }} />
          )}
        </div>
        {this.props.description?.(this.state.selectValue)}
      </div>
    )
  }
}
