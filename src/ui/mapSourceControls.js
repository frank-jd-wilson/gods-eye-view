import { renderMapStackChips, syncMapStackChips } from '../mapStackChips.js';
import { t, translateKnown } from '../i18n/index.js';
import { saveMapPreference } from '../maps/preference.js';

/**
 * Own Map Source presentation and selection without constructing map providers.
 * The supplied controller remains authoritative for availability and active state.
 */
export function createMapSourceControls({
  container,
  statusElement,
  controller,
  subscribe,
  claimSelection = () => {},
  onStateChanged = () => {},
  onError = () => {},
  storage,
}) {
  let destroyed = false;
  let generation = 0;
  let announcedFailure = null;
  let notice, noticeText, recoveryButton;
  const removers = [];
  const bind = (element, type, listener) => {
    element.addEventListener(type, listener);
    removers.push(() => element.removeEventListener(type, listener));
  };
  function render(state) {
    if (destroyed || !state) return;
    syncMapStackChips(container, state.activeId);
    if (
      state.imagerySuspended &&
      state.lastError &&
      state.lastError !== announcedFailure
    ) {
      announcedFailure = state.lastError;
      // The floating notice is already visible; do not duplicate it as a toast.
      if (!container?.ownerDocument?.body)
        onError(translateKnown(state.lastError));
    } else if (!state.imagerySuspended) {
      announcedFailure = null;
    }
    if (notice) {
      notice.hidden = !state.imagerySuspended;
      noticeText.textContent = state.imagerySuspended
        ? translateKnown(state.lastError || announcedFailure)
        : '';
      recoveryButton.disabled =
        state.status === 'switching' ||
        !controller
          .getStacks()
          .some((s) => s.id === 'esri-imagery' && s.available !== false);
    }
    if (statusElement) {
      const stack = state.activeStack;
      statusElement.textContent =
        state.status === 'switching'
          ? '...'
          : stack?.shortLabel || stack?.label || t('MAP');
      statusElement.classList.toggle('warn', !!state.lastError);
    }
  }
  async function select(stackId, { syncShare = true } = {}) {
    if (destroyed) return null;
    const current = ++generation;
    if (syncShare) claimSelection();
    const before = controller.getActiveId();
    render(controller.getState('switching'));
    let state;
    try {
      state = await controller.setStack(stackId, { retry: syncShare });
    } catch (error) {
      if (!destroyed && current === generation) {
        render(controller.getState());
        onError(error?.message || String(error));
      }
      throw error;
    }
    if (destroyed || current !== generation) return state;
    render(controller.getState());
    if (state?.activeId === before && stackId !== before && state?.lastError)
      onError(state.lastError);
    if (syncShare) onStateChanged();
    if (
      syncShare &&
      state?.activeId === stackId &&
      !state.lastError &&
      !saveMapPreference(stackId, storage)
    )
      onError(t('The basemap preference could not be saved in this browser.'));
    return state;
  }
  function refresh() {
    if (destroyed) return;
    for (const remove of removers.splice(0)) remove();
    notice?.remove?.();
    renderMapStackChips(container, controller.getStacks(), {
      activeId: controller.getActiveId(),
      onSelect: (id) => {
        void select(id).catch(() => {});
      },
      bind,
    });
    const doc = container?.ownerDocument;
    if (doc) {
      notice = doc.createElement('div');
      notice.className = 'map-source-error';
      notice.classList.toggle('map-source-error-floating', Boolean(doc.body));
      notice.setAttribute('role', 'status');
      noticeText = doc.createElement('p');
      recoveryButton = doc.createElement('button');
      recoveryButton.type = 'button';
      recoveryButton.className = 'map-stack-chip';
      recoveryButton.textContent = t('Switch to Esri satellite imagery');
      bind(recoveryButton, 'click', () => {
        void select('esri-imagery').catch(() => {});
      });
      notice.appendChild(noticeText);
      notice.appendChild(recoveryButton);
      // Keep the action reachable even while Visual Presets is collapsed.
      (doc.body || container).appendChild(notice);
    }
    render(controller.getState());
  }
  const unsubscribe = subscribe(() => {
    if (destroyed) return;
    render(controller.getState());
    onStateChanged();
  });
  refresh();
  return {
    render,
    select,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      unsubscribe?.();
      notice?.remove?.();
      for (const remove of removers.splice(0)) remove();
    },
  };
}
