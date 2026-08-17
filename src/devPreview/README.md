# Design harness — dev only

`npm run dev`, then open **http://localhost:3000/preview.html**.

Renders the portal screens against fixture data, with a screen switcher and a
switcher for all six contrast themes. Query params work too, so a particular
combination can be linked or screenshotted directly:

```
/preview.html?screen=today&contrast=midnight
```

## Why it exists

The portal needs a real Microsoft 365 session and a SharePoint site behind it, so
there is otherwise no way to *look* at a design change without deploying. That
made every visual decision unverifiable, which is how the admin dashboard ended
up with `rgba(255,255,255,0.94)` panels that turn into white cards on a black
page the moment somebody picks Midnight.

## What it is not

Not a route in the app. `preview.html` is a separate Vite entry, nothing under
`src/` imports it, and it ships no fixtures into the bundle — `vite build` only
follows `index.html`.

It also does not replace the tests. It answers "does this look right", not "is
this correct"; `portalScreens.test.tsx` still owns the second question.

`SettingsScreen` is deliberately absent: it reads `AppearanceContext`, which
needs a live MSAL session that fixtures cannot stand in for.
