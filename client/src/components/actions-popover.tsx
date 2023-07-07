import {
  FloatingArrow,
  FloatingFocusManager,
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole
} from '@floating-ui/react';
import { OrdinaryId } from 'pr1-shared';
import { useRef, useState } from 'react';

import { Icon } from './icon';


export interface ActionsPopoverAction {
  id: OrdinaryId;
  disabled?: unknown;
  icon?: string;
  label: string;
}


export function ActionsPopover(props: {
  actions: ActionsPopoverAction[];
}) {
  let [isOpen, setIsOpen] = useState(false);
  let arrowRef = useRef(null);

  let { refs, floatingStyles, context } = useFloating({
    middleware: [
      offset({
        alignmentAxis: -10,
        mainAxis: 10
      }),
      flip(),
      shift({
        padding: 12
      }),
      arrow({
        element: arrowRef,
        padding: 0
      }),
    ],
    onOpenChange: (open) => void setIsOpen(open && (!('enabled' in props) || !!props.enabled)),
    open: isOpen,
    placement: 'bottom',
    whileElementsMounted: autoUpdate
  });

  let { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context)
  ]);

  return (
    <>
      <button className="PopoverTarget" ref={refs.setReference} {...getReferenceProps()}>
        <Icon name="more_horiz" />
      </button>
      {isOpen && (
        <FloatingFocusManager context={context} modal={false}>
          <div
            className="Popover"
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {/* <div className="arrow" ref={arrowRef} /> */}
            <FloatingArrow
              className="arrow"
              context={context}
              fill="#fff"
              stroke="#ccc"
              strokeWidth={1}
              ref={arrowRef} />

            <div className="title">Actions</div>
            <div className="actions">
              <button type="button" className="item">
                <div className="text">Delete</div>
                <div className="shortcut">D</div>
              </button>
              <button type="button" className="item">
                <div className="text">Duplicate</div>
                <div className="shortcut">L</div>
              </button>
            </div>
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}
