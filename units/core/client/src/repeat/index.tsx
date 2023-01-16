import { getBlockExplicitLabel, GraphRendererDefaultMetrics, GraphRenderer, NodeContainer, ProtocolBlock, ProtocolBlockPath, React, Unit } from 'pr1';


export interface Block extends ProtocolBlock {
  namespace: typeof namespace;
  state: null;

  child: ProtocolBlock;
  count: number;
}

export interface BlockMetrics extends GraphRendererDefaultMetrics {
  child: GraphRendererDefaultMetrics;
  label: string;
}

export interface Location {
  child: unknown;
  iteration: number;
}

export interface Point {
  child: unknown | null;
  iteration: number;
}

export interface State {
  child: unknown;
  index: number;
}


const namespace = 'repeat';

const graphRenderer: GraphRenderer<Block, BlockMetrics, Location> = {
  computeMetrics(block, ancestors, options) {
    let childMetrics = options.computeMetrics(block.child, [...ancestors, block]);

    let label = ancestors.at(-1)?.state['name'].value
      ?? getBlockExplicitLabel(block, options.host)
      ?? unit.getBlockDefaultLabel(block);

    return {
      child: childMetrics,
      label,

      start: {
        x: childMetrics.start.x + 1,
        y: childMetrics.start.y + 2
      },
      end: {
        x: childMetrics.end.x + 1,
        y: childMetrics.end.y + 2
      },
      size: {
        width: childMetrics.size.width + 2,
        height: childMetrics.size.height + 3
      }
    };
  },
  render(block, path: ProtocolBlockPath, metrics, position, location, options) {
    // let label = (block.state['name'] as { value: string | null; }).value;

    return (
      <>
        <NodeContainer
          cellSize={{ width: metrics.size.width, height: metrics.size.height }}
          position={position}
          settings={options.settings}
          title={metrics.label} />
        {options.render(block.child, [...path, null], metrics.child, {
          x: position.x + 1,
          y: position.y + 2
        }, location?.child ?? null, options)}
      </>
    );
  }
};


const unit = {
  namespace: 'repeat',

  graphRenderer,

  createActiveBlockMenu(_block, _location, _options) {
    return [
      { id: 'halt', name: 'Skip', icon: 'double_arrow' }
    ];
  },
  createDefaultPoint(block, _key: number, getChildPoint) {
    return {
      child: getChildPoint(block.child),
      iteration: 0
    };
  },
  getBlockClassLabel(_block) {
    return 'Repeat';
  },
  getBlockDefaultLabel(block) {
    return 'Repeat ' + ({
      1: 'once',
      2: 'twice'
    }[block.count] ?? `${block.count} times`);
  },
  getActiveChildLocation(location, _key: number) {
    return location.child;
  },
  getChildBlock(block, _key: never) {
    return block.child;
  },
  getChildrenExecutionKeys(_block, location) {
    return [location.iteration];
  },
  getBlockLocationLabelSuffix(block, location) {
    return `(${location.iteration}/${block.count})`;
  },
  onSelectBlockMenu(_block, _location, path) {
    switch (path.first()) {
      case 'halt':
        return { type: 'halt' };
    }
  }
} satisfies Unit<Block, Location>;


export default unit
