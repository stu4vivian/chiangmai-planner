// fineflow-calendar-state.js — 細流行事曆的暫存 UI 狀態與 transaction 協調。
// 不碰 DOM、db 或同步；瀏覽器當全域 CNXFineFlowCalendarState、Node 當模組。
(function (root) {
  'use strict';

  var TRANSIENT_MODES = {
    'create-at': true,
    'add-source': true,
    detail: true,
    edit: true,
    'drag-preview': true,
    'resize-preview': true,
    'conflict-choice': true
  };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function idleState() {
    return { mode: 'idle' };
  }

  function result(state, effects) {
    return { state: state, effects: effects || [] };
  }

  function requireText(value, name) {
    if (typeof value !== 'string' || !value) throw new Error(name + ' is required');
    return value;
  }

  function interactionBase(event) {
    var base = {
      versionId: requireText(event.versionId, 'versionId'),
      baseFingerprint: requireText(event.baseFingerprint, 'baseFingerprint')
    };
    if (event.baseFingerprints) base.baseFingerprints = clone(event.baseFingerprints);
    return base;
  }

  function openCreateAt(event) {
    var base = interactionBase(event);
    return Object.assign({
      mode: 'create-at',
      day: requireText(event.day, 'day'),
      startAt: requireText(event.startAt, 'startAt'),
      draft: clone(event.draft || {})
    }, base);
  }

  function openAddSource(event) {
    return Object.assign({
      mode: 'add-source',
      draft: clone(event.draft || {})
    }, interactionBase(event));
  }

  function openDetail(event) {
    return Object.assign({
      mode: 'detail',
      occurrenceId: requireText(event.occurrenceId, 'occurrenceId')
    }, interactionBase(event));
  }

  function openEdit(event) {
    return Object.assign({
      mode: 'edit',
      occurrenceId: requireText(event.occurrenceId, 'occurrenceId'),
      draft: clone(event.draft || {})
    }, interactionBase(event));
  }

  function beginPreview(mode, event) {
    if (mode !== 'drag-preview' && mode !== 'resize-preview') throw new Error('Unknown preview mode: ' + mode);
    var state = Object.assign({
      mode: mode,
      occurrenceId: requireText(event.occurrenceId, 'occurrenceId'),
      transaction: event.transaction ? clone(event.transaction) : null,
      previewRequest: clone(event.previewRequest || {}),
      phase: event.transaction ? 'ready' : 'tracking'
    }, interactionBase(event));
    if (mode === 'resize-preview') state.edge = event.edge === 'start' ? 'start' : 'end';
    return state;
  }

  function isChangedIssue(issue) {
    return !!issue && (issue.status === 'new' || issue.status === 'worsened') && !issue.accepted;
  }

  function issueDelta(transaction) {
    var issues = transaction && Array.isArray(transaction.issues) ? transaction.issues : [];
    var changed = issues.filter(isChangedIssue);
    var conflicts = changed.filter(function (issue) { return issue.type === 'conflict'; });
    var blockers = changed.filter(function (issue) {
      return issue.type !== 'conflict' && issue.severity === 'blocking';
    });
    var warnings = changed.filter(function (issue) {
      return issue.type !== 'conflict' && issue.severity !== 'blocking';
    });
    var resolved = issues.filter(function (issue) { return issue.status === 'resolved'; });
    var preexisting = issues.filter(function (issue) { return issue.status === 'preexisting'; });
    return {
      conflicts: clone(conflicts),
      blockers: clone(blockers),
      warnings: clone(warnings),
      resolved: clone(resolved),
      preexisting: clone(preexisting),
      showConflictChoice: conflicts.length > 0,
      canConfirm: conflicts.length === 0 && blockers.length === 0
    };
  }

  function previewReady(state, event) {
    if (state.mode !== 'drag-preview' && state.mode !== 'resize-preview' && state.mode !== 'conflict-choice') {
      throw new Error('Preview transaction requires an active drag or resize');
    }
    if (!event.transaction) throw new Error('transaction is required');
    var transaction = clone(event.transaction);
    var delta = issueDelta(transaction);
    var sourceMode = state.mode === 'conflict-choice' ? state.sourceMode : state.mode;
    var common = {
      occurrenceId: state.occurrenceId,
      versionId: state.versionId,
      baseFingerprint: transaction.baseFingerprint || state.baseFingerprint,
      baseFingerprints: clone(transaction.baseFingerprints || state.baseFingerprints || null),
      transaction: transaction,
      previewRequest: clone(state.previewRequest || {}),
      issueDelta: delta,
      phase: 'ready'
    };
    if (sourceMode === 'resize-preview') common.edge = state.edge;
    if (delta.showConflictChoice) {
      return result(Object.assign({
        mode: 'conflict-choice',
        sourceMode: sourceMode,
        issues: clone(delta.conflicts)
      }, common), [{
        type: 'command',
        command: 'show-conflict-choice',
        occurrenceId: state.occurrenceId,
        issues: clone(delta.conflicts),
        choices: ['single', 'ripple', 'cancel']
      }]);
    }
    return result(Object.assign({ mode: sourceMode }, common), delta.blockers.length ? [{
      type: 'command',
      command: 'show-preview-blocked',
      issues: clone(delta.blockers)
    }] : [{
      type: 'command',
      command: 'show-preview-confirmation',
      transaction: transaction
    }]);
  }

  function confirmGuard(state, context) {
    context = context || {};
    if (state.mode !== 'drag-preview' && state.mode !== 'resize-preview') {
      return { ok: false, code: 'NO_CONFIRMABLE_PREVIEW', message: '目前沒有可確認的預演' };
    }
    if (!state.transaction) {
      return { ok: false, code: 'NO_TRANSACTION', message: '預演尚未完成' };
    }
    if (!context.activeVersionId || context.activeVersionId !== state.versionId ||
        (state.transaction.versionId && state.transaction.versionId !== state.versionId)) {
      return { ok: false, code: 'FINEFLOW_STALE_VERSION', message: '版本已切換，請重新預演' };
    }
    var expectedFingerprint = state.transaction.baseFingerprint || state.baseFingerprint;
    var expectedFingerprints = state.transaction.baseFingerprints || state.baseFingerprints;
    if (expectedFingerprints) {
      var currentFingerprints = context.currentFingerprints || {};
      var staleDay = Object.keys(expectedFingerprints).find(function (day) {
        return !currentFingerprints[day] || currentFingerprints[day] !== expectedFingerprints[day];
      });
      if (staleDay) {
        return { ok: false, code: 'FINEFLOW_STALE_BASE', day: staleDay, message: '行程內容已更新，請重新預演' };
      }
    } else if (!context.currentFingerprint || context.currentFingerprint !== expectedFingerprint) {
      return { ok: false, code: 'FINEFLOW_STALE_BASE', message: '行程內容已更新，請重新預演' };
    }
    var delta = issueDelta(state.transaction);
    if (!delta.canConfirm) {
      return {
        ok: false,
        code: delta.conflicts.length ? 'FINEFLOW_CONFLICT_CHOICE_REQUIRED' : 'FINEFLOW_PREVIEW_BLOCKED',
        message: delta.conflicts.length ? '請先選擇衝突處理方式' : '此調整仍有無法套用的問題',
        issues: clone(delta.conflicts.concat(delta.blockers))
      };
    }
    return {
      ok: true,
      command: {
        type: 'command',
        command: 'apply-transaction',
        versionId: state.versionId,
        baseFingerprint: expectedFingerprint,
        baseFingerprints: clone(expectedFingerprints || null),
        transaction: clone(state.transaction),
        createInverse: true
      }
    };
  }

  function resetTransient(state, reason) {
    if (!state || state.mode === 'idle') return result(idleState());
    return result(idleState(), [{
      type: 'command',
      command: 'discard-transient',
      reason: reason || 'cancel',
      previousMode: state.mode
    }]);
  }

  function reduce(current, event) {
    var state = current && typeof current.mode === 'string' ? clone(current) : idleState();
    event = event || {};
    switch (event.type) {
      case 'OPEN_CREATE_AT':
        return result(openCreateAt(event), [{ type: 'command', command: 'focus-create-panel' }]);
      case 'OPEN_ADD_SOURCE':
        return result(openAddSource(event), [{ type: 'command', command: 'show-source-menu' }]);
      case 'OPEN_DETAIL':
        return result(openDetail(event), [{ type: 'command', command: 'focus-detail-panel' }]);
      case 'OPEN_EDIT':
        return result(openEdit(event), [{ type: 'command', command: 'focus-edit-panel' }]);
      case 'START_DRAG_PREVIEW':
        return result(beginPreview('drag-preview', event), [{ type: 'command', command: 'render-drag-preview' }]);
      case 'START_RESIZE_PREVIEW':
        return result(beginPreview('resize-preview', event), [{ type: 'command', command: 'render-resize-preview' }]);
      case 'UPDATE_PREVIEW':
        if (state.mode !== 'drag-preview' && state.mode !== 'resize-preview') return result(state);
        state.previewRequest = clone(event.previewRequest || state.previewRequest || {});
        state.phase = 'tracking';
        if (event.transaction) state.transaction = clone(event.transaction);
        return result(state, [{
          type: 'command',
          command: 'render-preview-position',
          previewRequest: clone(state.previewRequest)
        }]);
      case 'PREVIEW_READY':
        return previewReady(state, event);
      case 'CONFLICT_SINGLE':
        if (state.mode !== 'conflict-choice') return result(state);
        return result(Object.assign({}, state, { phase: 'resolving-single' }), [{
          type: 'command',
          command: 'resolve-conflicts',
          strategy: 'single',
          resolutionType: 'accept_conflict',
          transaction: clone(state.transaction),
          issues: clone(state.issues)
        }]);
      case 'CONFLICT_RIPPLE':
        if (state.mode !== 'conflict-choice') return result(state);
        return result(Object.assign({}, state, { phase: 'recalculating-ripple' }), [{
          type: 'command',
          command: 'recalculate-preview',
          strategy: 'ripple',
          sourceMode: state.sourceMode,
          occurrenceId: state.occurrenceId,
          previewRequest: clone(state.previewRequest || {})
        }]);
      case 'CONFIRM': {
        var guard = confirmGuard(state, event);
        if (!guard.ok) {
          var stale = guard.code === 'FINEFLOW_STALE_BASE' || guard.code === 'FINEFLOW_STALE_VERSION';
          var next = stale ? idleState() : state;
          return result(next, [{
            type: 'command',
            command: stale ? 'discard-stale-preview' : 'show-confirm-error',
            code: guard.code,
            message: guard.message,
            issues: clone(guard.issues || [])
          }]);
        }
        return result(Object.assign({}, state, { phase: 'applying' }), [guard.command]);
      }
      case 'APPLY_SUCCEEDED':
        return result(idleState(), [{
          type: 'command',
          command: 'register-undo',
          versionId: state.versionId,
          transaction: clone(state.transaction),
          inverseTransaction: clone(event.inverseTransaction || null),
          appliedVersion: clone(event.appliedVersion || null)
        }]);
      case 'APPLY_FAILED':
        if (event.code === 'FINEFLOW_STALE_BASE' || event.code === 'FINEFLOW_STALE_VERSION') {
          return resetTransient(state, 'stale-apply');
        }
        return result(Object.assign({}, state, { phase: 'ready' }), [{
          type: 'command',
          command: 'show-apply-error',
          code: event.code || 'FINEFLOW_APPLY_FAILED',
          message: event.message || '無法套用這次調整'
        }]);
      case 'CANCEL':
      case 'ESCAPE':
        return resetTransient(state, event.type === 'ESCAPE' ? 'escape' : 'cancel');
      case 'VERSION_CHANGED':
        return resetTransient(state, 'version-changed');
      case 'SYNC_RELOADED':
        return resetTransient(state, 'sync-reloaded');
      case 'CLOSE_FINEFLOW':
        return resetTransient(state, 'close-fineflow');
      default:
        return result(state);
    }
  }

  function createStore(options) {
    options = options || {};
    var current = clone(options.initialState || idleState());
    var listener = typeof options.onChange === 'function' ? options.onChange : null;
    return {
      getState: function () { return clone(current); },
      dispatch: function (event) {
        var output = reduce(current, event);
        current = output.state;
        if (listener) listener(clone(current), clone(output.effects), clone(event));
        return { state: clone(current), effects: clone(output.effects) };
      },
      reset: function (reason) {
        return this.dispatch({ type: reason === 'escape' ? 'ESCAPE' : 'CANCEL' });
      }
    };
  }

  var api = {
    idleState: idleState,
    openCreateAt: openCreateAt,
    openAddSource: openAddSource,
    openDetail: openDetail,
    openEdit: openEdit,
    beginDragPreview: function (event) { return beginPreview('drag-preview', event); },
    beginResizePreview: function (event) { return beginPreview('resize-preview', event); },
    issueDelta: issueDelta,
    confirmGuard: confirmGuard,
    reduce: reduce,
    createStore: createStore,
    isTransientMode: function (mode) { return !!TRANSIENT_MODES[mode]; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNXFineFlowCalendarState = api;
})(typeof self !== 'undefined' ? self : this);
