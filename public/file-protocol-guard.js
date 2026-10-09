(() => {
  // A classic script still runs when index.html is opened directly; ES modules do not
  // reliably load from file://. Display a clear fix instead of leaving a dead-looking UI.
  if (window.location.protocol !== 'file:') return;
  const notice = document.createElement('aside');
  notice.className = 'file-open-warning';
  notice.setAttribute('role', 'alert');
  notice.setAttribute('aria-live', 'assertive');
  const heading = document.createElement('strong');
  heading.textContent = 'PAUSE was opened as a local file';
  const message = document.createElement('p');
  message.append(
    document.createTextNode('This prevents the app modules and server features from loading, so buttons may appear inactive. Close this tab, double-click '),
    document.createElement('code'),
    document.createTextNode(', then use '),
    document.createElement('code'),
    document.createTextNode('.')
  );
  message.children[0].textContent = 'START_PAUSE.bat';
  message.children[1].textContent = 'http://localhost:8080';
  notice.append(heading, message);
  document.body.prepend(notice);
})();
