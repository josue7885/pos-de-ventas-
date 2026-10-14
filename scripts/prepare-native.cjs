const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),platform=process.argv[2];
if(!['android','ios'].includes(platform))throw Error('Selecciona android o ios.');
if(platform==='ios'&&process.platform!=='darwin')throw Error('iOS requiere macOS y Xcode.');
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run(['scripts/prepare-web.cjs']);
const cap='node_modules/@capacitor/cli/bin/capacitor';
if(!fs.existsSync(path.join(root,platform)))run([cap,'add',platform]);
run([cap,'sync',platform]);
if(platform==='ios'){
 const plist=path.join(root,'ios/App/App/Info.plist');let xml=fs.readFileSync(plist,'utf8');
 if(!xml.includes('NSLocalNetworkUsageDescription'))xml=xml.replace('</dict>\n</plist>','\t<key>NSLocalNetworkUsageDescription</key>\n\t<string>Conectar con el servidor de ventas de tu negocio.</string>\n</dict>\n</plist>');
 fs.writeFileSync(plist,xml);
 // Apple requires a declared reason for filesystem timestamp APIs used by the plugin.
 fs.writeFileSync(path.join(root,'ios/App/App/PrivacyInfo.xcprivacy'),`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array></dict></array></dict></plist>\n`);
}
const version=require('../package.json').version,parts=version.split('.').map(Number),versionCode=parts[0]*10000+parts[1]*100+parts[2];
if(platform==='android'){
 const file=path.join(root,'android/app/build.gradle');let code=fs.readFileSync(file,'utf8');
 code=code.replace(/versionCode \d+/,`versionCode ${versionCode}`).replace(/versionName "[^"]+"/,`versionName "${version}"`);fs.writeFileSync(file,code);
}else{
 const file=path.join(root,'ios/App/App.xcodeproj/project.pbxproj');let code=fs.readFileSync(file,'utf8');
 code=code.replace(/MARKETING_VERSION = [^;]+;/g,`MARKETING_VERSION = ${version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g,`CURRENT_PROJECT_VERSION = ${versionCode};`);
 if(!code.includes('PrivacyInfo.xcprivacy')){
  const replacements=[
   ['/* Begin PBXBuildFile section */','\n\t\tAABBCCDD0000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = AABBCCDD0000000000000002 /* PrivacyInfo.xcprivacy */; };'],
   ['/* Begin PBXFileReference section */','\n\t\tAABBCCDD0000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };'],
   ['\t\t\t\t504EC3131FED79650016851F /* Info.plist */,','\n\t\t\t\tAABBCCDD0000000000000002 /* PrivacyInfo.xcprivacy */,'],
   ['\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,','\n\t\t\t\tAABBCCDD0000000000000001 /* PrivacyInfo.xcprivacy in Resources */,']
  ];
  for(const [anchor,addition] of replacements){if(!code.includes(anchor))throw Error('La plantilla iOS cambió: revisa el manifiesto de privacidad en Xcode.');code=code.replace(anchor,anchor+addition);}
 }
 fs.writeFileSync(file,code);
}
