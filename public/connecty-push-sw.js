self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = payload.title || "ConnectyHub";
  const options = {
    body: payload.body || "Temos uma atualizacao para voce.",
    icon: payload.icon || "/brand/connectyhub-mark-blue.png",
    badge: payload.badge || "/brand/connectyhub-mark-white.png",
    data: {
      url: payload.url || "/",
      trackingId: payload.trackingId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});

function readPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}
