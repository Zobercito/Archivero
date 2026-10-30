import { createInitialState } from './state';

let state = createInitialState();

export function demoState() {
  return state;
}

export function resetDemoState() {
  state = createInitialState();
}
