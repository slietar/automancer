import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';

import { formatClass } from '../util';


export function DiscreteSlider(props: {
  currentItemIndex: number;
  items: { // Sorted by position
    label: ReactNode;
    position: number;
  }[];
  setCurrentItemIndex(index: number): void;
}) {
  let [moving, setMoving] = useState(false);
  let [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);

  let refCursor = useRef<HTMLDivElement>(null);
  let refTrack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moving) {
      let controller = new AbortController();

      document.body.addEventListener('mousemove', (event) => {
        event.preventDefault();

        let trackRect = refTrack.current!.getBoundingClientRect();
        let progress = (event.clientX - trackRect.left) / trackRect.width;

        if (progress < 0) {
          props.setCurrentItemIndex(0);
        } else if (progress > 1) {
          props.setCurrentItemIndex(props.items.length - 1);
        } else {
          props.setCurrentItemIndex(props.items.findIndex((item, itemIndex) => {
            let nextItem = props.items[itemIndex + 1];
            return !nextItem || (progress < (item.position + nextItem.position) * 0.5);
          }));
        }

        document.body.style.setProperty('cursor', 'col-resize');
      }, { signal: controller.signal });

      document.body.addEventListener('mouseup', (event) => {
        event.preventDefault();
        setMoving(false);
      }, { signal: controller.signal });

      document.body.addEventListener('mouseleave', () => {
        setMoving(false);
      }, { signal: controller.signal });

      controller.signal.addEventListener('abort', () => {
        document.body.style.removeProperty('cursor');
      });

      return () => void controller.abort();
    } else {
      return () => {};
    }
  }, [moving]);

  let currentItem = props.items[props.currentItemIndex];

  return (
    <div className={formatClass('DiscreteSlider', { '_active': moving })}>
      <div className="contents">
        <div className="track" ref={refTrack}>
          {props.items.map((item, itemIndex) => (
            <div
              className="marker"
              style={{ '--progress': item.position.toFixed(3) } as CSSProperties}
              onMouseDown={(event) => {
                event.preventDefault();

                props.setCurrentItemIndex(itemIndex);
                refCursor.current!.focus();
              }}
              onMouseEnter={() => {
                setHoveredItemIndex(itemIndex);
              }}
              onMouseLeave={() => {
                setHoveredItemIndex(null);
              }}
              key={itemIndex}>
                <div className="inner" />
            </div>
          ))}
          <div
            className="cursor"
            style={{ '--progress': currentItem.position.toFixed(3) } as CSSProperties}
            tabIndex={-1}
            onKeyDown={(event) => {
              switch (event.key) {
                case 'ArrowLeft':
                  props.setCurrentItemIndex(Math.max(props.currentItemIndex - 1, 0));
                  break;
                case 'ArrowRight':
                  props.setCurrentItemIndex(Math.min(props.currentItemIndex + 1, props.items.length - 1));
                  break;
                default:
                  return;
              }
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={() => {
              setMoving(true);
            }}
            ref={refCursor} />
        </div>
      </div>
      <div className="description">
        {(hoveredItemIndex !== null) && !moving
          ? props.items[hoveredItemIndex].label
          : currentItem.label}
      </div>
    </div>
  );
}
