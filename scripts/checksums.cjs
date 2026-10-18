const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=path.resolve(process.argv[2]||'dist');
const files=fs.readdirSync(dir).filter(f=>/\.(exe|dmg|zip|AppImage|deb|tar\.gz|apk|aab|ipa)$/.test(f)).sort();
if(!files.length)throw Error('No hay paquetes para verificar en '+dir);
fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),files.map(file=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')}  ${file}`).join('\n')+'\n');
console.log('SHA256SUMS.txt: '+files.length+' paquetes');
