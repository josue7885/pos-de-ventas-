const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'www');
fs.mkdirSync(destination,{recursive:true});
for(const file of ['index.html','style.css','app.js','app_utils.js','app_exec_pin.js','customer-display.html','kitchen-display.html','display.js','manifest.webmanifest','icon.svg','pos-math.js','enhancements.js']) fs.copyFileSync(path.join(root,file),path.join(destination,file));
console.log('Recursos web preparados en www. Android requiere un servidor POS externo accesible.');
