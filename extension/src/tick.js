/* A steady beat for the picture mixer in screen.js on a Chrome too old to
   hand it frames directly: a worker's timer is not slowed down when the
   recording window is behind another one, a page's own timer is. */
setInterval(function () { postMessage(0); }, 33);
