import { trackStore } from '@solid-primitives/deep';
import { createEffect } from 'solid-js';
import { FilterStore, InitialState } from './stores';
import { SetStoreFunction, unwrap } from 'solid-js/store';

/*
// not needed for now, will help for getting URLs working though
function GetChangedFilters(store: FilterStore) {
  const modified = Object.entries(store).filter(([k, v]) => {
    return InitialState[k as keyof FilterStore] != v;
  });

  const modifiedObj = Object.fromEntries(modified);
  modifiedObj.eras = modifiedObj.eras.filter((era: any, i: number) => {
    return InitialState.eras[i].enabled != era?.enabled;
  });
  if (!modifiedObj.eras.length) delete modifiedObj.eras;

  return modifiedObj;
}
*/

let inPopState = false;
let replacedState = false;
let historyPaused = false;

let filterState: FilterStore;
let setFilterState: SetStoreFunction<FilterStore>;

export function pauseHistory(paused: boolean) {
  historyPaused = paused;
  // console.log('pauseHistory', paused);
  if (paused) {
    history.pushState(unwrap(filterState), '');
  }
  else {
    history.replaceState(unwrap(filterState), '');
  }
}

export function initializeHistory(state: FilterStore, setState: SetStoreFunction<FilterStore>) {
  filterState = state;
  setFilterState = setState;

  createEffect(() => {
    trackStore(filterState);
    if (inPopState) return;
    if (historyPaused) return;
    // console.log('pushstate', filterState);
    if (!replacedState) {
      history.replaceState(unwrap(filterState), '');
      replacedState = true;
    }
    else {
      history.pushState(unwrap(filterState), '');
    }
  });

  addEventListener('popstate', ev => {
    inPopState = true;
    // console.log('popstate', ev);
    if (ev.state == null) console.log('null ev.state');
    setFilterState(ev.state ?? InitialState);
    inPopState = false;
  });
}