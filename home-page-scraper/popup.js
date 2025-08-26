document.addEventListener('DOMContentLoaded', function() {
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggle');

  // Get current status
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
      if (response) {
        statusEl.textContent = `Status: ${response.enabled ? 'Enabled' : 'Disabled'}`;
        toggleBtn.textContent = response.enabled ? 'Disable Filter' : 'Enable Filter';
      } else {
        statusEl.textContent = 'Status: Not on YouTube';
        toggleBtn.disabled = true;
      }
    });
  });

  // Toggle functionality
  toggleBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle'}, function(response) {
        if (response) {
          statusEl.textContent = `Status: ${response.enabled ? 'Enabled' : 'Disabled'}`;
          toggleBtn.textContent = response.enabled ? 'Disable Filter' : 'Enable Filter';
        }
      });
    });
  });
});
