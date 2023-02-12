import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import styles from '../styles/components/application.module.scss';

import type { AppBackend, DraftDocumentId, DraftDocumentSnapshot, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './app-backends/base';
import type { Chip, ChipId } from './backends/common';
import type { UnsavedDataCallback, ViewRouteMatch, ViewType } from './interfaces/view';
import { Sidebar } from './components/sidebar';
import { createDraftFromItem, Draft, DraftCompilation, DraftId } from './draft';
import type { Host } from './host';
import { ViewChip } from './views/chip';
import { ViewChips } from './views/chips';
import { ViewDesign } from './views/test/design';
import { ViewDraft, ViewDraftWrapper } from './views/draft';
import { ViewExecution } from './views/execution';
import { ViewDrafts } from './views/protocols';
import { ViewConf } from './views/conf';
import { Pool } from './util';
import { Unit, UnitNamespace } from './units';
import { BaseBackend } from './backends/base';
import { HostInfo } from './interfaces/host';
import { BaseUrl, BaseUrlPathname } from './constants';


const Views: ViewType[] = [ViewChip, ViewChips, ViewConf, ViewDesign, ViewDraftWrapper, ViewDrafts, ViewExecution];

const Routes: Route[] = Views.flatMap((View) =>
  View.routes.map((route) => ({
    component: View,
    id: route.id,
    pattern: new URLPattern({
      baseURL: BaseUrl,
      pathname: BaseUrlPathname + route.pattern
    })
  }))
);


export interface Route {
  component: ViewType;
  id: string;
  pattern: URLPattern;
}

// export interface RouteResolution {
//   match: any;
//   route: Route;
// }

export interface RouteData {
  params: any;
  route: Route;
}

function createViewRouteMatchFromRouteData(routeData: RouteData): ViewRouteMatch {
  return {
    id: routeData.route.id,
    params: routeData.params
  };
}


export interface ApplicationProps {
  appBackend: AppBackend;
  backend: BaseBackend;
  hostInfo: HostInfo;

  onHostStarted?(): void;
  setStartup?(): void;
}

export interface ApplicationState {
  drafts: Record<DraftInstanceId, DraftInstanceSnapshot>;
  documents: Record<DraftDocumentId, DraftDocumentSnapshot>;
  currentRouteData: RouteData | null;
  host: Host | null;
}

export class Application extends React.Component<ApplicationProps, ApplicationState> {
  controller = new AbortController();
  pool = new Pool();
  unsavedDataCallback: UnsavedDataCallback | null = null;

  constructor(props: ApplicationProps) {
    super(props);

    this.state = {
      currentRouteData: null,
      documents: {},
      drafts: {},
      host: null
    };
  }

  get appBackend(): AppBackend {
    return this.props.appBackend;
  }

  async initializeHost() {
    let backend = this.props.backend;

    try {
      await backend.start();
    } catch (err) {
      console.error(`Backend of host failed to start with error: ${(err as Error).message}`);
      console.error(err);
      return;
    }

    console.log('Initial state ->', backend.state);

    backend.onUpdate(() => {
      console.log('New state ->', backend.state);

      this.setState((state) => ({
        host: {
          ...state.host!,
          state: backend.state
        }
      }));
    }, { signal: this.controller.signal });

    let host: Host = {
      backend,
      id: backend.state.info.id,
      state: backend.state,
      units: (null as unknown as Host['units'])
    };

    this.setState({ host }, () => {
      this.props.onHostStarted?.();
    });

    this.pool.add(async () => void await this.loadUnitClients(host));

    backend.closed
      .catch((err) => {
        console.error(`Backend of host '${host.id}' terminated with error: ${err.message ?? err}`);
        console.error(err);
      })
      .finally(() => {
        this.setState({ host: null });
      });

      return backend.state;
  }

  async loadUnitClients(host: Host = this.state.host!, options?: { development?: unknown; }) {
    let targetUnitsInfo = Object.values(host.state.info.units)
      .filter((unitInfo) => unitInfo.enabled && (!options?.development || unitInfo.development));

    if (host.units) {
      let expiredStyleSheets = targetUnitsInfo.flatMap((unitInfo) => {
        let unit = host.units[unitInfo.namespace];
        return unit?.styleSheets ?? [];
      });

      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => !expiredStyleSheets.includes(sheet));
    }

    let units: Record<UnitNamespace, Unit<unknown, unknown>> = Object.fromEntries(
      (await Promise.all(
        targetUnitsInfo
          .filter((unitInfo) => unitInfo.hasClient)
          .map(async (unitInfo) => {
            console.log(`%cLoading unit %c${unitInfo.namespace}%c (${unitInfo.version})`, '', 'font-weight: bold;', '');

            try {
              let unit = await host.backend.loadUnit(unitInfo);
              return [unitInfo.namespace, unit];
            } catch (err) {
              console.error(`%cFailed to load unit %c${unitInfo.namespace}%c (${unitInfo.version})`, '', 'font-weight: bold;', '');
              console.error(err);

              return [unitInfo.namespace, null];
            }
          })
      )).filter(([_namespace, unit]) => unit)
    );

    document.adoptedStyleSheets.push(...Object.values(units).flatMap((unit) => unit.styleSheets ?? []));

    this.setState((state) => ({
      host: {
        ...state.host!,
        units: {
          ...state.host!.units,
          ...units
        }
      }
    }));
  }


  resolveNavigation(url: string): RouteData | null {
    for (let route of Routes) {
      let match = route.pattern.exec(url);

      if (match) {
        return {
          params: match.pathname.groups,
          route
        };
      }
    }

    return null;
  }

  handleNavigation(url: string, routeData: RouteData | null) {
    if (routeData) {
      this.setState({
        currentRouteData: routeData
      });
    } else {
      console.warn(`Missing view for pathname ${new URL(url).pathname}, redirecting to ${BaseUrlPathname}/chip`);
      navigation.navigate(`${BaseUrl}/chip`);
    }
  }


  componentDidMount() {
    window.addEventListener('beforeunload', () => {
      this.state.host?.backend.close();
    }, { signal: this.controller.signal });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && (event.altKey || event.ctrlKey)) {
        event.preventDefault();

        this.pool.add(async () => {
          if (event.ctrlKey && this.state.host) {
            await this.state.host.backend.reloadUnits();
          }

          if (event.altKey) {
            await this.loadUnitClients(undefined, { development: true });
          }
        });
      }
    }, { signal: this.controller.signal });

    navigation.addEventListener('navigate', (event: any) => {
      if (event.canIntercept && !event.hashChange && !event.downloadRequest) {
        let url = event.destination.url;
        let routeData = this.resolveNavigation(url);

        if (this.unsavedDataCallback) {
          let viewRouteMatch = (routeData?.route.component === this.state.currentRouteData!.route.component)
            ? createViewRouteMatchFromRouteData(routeData)
            : null;

          let result = this.unsavedDataCallback(viewRouteMatch);

          if (result !== true) {
            event.preventDefault();

            if (result !== false) {
              this.pool.add(async () => {
                if (await result) {
                  this.unsavedDataCallback = null;
                  navigation.navigate(url, { info: event.info });
                }
              });
            }

            return;
          }
        }

        event.intercept({
          handler: async () => {
            this.handleNavigation(url, routeData);
          }
        });
      }
    }, { signal: this.controller.signal });

    this.pool.add(async () => {
      // Initialize the app backend

      await this.appBackend.initialize();


      // Initialize the host communication

      let state = await this.initializeHost();

      if (!state) {
        return;
      }


      // List and compile known drafts if available

      this.setState((state) => ({
        ...state,
        ...this.appBackend.getSnapshot()
      }));

      // let draftItems = await this.appBackend.listDrafts();
      // let drafts = Object.fromEntries(
      //   draftItems.map((draftItem) => {
      //     return [draftItem.id, createDraftFromItem(draftItem)];
      //   })
      // );

      // let createDraftItemFromInstance = (instance: DraftInstance): DraftItem => {
      //   return {
      //     id: instance.id,
      //     instance
      //   };
      // };

      // this.setState({
      //   drafts: Object.fromEntries(
      //     Object.values(this.appBackend.draftInstances)
      //       .map((instance) => instance.getSnapshot())
      //       .map((snapshot) => [snapshot.id, snapshot])
      //   )
      // });


      // Initialize the route

      let url = navigation.currentEntry.url;
      this.handleNavigation(url, this.resolveNavigation(url));
    });
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async createDraft(options: { directory: boolean; }): Promise<DraftId | null> {
    let sample = await this.state.host!.backend.createDraftSample();
    let draftItem = await this.appBackend.createDraft({ directory: options.directory, source: sample });

    if (draftItem) {
      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftItem!.id]: createDraftFromItem(draftItem!)
        }
      }));
    }

    return (draftItem?.id ?? null);
  }

  async deleteDraft(draftId: DraftId) {
    let instance = this.state.drafts[draftId].model;
    await instance.remove();

    this.setState((state) => ({
      ...state,
      ...this.appBackend.getSnapshot()
    }));
  }

  async queryDraft(options: { directory: boolean; }): Promise<void> {
    let candidates = await this.appBackend.queryDraftCandidates({ directory: options.directory });
    let candidate = candidates[0];

    if (candidate) {
      let instance = await candidate.createInstance();

      this.setState((state) => ({
        ...state,
        ...this.appBackend.getSnapshot()
      }));

      // this.setState((state) => {
      //   let documentSnapshot = instance.entryDocument.getSnapshot();
      //   let instanceSnapshot = instance.getSnapshot();

      //   return {
      //     documents: {
      //       ...state.documents,
      //       [documentSnapshot.id]: documentSnapshot
      //     },
      //     drafts: {
      //       ...state.drafts,
      //       [instanceSnapshot.id]: instanceSnapshot
      //     }
      //   };
      // });
    }
  }

  async saveDraftSource(draft: Draft, source: string) {
    let compilationTime = Date.now();
    draft.meta.compilationTime = compilationTime;

    await draft.item.write({ source });

    this.setState((state) => {
      return {
        drafts: {
          ...state.drafts,
          [draft.id]: {
            ...state.drafts[draft.id],
            lastModified: draft.item.lastModified
          }
        }
      }
    });
  }

  async saveDraftCompilation(draft: Draft, compilation: DraftCompilation) {
    this.setState((state) => {
      let stateDraft = state.drafts[draft.id];

      if (!stateDraft) {
        return null;
      }

      return {
        drafts: {
          ...state.drafts,
          [draft.id]: {
            ...stateDraft,
            compilation,
            name: compilation!.protocol?.name ?? stateDraft.name // ?? draft.item.name
          }
        }
      }
    });

    if (compilation.protocol?.name) {
      await draft.item.write({
        name: compilation.protocol.name
      });
    }
  }

  async watchDraft(draftId: DraftId, options: { signal: AbortSignal; }) {
    await this.state.drafts[draftId].item.watch(() => {
      this.setState((state) => {
        let draft = state.drafts[draftId];
        let draftItem = draft.item;

        return {
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...draft,
              lastModified: draftItem.lastModified,
              revision: draftItem.revision,
              readable: draftItem.readable,
              writable: draftItem.writable
            }
          }
        };
      });
    }, { signal: options.signal });
  }


  render() {
    let contents = null;
    let routeData = this.state.currentRouteData;

    if (routeData && this.state.host?.units) {
      let Component = routeData.route.component;
      let viewRouteMatch = createViewRouteMatchFromRouteData(routeData);

      let key = Component.hash?.({
        app: this,
        host: this.state.host,
        route: viewRouteMatch
      }) ?? '';

      contents = (
        <Component
          app={this}
          host={this.state.host}
          route={viewRouteMatch}
          setUnsavedDataCallback={(callback) => {
            this.unsavedDataCallback = callback;
          }}
          key={key} />
      );
    }

    return (
      <div className={styles.root}>
        <Sidebar
          host={this.state.host}
          hostInfo={this.props.hostInfo}

          setStartup={this.props.setStartup} />
        {contents}
      </div>
    );
  }
}
