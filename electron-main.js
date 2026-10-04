const {app,BrowserWindow,dialog} = require('electron');
const path=require('path');
const http=require('http');
const {spawn}=require('child_process');
let serverProcess,origin,quitting=false;
function health(url) {
  return new Promise(resolve=>{
    const request=http.get(url+'/api/health',{timeout:1500},res=>{
      let body='';res.on('data',d=>body+=d);res.on('end',()=>{
        try{const data=JSON.parse(body);resolve(res.statusCode===200 && data.service==='pos-control' && data.ready===true);}catch{resolve(false);}
      });
    });
    request.on('error',()=>resolve(false));request.on('timeout',()=>{request.destroy();resolve(false);});
  });
}
async function startServer() {
  const serverPath=path.join(app.isPackaged?process.resourcesPath:__dirname,'server','server.js');
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('El servidor no respondió en 30 segundos.')),30000);
    serverProcess=spawn(process.execPath,[serverPath],{
      env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PORT:'0',POS_HOST:'127.0.0.1',POS_DATA_DIR:process.env.POS_DATA_DIR || path.join(app.getPath('userData'),'data')},
      stdio:['ignore','pipe','pipe'],windowsHide:true
    });
    let output='',errors='';
    serverProcess.stderr.on('data',d=>{errors=(errors+d).slice(-4000);});
    serverProcess.stdout.on('data',async d=>{
      output+=d;const match=output.match(/listening on port (\d+)/);
      if(match){const url='http://127.0.0.1:'+match[1];if(await health(url)){clearTimeout(timer);resolve(url);}}
    });
    serverProcess.once('error',e=>{clearTimeout(timer);reject(e);});
    serverProcess.once('exit',code=>{
      clearTimeout(timer);reject(Error(errors || `Servidor terminó: ${code}`));
      if(origin && !quitting){dialog.showErrorBox('POS: servidor detenido','Cierra y abre la aplicación. No se puede cobrar sin servidor.');app.quit();}
    });
  });
}
function createWindow(){
  const win=new BrowserWindow({width:1280,height:860,minWidth:1000,minHeight:680,title:'POS Control',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  win.webContents.setWindowOpenHandler(({url})=>{
    // Receipts use an isolated same-origin window; external navigation is blocked.
    try{if(url==='about:blank' || new URL(url).origin===origin)return {action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};}catch{}
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  win.loadURL(origin);win.maximize();
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  try{origin=await startServer();createWindow();}catch(error){dialog.showErrorBox('No se pudo iniciar POS',error.message+'\nPrimera ejecución: define POS_ADMIN_PIN (6 a 12 dígitos).');app.quit();}
});
app.on('activate',()=>{if(origin && !BrowserWindow.getAllWindows().length)createWindow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{quitting=true;serverProcess?.kill();});
