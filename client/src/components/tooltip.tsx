import {
  Placement,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import { PropsWithChildren, ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';


export function Tooltip(props: PropsWithChildren<{
  contents: ReactNode;
  enabled?: unknown;
  placement?: Placement;
}>) {
  let [isOpen, setIsOpen] = useState(false);

  let { refs, floatingStyles, context } = useFloating({
    middleware: [offset(10), flip(), shift()],
    onOpenChange: (open) => void setIsOpen(open && (!('enabled' in props) || !!props.enabled)),
    open: isOpen,
    placement: (props.placement ?? 'bottom'),
    whileElementsMounted: autoUpdate
  });

  let hover = useHover(context, { move: false });
  let focus = useFocus(context);
  let dismiss = useDismiss(context);
  let role = useRole(context, { role: 'tooltip' });

  let { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  useEffect(() => {
    if (!props.enabled) {
      setIsOpen(false);
    }
  }, [props.enabled]);

  return (
    <>
      {/* <button ref={refs.setReference} {...getReferenceProps()}>
        Reference element
      </button> */}
      <div className="TooltipTarget" ref={refs.setReference} {...getReferenceProps()}>
        {props.children}
        {/* Text */}
      </div>
      {isOpen && createPortal((
        <div
          className="Tooltip"
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
        >
          <div className="core">
            <div className="text">{props.contents}</div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
