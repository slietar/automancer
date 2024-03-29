import { PropsWithChildren, ReactNode, useEffect, useRef, useState } from 'react';


export function ExpandableText(props: PropsWithChildren<{
  expandedValue?: ReactNode;
}>) {
  let [width, setWidth] = useState<number | null>(null);
  let ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rect = ref.current!.getBoundingClientRect();
    setWidth(rect.width);
  }, []);

  return !width
    ? (
      <div className="ExpandableText _expanded" style={{ display: 'inline-block' }} ref={ref}>{props.expandedValue ?? props.children}</div>
    )
    : (
      <div className="ExpandableText" style={{ display: 'inline-block', width: `${width}px` }}>{props.children}</div>
    );
}
