// Get the block reason from the URL parameters
const urlParams = new URLSearchParams(window.location.search);
const reason = urlParams.get("reason") || "Not educational content";
document.getElementById("blockReason").textContent = "Reason: " + reason;

async function overrideBlock() {
    try {
        // Request storage access if needed
        if (document.hasStorageAccess) {
            const hasAccess = await document.hasStorageAccess();
            if (!hasAccess) {
                await document.requestStorageAccess();
            }
        }

        // Send message to parent window to override the block
        window.parent.postMessage({ type: "OVERRIDE_BLOCK" }, "*");
    } catch (error) {
        console.error("Error in override:", error);
        // Still try to send the override message even if storage access fails
        window.parent.postMessage({ type: "OVERRIDE_BLOCK" }, "*");
    }
}
