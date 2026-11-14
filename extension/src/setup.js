/* RECORD A VIDEO: what the popup's setup starts on, and what the recording
   window falls back to when nothing was chosen yet. Shared by popup.js and
   screen.js; the last choices are kept in chrome.storage.local under
   "screenSetup". */
self.ORBIT_SCREEN_DEFAULTS = { what: 'tab', cam: 'off', mic: 'default' };
/* the line under Record a video once it was set up: what one press starts */
self.orbitScreenLine = function (s) {
  var what = s.what === 'window' ? 'A window' : s.what === 'screen' ? 'Whole screen' : s.what === 'area' ? 'Part of the screen' : 'This tab';
  return what + ', ' + (s.cam && s.cam !== 'off' ? 'your face in the corner' : 'no camera') + ', ' + (s.mic === 'off' ? 'mic off' : 'mic on') + '.'
    + (s.what === 'window' ? ' A window records no computer sound.' : '');
};
self.orbitScreenSetup = function (saved) {
  var d = self.ORBIT_SCREEN_DEFAULTS, s = saved || {};
  // 'audio': sound only, the mic and (pc) the computer's sound
  // 'area': Chrome's box, then a box drawn over the part to record
  // 'call': a call's tab picked in Chrome's box (the card on a call opens it)
  var what = ['tab', 'window', 'screen', 'area', 'audio', 'call'].indexOf(s.what) >= 0 ? s.what : d.what;
  return { what: what,
           cam: what === 'audio' || what === 'call' ? 'off' : (typeof s.cam === 'string' && s.cam ? s.cam : d.cam),
           mic: typeof s.mic === 'string' && s.mic ? s.mic : d.mic,
           pc: !!s.pc, video: !!s.video, where: String(s.where || '').slice(0, 20),
           meetTab: typeof s.meetTab === 'number' ? s.meetTab : null };
};
