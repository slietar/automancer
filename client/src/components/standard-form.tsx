import { OrdinaryId } from 'pr1-shared';

import formStyles from '../../styles/components/form.module.scss';

import { Icon } from './icon';

import { ShortcutGuide } from './shortcut-guide';
import { useEffect, useRef } from 'react';


export function Actions(props: React.PropsWithChildren<{
  mode?: 'both' | 'left' | 'right';
}>) {
  return (
    <div className={formStyles.actions} data-mode={props.mode}>
      {(props.mode !== 'both')
        ? <div>{props.children}</div>
        : props.children}
    </div>
  );
}

export function Action(props: {
  autoFocus?: unknown;
  disabled?: unknown;
  label: string;
  onClick?(): void;
  shortcut?: string;
  type?: 'button' | 'submit';
}) {
  let ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (props.autoFocus) {
      ref.current!.focus();
    }
  }, []);

  return (
    <button type={props.type ?? 'button'} disabled={!!props.disabled} className={formStyles.btn} onClick={props.onClick} ref={ref}>
      <ShortcutGuide shortcut={props.shortcut ?? ((props.type === 'submit') ? 'Enter' : null)}>{props.label}</ShortcutGuide>
    </button>
  );
}


export function Checkbox(props: React.PropsWithChildren<{
  checked?: unknown;
  disabled?: unknown;
  label: string;
  onInput?(value: boolean): void;
}>) {
  return (
    <label className={formStyles.fieldCheckbox}>
      <input type="checkbox" checked={!!props.checked} disabled={!!props.disabled} onChange={() => props.onInput?.(!props.checked)} />
      <div>{props.label}</div>
      {props.children}
    </label>
  );
}

export function CheckboxList(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className={formStyles.fieldControl}>
      <div className={formStyles.fieldLabel}>{props.label}</div>
      <div className={formStyles.fieldCheckboxlist}>
        {props.children}
      </div>
    </div>
  );
}

export function DurationField(props: React.PropsWithChildren<{
  label: string;
}>) {
  return (
    <div className="sform-group">
      <div className="sform-label">{props.label}</div>
      <div className="sform-durationfield">
        <label>
          <input type="text" placeholder="0" />
          <div>hrs</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>min</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>sec</div>
        </label>
        <label>
          <input type="text" placeholder="0" />
          <div>ms</div>
        </label>
      </div>
    </div>
  );
}

export function Form(props: React.PropsWithChildren<{
  onSubmit?(): void;
}>) {
  return props.onSubmit
    ? (
      <form onSubmit={props.onSubmit && ((event) => {
        event.preventDefault();
        props.onSubmit!();
      })}>
        {props.children}
      </form>
    )
    : (
      <div>
        {props.children}
      </div>
    );
}

export function Header(props: React.PropsWithChildren<{}>) {
  return (
    <div className="sform-header">{props.children}</div>
  );
}


export interface UncontrolledSelectProps<T extends OrdinaryId | null> {
  disabled?: unknown;
  onInput(value: T): void;
  options: {
    id: T;
    disabled?: unknown;
    label: string;
  }[];
  targetRef?: React.Ref<HTMLSelectElement>;
  value: T;
}

export function UncontrolledSelect<T extends OrdinaryId | null>(props: UncontrolledSelectProps<T>) {
  return (
    <div className={formStyles.fieldSelect}>
      <select
        disabled={!!props.disabled}
        value={props.options.findIndex((option) => option.id === props.value)}
        onInput={(event) => {
          let optionIndex = parseInt(event.currentTarget.value);
          props.onInput(props.options[optionIndex].id);
        }}
        ref={props.targetRef}>
        {props.options.map((option, optionIndex) =>
          <option value={optionIndex} disabled={!!option.disabled} key={option.id}>{option.label}</option>
        )}
      </select>
      <Icon name="expand_more" />
    </div>
  );
}

export function Select<T extends OrdinaryId | null>(props: UncontrolledSelectProps<T> & {
  label: string;
}) {
  return (
    <label className={formStyles.fieldControl}>
      <div className={formStyles.fieldLabel}>{props.label}</div>
      <UncontrolledSelect {...props} />
    </label>
  );
}


export function TextArea(props: {
  label: string;
  onBlur?(): void;
  onInput(value: string): void;
  placeholder?: string;
  targetRef?: React.Ref<HTMLTextAreaElement>;
  value: string;
}) {
  return (
    <label className="sform-group">
      <div className="sform-label">{props.label}</div>
      <textarea className="sform-textarea"
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        onInput={(event) => void props.onInput(event.currentTarget.value)}
        value={props.value}
        rows={3}
        ref={props.targetRef} />
    </label>
  );
}

export function TextField(props: {
  label: string;
  onBlur?(): void;
  onInput?(value: string): void;
  placeholder?: string;
  targetRef?: React.Ref<HTMLInputElement>;
  value: string;
}) {
  return (
    <label className={formStyles.fieldControl}>
      <div className={formStyles.fieldLabel}>{props.label}</div>
      <input
        type="text"
        className={formStyles.fieldTextfield}
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        onInput={props.onInput && ((event) => void props.onInput!(event.currentTarget.value))}
        readOnly={!props.onInput}
        disabled={!props.onInput}
        value={props.value}
        ref={props.targetRef} />
    </label>
  );
}
