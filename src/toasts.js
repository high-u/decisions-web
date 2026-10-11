// The data of the stacking toast in index.html (see notify.js for how errors reach it).
export const toasts = () => ({
  notifications: [],

  add({ variant = 'info', sender = null, title = null, message = null, closeWhen = null }) {
    const id = crypto.randomUUID();
    this.notifications.push({ id, variant, sender, title, message, closeWhen });
  },

  // after the leave transition
  remove(id) {
    setTimeout(() => {
      this.notifications = this.notifications.filter(notification => notification.id !== id);
    }, 400);
  },
});
