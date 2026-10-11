// Keep an honest fallback visible when module loading or initialization fails.
// This never clears, replaces, or migrates browser data.
document.documentElement.dataset.appStatus = 'initializing';
try {
  await import('./main.js');
} catch (error) {
  document.documentElement.dataset.appStatus = 'initialization-failed';
  const notice = document.getElementById('app-startup');
  notice.hidden = false;
  notice.textContent = `The app could not start (${error.name}). This preview may be blocking application files or scripts. Open the running web-server preview on port 5173. Preview revision: server-p1-3.`;
  console.error('Dual-Track initialization failed:', error);
}
