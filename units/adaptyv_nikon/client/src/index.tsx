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
      Component(props) {
        return (
          <div>
            <p>Points saved: {props.location.pointsSaved ? 'yes' : 'no'}</p>

            <Form.Actions>
              <Form.Action label="Query points" onClick={() => {
                props.context.sendMessage({ type: 'query' });
              }} />
              {props.location.pointsSaved && (
                <Form.Action label="Change focus" onClick={() => {
                  props.context.sendMessage({ type: 'requery' });
                }} />
              )}
            </Form.Actions>
          </div>
        );
      },
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
      pointsSaved: boolean;
      settings: {
        chipCount: number;
        gridColumns: number;
        gridRows: number;
      } | null;
    }>
  }
} satisfies Plugin
