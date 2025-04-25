document.addEventListener("DOMContentLoaded", () => {
    const toggleButton = document.getElementById("toggle-settings");
    const settingsPanel = document.getElementById("settings-panel");
    const limitInput = document.getElementById("daily-limit");
    const saveButton = document.getElementById("save-limit");
    const timeLeftDisplay = document.getElementById("time-left");
  
    // Toggle visibility
    toggleButton.addEventListener("click", () => {
      settingsPanel.classList.toggle("hidden");
    });
  
    // Load saved limit
    const savedLimit = localStorage.getItem("dailyTimeLimit");
    if (savedLimit !== null) {
      limitInput.value = savedLimit;
      timeLeftDisplay.textContent = `${savedLimit} minutes`;
    }
  
    // Save new limit
    saveButton.addEventListener("click", () => {
      const value = limitInput.value;
      if (value && value > 0) {
        localStorage.setItem("dailyTimeLimit", value);
        timeLeftDisplay.textContent = `${value} minutes`;
      }
    });
  });
  