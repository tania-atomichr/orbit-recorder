/* The extension's background. Each part is its own file:

     rec-bg.js     calls, videos and voice notes
     guide-bg.js   step-by-step guides
     outbox.js     sending finished notes and guides where you chose

   store.js, format.js, destinations.js and recordings.js are shared with the
   extension's pages, so both read and write the same rows. */
importScripts('store.js', 'format.js', 'templates.js', 'providers.js', 'destinations.js', 'export.js', 'outbox.js', 'recordings.js', 'rec-bg.js', 'guide-bg.js');
