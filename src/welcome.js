(function () {
  'use strict';
  var said = document.getElementById('said');
  if (!/Mac/.test(navigator.platform)) document.getElementById('keys').textContent = 'Alt Shift R';
  function show(ok) {
    said.className = ok ? 'ok' : 'no';
    said.textContent = ok ? 'Microphone allowed.' : 'Not allowed yet. Press it again and choose Allow.';
  }
  try {
    navigator.permissions.query({ name: 'microphone' }).then(function (p) { if (p.state === 'granted') show(true); });
  } catch (e) {}
  var saidCam = document.getElementById('said-cam');
  function showCam(ok) {
    saidCam.className = ok ? 'ok' : 'no';
    saidCam.textContent = ok ? 'Camera allowed.' : 'Not allowed yet. Press it again and choose Allow.';
  }
  try {
    navigator.permissions.query({ name: 'camera' }).then(function (p) { if (p.state === 'granted') showCam(true); });
  } catch (e) {}
  document.getElementById('cam').addEventListener('click', function () {
    navigator.mediaDevices.getUserMedia({ video: true }).then(function (s) {
      s.getTracks().forEach(function (t) { t.stop(); });
      showCam(true);
    }, function () { showCam(false); });
  });
  document.getElementById('mic').addEventListener('click', function () {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      s.getTracks().forEach(function (t) { t.stop(); });
      show(true);
    }, function () { show(false); });
  });
})();
