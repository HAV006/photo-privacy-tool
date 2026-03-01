import { initToolShell } from "./tool-ui.js";

document.querySelectorAll("[data-tool-shell]").forEach((shell) => {
  initToolShell(shell);
});
