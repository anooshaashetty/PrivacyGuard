document.getElementById('closeLink').addEventListener('click', function() {
  if (chrome && chrome.tabs) {
    chrome.tabs.getCurrent(function(tab) {
      if (tab) chrome.tabs.remove(tab.id);
    });
  } else {
    window.close();
  }
});

document.getElementById('contactLink').addEventListener('click', function() {
  var username = 'anooshaashetty';
  var domain = 'gmail.com';
  window.location.href = 'mailto:' + username + '@' + domain;
});
