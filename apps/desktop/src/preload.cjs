const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("virtualOfficeDesktop", {
  pickDirectory: () => ipcRenderer.invoke("desktop:pick-directory"),
});
