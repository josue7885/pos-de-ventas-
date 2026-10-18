const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),{validateConfig,saveConfig,isWhatsAppUrl}=require('../desktop/config.cjs');
test('desktop configuration rejects unsafe URLs/ports and never persists the administrator PIN',()=>{
 for(const url of ['file:///etc/passwd','https://user:password@example.com','https://example.com/path','https://example.com/?key=secret','javascript:alert(1)'])assert.throws(()=>validateConfig({mode:'remote',url}));
 for(const port of [0,80,65536,3.2,'bad'])assert.throws(()=>validateConfig({mode:'local',port}));
 assert.deepEqual(validateConfig({mode:'remote',url:'https://example.com/'}),{mode:'remote',url:'https://example.com'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-install-'));try{const file=path.join(dir,'config.json');saveConfig(file,{mode:'local',pin:'12345678',port:37891});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{mode:'local',port:37891,shareNetwork:false});}finally{fs.rmSync(dir,{recursive:true,force:true});}
 assert.equal(isWhatsAppUrl('https://wa.me/50370000000?text=Hola'),true);
 for(const url of ['https://wa.me.evil/50370000000','https://user@wa.me/50370000000','file:///bin/sh','https://wa.me/50370000000?redirect=evil'])assert.equal(isWhatsAppUrl(url),false);
});
test('packaged applications include all UI scripts and explicitly exclude live server data',()=>{
 const pkg=require('../package.json'),resources=pkg.build.extraResources,files=resources.find(r=>r.from==='.').filter;
 for(const [,file] of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script src="([^"]+)"/g)){assert(files.includes(file),file);assert(fs.existsSync(path.join(root,file)),file);}
 assert(pkg.build.files.includes('desktop/**'));
 const backend=resources.find(r=>r.from==='server').filter;assert(!backend.includes('**/*'));assert(resources.some(r=>r.from==='server/node_modules'&&r.to==='server/node_modules'&&r.filter.includes('**/*')));assert(!backend.some(f=>/\.db|\.key|businesses|invoices/.test(f)));
 assert.notEqual(pkg.build.nsis.artifactName,pkg.build.portable.artifactName);
});
test('native document sharing uses an isolated temporary file and preserves it while receivers can still read it',async()=>{
 const calls=[];let fail=false;
 const plugins={Filesystem:{readdir:async()=>({files:[{name:'pos-1-old.pdf'},{name:'unrelated.pdf'}]}),writeFile:async o=>{calls.push(['write',o]);return {uri:'file:///cache/doc.pdf'};},deleteFile:async o=>calls.push(['delete',o])},Share:{share:async o=>{calls.push(['share',o]);if(fail)throw Error('cancelled');}},Browser:{open:async o=>calls.push(['open',o])}};
 const context={window:{Capacitor:{isNativePlatform:()=>true,registerPlugin:n=>plugins[n]}},URL,FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,cGRm';this.onload();}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'native-platform.js'),'utf8'),context);
 const native=context.window.POSNative;await native.shareFile({},'../nota.pdf');assert.equal(calls[0][1].path,'pos-1-old.pdf');assert.equal(calls[1][1].directory,'CACHE');assert(!calls[1][1].path.includes('/'));assert.equal(calls[2][1].files[0],'file:///cache/doc.pdf');assert.equal(calls.at(-1)[0],'share');
 fail=true;await assert.rejects(native.shareFile({},'nota.pdf'),/cancelled/);assert.equal(calls.at(-1)[0],'share');
 await assert.rejects(native.openWhatsApp('https://evil.example/50370000000'));await native.openWhatsApp('https://wa.me/50370000000?text=Hola');assert.equal(calls.at(-1)[0],'open');
});
test('ordinary web clients never request native plugins',()=>{const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'native-platform.js'),'utf8'),context);assert.equal(context.window.POSNative.active,false);});
