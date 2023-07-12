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
  // let [currentItemIndex, setCurrentItemIndex] = useState(props.currentItemIndex);
  let [moving, setMoving] = useState(false);
  let refTrack = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moving) {
      let controller = new AbortController();

      document.body.addEventListener('mousemove', (event) => {
        event.preventDefault();
        document.body.style.setProperty('cursor', 'col-resize');

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
      }, { signal: controller.signal });

      document.body.addEventListener('mouseup', (event) => {
        event.preventDefault();

        document.body.style.removeProperty('cursor');
        setMoving(false);
      }, { signal: controller.signal });

      document.body.addEventListener('mouseleave', () => {
        setMoving(false);
      }, { signal: controller.signal });

      return () => void controller.abort();
    } else {
      return () => {};
    }
  }, [moving]);

  let currentItem = props.items[props.currentItemIndex];

  // console.log(props.items);
  // console.log(props.currentItemIndex);

  return (
    <div className={formatClass('DiscreteSlider', { '_active': moving })}>
      <div className="track" ref={refTrack}>
        {props.items.map((item, index) => (
          <div className="marker" key={index} style={{ '--progress': item.position.toFixed(3) } as CSSProperties} />
        ))}
        <div className="cursor" style={{ '--progress': currentItem.position.toFixed(3) } as CSSProperties}
          onMouseDown={() => {
            setMoving(true);
          }} />
      </div>
    </div>
  );
}
