const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'www');
const files=require('../package.json').build.extraResources.find(r=>r.from==='.').filter;
fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(destination,file));
fs.copyFileSync(path.join(root,'node_modules/@capacitor/core/dist/capacitor.js'),path.join(destination,'capacitor-runtime.js'));
const html=fs.readFileSync(path.join(destination,'index.html'),'utf8').replace('<script src="native-platform.js">','<script src="capacitor-runtime.js"></script>\n    <script src="native-platform.js">');
fs.writeFileSync(path.join(destination,'index.html'),html);
console.log('Recursos móviles preparados en www. Configura la dirección del servidor POS en el acceso.');
