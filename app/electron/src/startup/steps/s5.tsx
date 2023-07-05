//* Enter local host settings

import { PythonInstallation, PythonInstallationId } from 'find-python-installations';
import { Form } from 'pr1';
import { LocalHostOptions } from 'pr1-library';
import { useCallback } from 'react';
import seqOrd from 'seq-ord';

import { HostCreatorStepData, HostCreatorStepProps } from '../host-creator';


export interface Data extends HostCreatorStepData {
  stepIndex: 5;

  customPythonInstallation: PythonInstallation | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string;
    id: PythonInstallationId;
    virtualEnv: boolean;
  } | null;
}


export function Component(props: HostCreatorStepProps<Data>) {
  let currentSettings = props.data.pythonInstallationSettings;

  let selectPythonInstallation = (selectedPythonInstallation: PythonInstallation) => {
    props.setData({
      ...props.data,
      customPythonInstallation: !(selectedPythonInstallation.id in props.context.pythonInstallations)
        ? selectedPythonInstallation
        : null,
      pythonInstallationSettings: {
        id: selectedPythonInstallation.id,
        architecture: currentSettings && selectedPythonInstallation.info.architectures && selectedPythonInstallation.info.architectures.includes(currentSettings.architecture)
          ? currentSettings.architecture
          : '_auto',
        virtualEnv: ((currentSettings?.virtualEnv ?? true) && selectedPythonInstallation.info.supportsVirtualEnv) || selectedPythonInstallation.info.isVirtualEnv
      }
    });
  };

  if (!currentSettings) {
    let selectedPythonInstallation = Object.values(props.context.pythonInstallations).find((pythonInstallation) => isPythonInstallationSupported(pythonInstallation));

    if (selectedPythonInstallation) {
      selectPythonInstallation(selectedPythonInstallation);
      return null;
    }
  }

  return (
    <form className="startup-editor-contents" onSubmit={(event) => {
      event.preventDefault();

      let installationSettings = currentSettings!;

      let options: LocalHostOptions = {
        customPythonInstallation: props.data.customPythonInstallation,
        label: props.data.label.trim(),
        pythonInstallationSettings: {
          architecture: (installationSettings.architecture !== '_auto')
            ? installationSettings.architecture
            : null,
          id: installationSettings.id,
          virtualEnv: installationSettings.virtualEnv
        }
      };

      props.setData({
        stepIndex: 6,
        options
      });
    }}>
      <div className="startup-editor-inner">
        <header className="startup-editor-header">
          <div className="startup-editor-subtitle">New setup</div>
          <h2>Set parameters</h2>
        </header>
        <div>
          <Form.TextField
            label="Setup name"
            onInput={(label) => void props.setData({ ...props.data, label })}
            value={props.data.label}
            targetRef={useCallback((el: HTMLInputElement | null) => void el?.select(), [])} />
          <Form.Select
            label="Python location"
            onInput={(optionId) => {
              (async () => {
                if (optionId === '_custom') {
                  let customPythonInstallation = await window.api.hostSettings.selectPythonInstallation();

                  if (customPythonInstallation) {
                    selectPythonInstallation(customPythonInstallation);
                  }
                } else {
                  selectPythonInstallation(props.context.pythonInstallations[optionId as PythonInstallationId]);
                }
              })();
            }}
            options={[
              ...(!currentSettings
                ? [{ id: null, label: 'Select a Python location\u2026' }]
                : []),
              { id: '_header.main', label: '[Common locations]', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => pythonInstallation.leaf)
                .sort(sortPythonInstallations)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.others', label: '[Other locations]', disabled: true },
              ...Object.values(props.context.pythonInstallations)
                .filter((pythonInstallation) => !pythonInstallation.leaf)
                .sort(sortPythonInstallations)
                .map(createSelectOptionFromPythonInstallation),
              { id: '_header.custom', label: '[Custom locations]', disabled: true },
              ...(props.data.customPythonInstallation
                ? [createSelectOptionFromPythonInstallation(props.data.customPythonInstallation)]
                : []),
              { id: '_custom', label: 'Custom location' }
            ]}
            value={currentSettings?.id ?? null} />
          {currentSettings && (() => {
            let currentPythonInstallation = props.data.customPythonInstallation ?? props.context.pythonInstallations[currentSettings.id];

            return (
              <>
                <Form.Select
                  label="Architecture"
                  onInput={(architecture) => void props.setData({
                    ...props.data,
                    pythonInstallationSettings: {
                      ...currentSettings!,
                      architecture
                    }
                  })}
                  options={[
                    { id: '_auto', label: 'Automatic' },
                    ...(currentPythonInstallation.info.architectures?.map((architecture) => ({
                      id: architecture,
                      label: architecture
                    })) ?? [])
                  ]}
                  value={currentSettings.architecture} />
                <Form.CheckboxList label="Virtual environment">
                  {/* <pre>{JSON.stringify(pythonInstallation?.info, null, 2)}</pre>
                <pre>{JSON.stringify(props.data, null, 2)}</pre> */}
                  <Form.Checkbox
                    checked={currentSettings.virtualEnv}
                    disabled={currentPythonInstallation.info.isVirtualEnv || !currentPythonInstallation.info.supportsVirtualEnv}
                    label="Create a virtual environment"
                    onInput={(value) => void props.setData({
                      ...props.data,
                      pythonInstallationSettings: {
                        ...currentSettings!,
                        virtualEnv: value
                      }
                    })}>
                    {!currentPythonInstallation.info.supportsVirtualEnv && (
                      <p>Virtual environments are not supported in this Python installation. Install venv to add their support.</p>
                    )}
                    {currentPythonInstallation.info.isVirtualEnv && (
                      <p>This installation is already a virtual environment.</p>
                    )}
                  </Form.Checkbox>
                </Form.CheckboxList>
              </>
            );
          })()}
        </div>
      </div>
      <div className="startup-editor-action-root">
        <div className="startup-editor-action-list">
          <button type="button" className="startup-editor-action-item" onClick={() => {
            props.setData({
              stepIndex: 4,
              mode: 'advanced'
            });
          }}>Back</button>
        </div>
        <div className="startup-editor-action-list">
          <button type="submit" className="startup-editor-action-item" disabled={!currentSettings || !props.data.label.trim()}>Next</button>
        </div>
      </div>
    </form>
  );
}


function createSelectOptionFromPythonInstallation(pythonInstallation: PythonInstallation) {
  let info = pythonInstallation.info;
  let supported = isPythonInstallationSupported(pythonInstallation);

  return {
    id: (pythonInstallation.id as string),
    disabled: !supported,
    label: `${pythonInstallation.path} (${[
      info.version.join('.'),
      ...(info.isVirtualEnv ? ['virtual environment'] : [])
    ].join(', ')})${supported ? '' : ' \u2014 Not supported'}`
  };
}

function isPythonInstallationSupported(pythonInstallation: PythonInstallation) {
  let version = pythonInstallation.info.version;
  return (version[0] === 3) && (version[1] >= 11);
}

const sortPythonInstallations = seqOrd<PythonInstallation>(function* (a, b, rules) {
  yield rules.numeric(b.info.version[0], a.info.version[0]);
  yield rules.numeric(b.info.version[1], a.info.version[1]);
  yield rules.numeric(b.info.version[2], a.info.version[2]);
  yield rules.text(a.path, b.path);
});
