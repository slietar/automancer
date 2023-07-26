import { Form, PanelDataList, PanelRoot, PanelSection, Plugin, PluginBlockImpl, createProcessBlockImpl } from 'pr1';
import { MasterBlockLocation, PluginName, ProtocolBlock, ProtocolBlockName, createZeroTerm } from 'pr1-shared';
import { useState } from 'react';


export type RunnerRequest = {
  type: 'queryPoints';
} | {
  type: 'set';
  chipCount: number;
};

export interface ExecutorState {
  objectives: string[];
  optconfs: string[];
}

export interface Runner {
  chipCount: number;
  pointsSaved: number;
}

export interface ProcessData {
  exposure: number;
  objective: string;
  optconf: string;
}


const namespace = ('adaptyv_nikon' as PluginName);

export default {
  namespace,
  blocks: {
    ['capture' as ProtocolBlockName]: createProcessBlockImpl<ProcessData, never>({
      createFeatures(data, location) {
        return [{
          icon: 'biotech',
          label: 'Capture'
        }];
      }
    }),
    ['settings' as ProtocolBlockName]: {
      createFeatures(block, location, descendantPairs, context) {
        return [{
          icon: 'biotech',
          ...(location?.settings
            ? {
              description: 'Capture settings',
              label: location?.settings
                ? `${location.settings.chipCount} chip${location.settings.chipCount > 1 ? 's' : ''}, ${location.settings.gridColumns}x${location.settings.gridRows} grid`
                : null
            }
            : {
              label: 'Capture settings',
            })
        }]
      },
      getChildren(block, context) {
        return [{
          block: block.child,
          delay: createZeroTerm()
        }];
      },
      getChildrenExecution(block, location, context) {
        return [{
          location: location.children[0]
        }];
      }
    } satisfies PluginBlockImpl<ProtocolBlock & {
      child: ProtocolBlock;
    }, MasterBlockLocation & {
      settings: {
        chipCount: number;
        gridColumns: number;
        gridRows: number;
      } | null;
    }>
  },

  executionPanels: [{
    id: '_',
    label: 'Capture',
    Component(props) {
      let executor = props.context.host.state.executors[namespace] as ExecutorState;
      let runner = props.experiment.master!.runners[namespace] as Runner;

      let request = (request: RunnerRequest) => {
        props.context.pool.add(async () => {
          await props.context.requestToRunner(request, props.experiment.id);
        });
      };

      return (
        <PanelRoot>
          <PanelSection>
            <h2>Capture</h2>

            {/* <h3>Objectives</h3>
            <ul>{executor.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>

            <h3>Optical configurations</h3>
            <ul>{executor.optconfs.map((optconf) => <li key={optconf}>{optconf}</li>)}</ul> */}

            {/* <h3>Points</h3> */}

            <PanelDataList data={[
              { label: 'Points saved',
                value: (runner.pointsSaved ? 'Yes' : 'No') }
            ]} />

            <Form.Actions>
              <Form.Action label="Query points" onClick={() => {
                request({ type: 'queryPoints' });
              }} />
              <Form.Action label="Change focus" onClick={() => {
                request({ type: 'queryPoints' });
              }} />
            </Form.Actions>
          </PanelSection>
        </PanelRoot>
      );
    }
  }]
} satisfies Plugin
