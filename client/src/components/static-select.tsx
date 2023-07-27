import { OrdinaryId } from 'pr1-shared';
import { PropsWithChildren, ReactNode } from 'react';

import styles from '../../styles/components/static-select.module.scss';

import { formatClass } from '../util';


export function StaticSelect<T extends OrdinaryId | null>(props: PropsWithChildren<{
  disabled?: unknown;
  options: {
    id: T;
    label: string;
  }[];
  rootClassName?: string;
  selectedOptionId: T;
  selectionClassName?: string;
  selectOption?(optionId: T): void;
}>) {
  let selectedOption = props.options.find((option) => (option.id === props.selectedOptionId))!;

  return (
    <div className={formatClass(styles.root, props.rootClassName)}>
      <div className={props.selectionClassName}>{props.children ?? selectedOption.label}</div>
      <select
        disabled={!!props.disabled}
        value={props.options.findIndex((option) => (option.id === props.selectedOptionId))}
        onInput={(event) => {
          let optionIndex = parseInt(event.currentTarget.value);
          props.selectOption?.(props.options[optionIndex].id);
        }}>
        {props.options.map((option, optionIndex) => (
          <option value={optionIndex} key={optionIndex}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
