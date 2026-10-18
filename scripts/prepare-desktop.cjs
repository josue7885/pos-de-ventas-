const {spawnSync}=require('child_process');
const path=require('path');
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--omit=dev','--prefix','server'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',shell:process.platform==='win32'});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
