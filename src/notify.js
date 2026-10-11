// Errors are told to the user with the Penguin stacking toast in index.html, and stay until the user closes them.
// closeWhen: for an error that resolves itself, a function that becomes true when it is resolved.
// Errors from before the page is ready (while modules load) are kept and told once it is.

const pending = [];
let ready = false;

const dispatch = detail => window.dispatchEvent(new CustomEvent('notify', { detail }));

export function notifyError(title, message = null, { closeWhen = null } = {}) {
  const detail = { variant: 'danger', title, message, closeWhen };
  if (ready) dispatch(detail);
  else pending.push(detail);
}

// called once the toast is listening
export function pageReady() {
  ready = true;
  pending.splice(0).forEach(dispatch);
}
