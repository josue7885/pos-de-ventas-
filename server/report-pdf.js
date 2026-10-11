const PDFDocument=require('pdfkit');
const path=require('node:path');

// Shared A4 report layout: every table fits the page and repeats its headings.
function reportDocument(profile,title,period,sections,{landscape=false,note=''}={}){
 const doc=new PDFDocument({size:'A4',layout:landscape?'landscape':'portrait',margin:36,bufferPages:true,info:{Title:title,Author:profile.company_name||'POS Control'}});
 doc.registerFont('Report',path.join(__dirname,'fonts','DejaVuSans.ttf'));
 doc.registerFont('ReportBold',path.join(__dirname,'fonts','DejaVuSans-Bold.ttf'));
 const x=36,width=doc.page.width-72,bottom=doc.page.height-66,navy='#103f70',ink='#203348';let y=36;
 const font=(bold=false,size=9,color=ink)=>doc.font(bold?'ReportBold':'Report').fontSize(size).fillColor(color);
 function write(value,tx,ty,w,{bold=false,size=9,color=ink,align='left'}={}){font(bold,size,color);doc.text(String(value??''),tx,ty,{width:w,lineBreak:false,align});}
 function wrap(value,w,size=9,bold=false){font(bold,size);const result=[];for(const para of String(value??'').split('\n')){let row='';for(const word of para.split(/\s+/)){if(row&&doc.widthOfString(row+word)>w){result.push(row.trimEnd());row='';}for(const char of word){if(doc.widthOfString(row+char)>w){result.push(row);row='';}row+=char;}row+=' ';}result.push(row.trimEnd());}return result;}
 function header(continued=false){
  y=36;for(const row of wrap(profile.company_name||'POS Control',width,continued?12:18,true)){write(row,x,y,width,{bold:true,size:continued?12:18,color:navy});y+=continued?17:24;}
  if(!continued){for(const row of wrap([profile.company_nit&&'NIT: '+profile.company_nit,profile.company_phone&&'Tel: '+profile.company_phone].filter(Boolean).join(' | '),width,8)){write(row,x,y,width,{size:8});y+=12;}}
  y+=7;doc.rect(x,y,width,31).fill(navy);write(title+(continued?' - continuación':''),x+10,y+9,width-20,{bold:true,size:11,color:'#ffffff'});y+=43;
  write(`Moneda: ${profile.currency_code||'USD'} | ${period||'Datos actuales'}`,x,y,width,{size:8});y+=22;
 }
 function page(){doc.addPage();header(true);}
 function paragraph(value){for(const row of wrap(value,width,9)){if(y+15>bottom)page();write(row,x,y,width);y+=14;}y+=10;}
 header();if(note)paragraph(note);
 for(const section of sections){
  if(y+75>bottom)page();
  if(section.title){write(section.title,x,y,width,{bold:true,size:11,color:navy});y+=22;}
  const columns=section.columns,total=columns.reduce((sum,c)=>sum+c.weight,0);let left=x;
  const positions=columns.map(c=>{const w=width*c.weight/total,result={x:left,w,...c};left+=w;return result;});
  function tableHeader(){doc.rect(x,y,width,28).fill(navy);positions.forEach(c=>write(c.label,c.x+6,y+9,c.w-12,{bold:true,size:8,color:'#ffffff',align:c.align||'left'}));y+=28;}
  tableHeader();
  if(!section.rows.length){paragraph('No hay registros en este período.');}
  for(let i=0;i<section.rows.length;i++){
   const cells=section.rows[i].map((v,j)=>wrap(v,positions[j].w-12,8));let offset=0,length=Math.max(...cells.map(c=>c.length));
   while(offset<length){
    if(bottom-y<30){page();tableHeader();}
    const take=Math.min(length-offset,Math.max(1,Math.floor((bottom-y-12)/12))),height=take*12+12;
    doc.rect(x,y,width,height).fill(i%2===0?'#f0f5fa':'#ffffff');
    positions.forEach((c,j)=>cells[j].slice(offset,offset+take).forEach((row,k)=>write(row,c.x+6,y+6+k*12,c.w-12,{size:8,align:c.align||'left'})));
    y+=height;offset+=take;
    doc.strokeColor('#d5dfe9').lineWidth(.5).moveTo(x,y).lineTo(x+width,y).stroke();
   }
  }
  y+=15;if(section.footer)paragraph(section.footer);
 }
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.strokeColor('#d5dfe9').moveTo(x,doc.page.height-56).lineTo(x+width,doc.page.height-56).stroke();write('Reporte interno | Fechas del reporte en UTC',x,doc.page.height-48,width-105,{size:7,color:'#62758a'});write(`Página ${i+1} de ${range.count}`,x+width-105,doc.page.height-48,105,{size:7,align:'right',color:'#62758a'});}
 return doc;
}
module.exports={reportDocument};
