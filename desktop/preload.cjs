const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('posSetup',{
 info:()=>ipcRenderer.invoke('pos-setup-info'),
 save:config=>ipcRenderer.invoke('pos-setup-save',config)
});
